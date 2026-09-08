import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const directory = path.dirname(new URL(import.meta.url).pathname);
const reports = Array.from({ length: 8 }, (_, index) => JSON.parse(readFileSync(
  path.join(directory, `vitest-shard-${index + 1}-r46.json`),
  "utf8",
)));
const sum = (key) => reports.reduce((total, report) => total + Number(report[key] ?? 0), 0);
const testResults = reports.flatMap((report) => report.testResults ?? []);
const names = testResults.map((result) => result.name);
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
  testFileCount: names.length,
  uniqueTestFileCount: new Set(names).size,
  testResults,
};
if (!merged.success || merged.numFailedTests || merged.numFailedTestSuites || merged.uniqueTestFileCount !== merged.testFileCount) {
  throw new Error("full_r46_gate_not_green_or_duplicate");
}
writeFileSync(path.join(directory, "full-vitest-r46-final.json"), `${JSON.stringify(merged, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ success: merged.success, suites: merged.numTotalTestSuites, testFiles: merged.testFileCount, uniqueTestFiles: merged.uniqueTestFileCount, tests: merged.numTotalTests })}\n`);
