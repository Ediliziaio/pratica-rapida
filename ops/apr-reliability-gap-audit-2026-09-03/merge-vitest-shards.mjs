import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const suffix = process.env.APR_VITEST_SUFFIX ?? "";
const reports = Array.from({ length: 8 }, (_, index) =>
  JSON.parse(readFileSync(path.join(directory, `vitest-shard-${index + 1}${suffix}.json`), "utf8")),
);

const sum = (key) => reports.reduce((total, report) => total + Number(report[key] ?? 0), 0);
const merged = {
  numTotalTestSuites: sum("numTotalTestSuites"),
  numPassedTestSuites: sum("numPassedTestSuites"),
  numFailedTestSuites: sum("numFailedTestSuites"),
  numPendingTestSuites: sum("numPendingTestSuites"),
  numTotalTests: sum("numTotalTests"),
  numPassedTests: sum("numPassedTests"),
  numFailedTests: sum("numFailedTests"),
  numPendingTests: sum("numPendingTests"),
  numTodoTests: sum("numTodoTests"),
  startTime: Math.min(...reports.map((report) => report.startTime)),
  success: reports.every((report) => report.success === true),
  testResults: reports.flatMap((report) => report.testResults ?? []),
  shardEvidence: reports.map((report, index) => ({
    shard: `${index + 1}/8`,
    success: report.success,
    tests: report.numTotalTests,
    suites: report.numTotalTestSuites,
  })),
};

const uniqueTests = new Set(
  merged.testResults.flatMap((file) =>
    (file.assertionResults ?? []).map((assertion) => assertion.fullName),
  ),
);
if (!merged.success || merged.numFailedTests !== 0 || merged.numFailedTestSuites !== 0) {
  throw new Error("apr_sharded_suite_not_green");
}
if (uniqueTests.size !== merged.numTotalTests) {
  throw new Error(`apr_duplicate_or_missing_tests:${uniqueTests.size}:${merged.numTotalTests}`);
}

const target = path.join(directory, process.env.APR_VITEST_TARGET ?? "full-vitest-r35-final.json");
writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  target,
  success: merged.success,
  suites: merged.numTotalTestSuites,
  tests: merged.numTotalTests,
  uniqueTests: uniqueTests.size,
}, null, 2)}\n`);
