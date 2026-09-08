import path from "node:path";
import { writeFileSync } from "node:fs";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = path.resolve(process.cwd());
const rootDirectory = path.join(repositoryRoot, "ops/apr-official-municipality-r55-2026-09-05/rule-gate-r55");
const snapshot = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory,
  rawReportPath: "/private/tmp/apr-r55-combined.json",
  testCommand: "gate r55: sandbox 442/442 suite e 1688/1688 test; integrazione socket/Chrome seriale 2/2 file e 76/76 test",
});
writeFileSync(
  path.join(repositoryRoot, "ops/apr-official-municipality-r55-2026-09-05/rule-proof-materialization-r55.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ testedCount: snapshot.testedCount, totalCount: snapshot.totalCount, deploymentVerified: snapshot.deploymentVerified })}\n`);
