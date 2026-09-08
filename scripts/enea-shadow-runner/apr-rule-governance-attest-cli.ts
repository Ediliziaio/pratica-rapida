#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildAprRuleGovernanceAttestation, verifyAprRuleGovernanceAdmission } from "./aprRuleGovernanceAdmission";

const args = process.argv.slice(2);
const required = (name: string) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`Opzione obbligatoria ${name}.`);
  return path.resolve(value);
};

const bundleDirectory = required("--bundle-dir");
const historicalAuditReport = required("--historical-audit");
const output = required("--output");
const allowAuthorizedHistoricalGap = args.includes("--allow-authorized-historical-gap");
const attestation = buildAprRuleGovernanceAttestation({ bundleDirectory, historicalAuditReport, allowAuthorizedHistoricalGap });
writeFileSync(output, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
const admission = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"].map((name) => verifyAprRuleGovernanceAdmission({ executablePath: path.join(bundleDirectory, name), attestationPath: output }));
if (admission.some((item) => item.status !== "admitted")) throw new Error(`apr_rule_governance_staged_admission_failed:${JSON.stringify(admission.map((item) => item.failures))}`);
process.stdout.write(`${JSON.stringify({ status: attestation.status, output, bundleSha256: attestation.bundleSha256, admittedExecutables: admission.length }, null, 2)}\n`);
