import { canonicalSha256 } from "./aprMonotonicArtifacts";

export const APR_ECONOMIC_CUTOVER_GATE_VERSION = "apr-economic-cutover-gate-v1" as const;

export interface AprEconomicCutoverGateEvidence {
  positiveTest: { status: "PASS" | "FAIL"; evidenceRef: string };
  negativeTest: { status: "PASS" | "FAIL"; evidenceRef: string };
  toleranceBoundaryTest: { status: "PASS" | "FAIL"; evidenceRef: string };
  deterministicDoubleReplay: { status: "PASS" | "FAIL"; firstFingerprint: string; secondFingerprint: string };
  perCaseBaselineComparison: { status: "PASS" | "FAIL"; caseCount: number; differenceCount: number; reportFingerprint: string };
  noCorrectedCaseRegression: { status: "PASS" | "FAIL"; regressionCount: number };
  differencesExplainedAndApproved: { status: "PASS" | "FAIL"; unexplainedCount: number; approvalRef: string | null };
  monotonicGate: { status: "PASS" | "FAIL" | "NOT_RUN"; certificateId: string | null };
}

export interface AprEconomicCutoverGateResult {
  schemaVersion: typeof APR_ECONOMIC_CUTOVER_GATE_VERSION;
  status: "PASS" | "BLOCKED";
  cutoverAllowed: boolean;
  evidenceFingerprint: string;
  failedChecks: readonly string[];
}

export function evaluateEconomicCutoverGate(evidence: AprEconomicCutoverGateEvidence): AprEconomicCutoverGateResult {
  const failedChecks = [
    evidence.positiveTest.status !== "PASS" ? "1_positive_test" : null,
    evidence.negativeTest.status !== "PASS" ? "2_negative_test" : null,
    evidence.toleranceBoundaryTest.status !== "PASS" ? "3_tolerance_boundary" : null,
    evidence.deterministicDoubleReplay.status !== "PASS"
      || evidence.deterministicDoubleReplay.firstFingerprint !== evidence.deterministicDoubleReplay.secondFingerprint ? "4_deterministic_double_replay" : null,
    evidence.perCaseBaselineComparison.status !== "PASS" ? "5_per_case_baseline_comparison" : null,
    evidence.noCorrectedCaseRegression.status !== "PASS" || evidence.noCorrectedCaseRegression.regressionCount > 0 ? "6_no_regression" : null,
    evidence.differencesExplainedAndApproved.status !== "PASS" || evidence.differencesExplainedAndApproved.unexplainedCount > 0 ? "7_differences_approved" : null,
    evidence.monotonicGate.status !== "PASS" || !evidence.monotonicGate.certificateId ? "8_monotonic_gate" : null,
  ].filter((item): item is string => item !== null);
  return Object.freeze({
    schemaVersion: APR_ECONOMIC_CUTOVER_GATE_VERSION,
    status: failedChecks.length ? "BLOCKED" : "PASS",
    cutoverAllowed: failedChecks.length === 0,
    evidenceFingerprint: canonicalSha256(evidence),
    failedChecks: Object.freeze(failedChecks),
  });
}
