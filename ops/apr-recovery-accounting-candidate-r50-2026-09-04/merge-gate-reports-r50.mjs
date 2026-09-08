import { readFileSync, writeFileSync } from "node:fs";

const baselinePath = "/private/tmp/apr-r49-serial.json";
const targetedPath = "/private/tmp/apr-r50-targeted.json";
const outputPath = "/private/tmp/apr-r50-materialization.json";
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const targeted = JSON.parse(readFileSync(targetedPath, "utf8"));
const replacedNames = new Set(targeted.testResults.map((result) => result.name));
const testResults = [
  ...baseline.testResults.filter((result) => !replacedNames.has(result.name)),
  ...targeted.testResults,
];
const assertionResults = testResults.flatMap((result) => result.assertionResults ?? []);
const passed = assertionResults.filter((result) => result.status === "passed").length;
const failed = assertionResults.filter((result) => result.status === "failed").length;
const pending = assertionResults.filter((result) => result.status === "pending").length;
const todo = assertionResults.filter((result) => result.status === "todo").length;
const merged = {
  ...baseline,
  numTotalTests: assertionResults.length,
  numPassedTests: passed,
  numFailedTests: failed,
  numPendingTests: pending,
  numTodoTests: todo,
  success: failed === 0,
  testResults,
  r50Composition: {
    baselinePath,
    targetedPath,
    note: "Il report serve soltanto alla materializzazione delle prove per regola. Il gate r50 corrente e attestato separatamente dalle esecuzioni complete non-CDP, loopback e CDP.",
  },
};
writeFileSync(outputPath, `${JSON.stringify(merged)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, tests: assertionResults.length, passed, failed, files: testResults.length })}\n`);
