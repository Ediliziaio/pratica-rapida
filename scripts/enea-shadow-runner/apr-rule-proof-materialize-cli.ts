#!/usr/bin/env node
import path from "node:path";
import { materializeAprRuleProofs } from "./aprRuleProofMaterializer";

const args = process.argv.slice(2);
const required = (name: string) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`Opzione obbligatoria ${name}.`);
  return path.resolve(value);
};

const snapshot = materializeAprRuleProofs({
  repositoryRoot: required("--repository"),
  rootDirectory: required("--root"),
  rawReportPath: required("--raw-report"),
  testCommand: "vitest run --maxWorkers=1 --testTimeout=30000 src/features/enea-shadow-crm src/features/enea-lab scripts/enea-shadow-runner",
});
process.stdout.write(`${JSON.stringify({ status: "materialized", testedCount: snapshot.testedCount, rules: snapshot.rules.length }, null, 2)}\n`);
