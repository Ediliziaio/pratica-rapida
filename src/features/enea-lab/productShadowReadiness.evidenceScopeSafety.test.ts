import { describe, expect, it } from "vitest";
import { evaluateAprProductShadowReadiness } from "./productShadowReadiness";

const otherwiseCompleteEvidence = {
  completedEneaPdfSamples: 3,
  realParserFixtureSamples: 3,
  historicalAuditsCompared: 3,
  unresolvedHistoricalMismatches: 0,
  unobservedDefaultFieldCount: 0,
  technicalPortalContractObserved: true,
  technicalPerformanceSourceObserved: true,
  productParserImplemented: true,
  productMapperImplemented: true,
  capabilityGateImplemented: true,
  regressionSuiteGreen: true,
  globalShadowUserGateGranted: true,
} as const;

describe("APR product shadow readiness - evidence product scope", () => {
  it("non usa evidenze di un altro prodotto per promuovere la readiness", () => {
    const evidence = {
      ...otherwiseCompleteEvidence,
      evidenceProductType: "impianto_termico",
    } as const;

    const result = evaluateAprProductShadowReadiness("infissi", evidence);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-product-scope-mismatch");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("resta fail-closed quando il corpus non dichiara il prodotto a cui appartiene", () => {
    const result = evaluateAprProductShadowReadiness("infissi", otherwiseCompleteEvidence);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-product-scope-unverified");
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
