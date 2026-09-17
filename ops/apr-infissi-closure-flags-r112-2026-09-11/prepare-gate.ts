import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";
import { APR_AUTHORIZED_HISTORICAL_GAP_DECISION_IDS } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";

const repositoryRoot = process.cwd();
const gateRoot = path.join(repositoryRoot, "ops/apr-infissi-closure-flags-r112-2026-09-11");
const evidenceRoot = path.join(gateRoot, "rule-evidence");
const stagedBundle = path.join(gateRoot, "staged-bundle");
const rawReport = path.join(gateRoot, "full-vitest-report-outside-sandbox.json");
const historicalAudit = path.join(gateRoot, "historical-audit-report-r112.json");
const canonicalCurrent = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle/current";
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const requiredRuntimeRules = {
  "apr-supervisor.mjs": [USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable],
  "apr-enea-worker.mjs": [USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable],
} as const;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const atomicWrite = (target: string, contents: string) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
};
const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length
  && [...left].sort().every((item, index) => item === [...right].sort()[index]);

const report = JSON.parse(readFileSync(rawReport, "utf8")) as {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
};
if (!report.success || report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numPassedTests !== report.numTotalTests) {
  throw new Error("r112_source_test_report_not_green");
}

mkdirSync(gateRoot, { recursive: true, mode: 0o700 });
execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", stagedBundle], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

for (const [executable, ruleIds] of Object.entries(requiredRuntimeRules)) {
  const text = readFileSync(path.join(stagedBundle, executable), "utf8");
  const missing = ruleIds.filter((ruleId) => !text.includes(ruleId));
  if (missing.length) throw new Error(`r112_runtime_rules_missing:${executable}:${missing.join(",")}`);
}

const evidence = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory: evidenceRoot,
  rawReportPath: rawReport,
  testCommand: `vitest completo seriale fuori sandbox: ${report.numPassedTests}/${report.numTotalTests} verde`,
});
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length) {
  throw new Error(`r112_rule_evidence_incomplete:${evidence.testedCount}/${APR_RULE_TEST_MATRIX.length}`);
}

const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [
    path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json"),
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
  throw new Error(`r112_historical_gap_not_exactly_authorized:${JSON.stringify(unresolved)}`);
}
const auditBody = `${JSON.stringify(audit, null, 2)}\n`;
atomicWrite(historicalAudit, auditBody);
atomicWrite(`${historicalAudit}.sha256`, `${sha256(auditBody)}  ${path.basename(historicalAudit)}\n`);

const summary = {
  status: "PASS",
  tests: { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests },
  matrixRules: APR_RULE_TEST_MATRIX.length,
  testedRules: evidence.testedCount,
  requiredRuntimeRules,
  stagedBundleSha256: Object.fromEntries(executables.map((name) => [name, sha256(readFileSync(path.join(stagedBundle, name)))])),
  historicalAudit,
  historicalAuditSha256: sha256(auditBody),
  authorizedHistoricalGapOnly: unresolved,
};
atomicWrite(path.join(gateRoot, "gate-preparation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
