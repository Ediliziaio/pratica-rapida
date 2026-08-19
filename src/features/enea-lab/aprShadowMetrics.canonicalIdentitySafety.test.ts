import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics, type AprShadowMetricCase } from "./aprShadowMetrics";

function metricCase(overrides: Partial<AprShadowMetricCase> = {}): AprShadowMetricCase {
  return {
    practiceId: "practice-1",
    productType: "schermature",
    evaluated: true,
    blockerCodes: [],
    mappedFieldCount: 1,
    autoReadyFieldCount: 1,
    operatorVerdict: "unreviewed",
    preparationMinutes: 2,
    ...overrides,
  };
}

describe("APR shadow metrics canonical identity safety", () => {
  it("rifiuta ID pratica equivalenti dopo trim invece di contarli come evidenza distinta", () => {
    const result = calculateAprShadowMetrics([
      metricCase({ practiceId: "practice-1" }),
      metricCase({ practiceId: " practice-1 " }),
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: " practice-1 ",
      code: "invalid-practice-id",
    });
    expect(result.evidenceBlockers.some((item) => item.code === "duplicate-practice-id")).toBe(true);
    expect(result.rates.falseBlockRate).toBeNull();
    expect(result.rates.escapedErrorRate).toBeNull();
  });

  it("rifiuta blocker non canonici o duplicati dopo normalizzazione", () => {
    const result = calculateAprShadowMetrics([
      metricCase({
        practiceId: "practice-2",
        blockerCodes: ["document-missing", " document-missing "],
        autoReadyFieldCount: 0,
      }),
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-2",
      code: "invalid-blocker-code",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-2",
      code: "duplicate-blocker-code",
    });
  });
});
