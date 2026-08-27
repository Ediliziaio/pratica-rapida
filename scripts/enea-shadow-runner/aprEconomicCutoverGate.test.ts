import { describe, expect, it } from "vitest";
import { evaluateEconomicCutoverGate, type AprEconomicCutoverGateEvidence } from "./aprEconomicCutoverGate";

const passing = (): AprEconomicCutoverGateEvidence => ({
  positiveTest: { status: "PASS", evidenceRef: "test:positive" },
  negativeTest: { status: "PASS", evidenceRef: "test:negative" },
  toleranceBoundaryTest: { status: "PASS", evidenceRef: "test:tolerance" },
  deterministicDoubleReplay: { status: "PASS", firstFingerprint: "same", secondFingerprint: "same" },
  perCaseBaselineComparison: { status: "PASS", caseCount: 125, differenceCount: 0, reportFingerprint: "report" },
  noCorrectedCaseRegression: { status: "PASS", regressionCount: 0 },
  differencesExplainedAndApproved: { status: "PASS", unexplainedCount: 0, approvalRef: "none-required" },
  monotonicGate: { status: "PASS", certificateId: "certificate" },
});

describe("APR Slice 2 economic cutover gate", () => {
  it("consente il cutover soltanto con tutti gli otto controlli verdi", () => {
    expect(evaluateEconomicCutoverGate(passing())).toMatchObject({ status: "PASS", cutoverAllowed: true, failedChecks: [] });
  });

  it("resta fail-closed quando il gate monotono non e stato eseguito", () => {
    const evidence = passing();
    evidence.monotonicGate = { status: "NOT_RUN", certificateId: null };
    expect(evaluateEconomicCutoverGate(evidence)).toMatchObject({
      status: "BLOCKED",
      cutoverAllowed: false,
      failedChecks: ["8_monotonic_gate"],
    });
  });

  it("rifiuta un replay dichiarato PASS con fingerprint differenti", () => {
    const evidence = passing();
    evidence.deterministicDoubleReplay.secondFingerprint = "different";
    expect(evaluateEconomicCutoverGate(evidence).failedChecks).toContain("4_deterministic_double_replay");
  });

  it("rifiuta anche una sola regressione precedentemente corretta", () => {
    const evidence = passing();
    evidence.noCorrectedCaseRegression = { status: "FAIL", regressionCount: 1 };
    expect(evaluateEconomicCutoverGate(evidence).failedChecks).toContain("6_no_regression");
  });
});
