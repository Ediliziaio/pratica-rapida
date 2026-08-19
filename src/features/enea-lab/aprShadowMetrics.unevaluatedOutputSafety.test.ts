import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics, type AprShadowMetricCase } from "./aprShadowMetrics";

const unevaluated: AprShadowMetricCase = {
  practiceId: "practice-not-evaluated",
  productType: "infissi",
  evaluated: false,
  blockerCodes: [],
  mappedFieldCount: 0,
  autoReadyFieldCount: 0,
  operatorVerdict: "unreviewed",
  preparationMinutes: null,
};

describe("APR shadow metrics - unevaluated output safety", () => {
  it("rifiuta campi mappati su una pratica dichiarata non valutata", () => {
    const result = calculateAprShadowMetrics([
      {
        ...unevaluated,
        mappedFieldCount: 8,
        autoReadyFieldCount: 6,
      },
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-not-evaluated",
      code: "unevaluated-case-has-apr-result",
    });
    expect(Object.values(result.rates).every((rate) => rate === null)).toBe(true);
  });
});
