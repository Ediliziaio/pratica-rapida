import type {
  AprCaseObservationSource,
  AprCaseStatusObservation,
  AprNormalizedObservationStatus,
  AprPipelineStage,
} from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

export const APR_CASE_SOURCE_POLICY_VERSION = "apr-case-source-policy-v1" as const;

export type AprCaseSourceRequirement = "required" | "not_applicable_expected";
export type AprCaseSourcePolicy = Record<"preflight_common" | "product_gate" | "deep_review" | "execution" | "server_verification", AprCaseSourceRequirement>;

export function deriveAprCaseSourcePolicy(input: {
  commonStatus: AprNormalizedObservationStatus;
  productStatus?: AprNormalizedObservationStatus;
  executionPresent: boolean;
  serverVerificationPresent: boolean;
}): AprCaseSourcePolicy {
  const result: AprCaseSourcePolicy = {
    preflight_common: "required",
    product_gate: "not_applicable_expected",
    deep_review: "not_applicable_expected",
    execution: "not_applicable_expected",
    server_verification: "not_applicable_expected",
  };
  if (input.commonStatus === "PASS") {
    result.product_gate = "required";
    if (input.productStatus === "BLOCKED") result.deep_review = "required";
    if (input.productStatus === "PASS" && input.executionPresent) result.execution = "required";
    if (input.productStatus === "PASS" && input.serverVerificationPresent) result.server_verification = "required";
  } else if (input.commonStatus === "BLOCKED") {
    result.deep_review = "required";
  }
  return result;
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
  blockerCodes: readonly string[];
}): AprCaseStatusObservation {
  if (!input.runId.trim()) throw new Error("apr_structured_blockers_run_id_empty");
  const blockerCodes = [...new Set(input.blockerCodes.map((code) => code.trim()).filter(Boolean))].sort();
  const base = { source: "report_blockers" as const, stage: "EVIDENCE" as const, customerKey: input.customerKey, runId: input.runId,
    observedAt: input.observedAt, status: blockerCodes.length > 0 ? "BLOCKED" as const : "PASS" as const, blockerCodes, classification: "NONE" as const };
  return { ...base, sourceFingerprint: canonicalSha256(base) };
}
