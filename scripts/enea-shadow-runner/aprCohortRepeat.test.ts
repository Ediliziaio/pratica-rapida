import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APR_COHORT_SEED_VERSION, type AprCohortSeedCheckpoint } from "./aprCohortSeed";
import { buildAprCohortRepeatPlan } from "./aprCohortRepeat";

function writeJson(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value)}\n`, "utf8");
}

function seed(candidates: AprCohortSeedCheckpoint["candidates"]): AprCohortSeedCheckpoint {
  return {
    version: APR_COHORT_SEED_VERSION,
    revision: 1,
    status: "armed_readonly",
    sourceEvidenceId: "source-evidence-test",
    candidateFingerprint: "fingerprint",
    candidates,
    externalActionAllowed: false,
    executor: "apr_persistent_runtime",
    repeatTest: null,
    reason: "test",
    nextAction: "test",
    createdAt: "2026-08-23T00:00:00.000Z",
    audit: [{ at: "2026-08-23T00:00:00.000Z", type: "cohort_seeded", reason: "test", appliedRuleIds: ["rule"] }],
  };
}

describe("APR fresh historical cohort repeat", () => {
  it("excludes portal-year-incompatible cases and preserves the other candidates", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-plan-"));
    const candidates = [
      { customerKey: "alpha-case", displayName: "Alpha", productModule: "screening" as const },
      { customerKey: "old-year", displayName: "Old Year", productModule: "infissi" as const },
      { customerKey: "beta-case", displayName: "Beta", productModule: "infissi" as const },
    ];
    writeJson(path.join(root, "cohort-seed/checkpoint.json"), seed(candidates));
    writeJson(path.join(root, "infissi-batch-preflight/checkpoint.json"), {
      items: [{ customerKey: "old-year", report: { blockers: [{ code: "completion_date_portal_year_mismatch", reason: "2025 non compatibile" }] } }],
    });
    const plan = buildAprCohortRepeatPlan({ sourceRoot: root, authorizationId: "user-repeat-test-2026-08-23", sourceEvidenceId: "repeat-evidence-2026-08-23" });
    expect(plan.sourceCandidateCount).toBe(3);
    expect(plan.includedCandidateCount).toBe(2);
    expect(plan.manifest.candidates.map((candidate) => candidate.customerKey)).toEqual(["alpha-case", "beta-case"]);
    expect(plan.manifest.historicalRetest).toEqual({ authorizationId: "user-repeat-test-2026-08-23", preservePriorDrafts: true });
    expect(plan.exclusions).toEqual([expect.objectContaining({ customerKey: "old-year", source: "portal_year_incompatible" })]);
  });

  it("does not infer exclusions from unrelated blockers", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-repeat-plan-negative-"));
    const candidates = [
      { customerKey: "alpha-case", displayName: "Alpha", productModule: "screening" as const },
      { customerKey: "beta-case", displayName: "Beta", productModule: "infissi" as const },
    ];
    writeJson(path.join(root, "cohort-seed/checkpoint.json"), seed(candidates));
    writeJson(path.join(root, "crm-local-preflight/checkpoint.json"), {
      items: [{ customerKey: "alpha-case", report: { blockers: [{ code: "missing_invoice", reason: "missing" }] } }],
    });
    const plan = buildAprCohortRepeatPlan({ sourceRoot: root, authorizationId: "user-repeat-test-2026-08-23", sourceEvidenceId: "repeat-evidence-2026-08-23" });
    expect(plan.includedCandidateCount).toBe(2);
    expect(plan.exclusions).toEqual([]);
  });
});
