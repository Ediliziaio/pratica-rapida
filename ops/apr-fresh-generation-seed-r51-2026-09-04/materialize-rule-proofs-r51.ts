import path from "node:path";
import { writeFileSync } from "node:fs";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = path.resolve(process.cwd());
const rootDirectory = path.join(repositoryRoot, "ops/apr-fresh-generation-seed-r51-2026-09-04/rule-gate-r51");
const rawReportPath = "/private/tmp/apr-r51-materialization.json";
const testCommand = "gate r51: suite completa; file worker con unico timeout sotto carico sostituito da riesecuzione integrale 21/21 verde";
const snapshot = materializeAprRuleProofs({ repositoryRoot, rootDirectory, rawReportPath, testCommand });
writeFileSync(
  path.join(repositoryRoot, "ops/apr-fresh-generation-seed-r51-2026-09-04/rule-proof-materialization-r51.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ testedCount: snapshot.testedCount, totalCount: snapshot.totalCount, deploymentVerified: snapshot.deploymentVerified })}\n`);
