import { describe, expect, it } from "vitest";
import { evaluateFiveLevelMatrixCutoverGate, type AprFiveLevelMatrixCutoverGateEvidence } from "./aprFiveLevelMatrixCutoverGate";

const evidence = (): AprFiveLevelMatrixCutoverGateEvidence => ({
  positiveTest: { status: "PASS", evidenceRef: "positive" },
  negativeTest: { status: "PASS", evidenceRef: "negative" },
  toleranceBoundaryTest: { status: "NOT_APPLICABLE", evidenceRef: "observation-only" },
  deterministicDoubleReplay: { status: "PASS", firstFingerprint: "same", secondFingerprint: "same" },
  perCaseBaselineComparison: { status: "PASS", caseCount: 1, differenceCount: 0, reportFingerprint: "report" },
  noCorrectedCaseRegression: { status: "PASS", regressionCount: 0 },
  differencesExplainedAndApproved: { status: "PASS", unexplainedCount: 0, approvalRef: "none-required" },
  monotonicGate: { status: "NOT_RUN", certificateId: null },
});

describe("APR Slice 5 eight-control gate", () => {
  it("resta bloccato esclusivamente sul gate monotono non eseguito", () => {
    expect(evaluateFiveLevelMatrixCutoverGate(evidence())).toMatchObject({ status: "BLOCKED", cutoverAllowed: false, failedChecks: ["8_monotonic_gate"] });
  });

  it("rifiuta differenze o regressioni anche se gli altri controlli sono verdi", () => {
    const input = evidence();
    input.perCaseBaselineComparison = { ...input.perCaseBaselineComparison, status: "FAIL", differenceCount: 1 };
    input.noCorrectedCaseRegression = { status: "FAIL", regressionCount: 1 };
    expect(evaluateFiveLevelMatrixCutoverGate(input).failedChecks).toEqual(["5_per_case_baseline_comparison", "6_no_regression", "8_monotonic_gate"]);
  });

  it("passerebbe solo con tutti gli otto controlli certificati", () => {
    const input = evidence();
    input.monotonicGate = { status: "PASS", certificateId: "certificate" };
    expect(evaluateFiveLevelMatrixCutoverGate(input)).toMatchObject({ status: "PASS", cutoverAllowed: true, failedChecks: [] });
  });
});
