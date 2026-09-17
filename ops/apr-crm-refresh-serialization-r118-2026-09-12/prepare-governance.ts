import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";
import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";

const repositoryRoot = process.cwd();
const root = path.join(repositoryRoot, "ops/apr-crm-refresh-serialization-r118-2026-09-12");
const reportPath = path.join(root, "full-vitest-report-chunked.json");
const evidenceRoot = path.join(root, "rule-evidence");
const stagedBundle = path.join(root, "staged-bundle");
const historicalAuditPath = path.join(root, "historical-audit-report-r118.json");
const canonicalCurrent = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current";
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const refreshRuleId = "system-apr-crm-refresh-serialization-v1";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const atomicWrite = (target: string, contents: string) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
};
const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length
  && [...left].sort().every((item, index) => item === [...right].sort()[index]);
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");

const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
  success: boolean;
  testFileCount: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
};
if (!report.success || report.testFileCount !== 238 || report.numFailedTests !== 0 || report.numPendingTests !== 0
  || report.numPassedTests !== report.numTotalTests) throw new Error("r118_full_test_report_not_green");

execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", stagedBundle], { cwd: repositoryRoot, stdio: "inherit" });
for (const executable of ["apr-supervisor.mjs", "apr-enea-worker.mjs"] as const) {
  if (!readFileSync(path.join(stagedBundle, executable), "utf8").includes(refreshRuleId)) {
    throw new Error(`r118_runtime_rule_missing:${executable}:${refreshRuleId}`);
  }
}

const evidence = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory: evidenceRoot,
  rawReportPath: reportPath,
  testCommand: `suite completa a blocchi disgiunti ${report.numPassedTests}/${report.numTotalTests}`,
});
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length) {
  throw new Error(`r118_rule_evidence_incomplete:${evidence.testedCount}/${APR_RULE_TEST_MATRIX.length}`);
}

const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [
    path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json"),
    path.join(repositoryRoot, "ops/apr-operator-responses-runtime-r113-2026-09-11/user-decision-source.json"),
    path.join(repositoryRoot, "ops/apr-authoritative-economic-questions-r116-2026-09-12/user-decision-source.json"),
  ],
});
const audit = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(evidence.rules.filter((item) => item.status !== "pending_test").map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(canonicalCurrent),
  currentBundleText: readBundle(stagedBundle),
});
const unresolved = audit.decisions
  .filter((item) => item.recoveryStatus === "unresolved_documented")
  .map((item) => item.decisionId.replace(/^decision:/u, ""));
if (audit.status !== "incomplete"
  || audit.unresolvedDocumentedDecisionCount !== APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS.length
  || !sameStrings(unresolved, APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS)) {
  throw new Error(`r118_historical_gap_not_exactly_authorized:${JSON.stringify(unresolved)}`);
}
const auditBody = `${JSON.stringify(audit, null, 2)}\n`;
atomicWrite(historicalAuditPath, auditBody);
atomicWrite(`${historicalAuditPath}.sha256`, `${sha256(auditBody)}  ${path.basename(historicalAuditPath)}\n`);

const runnerPath = path.join(repositoryRoot, "scripts/enea-shadow-runner/simple-independent-runner.mjs");
const summary = {
  status: "PASS",
  tests: { files: report.testFileCount, total: report.numTotalTests, passed: report.numPassedTests, failed: 0, pending: 0 },
  matrixRules: APR_RULE_TEST_MATRIX.length,
  testedRules: evidence.testedCount,
  requiredRuntimeRule: refreshRuleId,
  runner: { path: runnerPath, sha256: sha256(readFileSync(runnerPath)) },
  stagedBundleSha256: Object.fromEntries(executables.map((name) => [name, sha256(readFileSync(path.join(stagedBundle, name)))])),
  historicalAudit: historicalAuditPath,
  historicalAuditSha256: sha256(auditBody),
  authorizedHistoricalGapOnly: unresolved,
};
atomicWrite(path.join(root, "gate-preparation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
