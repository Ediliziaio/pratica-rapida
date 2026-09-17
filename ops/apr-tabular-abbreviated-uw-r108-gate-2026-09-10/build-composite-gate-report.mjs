import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const fullPath = path.join(root, "full-vitest-report.json");
const socketPath = path.join(root, "socket-integration-report.json");
const outputPath = path.join(root, "composite-vitest-report.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fullText = readFileSync(fullPath, "utf8");
const socketText = readFileSync(socketPath, "utf8");
const full = JSON.parse(fullText);
const socket = JSON.parse(socketText);
const allowedEnvironmentalFiles = new Set([
  "scripts/enea-shadow-runner/cdpClientTimeout.test.ts",
  "scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts",
]);
const relative = (value) => path.relative(process.cwd(), value);
const failedFiles = full.testResults.filter((item) => item.status !== "passed");
if (full.numFailedTests !== 47 || failedFiles.length !== 2 || failedFiles.some((item) => !allowedEnvironmentalFiles.has(relative(item.name)))) {
  throw new Error(`unexpected_full_suite_failures:${JSON.stringify(failedFiles.map((item) => relative(item.name)))}`);
}
if (!socket.success || socket.numFailedTests !== 0 || socket.testResults.length !== 2) throw new Error("socket_integration_not_green");
const socketByFile = new Map(socket.testResults.map((item) => [relative(item.name), item]));
for (const file of allowedEnvironmentalFiles) {
  const replacement = socketByFile.get(file);
  if (!replacement || replacement.status !== "passed" || replacement.assertionResults.some((item) => item.status !== "passed")) {
    throw new Error(`socket_replacement_invalid:${file}`);
  }
  const original = full.testResults.find((item) => relative(item.name) === file);
  const originalNames = (original?.assertionResults ?? []).map((item) => item.fullName).sort();
  const replacementNames = replacement.assertionResults.map((item) => item.fullName).sort();
  if (JSON.stringify(originalNames) !== JSON.stringify(replacementNames)) throw new Error(`socket_test_inventory_changed:${file}`);
}
const testResults = full.testResults.map((item) => socketByFile.get(relative(item.name)) ?? item);
const allAssertions = testResults.flatMap((item) => item.assertionResults);
if (allAssertions.some((item) => item.status !== "passed")) throw new Error("composite_assertion_not_green");
const output = {
  ...full,
  numPassedTestSuites: full.numTotalTestSuites,
  numFailedTestSuites: 0,
  numPassedTests: full.numTotalTests,
  numFailedTests: 0,
  success: true,
  testResults,
  aprEnvironmentComposition: {
    version: "apr-environment-composite-vitest-report-v1",
    sandboxFullReport: { path: fullPath, sha256: sha256(fullText), passedTests: full.numPassedTests, environmentalFailures: full.numFailedTests },
    unrestrictedSocketReport: { path: socketPath, sha256: sha256(socketText), passedTests: socket.numPassedTests, failedTests: socket.numFailedTests },
    replacedFiles: [...allowedEnvironmentalFiles].sort(),
    invariant: "Only the two allowlisted CDP/socket test files may be replaced, with an identical test-name inventory and an all-green unrestricted run.",
  },
};
const body = `${JSON.stringify(output, null, 2)}\n`;
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporaryPath, body, { encoding: "utf8", mode: 0o600 });
renameSync(temporaryPath, outputPath);
writeFileSync(`${outputPath}.sha256`, `${sha256(body)}  ${path.basename(outputPath)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ outputPath, total: output.numTotalTests, passed: output.numPassedTests, failed: output.numFailedTests, success: output.success }));
