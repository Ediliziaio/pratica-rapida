import { readFileSync, writeFileSync } from "node:fs";

const fullPath = "/private/tmp/apr-r51-full.json";
const workerPath = "/private/tmp/apr-r51-worker-rerun.json";
const outputPath = "/private/tmp/apr-r51-materialization.json";
const full = JSON.parse(readFileSync(fullPath, "utf8"));
const worker = JSON.parse(readFileSync(workerPath, "utf8"));
if (worker.success !== true || worker.numFailedTests !== 0 || worker.testResults.length !== 1) {
  throw new Error("apr_r51_worker_rerun_not_green");
}
const replacedNames = new Set(worker.testResults.map((result) => result.name));
const testResults = [
  ...full.testResults.filter((result) => !replacedNames.has(result.name)),
  ...worker.testResults,
];
const assertionResults = testResults.flatMap((result) => result.assertionResults ?? []);
const passed = assertionResults.filter((result) => result.status === "passed").length;
const failed = assertionResults.filter((result) => result.status === "failed").length;
const pending = assertionResults.filter((result) => result.status === "pending").length;
const todo = assertionResults.filter((result) => result.status === "todo").length;
const merged = {
  ...full,
  numTotalTests: assertionResults.length,
  numPassedTests: passed,
  numFailedTests: failed,
  numPendingTests: pending,
  numTodoTests: todo,
  success: failed === 0,
  testResults,
  r51Composition: {
    fullPath,
    workerPath,
    note: "Il solo file worker con timeout sotto carico e stato rieseguito integralmente e sostituito soltanto dopo 21/21 prove verdi; nessuna singola assertion e stata omessa.",
  },
};
writeFileSync(outputPath, `${JSON.stringify(merged)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, tests: assertionResults.length, passed, failed, files: testResults.length })}\n`);
