import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport, reconcileCommonReportWithAuthoritativeInfissiGate } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";

const stateDirectory = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-2932-global-controller-marco-de-marinis";
const customerKey = "marco-de-marinis";
const expectedPracticeId = "0e6c3b0f-f4d0-45f9-921a-6f3a23f713ee";
const businessTime = "2026-09-03T00:00:00.000Z";
const outputPath = path.join(import.meta.dirname, "marco-de-marinis-local-replay.json");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const current = resolveCurrentCohortManifestCase(stateDirectory, customerKey);
if (current.practiceId !== expectedPracticeId) throw new Error("practice_identity_mismatch");
const now = new Date(businessTime);
const analysis = new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(now);
const dossier = JSON.parse(readFileSync(current.evidence.dossierPath, "utf8"));
const commonOriginal = buildCrmLocalPreflightReport(dossier, customerKey, analysis, now);
const scratch = mkdtempSync(path.join(tmpdir(), "apr-marco-de-marinis-replay-"));

try {
  symlinkSync(path.join(stateDirectory, "crm-acquisition"), path.join(scratch, "crm-acquisition"), "dir");
  symlinkSync(path.join(stateDirectory, "crm-document-analysis"), path.join(scratch, "crm-document-analysis"), "dir");
  mkdirSync(path.join(scratch, "crm-local-preflight"), { recursive: true, mode: 0o700 });
  writeFileSync(path.join(scratch, "crm-local-preflight/checkpoint.json"), `${JSON.stringify({
    version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: "marco-de-marinis-local-replay",
    currentCustomerKey: null,
    items: [{ customerKey, displayName: "Marco De Marinis", practiceId: expectedPracticeId, dossierPath: current.evidence.dossierPath, state: commonOriginal.outcome, attemptCount: 1, startedAt: businessTime, endedAt: businessTime, report: commonOriginal, reason: "Replay locale fail-closed" }],
    externalActionAllowed: false, reason: "Replay locale fail-closed", nextAction: "Nessuna azione esterna.", validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
  }, null, 2)}\n`, { mode: 0o600 });
  const infissi = new PersistentAprInfissiBatchPreflight(scratch);
  let infissiState = infissi.tick(now);
  for (let guard = 0; infissiState.status !== "completed" && guard < 5; guard += 1) infissiState = infissi.tick(now);
  if (infissiState.status !== "completed") throw new Error("infissi_replay_incomplete");
  const infissiItem = infissiState.items.find((item) => item.customerKey === customerKey);
  if (!infissiItem?.report) throw new Error("infissi_report_missing");
  const common = reconcileCommonReportWithAuthoritativeInfissiGate(commonOriginal);
  const output = {
    schemaVersion: "apr-marco-de-marinis-local-replay-v1", generatedAt: new Date().toISOString(), businessTime,
    source: { stateDirectory, practiceId: expectedPracticeId, sourceSha256: current.evidence.sourceSha256 },
    safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    common: { outcome: common.outcome, blockerCodes: common.blockers.map((item) => item.code), financial: common.financial },
    infissi: { outcome: infissiItem.report.outcome, blockerCodes: infissiItem.report.blockers.map((item) => item.code), report: infissiItem.report },
  };
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ outputPath, sha256: sha256(readFileSync(outputPath)), commonBlockers: output.common.blockerCodes, infissiBlockers: output.infissi.blockerCodes }, null, 2)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
