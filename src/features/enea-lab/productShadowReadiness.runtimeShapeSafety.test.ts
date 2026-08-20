import { describe, expect, it } from "vitest";
import {
  evaluateAprProductShadowReadiness,
  type AprProductShadowReadinessEvidence,
} from "./productShadowReadiness";

const completeEvidence = {
  evidenceProductType: "infissi",
  completedEneaPdfSamples: 1,
  realParserFixtureSamples: 1,
  historicalAuditsCompared: 1,
  unresolvedHistoricalMismatches: 0,
  unobservedDefaultFieldCount: 0,
  completedEneaPdfSampleIds: ["enea-pdf-1"],
  realParserFixtureSampleIds: ["fixture-1"],
  historicalAuditedSampleIds: ["enea-pdf-1"],
  technicalPortalContractObserved: true,
  technicalPerformanceSourceObserved: true,
  productParserImplemented: true,
  productMapperImplemented: true,
  capabilityGateImplemented: true,
  regressionSuiteGreen: true,
} satisfies AprProductShadowReadinessEvidence;

describe("APR product shadow readiness - runtime shape safety", () => {
  it("non promuove booleani truthy corrotti provenienti da snapshot runtime", () => {
    const corrupted = {
      ...completeEvidence,
      productParserImplemented: "false",
      regressionSuiteGreen: 1,
    } as unknown as AprProductShadowReadinessEvidence;

    const result = evaluateAprProductShadowReadiness("infissi", corrupted);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-runtime-shape-invalid");
  });

  it("resta fail-closed senza eccezioni se gli ID campione non sono array di stringhe", () => {
    const corrupted = {
      ...completeEvidence,
      completedEneaPdfSampleIds: "enea-pdf-1",
    } as unknown as AprProductShadowReadinessEvidence;

    expect(() => evaluateAprProductShadowReadiness("infissi", corrupted)).not.toThrow();

    const result = evaluateAprProductShadowReadiness("infissi", corrupted);
    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-runtime-shape-invalid");
  });
});
