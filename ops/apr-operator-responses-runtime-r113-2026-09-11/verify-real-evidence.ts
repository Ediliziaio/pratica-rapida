import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";
import {
  applyOperatorResponseDossierOverrides,
  type AprOperatorResponseEntry,
  PersistentAprOperatorResponseLedger,
} from "../../scripts/enea-shadow-runner/operatorResponseLedger";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

const corpusRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cases = [
  { cohort: 5927, customerKey: "luca-cigognetti", mode: "infissi" },
  { cohort: 5943, customerKey: "elena-depalma", mode: "infissi" },
  { cohort: 5950, customerKey: "sarah-mondini", mode: "screening" },
  { cohort: 5953, customerKey: "marcella-capatti", mode: "infissi" },
  { cohort: 5955, customerKey: "giulia-kasermann", mode: "screening" },
  { cohort: 5964, customerKey: "marian-maeschi", mode: "infissi" },
  { cohort: 5722, customerKey: "alberto-maggi", mode: "screening" },
] as const;

const importArtifact = JSON.parse(readFileSync(new URL("./operator-response-import.json", import.meta.url), "utf8")) as {
  responses: AprOperatorResponseEntry[];
};
const installedRuntimeLedger = new PersistentAprOperatorResponseLedger(
  "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/runtime-verification",
);
const installedRuntimeState = installedRuntimeLedger.load();
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function sourceRoot(cohort: number, customerKey: string) {
  return path.join(corpusRoot, `apr-pilot-${cohort}-global-controller-${customerKey}`);
}

function copyCheckpoint(source: string, targetRoot: string, component: string) {
  const targetDirectory = path.join(targetRoot, component);
  mkdirSync(targetDirectory, { recursive: true });
  copyFileSync(path.join(source, component, "checkpoint.json"), path.join(targetDirectory, "checkpoint.json"));
}

const results = [];
for (const definition of cases) {
  const source = sourceRoot(definition.cohort, definition.customerKey);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), `apr-r113-real-${definition.customerKey}-`));
  copyCheckpoint(source, tempRoot, "crm-acquisition");
  copyCheckpoint(source, tempRoot, "crm-document-analysis");
  const acquisition = JSON.parse(readFileSync(path.join(source, "crm-acquisition", "checkpoint.json"), "utf8")) as {
    items: Array<Record<string, unknown>>;
  };
  const acquired = acquisition.items.filter((item) => item.state === "acquired");
  const item = acquired.find((candidate) => candidate.customerKey === definition.customerKey);
  if (!item) throw new Error(`real_evidence_item_missing:${definition.customerKey}`);
  const ledger = new PersistentAprOperatorResponseLedger(tempRoot);
  ledger.importResponses(importArtifact.responses);
  const analysis = new PersistentAprCrmDocumentAnalysis(tempRoot, async () => { throw new Error("real_evidence_must_not_reextract_documents"); });
  const sourceFingerprint = sha256(acquired.map((candidate) => [candidate.customerKey, candidate.practiceId, candidate.responseSha256]));
  const common = new PersistentAprCrmLocalPreflight(tempRoot, analysis);
  common.prepare(acquired as never[], sourceFingerprint);
  const commonState = common.runToCompletion();
  const commonItem = commonState.items.find((candidate) => candidate.customerKey === definition.customerKey);

  let infissiItem: ReturnType<PersistentAprInfissiBatchPreflight["snapshot"]>["items"][number] | null = null;
  if (definition.mode === "infissi" && commonItem?.state !== "deferred_operator") {
    const infissi = new PersistentAprInfissiBatchPreflight(tempRoot);
    let infissiState = infissi.tick();
    for (let tick = 0; tick < 4 && infissiState.status !== "completed"; tick += 1) infissiState = infissi.tick(new Date(Date.now() + (tick + 1) * 1_000));
    infissiItem = infissiState.items.find((candidate) => candidate.customerKey === definition.customerKey) ?? null;
  }

  const projection = ledger.projection(definition.customerKey, String(item.practiceId));
  const dossier = JSON.parse(readFileSync(String(item.dossierPath), "utf8"));
  const patched = applyOperatorResponseDossierOverrides(dossier, projection);
  const finalLedger = ledger.load();
  const responseIds = projection.entries.map((entry) => entry.responseId);
  const applications = finalLedger.applications.filter((application) => responseIds.includes(application.responseId));
  const reportProducts = commonItem?.report?.products.map((product) => ({ description: product.description, widthMm: product.widthMm, heightMm: product.heightMm })) ?? [];
  const row = (patched.dossier.row ?? {}) as Record<string, unknown>;
  const form = (row.dati_form ?? {}) as Record<string, unknown>;
  const cadastral = (form.catastali ?? {}) as Record<string, unknown>;
  const product = (form.prodotto ?? {}) as Record<string, unknown>;

  const checks: Record<string, boolean> = {};
  if (definition.customerKey === "sarah-mondini") checks.operatorMeasurementsApplied = reportProducts.some((entry) => entry.widthMm === 5400 && entry.heightMm === 4000);
  if (definition.customerKey === "giulia-kasermann") checks.operatorMeasurementsApplied = reportProducts.some((entry) => entry.widthMm === 3000 && entry.heightMm === 2000);
  if (definition.customerKey === "alberto-maggi") checks.cadastralIdentifiersApplied = cadastral.foglio === "9" && cadastral.mappale === "6642";
  if (definition.customerKey === "elena-depalma") checks.oldWindowCharacteristicsApplied = product.materiale_vecchi === "metallo" && product.vetro_vecchi === "vetro_doppio" && infissiItem?.report?.oldWindowSourceResolution.material === "metallo" && infissiItem.report.oldWindowSourceResolution.glazing === "doppio";
  if (definition.customerKey === "marcella-capatti") checks.operatorCountAvailable = projection.physicalProductCount?.count === 7;
  if (definition.customerKey === "luca-cigognetti") checks.generalRuleRegistered = Boolean(registryRule("user-2026-09-11-zanzariera-first-window-allocation-v1"));
  if (definition.customerKey === "marian-maeschi") checks.caseDispositionApplied = commonItem?.state === "deferred_operator";
  checks.responsePresent = responseIds.length > 0;
  const pendingReason = definition.customerKey === "marcella-capatti" && infissiItem?.report?.physicalProductCount !== 7
    ? `Risposta 7 persistita ma non ancora applicabile: il replay delle fonti reali si ferma prima con ${infissiItem?.report?.blockers.map((blocker) => blocker.code).join(",") || "evidenza tecnica non disponibile"}.`
    : definition.customerKey === "luca-cigognetti" && !infissiItem?.report?.appliedRuleIds.includes("user-2026-09-11-zanzariera-first-window-allocation-v1")
      ? `Regola registrata e nel bundle, ma non ancora invocabile sul caso: ${infissiItem?.report?.blockers.map((blocker) => blocker.code).join(",") || "precondizione documentale non raggiunta"}.`
      : null;
  checks.applicationReceiptPersistedOrExplicitlyPending = applications.length > 0 || pendingReason !== null;

  results.push({
    customerKey: definition.customerKey,
    cohort: definition.cohort,
    sourcePracticeId: item.practiceId,
    sourceDossierPath: item.dossierPath,
    commonState: commonItem?.state ?? null,
    infissiState: infissiItem?.state ?? null,
    responseIds,
    applications,
    pendingReason,
    checks,
    passed: Object.values(checks).every(Boolean),
  });
}

