import { describe, expect, it } from "vitest";
import { evaluateEneaMapperCutoverGate, type AprEneaMapperCutoverGateEvidence } from "./aprEneaMapperCutoverGate";

const passing = (): AprEneaMapperCutoverGateEvidence => ({
  positiveTest: { status: "PASS", evidenceRef: "economic+screening+infissi" },
  negativeTest: { status: "PASS", evidenceRef: "unresolved+missing" },
  toleranceBoundaryTest: { status: "NOT_APPLICABLE", evidenceRef: "L4 maps decided values exactly" },
  deterministicDoubleReplay: { status: "PASS", firstFingerprint: "same", secondFingerprint: "same" },
  perCaseBaselineComparison: { status: "PASS", caseCount: 3, differenceCount: 0, reportFingerprint: "baseline" },
  noCorrectedCaseRegression: { status: "PASS", regressionCount: 0 },
  differencesExplainedAndApproved: { status: "PASS", unexplainedCount: 0, approvalRef: "none-required" },
  monotonicGate: { status: "PASS", certificateId: "certificate" },
});
describe("APR Slice 4 ENEA mapper cutover gate", () => {
  it("accetta NOT_APPLICABLE per la tolleranza perche L4 non ricalcola valori", () => {
    expect(evaluateEneaMapperCutoverGate(passing())).toMatchObject({ status: "PASS", cutoverAllowed: true, failedChecks: [] });
  });

  it("resta fail-closed senza certificato monotono", () => {
    const evidence = passing();
    evidence.monotonicGate = { status: "NOT_RUN", certificateId: null };
    expect(evaluateEneaMapperCutoverGate(evidence)).toMatchObject({ status: "BLOCKED", cutoverAllowed: false, failedChecks: ["8_monotonic_gate"] });
  });

  it("rifiuta una differenza baseline anche se il report e marcato PASS", () => {
    const evidence = passing();
    evidence.perCaseBaselineComparison.differenceCount = 1;
    expect(evaluateEneaMapperCutoverGate(evidence).failedChecks).toContain("5_per_case_baseline_comparison");
  });

  it("rifiuta fingerprint differenti nel doppio replay", () => {
    const evidence = passing();
    evidence.deterministicDoubleReplay.secondFingerprint = "different";
    expect(evaluateEneaMapperCutoverGate(evidence).failedChecks).toContain("4_deterministic_double_replay");
  });
});
