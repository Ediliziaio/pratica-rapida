import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyzePdfLocally, PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport, reconcileCommonReportWithAuthoritativeInfissiGate } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";

type ManifestCase = {
  cohort: number; practiceId: string; customerKey: string; displayName: string;
  stage: string; stageName: string; module: string; productEvidence: string;
  reseller: string; invoiceCount: number; complexity: string;
};

type OriginalDocument = {
  documentKey: string; customerKey: string; practiceId: string; kind: "invoice" | "additional";
  state: string; localPath: string; responseSha256: string; byteLength: number;
};

const operationRoot = import.meta.dirname;
const repoRoot = path.resolve(operationRoot, "../..");
const manifestPath = path.join(repoRoot, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const priorReplayPath = path.join(operationRoot, "local-replay-current-source.json");
const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const ocrExecutable = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current/apr-pdf-ocr";
const expectedManifestSha256 = "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0";
const productGateDirectoryName = process.env.APR_AUDIT_PRODUCT_GATE_DIRECTORY || "product-gate";
const replayReportName = process.env.APR_AUDIT_REPLAY_REPORT_NAME || "fresh-original-replay-v3-candidate.json";
const replayStateDirectoryName = process.env.APR_AUDIT_STATE_DIRECTORY || "fresh-original-state-v2";
const classificationRevision = process.env.APR_AUDIT_CLASSIFICATION_REVISION || "fresh-original-document-classification-r34-v1";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const canonical = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());

const parserRevisions = [
  "invoice-parser-v31-rinaldi-sp-dot-and-vat-layout",
  "invoice-parser-v32-grk-vertical-number-date",
  "invoice-parser-v33-header-identity-over-body-reference",
  "invoice-parser-v34-linea-sole-partial-paper-scomparsa",
  "invoice-parser-v35-composite-invoice-transfer-segmentation",
  "invoice-parser-v36-screening-unit-surface-coherence",
  "invoice-parser-v38-rotated-fiscal-bank-layouts-r30",
];

