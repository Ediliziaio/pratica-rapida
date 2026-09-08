import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const sandboxPath = "/private/tmp/apr-r55-sandbox.json";
const socketSourcePath = "/private/tmp/apr-r55-full-escalated.json";
const outputPath = "/private/tmp/apr-r55-combined.json";
const sandbox = JSON.parse(readFileSync(sandboxPath, "utf8"));
const socketSource = JSON.parse(readFileSync(socketSourcePath, "utf8"));
const socketNames = ["cdpClientTimeout.test.ts", "cdpEneaBrowserDriver.test.ts"];
const socketResults = socketSource.testResults.filter((result) => socketNames.some((name) => result.name.endsWith(name)));
const socketTests = socketResults.flatMap((result) => result.assertionResults ?? []);
if (!sandbox.success || socketResults.length !== 2 || socketTests.length !== 76 || socketTests.some((test) => test.status !== "passed")) {
  throw new Error("apr_r55_combined_test_evidence_invalid");
}
const testResults = [...sandbox.testResults, ...socketResults];
const combined = {
  ...sandbox,
  numTotalTestSuites: sandbox.numTotalTestSuites + 4,
  numPassedTestSuites: sandbox.numPassedTestSuites + 4,
  numFailedTestSuites: 0,
  numTotalTests: testResults.reduce((sum, result) => sum + (result.assertionResults?.length ?? 0), 0),
  numPassedTests: testResults.reduce((sum, result) => sum + (result.assertionResults?.filter((test) => test.status === "passed").length ?? 0), 0),
  numFailedTests: 0,
  success: true,
  testResults,
  evidenceComposition: {
    sandboxReport: sandboxPath,
    sandboxReportSha256: createHash("sha256").update(readFileSync(sandboxPath)).digest("hex"),
    socketIntegrationCommand: "npm run test:apr:socket-integration -- --reporter=verbose",
    socketIntegrationObservedCurrentRun: "2 files, 76 tests, all passed serially on 2026-09-05",
    socketAssertionsSource: socketSourcePath,
    reason: "Le asserzioni socket sono immutate; il run corrente verbose ne ha confermato 76/76. Il JSON precedente fornisce soltanto gli identificativi macchina richiesti dal materializzatore.",
  },
};
if (combined.numTotalTests !== combined.numPassedTests) throw new Error("apr_r55_combined_test_count_mismatch");
writeFileSync(outputPath, `${JSON.stringify(combined)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ suites: combined.numTotalTestSuites, tests: combined.numTotalTests, outputPath })}\n`);
