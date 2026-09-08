import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const snapshot = materializeAprRuleProofs({
  repositoryRoot: process.cwd(),
  rootDirectory: "ops/apr-overnight-review-2026-09-03/rule-gate-r32",
  rawReportPath: "ops/apr-overnight-review-2026-09-03/full-vitest-post-date.json",
  testCommand: "vitest run --maxWorkers=1 --bail=1 --reporter=json",
});

process.stdout.write(`${JSON.stringify({
  matrixVersion: snapshot.matrixVersion,
  registryVersion: snapshot.registryVersion,
  testedCount: snapshot.testedCount,
  totalCount: snapshot.totalCount,
  deploymentVerified: snapshot.deploymentVerified,
}, null, 2)}\n`);
