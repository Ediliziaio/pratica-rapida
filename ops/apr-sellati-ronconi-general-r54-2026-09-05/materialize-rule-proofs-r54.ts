import path from "node:path";
import { writeFileSync } from "node:fs";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = path.resolve(process.cwd());
const rootDirectory = path.join(repositoryRoot, "ops/apr-sellati-ronconi-general-r54-2026-09-05/rule-gate-r54");
const snapshot = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory,
  rawReportPath: "/private/tmp/apr-r54-full.json",
  testCommand: "gate r54: suite completa 444/444 file e 1755/1755 test verdi, inclusi fixture browser locali",
});
writeFileSync(
  path.join(repositoryRoot, "ops/apr-sellati-ronconi-general-r54-2026-09-05/rule-proof-materialization-r54.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ testedCount: snapshot.testedCount, totalCount: snapshot.totalCount, deploymentVerified: snapshot.deploymentVerified })}\n`);
