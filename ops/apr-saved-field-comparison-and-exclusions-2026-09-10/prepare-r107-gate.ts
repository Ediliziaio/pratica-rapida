import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

type VitestReport = {
  success: boolean;
  startTime: number;
  testResults: unknown[];
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numPendingTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  snapshot: unknown;
};
const repositoryRoot = path.resolve(".");
const auditRoot = path.resolve("ops/apr-saved-field-comparison-and-exclusions-2026-09-10");
const gateRoot = path.resolve("ops/apr-ideal-sistem-exclusion-r107-gate-2026-09-10");
const evidenceRoot = path.join(gateRoot, "rule-evidence");
const stagedBundle = path.join(gateRoot, "staged-bundle");
mkdirSync(gateRoot, { recursive: true, mode: 0o700 });
const reports = ["full-vitest-sandbox-serial-report.json", "socket-integration-report.json"]
  .map((name) => JSON.parse(readFileSync(path.join(auditRoot, name), "utf8")) as VitestReport);
if (reports.some((report) => !report.success || report.numFailedTests !== 0)) throw new Error("r107_gate_source_test_report_not_green");
const sum = (field: keyof VitestReport) => reports.reduce((total, report) => total + Number(report[field]), 0);
const merged: VitestReport = {
  success: true,
  startTime: Math.min(...reports.map((report) => report.startTime)),
  testResults: reports.flatMap((report) => report.testResults),
  numTotalTestSuites: sum("numTotalTestSuites"), numPassedTestSuites: sum("numPassedTestSuites"), numFailedTestSuites: 0, numPendingTestSuites: sum("numPendingTestSuites"),
  numTotalTests: sum("numTotalTests"), numPassedTests: sum("numPassedTests"), numFailedTests: 0, numPendingTests: sum("numPendingTests"), numTodoTests: sum("numTodoTests"),
  snapshot: reports[0].snapshot,
};
const mergedPath = path.join(gateRoot, "full-vitest-report.json");
writeFileSync(mergedPath, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", stagedBundle], { cwd: repositoryRoot, stdio: "inherit" });
const evidence = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory: evidenceRoot,
  rawReportPath: mergedPath,
  testCommand: "vitest completo: sandbox seriale + CDP/socket seriale nell'ambiente locale",
});
if (evidence.testedCount !== APR_RULE_TEST_MATRIX.length) throw new Error(`r107_rule_evidence_incomplete:${evidence.testedCount}/${APR_RULE_TEST_MATRIX.length}`);
process.stdout.write(`${JSON.stringify({
  tests: { total: merged.numTotalTests, passed: merged.numPassedTests },
  matrixRules: APR_RULE_TEST_MATRIX.length,
  testedRules: evidence.testedCount,
  mergedReport: mergedPath,
  mergedReportSha256: createHash("sha256").update(readFileSync(mergedPath)).digest("hex"),
  stagedBundle,
}, null, 2)}\n`);
