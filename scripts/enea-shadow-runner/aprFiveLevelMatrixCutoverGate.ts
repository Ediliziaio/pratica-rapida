import { canonicalSha256 } from "./aprMonotonicArtifacts";

export const APR_FIVE_LEVEL_MATRIX_CUTOVER_GATE_VERSION = "apr-five-level-matrix-cutover-gate-v1" as const;

export interface AprFiveLevelMatrixCutoverGateEvidence {
  positiveTest: { status: "PASS" | "FAIL"; evidenceRef: string };
  negativeTest: { status: "PASS" | "FAIL"; evidenceRef: string };
  toleranceBoundaryTest: { status: "PASS" | "FAIL" | "NOT_APPLICABLE"; evidenceRef: string };
  deterministicDoubleReplay: { status: "PASS" | "FAIL"; firstFingerprint: string; secondFingerprint: string };
  perCaseBaselineComparison: { status: "PASS" | "FAIL"; caseCount: number; differenceCount: number; reportFingerprint: string };
  noCorrectedCaseRegression: { status: "PASS" | "FAIL"; regressionCount: number };
  differencesExplainedAndApproved: { status: "PASS" | "FAIL"; unexplainedCount: number; approvalRef: string | null };
  monotonicGate: { status: "PASS" | "FAIL" | "NOT_RUN"; certificateId: string | null };
}

export function evaluateFiveLevelMatrixCutoverGate(evidence: AprFiveLevelMatrixCutoverGateEvidence) {
  const toleranceAccepted = evidence.toleranceBoundaryTest.status === "PASS" || evidence.toleranceBoundaryTest.status === "NOT_APPLICABLE";
  const failedChecks = [
    evidence.positiveTest.status !== "PASS" ? "1_positive_test" : null,
    evidence.negativeTest.status !== "PASS" ? "2_negative_test" : null,
    !toleranceAccepted ? "3_tolerance_boundary" : null,
    evidence.deterministicDoubleReplay.status !== "PASS" || evidence.deterministicDoubleReplay.firstFingerprint !== evidence.deterministicDoubleReplay.secondFingerprint ? "4_deterministic_double_replay" : null,
    evidence.perCaseBaselineComparison.status !== "PASS" || evidence.perCaseBaselineComparison.differenceCount > 0 ? "5_per_case_baseline_comparison" : null,
    evidence.noCorrectedCaseRegression.status !== "PASS" || evidence.noCorrectedCaseRegression.regressionCount > 0 ? "6_no_regression" : null,
    evidence.differencesExplainedAndApproved.status !== "PASS" || evidence.differencesExplainedAndApproved.unexplainedCount > 0 ? "7_differences_approved" : null,
    evidence.monotonicGate.status !== "PASS" || !evidence.monotonicGate.certificateId ? "8_monotonic_gate" : null,
  ].filter((item): item is string => item !== null);
  return Object.freeze({
    schemaVersion: APR_FIVE_LEVEL_MATRIX_CUTOVER_GATE_VERSION,
    status: failedChecks.length ? "BLOCKED" as const : "PASS" as const,
    cutoverAllowed: failedChecks.length === 0,
    evidenceFingerprint: canonicalSha256(evidence),
    failedChecks: Object.freeze(failedChecks),
  });
}
