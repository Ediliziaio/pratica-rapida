import path from "node:path";
import { writeFileSync } from "node:fs";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = path.resolve(process.cwd());
const rootDirectory = path.join(repositoryRoot, "ops/apr-recovery-accounting-candidate-r50-2026-09-04/rule-gate-r50");
const rawReportPath = "/private/tmp/apr-r50-materialization.json";
const testCommand = "gate r50: full non-CDP seriale + loopback seriale + CDP seriale; report composto solo per materializzazione prove";
const snapshot = materializeAprRuleProofs({ repositoryRoot, rootDirectory, rawReportPath, testCommand });
writeFileSync(
  path.join(repositoryRoot, "ops/apr-recovery-accounting-candidate-r50-2026-09-04/rule-proof-materialization-r50.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ testedCount: snapshot.testedCount, totalCount: snapshot.totalCount, deploymentVerified: snapshot.deploymentVerified })}\n`);
