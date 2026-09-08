import path from "node:path";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = process.cwd();
const rootDirectory = path.join(repositoryRoot, "ops/apr-reliability-gap-audit-2026-09-03/rule-gate-r45");
const rawReportPath = path.join(repositoryRoot, "ops/apr-reliability-gap-audit-2026-09-03/full-vitest-r45-final.json");
materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory,
  rawReportPath,
  testCommand: "vitest full suite: 8 deterministic shards; shard 2 executed file-by-file; loopback suites separately authorized",
});
process.stdout.write(`${JSON.stringify({ status: "materialized", rootDirectory }, null, 2)}\n`);
