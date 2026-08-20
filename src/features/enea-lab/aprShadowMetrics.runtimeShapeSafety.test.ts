import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics } from "./aprShadowMetrics";

describe("APR shadow metrics runtime shape safety", () => {
  it("resta fail-closed su product type runtime sconosciuto", () => {
    const result = calculateAprShadowMetrics([
      {
        practiceId: "practice-1",
        productType: "infissii",
        evaluated: true,
        blockerCodes: [],
        mappedFieldCount: 3,
        autoReadyFieldCount: 2,
        operatorVerdict: "correct-ready",
      } as any,
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "invalid-product-type",
    });
    expect(result.rates.coverage).toBeNull();
  });

  it("non interpreta booleani runtime truthy come esito APR valido", () => {
    const result = calculateAprShadowMetrics([
      {
        practiceId: "practice-2",
        productType: "infissi",
        evaluated: "false",
        blockerCodes: [],
        mappedFieldCount: 3,
        autoReadyFieldCount: 2,
        operatorVerdict: "correct-ready",
      } as any,
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-2",
      code: "invalid-runtime-shape",
    });
    expect(result.rates.coverage).toBeNull();
  });

  it("non va in eccezione su righe corrotte ricostruite da storage", () => {
    expect(() => calculateAprShadowMetrics([
      {
        practiceId: 123,
        productType: "infissi",
        evaluated: true,
        blockerCodes: null,
        mappedFieldCount: 1,
        autoReadyFieldCount: 1,
        operatorVerdict: "correct-ready",
      } as any,
    ])).not.toThrow();

    const result = calculateAprShadowMetrics([
      {
        practiceId: 123,
        productType: "infissi",
        evaluated: true,
        blockerCodes: null,
        mappedFieldCount: 1,
        autoReadyFieldCount: 1,
        operatorVerdict: "correct-ready",
      } as any,
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers[0]?.code).toBe("invalid-runtime-shape");
    expect(result.rates.coverage).toBeNull();
  });

  it("non va in eccezione se il dataset ricostruito da storage non è un array", () => {
    expect(() => calculateAprShadowMetrics(null as any)).not.toThrow();
    expect(() => calculateAprShadowMetrics({ rows: [] } as any)).not.toThrow();

    for (const corruptedDataset of [null, { rows: [] }] as any[]) {
      const result = calculateAprShadowMetrics(corruptedDataset as any);
      expect(result.evidenceValid).toBe(false);
      expect(result.evidenceBlockers).toContainEqual({
        practiceId: "runtime-dataset",
        code: "invalid-runtime-shape",
      });
      expect(result.counts.inScope).toBe(0);
      expect(result.rates.coverage).toBeNull();
    }
  });
});