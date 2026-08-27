import { describe, expect, it } from "vitest";
import { evaluateProductCutoverGate, type AprProductCutoverGateEvidence } from "./aprProductCutoverGate";

const passing = (): AprProductCutoverGateEvidence => ({
  positiveTest: { status: "PASS", evidenceRef: "product-positive" },
  negativeTest: { status: "PASS", evidenceRef: "product-negative" },
  toleranceBoundaryTest: { status: "PASS", evidenceRef: "product-tolerance" },
  deterministicDoubleReplay: { status: "PASS", firstFingerprint: "same", secondFingerprint: "same" },
  perCaseBaselineComparison: { status: "PASS", caseCount: 125, differenceCount: 0, reportFingerprint: "report" },
  noCorrectedCaseRegression: { status: "PASS", regressionCount: 0 },
  differencesExplainedAndApproved: { status: "PASS", unexplainedCount: 0, approvalRef: "none-required" },
  monotonicGate: { status: "PASS", certificateId: "certificate" },
});

describe("APR Slice 3 product cutover gate", () => {
  it("consente il cutover soltanto con tutti gli otto controlli verdi", () => {
    expect(evaluateProductCutoverGate(passing())).toMatchObject({ status: "PASS", cutoverAllowed: true, failedChecks: [] });
  });

  it("resta fail-closed senza certificato monotono", () => {
    const evidence = passing();
    evidence.monotonicGate = { status: "NOT_RUN", certificateId: null };
    expect(evaluateProductCutoverGate(evidence)).toMatchObject({ status: "BLOCKED", cutoverAllowed: false, failedChecks: ["8_monotonic_gate"] });
  });

  it("rifiuta fingerprint differenti nel doppio replay", () => {
    const evidence = passing();
    evidence.deterministicDoubleReplay.secondFingerprint = "different";
    expect(evaluateProductCutoverGate(evidence).failedChecks).toContain("4_deterministic_double_replay");
  });

  it("rifiuta una singola regressione", () => {
    const evidence = passing();
    evidence.noCorrectedCaseRegression = { status: "FAIL", regressionCount: 1 };
    expect(evaluateProductCutoverGate(evidence).failedChecks).toContain("6_no_regression");
  });
});
