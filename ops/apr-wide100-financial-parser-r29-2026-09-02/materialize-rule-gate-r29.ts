import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const snapshot = materializeAprRuleProofs({
  repositoryRoot: process.cwd(),
  rootDirectory: "ops/apr-wide100-financial-parser-r29-2026-09-02/rule-gate-r29",
  rawReportPath: "ops/apr-wide100-financial-parser-r29-2026-09-02/full-vitest-final-r29.json",
  testCommand: "vitest run --maxWorkers=1 --reporter=json",
});

process.stdout.write(`${JSON.stringify({
  matrixVersion: snapshot.matrixVersion,
  registryVersion: snapshot.registryVersion,
  testedCount: snapshot.testedCount,
  totalCount: snapshot.totalCount,
  deploymentVerified: snapshot.deploymentVerified,
}, null, 2)}\n`);
