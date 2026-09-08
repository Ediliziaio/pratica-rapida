import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const snapshot = materializeAprRuleProofs({
  repositoryRoot: process.cwd(),
  rootDirectory: "ops/apr-wide100-province-lineage-2026-09-02/rule-gate-r26",
  rawReportPath: "ops/apr-wide100-province-lineage-2026-09-02/rule-gate-r26/rule-activation/vitest-1788342512614-9d83d72a-b2cb-47e3-9312-96f54768d0b3.json",
  testCommand: "vitest run --maxWorkers=1 --testTimeout=30000 src/features/enea-shadow-crm src/features/enea-lab scripts/enea-shadow-runner",
});

process.stdout.write(`${JSON.stringify({
  matrixVersion: snapshot.matrixVersion,
  registryVersion: snapshot.registryVersion,
  testedCount: snapshot.testedCount,
  totalCount: snapshot.totalCount,
  deploymentVerified: snapshot.deploymentVerified,
}, null, 2)}\n`);
