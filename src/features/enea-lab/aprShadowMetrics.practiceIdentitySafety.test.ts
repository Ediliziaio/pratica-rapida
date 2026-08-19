import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics, type AprShadowMetricCase } from "./aprShadowMetrics";

const baseCase: AprShadowMetricCase = {
  practiceId: "practice-valid",
  productType: "schermature",
  evaluated: true,
  blockerCodes: [],
  mappedFieldCount: 10,
  autoReadyFieldCount: 10,
  operatorVerdict: "correct-ready",
  preparationMinutes: 5,
};

describe("APR shadow metrics - practice identity safety", () => {
  it("rifiuta una pratica senza identificativo stabile invece di farla pesare nei KPI", () => {
    const result = calculateAprShadowMetrics([
      { ...baseCase, practiceId: "   " },
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "   ",
      code: "invalid-practice-id",
    });
    expect(Object.values(result.rates).every((rate) => rate === null)).toBe(true);
  });
});
