import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = import.meta.dirname;
const reportPath = path.join(root, "local-replay-r31.json");
const manifestPath = path.resolve(root, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors: string[] = [];
const manifestByKey = new Map(manifest.cases.map((item: any) => [item.customerKey, item]));

if (report.cases.length !== 100 || manifest.cases.length !== 100) errors.push("case_count_not_100");
if (new Set(report.cases.map((item: any) => item.customerKey)).size !== 100) errors.push("customer_keys_not_unique");
if (new Set(report.cases.map((item: any) => item.practiceId)).size !== 100) errors.push("practice_ids_not_unique");
if (new Set(report.cases.map((item: any) => item.operationalCohort)).size !== 100) errors.push("cohorts_not_unique");

for (const item of report.cases) {
  const frozen: any = manifestByKey.get(item.customerKey);
  if (!frozen || frozen.practiceId !== item.practiceId || 2920 + frozen.cohort !== item.operationalCohort) errors.push(`manifest_identity:${item.customerKey}`);
  const acquisition = JSON.parse(readFileSync(path.join(item.stateDirectory, "crm-acquisition/checkpoint.json"), "utf8"));
  const acquired = acquisition.items.filter((candidate: any) => candidate.customerKey === item.customerKey);
  if (acquisition.status !== "completed" || acquired.length !== 1 || acquired[0].state !== "acquired" || acquired[0].practiceId !== item.practiceId) errors.push(`acquisition_identity:${item.customerKey}`);
  const dossier = JSON.parse(readFileSync(acquired[0].dossierPath, "utf8"));
  if (dossier.row?.id !== item.practiceId) errors.push(`dossier_identity:${item.customerKey}`);
  if (item.blockerCount !== item.blockers.length) errors.push(`blocker_count:${item.customerKey}`);
  if (item.outcome === "READY_LOCAL" && item.blockers.length !== 0) errors.push(`ready_with_blockers:${item.customerKey}`);
  if (item.outcome === "OPERATOR_REQUIRED_LOCAL" && item.blockers.length === 0) errors.push(`operator_without_blockers:${item.customerKey}`);
  if (!item.safety.localOnly || item.safety.externalActionAllowed !== false) errors.push(`unsafe_case:${item.customerKey}`);
}

const outcomes = Object.fromEntries([...new Set(report.cases.map((item: any) => item.outcome))].map((key: any) => [key, report.cases.filter((item: any) => item.outcome === key).length]));
if (JSON.stringify(outcomes) !== JSON.stringify(report.summary.countsByOutcome)) errors.push("outcome_summary_mismatch");
const validation = {
  schemaVersion: "apr-wide100-local-replay-independent-validation-v1",
  validatedAt: new Date().toISOString(),
  status: errors.length ? "FAIL" : "PASS",
  checks: {
    frozenManifestIdentity: errors.every((item) => !item.startsWith("manifest_identity")),
    acquisitionIdentity: errors.every((item) => !item.startsWith("acquisition_identity")),
    dossierIdentity: errors.every((item) => !item.startsWith("dossier_identity")),
    resultInvariants: errors.every((item) => !/^(blocker_count|ready_with_blockers|operator_without_blockers|outcome_summary)/.test(item)),
    localSafety: errors.every((item) => !item.startsWith("unsafe_case")),
  },
  caseCount: report.cases.length,
  errors,
  reportSha256: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
};
writeFileSync(path.join(root, "independent-validation-r31.json"), `${JSON.stringify(validation, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
