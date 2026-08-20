import { describe, expect, it } from "vitest";
import { evaluateAprProductShadowReadiness } from "./productShadowReadiness";

const completeEvidence = {
  evidenceProductType: "infissi" as const,
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
  completedEneaPdfSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
  realParserFixtureSampleIds: ["fixture-1", "fixture-2", "fixture-3"],
  historicalAuditedSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-3"],
} as const;

describe("APR product shadow readiness - sample identity safety", () => {
  it("non usa conteggi senza identita campione per promuovere la readiness", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      evidenceProductType: "infissi",
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
    });

    expect(result.technicalShadowReady).toBe(false);
    expect(result.blockers).toContain("evidence-sample-identity-unverified");
  });

  it("rifiuta PDF duplicati anche quando il conteggio dichiarato sembra completo", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...completeEvidence,
      completedEneaPdfSampleIds: ["enea-pdf-1", "enea-pdf-1", "enea-pdf-3"],
    });

    expect(result.technicalShadowReady).toBe(false);
    expect(result.blockers).toContain("evidence-sample-identity-invalid");
  });

  it("rifiuta audit attribuiti a PDF che non appartengono al corpus dichiarato", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...completeEvidence,
      historicalAuditedSampleIds: ["enea-pdf-1", "enea-pdf-2", "enea-pdf-x"],
    });

    expect(result.technicalShadowReady).toBe(false);
    expect(result.blockers).toContain("evidence-sample-identity-invalid");
  });

  it("mantiene separato il gate utente quando identita e conteggi sono coerenti", () => {
    const result = evaluateAprProductShadowReadiness("infissi", completeEvidence);

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
