import { describe, expect, it } from "vitest";
import {
  rankAprNextProduct,
  type AprProductIntegrationSummary,
} from "./productIntegration";

function summary(): AprProductIntegrationSummary {
  return {
    total: 55,
    unknown: 0,
    byProduct: {
      schermature: {
        total: 0,
        activeReady: 0,
        historicalWithCompletedEnea: 0,
        withInvoices: 0,
        integrationPhase: "screenings-validated",
      },
      infissi: {
        total: 50,
        activeReady: 10,
        historicalWithCompletedEnea: 1,
        // Il solo fatture_urls può essere vuoto anche quando i moduli dinamici
        // hanno fatture in dati_form: non deve sembrare prova di corpus assente.
        withInvoices: 0,
        integrationPhase: "intake-only",
      },
      impianto_termico: {
        total: 5,
        activeReady: 2,
        historicalWithCompletedEnea: 1,
        withInvoices: 5,
        integrationPhase: "intake-only",
      },
      insufflaggio: {
        total: 0,
        activeReady: 0,
        historicalWithCompletedEnea: 0,
        withInvoices: 0,
        integrationPhase: "intake-only",
      },
    },
  };
}

describe("APR priority: visibilità parziale delle fatture", () => {
  it("non penalizza la domanda reale usando fatture_urls come se fosse un indice completo", () => {
    const decision = rankAprNextProduct(summary());

    expect(decision.recommendedNextProduct).toBe("infissi");
    expect(decision.candidates.map((candidate) => candidate.productType)).toEqual([
      "infissi",
      "impianto_termico",
      "insufflaggio",
    ]);

    const infissi = decision.candidates.find((candidate) => candidate.productType === "infissi");
    expect(infissi?.blockers).toContain("invoice-corpus-index-incomplete");
    expect(infissi?.blockers).not.toContain("invoice-corpus-missing");
    expect(infissi?.nextAction).toBe("verify-invoice-corpus-index");
    expect(infissi?.shadowTechnicalMappingAllowed).toBe(false);
    expect(infissi?.officialSubmissionAllowed).toBe(false);
  });
});
