import { describe, expect, it } from "vitest";
import { evaluateAprProductShadowReadiness } from "./productShadowReadiness";

const otherwiseCompleteEvidence = {
  completedEneaPdfSamples: 3,
  realParserFixtureSamples: 3,
  historicalAuditsCompared: 3,
  unresolvedHistoricalMismatches: 0,
  unobservedDefaultFieldCount: 0,
  completedEneaPdfSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
  realParserFixtureSampleIds: ["fixture-1", "fixture-2", "fixture-3"],
  realParserFixtureSourcePdfIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
  historicalAuditedSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
  technicalPortalContractObserved: true,
  productParserImplemented: true,
  productMapperImplemented: true,
  capabilityGateImplemented: true,
  regressionSuiteGreen: true,
  globalShadowUserGateGranted: true,
} as const;

describe("APR product shadow readiness - technical performance source", () => {
  it.each(["infissi", "impianto_termico", "insufflaggio"] as const)(
    "non promuove %s quando la sorgente della prestazione tecnica non e stata osservata",
    (productType) => {
      const evidence = {
        ...otherwiseCompleteEvidence,
        evidenceProductType: productType,
        technicalPerformanceSourceObserved: false,
      };
      const result = evaluateAprProductShadowReadiness(productType, evidence);

      expect(result.technicalShadowReady).toBe(false);
      expect(result.operationalShadowAllowed).toBe(false);
      expect(result.blockers).toContain("technical-performance-source-unobserved");
      expect(result.officialSubmissionAllowed).toBe(false);
    },
  );

  it("resta separato dal gate utente anche dopo aver osservato la sorgente tecnica", () => {
    const evidence = {
      ...otherwiseCompleteEvidence,
      evidenceProductType: "infissi" as const,
      technicalPerformanceSourceObserved: true,
      globalShadowUserGateGranted: false,
    };
    const result = evaluateAprProductShadowReadiness("infissi", evidence);

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
