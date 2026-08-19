import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics, type AprShadowMetricCase } from "./aprShadowMetrics";
import { calculateAprShadowMetricsByProduct } from "./aprShadowMetricsByProduct";

function readyCase(
  practiceId: string,
  productType: AprShadowMetricCase["productType"],
  operatorVerdict: "correct-ready" | "escaped-error" = "correct-ready",
): AprShadowMetricCase {
  return {
    practiceId,
    productType,
    evaluated: true,
    blockerCodes: [],
    mappedFieldCount: 10,
    autoReadyFieldCount: 10,
    operatorVerdict,
    preparationMinutes: 5,
  };
}

function blockedCase(practiceId: string): AprShadowMetricCase {
  return {
    practiceId,
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["document-missing"],
    mappedFieldCount: 10,
    autoReadyFieldCount: 5,
    operatorVerdict: "correct-block",
    preparationMinutes: 8,
  };
}

describe("APR shadow metrics per product", () => {
  it("non permette alle metriche aggregate di nascondere errori di un singolo prodotto", () => {
    const result = calculateAprShadowMetricsByProduct([
      readyCase("screening-error", "schermature", "escaped-error"),
      readyCase("screening-ok", "schermature"),
      readyCase("infissi-1", "infissi"),
      readyCase("infissi-2", "infissi"),
      readyCase("infissi-3", "infissi"),
      readyCase("infissi-4", "infissi"),
    ]);

    expect(result.portfolioEvidenceValid).toBe(true);
    expect(result.overall.rates.escapedErrorRate).toBeCloseTo(1 / 6);
    expect(result.byProduct.schermature?.rates.escapedErrorRate).toBe(0.5);
    expect(result.byProduct.infissi?.rates.escapedErrorRate).toBe(0);
    expect(result.byProduct.impianto_termico?.counts.inScope).toBe(0);
    expect(result.byProduct.insufflaggio?.rates.coverage).toBeNull();
  });

  it("spegne tutti i KPI per prodotto se il portafoglio contiene evidenze invalide", () => {
    const result = calculateAprShadowMetricsByProduct([
      readyCase("same-practice", "schermature"),
      readyCase("same-practice", "infissi"),
    ]);

    expect(result.portfolioEvidenceValid).toBe(false);
    expect(result.overall.evidenceValid).toBe(false);
    expect(result.overall.evidenceBlockers).toContainEqual({
      practiceId: "same-practice",
      code: "duplicate-practice-id",
    });
    expect(Object.values(result.byProduct).every((value) => value === null)).toBe(true);
  });

  it("mantiene escaped-error rate condizionato alle pratiche dichiarate ready, evitando di migliorarlo bloccando di più", () => {
    const result = calculateAprShadowMetrics([
      ...Array.from({ length: 8 }, (_, index) => blockedCase(`blocked-${index}`)),
      readyCase("ready-error", "schermature", "escaped-error"),
      readyCase("ready-ok", "schermature"),
    ]);

    expect(result.rates.blockerRate).toBe(0.8);
    expect(result.rates.escapedErrorRate).toBe(0.5);
  });
});
