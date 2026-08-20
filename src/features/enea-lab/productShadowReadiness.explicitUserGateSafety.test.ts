import { describe, expect, it } from "vitest";
import {
  evaluateAprProductShadowReadiness,
  type AprProductShadowReadinessEvidence,
} from "./productShadowReadiness";

const completeEvidence = {
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
} as const;

describe("APR product shadow readiness - explicit user gate", () => {
  it("non attiva OMBRA con il solo boolean legacy", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...completeEvidence,
      globalShadowUserGateGranted: true,
    });

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
  });

  it("rifiuta a runtime una pseudo-autorizzazione diversa dalla frase esplicita dell'utente", () => {
    const malformed = {
      ...completeEvidence,
      globalShadowUserGateGranted: true,
      globalShadowAuthorization: {
        source: "user",
        phrase: "APR operativo quasi ombra",
      },
    } as unknown as AprProductShadowReadinessEvidence;

    const result = evaluateAprProductShadowReadiness("infissi", malformed);

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
  });

  it("attiva OMBRA soltanto con l'autorizzazione utente canonica", () => {
    const result = evaluateAprProductShadowReadiness("infissi", {
      ...completeEvidence,
      globalShadowAuthorization: {
        source: "user",
        phrase: "APR operativo ombra",
      },
    });

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
