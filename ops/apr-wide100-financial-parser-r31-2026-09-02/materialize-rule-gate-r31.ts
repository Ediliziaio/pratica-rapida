import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const snapshot = materializeAprRuleProofs({
  repositoryRoot: process.cwd(),
  rootDirectory: "ops/apr-wide100-financial-parser-r31-2026-09-02/rule-gate-r31",
  rawReportPath: "ops/apr-wide100-financial-parser-r31-2026-09-02/full-vitest-r31.json",
  testCommand: "vitest run --maxWorkers=1 --bail=1 --reporter=json",
});

process.stdout.write(`${JSON.stringify({
  matrixVersion: snapshot.matrixVersion,
  registryVersion: snapshot.registryVersion,
  testedCount: snapshot.testedCount,
  totalCount: snapshot.totalCount,
  deploymentVerified: snapshot.deploymentVerified,
}, null, 2)}\n`);
