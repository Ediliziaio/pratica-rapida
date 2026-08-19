import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics } from "./aprShadowMetrics";

describe("APR shadow metrics — ready senza output", () => {
  it("non considera pronta una pratica valutata senza blocker ma senza alcun campo mappato", () => {
    const result = calculateAprShadowMetrics([
      {
        practiceId: "ready-without-output",
        productType: "schermature",
        evaluated: true,
        blockerCodes: [],
        mappedFieldCount: 0,
        autoReadyFieldCount: 0,
        operatorVerdict: "unreviewed",
        preparationMinutes: 2,
      },
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "ready-without-output",
      code: "evaluated-ready-case-has-no-mapped-fields",
    });
    expect(Object.values(result.rates).every((rate) => rate === null)).toBe(true);
  });
});
