import path from "node:path";
import { writeFileSync } from "node:fs";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = path.resolve(process.cwd());
const rootDirectory = path.join(repositoryRoot, "ops/apr-recovery-prepared-window-r49-2026-09-04/rule-gate-r49");
const rawReportPath = "/private/tmp/apr-r49-serial.json";
const testCommand = "vitest run --maxWorkers=1 --testTimeout=30000";
const snapshot = materializeAprRuleProofs({ repositoryRoot, rootDirectory, rawReportPath, testCommand });
writeFileSync(
  path.join(repositoryRoot, "ops/apr-recovery-prepared-window-r49-2026-09-04/rule-proof-materialization-r49.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ testedCount: snapshot.testedCount, totalCount: snapshot.totalCount, deploymentVerified: snapshot.deploymentVerified })}\n`);
