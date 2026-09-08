import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const snapshot = materializeAprRuleProofs({
  repositoryRoot: process.cwd(),
  rootDirectory: "ops/apr-reliability-gap-audit-2026-09-03/rule-gate-r43",
  rawReportPath: "ops/apr-reliability-gap-audit-2026-09-03/full-vitest-r43-final.json",
  testCommand: "vitest run in 8 deterministic file shards --pool=forks --maxWorkers=1",
});

process.stdout.write(`${JSON.stringify({
  matrixVersion: snapshot.matrixVersion,
  registryVersion: snapshot.registryVersion,
  testedCount: snapshot.testedCount,
  totalCount: snapshot.totalCount,
  deploymentVerified: snapshot.deploymentVerified,
}, null, 2)}\n`);