function fileHash(file: string) {
  return sha256(readFileSync(file));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

function blockerKey(blocker: { code: string; field?: string }) {
  return `${blocker.code}:${blocker.field ?? ""}`;
}

async function drain(analysis: PersistentAprCrmDocumentAnalysis) {
  for (let guard = 0; guard < 2_000; guard += 1) {
    const state = analysis.snapshot();
    if (state.status === "completed") return state;
    await analysis.tick();
  }
  throw new Error("fresh_analysis_guard_exhausted");
}

async function main() {
  const manifestBytes = readFileSync(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== expectedManifestSha256) throw new Error(`manifest_hash_mismatch:${manifestSha256}`);
  if (!existsSync(ocrExecutable)) throw new Error("installed_ocr_missing");
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { cases: ManifestCase[] };
  if (manifest.cases.length !== 100) throw new Error(`manifest_count_mismatch:${manifest.cases.length}`);
  const prior = json(priorReplayPath) as { cases: Array<{ customerKey: string; outcome: string; blockers: Array<{ code: string; field?: string }> }> };
  const priorByKey = new Map(prior.cases.map((item) => [item.customerKey, item]));
  const cohortNames = readdirSync(cohortRoot);
  const stateRoot = path.join(operationRoot, replayStateDirectoryName);
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const results: unknown[] = [];
  let sourceBytes = 0;
  let sourceDocuments = 0;
  let sourceHashMismatches = 0;

  for (const entry of manifest.cases) {
    const operationalCohort = 2920 + entry.cohort;
    const matches = cohortNames.filter((name) => name.startsWith(`apr-pilot-${operationalCohort}-global-controller-`));
    if (matches.length !== 1) throw new Error(`cohort_state_count:${entry.customerKey}:${matches.length}`);
    const originalStateDir = path.join(cohortRoot, matches[0]);
    const originals = json(path.join(originalStateDir, "crm-original-documents/checkpoint.json")) as { status: string; sourceSetFingerprint: string; items: OriginalDocument[] };
    if (originals.status !== "completed") throw new Error(`original_documents_incomplete:${entry.customerKey}`);
    const documents = originals.items.filter((item) => item.customerKey === entry.customerKey && item.state === "downloaded");
    if (!documents.length) throw new Error(`original_documents_missing:${entry.customerKey}`);
    for (const document of documents) {
      sourceDocuments += 1;
      sourceBytes += document.byteLength;
      if (!existsSync(document.localPath) || fileHash(document.localPath) !== document.responseSha256) sourceHashMismatches += 1;
    }
    if (sourceHashMismatches) throw new Error(`original_document_hash_mismatch:${entry.customerKey}`);

    const freshRoot = path.join(stateRoot, String(entry.cohort).padStart(3, "0"), entry.customerKey);
    mkdirSync(freshRoot, { recursive: true, mode: 0o700 });
    const analysis = new PersistentAprCrmDocumentAnalysis(freshRoot, (file) => analyzePdfLocally(file, ocrExecutable));
    analysis.prepare(documents.map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, localPath: item.localPath, responseSha256: item.responseSha256 })), originals.sourceSetFingerprint);
    await drain(analysis);
    analysis.applyTechnicalPerformanceDiagramOcrRepair("infissi-performance-diagram-ocr-v2");
    await drain(analysis);
    analysis.applyOcrOrientationRevision("document-ocr-orientation-normalization-v1");
    await drain(analysis);
    analysis.applyTechnicalDocumentClassificationRevision(classificationRevision);
    for (const revision of parserRevisions) analysis.applyParserRevision(revision);
    const freshAnalysis = analysis.snapshot();
    const blockedDocuments = freshAnalysis.items.filter((item) => item.state !== "analyzed");

    const acquisition = json(path.join(originalStateDir, "crm-acquisition/checkpoint.json"));
    const acquired = acquisition.items.find((item: { customerKey: string }) => item.customerKey === entry.customerKey);
    if (!acquired || acquired.practiceId !== entry.practiceId) throw new Error(`acquisition_identity_mismatch:${entry.customerKey}`);
    const dossier = json(acquired.dossierPath);
    if (dossier.row?.id !== entry.practiceId) throw new Error(`dossier_identity_mismatch:${entry.customerKey}`);
    const commonOriginal = buildCrmLocalPreflightReport(dossier, entry.customerKey, freshAnalysis, new Date("2026-09-03T12:00:00+02:00"));

    const productRoot = path.join(freshRoot, productGateDirectoryName);
    mkdirSync(productRoot, { recursive: true, mode: 0o700 });
    const acquisitionLink = path.join(productRoot, "crm-acquisition");
    const analysisLink = path.join(productRoot, "crm-document-analysis");
    if (!existsSync(acquisitionLink)) symlinkSync(path.join(originalStateDir, "crm-acquisition"), acquisitionLink, "dir");
    if (!existsSync(analysisLink)) symlinkSync(path.join(freshRoot, "crm-document-analysis"), analysisLink, "dir");
    mkdirSync(path.join(productRoot, "crm-local-preflight"), { recursive: true, mode: 0o700 });
    const commonCheckpoint = {
      version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: originals.sourceSetFingerprint,
      currentCustomerKey: null,
      items: [{ customerKey: entry.customerKey, displayName: entry.displayName, practiceId: entry.practiceId, dossierPath: acquired.dossierPath, state: commonOriginal.outcome, attemptCount: 1, startedAt: null, endedAt: null, report: commonOriginal, reason: "Fresh replay dai documenti originali" }],
      externalActionAllowed: false, reason: "Fresh replay locale", nextAction: "Nessuna azione esterna.", validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [],
      audit: [{ revision: 1, at: "2026-09-03T10:00:00.000Z", type: "completed", customerKey: null, reason: "Fresh replay locale", appliedRuleIds: ["system-single-active-practice"] }],
    };
    writeFileSync(path.join(productRoot, "crm-local-preflight/checkpoint.json"), `${JSON.stringify(commonCheckpoint, null, 2)}\n`, { mode: 0o600 });
    const infissi = new PersistentAprInfissiBatchPreflight(productRoot);
    let infissiState = infissi.tick(new Date("2026-09-03T12:00:00+02:00"));
    for (let guard = 0; infissiState.status !== "completed" && guard < 10; guard += 1) infissiState = infissi.tick(new Date("2026-09-03T12:00:00+02:00"));
    if (infissiState.status !== "completed") throw new Error(`infissi_gate_incomplete:${entry.customerKey}`);
    const infissiItem = infissiState.items.find((item) => item.customerKey === entry.customerKey) ?? null;
    const common = infissiItem ? reconcileCommonReportWithAuthoritativeInfissiGate(commonOriginal) : commonOriginal;
    const blockers = [...common.blockers, ...(infissiItem?.report?.blockers ?? [])];
    const freshKeys = [...new Set(blockers.map(blockerKey))].sort();
    const priorCase = priorByKey.get(entry.customerKey);
    if (!priorCase) throw new Error(`prior_case_missing:${entry.customerKey}`);
    const priorKeys = [...new Set(priorCase.blockers.map(blockerKey))].sort();
    const freshOutcome = freshKeys.length ? "OPERATOR_REQUIRED_LOCAL" : "READY_LOCAL";
    results.push({
      cohort: entry.cohort, operationalCohort, practiceId: entry.practiceId, customerKey: entry.customerKey, displayName: entry.displayName,
      documentCount: documents.length, analyzedDocumentCount: freshAnalysis.items.filter((item) => item.state === "analyzed").length,
      blockedDocuments: blockedDocuments.map((item) => ({ documentKey: item.documentKey, reason: item.reason })),
      freshOutcome, priorOutcome: priorCase.outcome,
      freshBlockerKeys: freshKeys, priorBlockerKeys: priorKeys,
      addedBlockers: freshKeys.filter((item) => !priorKeys.includes(item)), removedBlockers: priorKeys.filter((item) => !freshKeys.includes(item)),
      changed: freshOutcome !== priorCase.outcome || JSON.stringify(freshKeys) !== JSON.stringify(priorKeys),
    });
    process.stdout.write(`${entry.cohort}/100 ${entry.customerKey} ${freshOutcome}\n`);
  }

  const changed = results.filter((item) => (item as { changed: boolean }).changed);
  const report = {
    schemaVersion: "apr-reliability-fresh-original-replay-v1", generatedAt: new Date().toISOString(),
    safety: { localOnly: true, crmAccessed: false, eneaAccessed: false, externalActionAllowed: false },
    manifestSha256, installedOcrSha256: fileHash(ocrExecutable),
    sourceIntegrity: { documents: sourceDocuments, bytes: sourceBytes, hashMismatches: sourceHashMismatches },
    summary: {
      total: results.length,
      freshReady: results.filter((item) => (item as { freshOutcome: string }).freshOutcome === "READY_LOCAL").length,
      freshOperatorRequired: results.filter((item) => (item as { freshOutcome: string }).freshOutcome === "OPERATOR_REQUIRED_LOCAL").length,
      casesWithAnalysisFailure: results.filter((item) => (item as { blockedDocuments: unknown[] }).blockedDocuments.length > 0).length,
      changedVersusPersistedReplay: changed.length,
    },
    changedCases: changed,
    cases: results,
  };
  const reportPath = path.join(operationRoot, replayReportName);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  const digest = sha256(JSON.stringify(stableValue({ ...report, generatedAt: null })));
  writeFileSync(path.join(operationRoot, replayReportName.replace(/\.json$/u, ".sha256")), `${digest}  ${replayReportName} (generatedAt excluded)\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ reportPath, summary: report.summary, canonicalSha256: digest }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
