import { describe, expect, it } from "vitest";
import { evaluateAprProductShadowReadiness } from "./productShadowReadiness";

const completeEvidence = {
  completedEneaPdfSamples: 3,
  realParserFixtureSamples: 3,
  historicalAuditsCompared: 3,
  unresolvedHistoricalMismatches: 0,
  unobservedDefaultFieldCount: 0,
  technicalPortalContractObserved: true,
  productParserImplemented: true,
  productMapperImplemented: true,
  capabilityGateImplemented: true,
  regressionSuiteGreen: true,
} as const;

describe("APR product shadow readiness", () => {
  it("resta fail-closed quando mancano le evidenze minime del prodotto", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      completedEneaPdfSamples: 0,
      realParserFixtureSamples: 0,
      historicalAuditsCompared: 0,
      unresolvedHistoricalMismatches: 0,
      unobservedDefaultFieldCount: 0,
      technicalPortalContractObserved: false,
      productParserImplemented: false,
      productMapperImplemented: false,
      capabilityGateImplemented: false,
      regressionSuiteGreen: false,
    });

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.officialSubmissionAllowed).toBe(false);
    expect(result.blockers).toEqual([
      "completed-enea-ground-truth-missing",
      "real-parser-fixtures-missing",
      "historical-audit-missing",
      "technical-portal-contract-unobserved",
      "product-parser-missing",
      "product-mapper-missing",
      "capability-gate-missing",
      "regression-suite-not-green",
    ]);
  });

  it("separa la readiness tecnica dal gate esplicito APR operativo ombra", () => {
    const result = evaluateAprProductShadowReadiness("impianto_termico", completeEvidence);

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("consente shadow operativo solo dopo readiness tecnica e gate utente", () => {
    const result = evaluateAprProductShadowReadiness("insufflaggio", {
      ...completeEvidence,
      globalShadowUserGateGranted: true,
    });

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("blocca default non osservati e mismatch storici irrisolti anche con suite verde", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...completeEvidence,
      unresolvedHistoricalMismatches: 1,
      unobservedDefaultFieldCount: 2,
      globalShadowUserGateGranted: true,
    });

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual([
      "historical-mismatch-unresolved",
      "unobserved-default-present",
    ]);
  });
});
