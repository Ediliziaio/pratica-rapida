import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AprCohortSeedCheckpoint, AprCohortSeedManifest } from "./aprCohortSeed";
import { APR_COHORT_SEED_VERSION } from "./aprCohortSeed";
import { aprFutureTestExclusion } from "./aprFutureTestExclusions";

export const APR_COHORT_REPEAT_PLAN_VERSION = "apr-cohort-repeat-plan-v1" as const;
export const APR_COHORT_REPEAT_RULE_ID = "user-2026-08-23-repeat-forty-after-persistent-rules" as const;
export const APR_PORTAL_YEAR_EXCLUSION_RULE_ID = "user-2026-08-23-completion-portal-year-operator-gate" as const;

interface PreflightItem {
  customerKey?: string;
  report?: { blockers?: Array<{ code?: string; reason?: string }> };
}

interface PreflightCheckpoint {
  items?: PreflightItem[];
}

export interface AprCohortRepeatExclusion {
  customerKey: string;
  displayName: string;
  reason: string;
  source: "future_test_registry" | "portal_year_incompatible";
  appliedRuleIds: string[];
}

export interface AprCohortRepeatPlan {
  version: typeof APR_COHORT_REPEAT_PLAN_VERSION;
  sourceFingerprint: string;
  sourceCandidateCount: number;
  includedCandidateCount: number;
  exclusions: AprCohortRepeatExclusion[];
  manifest: AprCohortSeedManifest;
}

function loadJson<T>(target: string): T | null {
  if (!existsSync(target)) return null;
  return JSON.parse(readFileSync(target, "utf8")) as T;
}

function portalYearBlockers(sourceRoot: string) {
  const result = new Map<string, string>();
  for (const relative of ["crm-local-preflight/checkpoint.json", "infissi-batch-preflight/checkpoint.json"]) {
    const checkpoint = loadJson<PreflightCheckpoint>(path.join(sourceRoot, relative));
    for (const item of checkpoint?.items ?? []) {
      if (!item.customerKey) continue;
      const blocker = item.report?.blockers?.find((candidate) => candidate.code === "completion_date_portal_year_mismatch");
      if (blocker) result.set(item.customerKey, blocker.reason ?? "Anno fine lavori incompatibile con il portale ENEA della coorte.");
    }
  }
  return result;
}

export function buildAprCohortRepeatPlan(input: {
  sourceRoot: string;
  authorizationId: string;
  sourceEvidenceId: string;
}) {
  const sourceRoot = path.resolve(input.sourceRoot);
  const seed = loadJson<AprCohortSeedCheckpoint>(path.join(sourceRoot, "cohort-seed", "checkpoint.json"));
  if (!seed || seed.version !== APR_COHORT_SEED_VERSION || seed.executor !== "apr_persistent_runtime") {
    throw new Error("apr_cohort_repeat_source_seed_invalid");
  }
  if (!/^[a-z0-9][a-z0-9._:-]{7,255}$/.test(input.authorizationId)) throw new Error("apr_cohort_repeat_authorization_invalid");
  if (!/^[a-z0-9][a-z0-9._:-]{7,255}$/.test(input.sourceEvidenceId)) throw new Error("apr_cohort_repeat_evidence_invalid");
  const yearBlockers = portalYearBlockers(sourceRoot);
  const exclusions: AprCohortRepeatExclusion[] = [];
  const candidates = seed.candidates.filter((candidate) => {
    const permanent = aprFutureTestExclusion(candidate.customerKey);
    if (permanent) {
      exclusions.push({
        customerKey: candidate.customerKey,
        displayName: candidate.displayName,
        reason: permanent.reason,
        source: "future_test_registry",
        appliedRuleIds: ["user-2026-08-18-future-test-exclusions"],
      });
      return false;
    }
    const yearReason = yearBlockers.get(candidate.customerKey);
    if (yearReason) {
      exclusions.push({
        customerKey: candidate.customerKey,
        displayName: candidate.displayName,
        reason: yearReason,
        source: "portal_year_incompatible",
        appliedRuleIds: [APR_PORTAL_YEAR_EXCLUSION_RULE_ID],
      });
      return false;
    }
    return true;
  });
  if (candidates.length < 2 || candidates.length > 40) throw new Error(`apr_cohort_repeat_candidate_count_invalid:${candidates.length}`);
  const sourceFingerprint = createHash("sha256").update(JSON.stringify({
    source: seed.candidateFingerprint,
    candidates,
    exclusions,
  })).digest("hex");
  const manifest: AprCohortSeedManifest = {
    version: APR_COHORT_SEED_VERSION,
    sourceEvidenceId: input.sourceEvidenceId,
    candidates,
    authorizedBatch: { authorizationId: input.authorizationId, exactCount: candidates.length },
    historicalRetest: { authorizationId: input.authorizationId, preservePriorDrafts: true },
  };
  return {
    version: APR_COHORT_REPEAT_PLAN_VERSION,
    sourceFingerprint,
    sourceCandidateCount: seed.candidates.length,
    includedCandidateCount: candidates.length,
    exclusions,
    manifest,
  } satisfies AprCohortRepeatPlan;
}
