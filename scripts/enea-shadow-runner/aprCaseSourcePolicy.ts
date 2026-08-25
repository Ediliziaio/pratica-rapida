import type {
  AprCaseBlockerApplicability,
  AprCaseObservationSource,
  AprCaseProductModule,
  AprCaseStatusObservation,
  AprNormalizedObservationStatus,
  AprPipelineStage,
} from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

export const APR_CASE_SOURCE_POLICY_VERSION = "apr-case-source-policy-v2" as const;

export type AprCaseSourceRequirement = "required" | "not_applicable_expected";
export type AprCaseSourcePolicy = Record<"preflight_common" | "product_gate" | "deep_review" | "execution" | "server_verification", AprCaseSourceRequirement>;

export interface AprCaseSourcePolicyResolution {
  policy: AprCaseSourcePolicy;
  effectiveCommonStatus: AprNormalizedObservationStatus;
  ignoredCommonBlockerCodes: readonly string[];
}

function moduleApplies(routedProductModule: AprCaseProductModule, applicability: AprCaseBlockerApplicability) {
  if (routedProductModule === "mixed" || routedProductModule === "unresolved") return true;
  return applicability.productModules.includes(routedProductModule);
}

export function resolveAprCaseSourcePolicy(input: {
  commonStatus: AprNormalizedObservationStatus;
  commonBlockerCodes?: readonly string[];
  commonBlockerApplicability?: readonly AprCaseBlockerApplicability[];
  routedProductModule?: AprCaseProductModule;
  productStatus?: AprNormalizedObservationStatus;
  executionPresent: boolean;
  serverVerificationPresent: boolean;
}): AprCaseSourcePolicyResolution {
  const applicabilityByCode = new Map((input.commonBlockerApplicability ?? []).map((item) => [item.code, item]));
  const ignoredCommonBlockerCodes = input.commonStatus === "BLOCKED" && input.routedProductModule
    ? (input.commonBlockerCodes ?? []).filter((code) => {
      const applicability = applicabilityByCode.get(code);
      return applicability ? !moduleApplies(input.routedProductModule!, applicability) : false;
    })
    : [];
  const effectiveCommonStatus = input.commonStatus === "BLOCKED"
    && (input.commonBlockerCodes?.length ?? 0) > 0
    && ignoredCommonBlockerCodes.length === input.commonBlockerCodes!.length
    ? "PASS"
    : input.commonStatus;

  const policy: AprCaseSourcePolicy = {
    preflight_common: "required",
    product_gate: "not_applicable_expected",
    deep_review: "not_applicable_expected",
    execution: "not_applicable_expected",
    server_verification: "not_applicable_expected",
  };
  if (effectiveCommonStatus === "PASS") {
    policy.product_gate = "required";
    if (input.productStatus === "BLOCKED") policy.deep_review = "required";
    if (input.productStatus === "PASS" && input.executionPresent) policy.execution = "required";
    if (input.productStatus === "PASS" && input.serverVerificationPresent) policy.server_verification = "required";
  } else if (effectiveCommonStatus === "BLOCKED") {
    if (input.productStatus === "BLOCKED") policy.product_gate = "required";
    policy.deep_review = "required";
  }
  return { policy, effectiveCommonStatus, ignoredCommonBlockerCodes };
}

export function deriveAprCaseSourcePolicy(input: {
  commonStatus: AprNormalizedObservationStatus;
  commonBlockerCodes?: readonly string[];
  commonBlockerApplicability?: readonly AprCaseBlockerApplicability[];
  routedProductModule?: AprCaseProductModule;
  productStatus?: AprNormalizedObservationStatus;
  executionPresent: boolean;
  serverVerificationPresent: boolean;
}): AprCaseSourcePolicy {
  return resolveAprCaseSourcePolicy(input).policy;
}

const stageFor = (source: AprCaseObservationSource): AprPipelineStage => {
  switch (source) {
    case "preflight_common": return "COMMON_PREFLIGHT";
    case "product_gate": return "PRODUCT_GATE";
    case "deep_review": return "DEEP_REVIEW";
    case "execution": return "EXECUTION";
    case "checkpoint": return "SERVER_VERIFICATION";
    case "report_blockers": return "EVIDENCE";
  }
};

export function createAprNotApplicableObservation(input: {
  source: Exclude<AprCaseObservationSource, "report_blockers">;
  customerKey: string;
  runId: string;
  observedAt: string;
}): AprCaseStatusObservation {
  const base = { ...input, stage: stageFor(input.source), status: "NOT_APPLICABLE" as const, blockerCodes: [] as string[], classification: "NONE" as const };
  return { ...base, sourceFingerprint: canonicalSha256(base) };
}

export function observeAprStructuredBlockers(input: {
  customerKey: string;
  runId: string;
  observedAt: string;
  blockerCodes: readonly string[] | null;
}): AprCaseStatusObservation {
  if (!input.runId.trim()) throw new Error("apr_structured_blockers_run_id_empty");
  const blockerCodes = [...new Set((input.blockerCodes ?? []).map((code) => code.trim()).filter(Boolean))].sort();
  const base = { source: "report_blockers" as const, stage: "EVIDENCE" as const, customerKey: input.customerKey, runId: input.runId,
    observedAt: input.observedAt, status: input.blockerCodes === null ? "MISSING" as const : blockerCodes.length > 0 ? "BLOCKED" as const : "PASS" as const,
    blockerCodes, classification: input.blockerCodes === null ? "UNCLASSIFIED" as const : "NONE" as const };
  return { ...base, sourceFingerprint: canonicalSha256(base) };
}
