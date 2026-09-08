import path from "node:path";
import { materializeAprRuleProofs } from "../../scripts/enea-shadow-runner/aprRuleProofMaterializer";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const rootDirectory = path.join(repositoryRoot, "ops/apr-targeted-excel-ready-r70-2026-09-06/rule-gate-r70-green");
const rawReportPath = path.join(rootDirectory, "rule-activation/vitest-1788717779069-2e0d6ac4-bb8d-4029-850b-0941d7bc8683.json");

const result = materializeAprRuleProofs({
  repositoryRoot,
  rootDirectory,
  rawReportPath,
  testCommand: "vitest run --maxWorkers=1 --testTimeout=30000 src/features/enea-shadow-crm src/features/enea-lab scripts/enea-shadow-runner",
});

process.stdout.write(`${JSON.stringify({
  status: result.status,
  matrixRules: result.passedKeys.length,
  ruleProofs: Object.keys(result.ruleProofs).length,
  sourceFingerprint: result.sourceFingerprint,
}, null, 2)}\n`);
