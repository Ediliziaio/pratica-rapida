import { describe, expect, it } from "vitest";
import { assertStructuredResidualCase, calculateTechnicalAutonomyMetric, structureAprResidualBlocker } from "./technicalAutonomyMetric";

describe("autonomia tecnica sulle sole pratiche procedibili", () => {
  it("esclude solo i documenti realmente indisponibili e conserva errori tecnici e falsi blocchi nel denominatore", () => {
    const result = calculateTechnicalAutonomyMetric([
      { practiceId: "a", classification: "completed_autonomously", evidenceIds: ["truth-a"] },
      { practiceId: "b", classification: "legitimate_external_data_unavailable", evidenceIds: ["invoice-missing-b"] },
      { practiceId: "c", classification: "technical_failure", evidenceIds: ["truth-c"] },
      { practiceId: "d", classification: "avoidable_false_block", evidenceIds: ["truth-d"] },
    ]);
    expect(result).toMatchObject({ totalCases: 4, excludedLegitimateExternalDataUnavailable: 1, procedibleDenominator: 3, autonomousNumerator: 1, technicalAutonomyRate: 1 / 3 });
    expect(result.excludedPracticeIds).toEqual(["b"]);
    expect(result.failedEligiblePracticeIds).toEqual(["c", "d"]);
  });

  it("fallisce chiuso senza identita univoca o prova della classificazione", () => {
    expect(() => calculateTechnicalAutonomyMetric([{ practiceId: "a", classification: "completed_autonomously", evidenceIds: [] }])).toThrow("apr_technical_autonomy_evidence_missing");
    expect(() => calculateTechnicalAutonomyMetric([
      { practiceId: "a", classification: "completed_autonomously", evidenceIds: ["one"] },
      { practiceId: "a", classification: "legitimate_external_data_unavailable", evidenceIds: ["two"] },
    ])).toThrow("apr_technical_autonomy_case_identity_invalid");
  });
});

describe("residui strutturati per operatore e onboarding", () => {
  it("accetta una causa concreta con tipo documento e domanda diretta", () => {
    expect(assertStructuredResidualCase({
      practiceId: "girelli",
      classification: "operator_required",
      exactCause: "Manca la fattura di saldo necessaria alla riconciliazione.",
      missingDocumentType: "fattura di saldo",
      operatorQuestion: "Puoi inserire la fattura di saldo mancante?",
      onboardingGap: "Richiedere separatamente fattura di acconto e fattura di saldo.",
    })).toMatchObject({ ruleId: "user-2026-09-03-structured-residual-case-question-v1" });
  });

  it("rifiuta descrizioni incomplete, domande non dirette e documenti mancanti senza tipo", () => {
    expect(() => assertStructuredResidualCase({ practiceId: "x", classification: "operator_required", exactCause: "Manca un documento.", missingDocumentType: null, operatorQuestion: "Inserire documento?", onboardingGap: "Specificare il documento." })).toThrow("apr_structured_residual_missing_document_type_missing");
    expect(() => assertStructuredResidualCase({ practiceId: "x", classification: "ambiguous", exactCause: "Fonti discordanti.", missingDocumentType: null, operatorQuestion: "Verificare le fonti", onboardingGap: "Confermare il dato all'origine." })).toThrow("apr_structured_residual_operator_question_not_direct");
  });

  it("trasforma un blocker reale in campi completi senza perdere la causa originale", () => {
    expect(structureAprResidualBlocker({ practiceId: "case-1", code: "original_invoice_missing_or_unavailable", field: "economic_sources", reason: "La fattura di acconto richiamata non è presente." })).toMatchObject({
      exactCause: "La fattura di acconto richiamata non è presente.",
      missingDocumentType: "fattura o pagina fiscale necessaria",
      operatorQuestion: expect.stringMatching(/\?$/),
      onboardingGap: expect.stringContaining("fattura"),
    });
  });
});
