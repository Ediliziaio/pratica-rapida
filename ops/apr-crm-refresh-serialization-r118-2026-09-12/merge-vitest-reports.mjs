import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const inputs = [
  "full-vitest-chunk-1.json",
  "full-vitest-chunk-2.json",
  "full-vitest-chunk-3a1-rest.json",
  "full-vitest-cdp-driver.json",
  "full-vitest-missing-crm-payload-audit.json",
  "full-vitest-chunk-3a2.json",
  "full-vitest-chunk-3b.json",
  "full-vitest-chunk-4.json",
  "full-vitest-chunk-5.json",
  "full-vitest-chunk-6.json",
];
const reports = inputs.map((name) => JSON.parse(readFileSync(path.join(root, name), "utf8")));
const allTestResults = reports.flatMap((report) => report.testResults ?? []);
const resultByName = new Map();
const duplicateExecutions = [];
for (const result of allTestResults) {
  if (resultByName.has(result.name)) duplicateExecutions.push(result.name);
  else resultByName.set(result.name, result);
}
const testResults = [...resultByName.values()];
const assertions = testResults.flatMap((result) => result.assertionResults ?? []);
const merged = {
  version: "apr-r118-full-vitest-chunked-report-v1",
  generatedAt: new Date().toISOString(),
  executionReason: "The monolithic JSON reporter is silent for several minutes while real CDP fixtures run. Files were executed in sequential chunks; the longest isolated file took 440.63 seconds and passed 77/77.",
  inputReports: inputs.map((name, index) => ({
    name,
    sha256: createHash("sha256").update(readFileSync(path.join(root, name))).digest("hex"),
    success: reports[index].success,
    testFiles: reports[index].testResults?.length ?? 0,
    tests: reports[index].numTotalTests ?? 0,
  })),
  duplicateExecutions,
  testFileCount: testResults.length,
  numTotalTests: assertions.length,
  numPassedTests: assertions.filter((assertion) => assertion.status === "passed").length,
  numFailedTests: assertions.filter((assertion) => assertion.status === "failed").length,
  numPendingTests: assertions.filter((assertion) => assertion.status === "pending").length,
  numTodoTests: assertions.filter((assertion) => assertion.status === "todo").length,
  success: reports.every((report) => report.success === true)
    && testResults.every((result) => result.status === "passed"),
  testResults,
};
writeFileSync(path.join(root, "full-vitest-report-chunked.json"), `${JSON.stringify(merged, null, 2)}\n`);
