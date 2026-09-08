import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const directory = path.dirname(new URL(import.meta.url).pathname);
const reports = Array.from({ length: 28 }, (_, index) => JSON.parse(readFileSync(
  path.join(directory, `vitest-shard-2-file-${String(index + 1).padStart(2, "0")}-r43.json`),
  "utf8",
)));
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
};
if (!merged.success || merged.numFailedTests || merged.numFailedTestSuites) throw new Error("shard2_file_gate_not_green");
writeFileSync(path.join(directory, "vitest-shard-2-r43.json"), `${JSON.stringify(merged, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ success: merged.success, suites: merged.numTotalTestSuites, tests: merged.numTotalTests })}\n`);