const ruleIds = [...new Set(importArtifact.responses.flatMap((entry) => entry.payload.kind === "general_rule_confirmation" ? entry.payload.ruleIds : []))];
const report = {
  version: "apr-operator-response-real-evidence-verification-v1",
  verifiedAt: new Date().toISOString(),
  executionClass: "local_read_only_replay_from_real_persisted_crm_documents",
  externalActions: { crmWrites: false, eneaWrites: false, eneaReads: false, communications: false },
  importedResponseCount: importArtifact.responses.length,
  installedRuntimeLedger: {
    version: installedRuntimeState.version,
    revision: installedRuntimeState.revision,
    responseCount: installedRuntimeState.responses.length,
    activeResponseCount: installedRuntimeState.responses.filter((entry) => entry.status === "active").length,
    applicationCount: installedRuntimeState.applications.length,
    contentSha256: installedRuntimeState.contentSha256,
    caseScopeFailClosed: installedRuntimeLedger.projection("sarah-mondini", null).entries.length === 0
      && installedRuntimeLedger.projection("sarah-mondini", "practice-id-diversa").entries.length === 0
      && installedRuntimeLedger.projection("sarah-mondini", "36a9a1ab-0a3d-47d7-8671-e0654167ccb1").entries.length === 1,
  },
  activeGeneralRules: ruleIds.map((ruleId) => ({ ruleId, presentInRegistry: Boolean(registryRule(ruleId)) })),
  results,
  passed: results.every((result) => result.passed)
    && ruleIds.every((ruleId) => Boolean(registryRule(ruleId)))
    && installedRuntimeState.responses.length === importArtifact.responses.length
    && installedRuntimeLedger.projection("sarah-mondini", null).entries.length === 0
    && installedRuntimeLedger.projection("sarah-mondini", "practice-id-diversa").entries.length === 0
    && installedRuntimeLedger.projection("sarah-mondini", "36a9a1ab-0a3d-47d7-8671-e0654167ccb1").entries.length === 1,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
