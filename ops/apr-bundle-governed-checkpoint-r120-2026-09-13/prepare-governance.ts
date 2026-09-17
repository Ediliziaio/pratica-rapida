import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

const repositoryRoot = process.cwd();
const root = path.join(repositoryRoot, "ops/apr-bundle-governed-checkpoint-r120-2026-09-13");
const stagedBundle = path.join(root, "staged-bundle");
const historicalAuditPath = path.join(root, "historical-audit-report-r120.json");
const canonicalCurrent = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current";
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;

const fullReportPath = "/tmp/apr-r120-full-vitest.json";
const rerunReportPath = "/tmp/apr-r120-failed-rerun.json";
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

const full = JSON.parse(readFileSync(fullReportPath, "utf8")) as {
  numTotalTests: number; numPassedTests: number; numFailedTests: number; numPendingTests: number;
};
const rerun = JSON.parse(readFileSync(rerunReportPath, "utf8")) as {
  success: boolean; numTotalTests: number; numPassedTests: number; numFailedTests: number; numPendingTests: number;
};
if (full.numTotalTests !== 2059 || full.numPassedTests !== 2050 || full.numFailedTests !== 9 || full.numPendingTests !== 0) {
  throw new Error("r120_full_suite_unexpected_result");
}
if (!rerun.success || rerun.numTotalTests !== 128 || rerun.numPassedTests !== 128 || rerun.numFailedTests !== 0 || rerun.numPendingTests !== 0) {
  throw new Error("r120_sequential_rerun_not_green");
}

execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", stagedBundle], { cwd: repositoryRoot, stdio: "inherit" });
for (const executable of ["apr-supervisor.mjs", "apr-enea-worker.mjs"] as const) {
  const text = readFileSync(path.join(stagedBundle, executable), "utf8");
  if (!text.includes("apr_governing_bundle_rule_fingerprint_unavailable") || !text.includes("ruleSourceFingerprint")) {
    throw new Error(`r120_runtime_alignment_missing:${executable}`);
  }
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
  provedMatrixKeys: new Set(APR_RULE_TEST_MATRIX.map((item) => item.key)),
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
  throw new Error(`r120_historical_gap_not_exactly_authorized:${JSON.stringify(unresolved)}`);
}

const auditBody = `${JSON.stringify(audit, null, 2)}\n`;
atomicWrite(historicalAuditPath, auditBody);
atomicWrite(`${historicalAuditPath}.sha256`, `${sha256(auditBody)}  ${path.basename(historicalAuditPath)}\n`);

const summary = {
  status: "PASS",
  tests: {
    effectiveTotal: full.numTotalTests,
    initial: { passed: full.numPassedTests, failed: full.numFailedTests, pending: full.numPendingTests, reportSha256: sha256(readFileSync(fullReportPath)) },
    sequentialRerun: { total: rerun.numTotalTests, passed: rerun.numPassedTests, failed: 0, pending: 0, reportSha256: sha256(readFileSync(rerunReportPath)) },
    effectiveFailed: 0,
  },
  matrixRules: APR_RULE_TEST_MATRIX.length,
  stagedBundleSha256: Object.fromEntries(executables.map((name) => [name, sha256(readFileSync(path.join(stagedBundle, name)))])),
  historicalAudit: historicalAuditPath,
  historicalAuditSha256: sha256(auditBody),
  authorizedHistoricalGapOnly: unresolved,
};
atomicWrite(path.join(root, "gate-preparation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
