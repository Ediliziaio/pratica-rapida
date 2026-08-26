import { describe, expect, it } from "vitest";
import { APR_CASE_TRANSITION_MATRIX, matchAprCaseTransition } from "./aprCaseTransitionMatrix";

describe("APR explicit case transition matrix", () => {
  it("mappa il percorso pronto e quello completato", () => {
    expect(matchAprCaseTransition({ commonPreflight: "PASS", productGate: "PASS", deepReview: "NOT_APPLICABLE", execution: "NOT_APPLICABLE", serverVerification: "NOT_APPLICABLE" })?.publicStatus).toBe("READY");
    expect(matchAprCaseTransition({ commonPreflight: "PASS", productGate: "PASS", deepReview: "NOT_APPLICABLE", execution: "COMPLETED", serverVerification: "NOT_APPLICABLE" })?.publicStatus).toBe("COMPLETED");
  });

  it("distingue intervento operatore e riparazione tecnica dopo un blocker prodotto", () => {
    expect(matchAprCaseTransition({ commonPreflight: "PASS", productGate: "BLOCKED:UNCLASSIFIED", deepReview: "BLOCKED:OPERATOR", execution: "NOT_APPLICABLE", serverVerification: "NOT_APPLICABLE" })?.publicStatus).toBe("OPERATOR_REQUIRED");
    expect(matchAprCaseTransition({ commonPreflight: "PASS", productGate: "BLOCKED:UNCLASSIFIED", deepReview: "BLOCKED:TECHNICAL", execution: "NOT_APPLICABLE", serverVerification: "NOT_APPLICABLE" })?.publicStatus).toBe("TECHNICAL_BLOCK");
  });

  it("mappa il blocker comune con gate prodotto non applicabile", () => {
    expect(matchAprCaseTransition({ commonPreflight: "BLOCKED:UNCLASSIFIED", productGate: "NOT_APPLICABLE", deepReview: "BLOCKED:OPERATOR", execution: "NOT_APPLICABLE", serverVerification: "NOT_APPLICABLE" })?.publicStatus).toBe("OPERATOR_REQUIRED");
  });

  it("mappa il blocco tecnico terminale dell'esecuzione dopo gate verdi", () => {
    expect(matchAprCaseTransition({ commonPreflight: "PASS", productGate: "PASS", deepReview: "NOT_APPLICABLE", execution: "BLOCKED:TECHNICAL", serverVerification: "NOT_APPLICABLE" })).toMatchObject({
      id: "execution_technical_block",
      publicStatus: "TECHNICAL_BLOCK",
    });
  });

  it("non estende il blocco tecnico terminale a classificazioni diverse", () => {
    expect(matchAprCaseTransition({ commonPreflight: "PASS", productGate: "PASS", deepReview: "NOT_APPLICABLE", execution: "BLOCKED:OPERATOR", serverVerification: "NOT_APPLICABLE" })).toBeNull();
  });

  it("non possiede un default per combinazioni non registrate", () => {
    expect(matchAprCaseTransition({ commonPreflight: "BLOCKED:UNCLASSIFIED", productGate: "PASS", deepReview: "NOT_APPLICABLE", execution: "COMPLETED", serverVerification: "NOT_APPLICABLE" })).toBeNull();
    expect(new Set(APR_CASE_TRANSITION_MATRIX.map((item) => item.id)).size).toBe(APR_CASE_TRANSITION_MATRIX.length);
  });
});
