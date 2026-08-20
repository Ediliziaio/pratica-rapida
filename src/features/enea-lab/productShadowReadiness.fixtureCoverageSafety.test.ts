import { describe, expect, it } from "vitest";
import { evaluateAprProductShadowReadiness } from "./productShadowReadiness";

const otherwiseCompleteEvidence = {
  evidenceProductType: "infissi",
  completedEneaPdfSamples: 3,
  realParserFixtureSamples: 3,
  historicalAuditsCompared: 3,
  unresolvedHistoricalMismatches: 0,
  unobservedDefaultFieldCount: 0,
  completedEneaPdfSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
  realParserFixtureSampleIds: ["fixture-1", "fixture-2", "fixture-3"],
  historicalAuditedSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
  technicalPortalContractObserved: true,
  technicalPerformanceSourceObserved: true,
  productParserImplemented: true,
  productMapperImplemented: true,
  capabilityGateImplemented: true,
  regressionSuiteGreen: true,
} as const;

describe("APR product shadow readiness - fixture corpus coverage", () => {
  it("non promuove un parser quando tutte le fixture derivano da un solo PDF del corpus", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...otherwiseCompleteEvidence,
      realParserFixtureSourcePdfIds: ["enea-pdf-1", "enea-pdf-1", "enea-pdf-1"],
    });

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-sample-lineage-incomplete");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("considera completa la lineage quando ogni PDF conclusivo ha almeno una fixture reale", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...otherwiseCompleteEvidence,
      realParserFixtureSourcePdfIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
    });

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
