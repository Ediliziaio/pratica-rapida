#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateAprCohortSeed } from "../../scripts/enea-shadow-runner/aprCohortSeed";

const operationDir = path.resolve("ops/apr-wide100-province-lineage-2026-09-02");
const manifest = JSON.parse(readFileSync(path.join(operationDir, "manifest.json"), "utf8"));
const historyRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function seedManifest(candidate: any) {
  return {
    version: "apr-cohort-seed-v1",
    sourceEvidenceId: manifest.authorizationId,
    candidates: [{
      customerKey: candidate.customerKey,
      displayName: candidate.displayName,
      practiceId: candidate.practiceId,
      expectedStageType: candidate.stage,
      productModule: candidate.module,
    }],
    authorizedSingleCase: { authorizationId: manifest.authorizationId },
    historicalRetest: { authorizationId: manifest.authorizationId, preservePriorDrafts: true },
  };
}
function diagnose(candidate: any) {
  try {
    validateAprCohortSeed(seedManifest(candidate), historyRoot);
    return { customerKey: candidate.customerKey, displayName: candidate.displayName, practiceId: candidate.practiceId, stage: candidate.stage, result: "accepted" };
  } catch (error) {
    return { customerKey: candidate.customerKey, displayName: candidate.displayName, practiceId: candidate.practiceId, stage: candidate.stage, result: "rejected", error: error instanceof Error ? error.message : String(error) };
  }
}

const stageCases = manifest.cases.filter((item: any) => item.stage === "gestionale").map(diagnose);
const legacyKeys = new Set(["giovanni-dalle-donne", "vittorio-paolinelli", "sara-lionti", "nicoletta-garbarino"]);
const legacyExclusionCases = manifest.cases.filter((item: any) => legacyKeys.has(item.customerKey)).map(diagnose);
const allCaseValidation = manifest.cases.map(diagnose);
const report = {
  version: "apr-wide100-gate-diagnosis-v1",
  observedAt: new Date().toISOString(),
  manifestSha256: sha256(readFileSync(path.join(operationDir, "manifest.json"), "utf8")),
  stageCases,
  legacyExclusionCases,
  allCaseValidation: {
    total: allCaseValidation.length,
    accepted: allCaseValidation.filter((item: any) => item.result === "accepted").length,
    rejected: allCaseValidation.filter((item: any) => item.result === "rejected"),
  },
  finding: stageCases.some((item: any) => item.error === "apr_cohort_seed_practice_scope_invalid") || legacyExclusionCases.some((item: any) => String(item.error).startsWith("apr_cohort_seed_future_test_customer_excluded:")) || allCaseValidation.some((item: any) => item.result === "rejected")
    ? "technical_block_before_wide_execution"
    : "no_reproduced_gate_block",
  externalActionAttempted: false,
};
writeFileSync(path.join(operationDir, "gate-diagnosis.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
