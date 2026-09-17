import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const runRoot = path.join(runtimeRoot, "runs/apr-workable70-r110-20260911");
const cohortRoot = path.join(runtimeRoot, "cohorts/apr-pilot-5838-global-controller-lucia-lagrasta");
const checkpointPath = path.join(runRoot, "checkpoint.json");
const manifestPath = path.join(sourceRoot, "ops/apr-workable70-r110-2026-09-11/manifest.json");
const caseReportPath = path.join(runRoot, "case-5838-lucia-lagrasta/report.json");
const dashboardPath = path.join(cohortRoot, "dashboard/status.json");
const executionPath = path.join(cohortRoot, "enea-draft-execution/checkpoint.json");
const supervisorPath = path.join(cohortRoot, "supervisor/checkpoint.json");
const receiptPath = path.join(sourceRoot, "ops/apr-workable70-r110-2026-09-11/lucia-reconciliation-receipt.json");
const expectedManifestSha256 = "dc16fe1373645a33054cbf994fea1a647a5acd2bf7212341419e41070623a45d";
const expectedWorkerSha256 = "5beccb73cd8ee89d2fb440a45bdd70a2b7c668052bd5161c37be95595a551d79";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const atomicWrite = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); }
  finally { closeSync(descriptor); }
  renameSync(temporary, file);
};

if (sha256(readFileSync(manifestPath)) !== expectedManifestSha256) throw new Error("manifest_hash_mismatch");
const manifest = readJson(manifestPath);
const expectedCase = manifest.cases.find((item) => item.customerKey === "lucia-lagrasta");
if (!expectedCase || expectedCase.cohort !== 38 || expectedCase.practiceId !== "0f468582-9698-4589-b2d8-a103acced455") {
  throw new Error("manifest_lucia_identity_mismatch");
}

const checkpoint = readJson(checkpointPath);
const existing = checkpoint.results.find((item) => item.customerKey === "lucia-lagrasta");
const caseReport = readJson(caseReportPath);
const result = caseReport.cases?.find((item) => item.customerKey === "lucia-lagrasta");
const dashboard = readJson(dashboardPath);
const execution = readJson(executionPath);
const supervisor = readJson(supervisorPath);

if (caseReport.status !== "completed" || caseReport.processed !== 1 || caseReport.saved !== 1 || result?.state !== "saved") {
  throw new Error("lucia_single_case_report_not_saved");
}
if (result.practiceId !== expectedCase.practiceId || result.cohort !== 5838 || result.draftId !== "484382"
  || result.completedPages !== 11 || result.expectedPages !== 11) {
  throw new Error("lucia_single_case_identity_or_pages_mismatch");
}
if (dashboard.publicStatus !== "IDLE" || dashboard.health !== "run_completed"
  || !String(dashboard.reason ?? "").includes("Bozza TEST completa")) {
  throw new Error("lucia_dashboard_not_terminal_saved");
}
if (execution.status !== "completed" || !String(execution.reason ?? "").includes("484382")
  || !String(execution.reason ?? "").includes("verificata lato server")) {
  throw new Error("lucia_execution_checkpoint_not_server_verified");
}
if (supervisor.status !== "stopped" || supervisor.lastHealth !== "run_completed") {
  throw new Error("lucia_supervisor_not_cleanly_stopped");
}

let changed = false;
if (!existing) {
  if (checkpoint.results.length !== 37 || checkpoint.currentCustomerKey !== "lucia-lagrasta" || checkpoint.status !== "running") {
    throw new Error("outer_checkpoint_not_at_expected_interruption_boundary");
  }
  const backupPath = `${checkpointPath}.before-lucia-reconciliation-${sha256(readFileSync(checkpointPath)).slice(0, 12)}.json`;
  if (!existsSync(backupPath)) copyFileSync(checkpointPath, backupPath);
  checkpoint.results.push({ ...result, cohort: 5838, source: "single_case_apr_report_reconciled_after_controller_session_loss" });
  checkpoint.currentCustomerKey = null;
  checkpoint.status = "running";
  checkpoint.updatedAt = new Date().toISOString();
  atomicWrite(checkpointPath, checkpoint);
  appendFileSync(path.join(runRoot, "journal.ndjson"), `${JSON.stringify({
    at: checkpoint.updatedAt,
    event: "case_terminalized_reconciled",
    customerKey: "lucia-lagrasta",
    cohort: 5838,
    state: "saved",
    draftId: "484382",
    source: "three_persistent_terminal_sources_after_outer_controller_loss",
  })}\n`);
  changed = true;
} else if (existing.state !== "saved" || existing.draftId !== "484382") {
  throw new Error("existing_lucia_result_conflicts");
}

const receipt = {
  version: "apr-outer-checkpoint-terminal-case-reconciliation-v1",
  status: "PASS",
  reconciledAt: new Date().toISOString(),
  changed,
  runId: "apr-workable70-r110-20260911",
  customerKey: "lucia-lagrasta",
  practiceId: expectedCase.practiceId,
  cohort: 5838,
  state: "saved",
  draftId: "484382",
  pages: { completed: 11, expected: 11 },
  resultCountAfterReconciliation: checkpoint.results.length,
  remainingAfterReconciliation: manifest.cases.length - checkpoint.results.length,
  evidence: [caseReportPath, executionPath, dashboardPath, supervisorPath].map((file) => ({ file, sha256: sha256(readFileSync(file)) })),
  manifest: { path: manifestPath, sha256: expectedManifestSha256 },
  bundleWorkerSha256: expectedWorkerSha256,
};
atomicWrite(receiptPath, receipt);
console.log(JSON.stringify(receipt, null, 2));
