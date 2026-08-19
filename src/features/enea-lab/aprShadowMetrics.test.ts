import { describe, expect, it } from "vitest";
import { calculateAprShadowMetrics, type AprShadowMetricCase } from "./aprShadowMetrics";

const reviewedCases: AprShadowMetricCase[] = [
  {
    practiceId: "blocked-false",
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["document-missing"],
    mappedFieldCount: 10,
    autoReadyFieldCount: 8,
    operatorVerdict: "false-block",
    preparationMinutes: 8,
  },
  {
    practiceId: "blocked-correct",
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["field-missing"],
    mappedFieldCount: 10,
    autoReadyFieldCount: 7,
    operatorVerdict: "correct-block",
    preparationMinutes: 12,
  },
  {
    practiceId: "ready-error",
    productType: "schermature",
    evaluated: true,
    blockerCodes: [],
    mappedFieldCount: 10,
    autoReadyFieldCount: 10,
    operatorVerdict: "escaped-error",
    preparationMinutes: 4,
  },
  {
    practiceId: "ready-correct",
    productType: "schermature",
    evaluated: true,
    blockerCodes: [],
    mappedFieldCount: 10,
    autoReadyFieldCount: 10,
    operatorVerdict: "correct-ready",
    preparationMinutes: 6,
  },
];

describe("APR shadow metrics", () => {
  it("calcola i KPI qualità solo quando i casi valutati sono stati revisionati", () => {
    const result = calculateAprShadowMetrics(reviewedCases);

    expect(result.evidenceValid).toBe(true);
    expect(result.evidenceBlockers).toEqual([]);
    expect(result.counts).toEqual({
      inScope: 4,
      evaluated: 4,
      blocked: 2,
      ready: 2,
      reviewed: 4,
      unknownProduct: 0,
    });
    expect(result.rates.coverage).toBe(1);
    expect(result.rates.autoMapRate).toBe(0.875);
    expect(result.rates.blockerRate).toBe(0.5);
    expect(result.rates.reviewCoverage).toBe(1);
    expect(result.rates.falseBlockRate).toBe(0.5);
    expect(result.rates.escapedErrorRate).toBe(0.5);
    expect(result.rates.unknownProductRate).toBe(0);
    expect(result.medianPreparationMinutes).toBe(7);
  });

  it("non mostra tassi qualità falsamente ottimistici finché la review è incompleta", () => {
    const result = calculateAprShadowMetrics([
      reviewedCases[0],
      { ...reviewedCases[1], operatorVerdict: "unreviewed" },
      { ...reviewedCases[2], operatorVerdict: "unreviewed" },
    ]);

    expect(result.evidenceValid).toBe(true);
    expect(result.rates.reviewCoverage).toBeCloseTo(1 / 3);
    expect(result.rates.falseBlockRate).toBeNull();
    expect(result.rates.escapedErrorRate).toBeNull();
  });

  it("rifiuta metriche strutturalmente impossibili invece di produrre KPI", () => {
    const result = calculateAprShadowMetrics([
      {
        ...reviewedCases[0],
        practiceId: "invalid-counts",
        mappedFieldCount: 3,
        autoReadyFieldCount: 4,
      },
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toEqual([
      { practiceId: "invalid-counts", code: "invalid-field-counts" },
    ]);
    expect(Object.values(result.rates).every((rate) => rate === null)).toBe(true);
    expect(result.medianPreparationMinutes).toBeNull();
  });

  it("rifiuta un verdetto di falso blocco su una pratica che APR aveva dichiarato pronta", () => {
    const result = calculateAprShadowMetrics([
      {
        ...reviewedCases[2],
        practiceId: "invalid-verdict",
        operatorVerdict: "false-block",
      },
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toEqual([
      { practiceId: "invalid-verdict", code: "verdict-inconsistent-with-apr-result" },
    ]);
  });

  it("rifiuta la stessa pratica duplicata per non pesare due volte i KPI", () => {
    const result = calculateAprShadowMetrics([
      reviewedCases[0],
      { ...reviewedCases[1], practiceId: "blocked-false" },
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toEqual([
      { practiceId: "blocked-false", code: "duplicate-practice-id" },
    ]);
    expect(Object.values(result.rates).every((rate) => rate === null)).toBe(true);
  });
});
