import { describe, expect, it } from "vitest";
import {
  evaluateAprProductShadowReadiness,
  type AprProductShadowReadinessEvidence,
} from "./productShadowReadiness";

const completeEvidence = {
  evidenceProductType: "infissi",
  completedEneaPdfSamples: 2,
  realParserFixtureSamples: 2,
  historicalAuditsCompared: 2,
  unresolvedHistoricalMismatches: 0,
  unobservedDefaultFieldCount: 0,
  completedEneaPdfSampleIds: ["enea-pdf-1", "enea-pdf-2"],
  realParserFixtureSampleIds: ["fixture-1", "fixture-2"],
  historicalAuditedSampleIds: ["enea-pdf-1", "enea-pdf-2"],
  technicalPortalContractObserved: true,
  technicalPerformanceSourceObserved: true,
  productParserImplemented: true,
  productMapperImplemented: true,
  capabilityGateImplemented: true,
  regressionSuiteGreen: true,
} as const;

describe("APR product shadow readiness - fixture lineage safety", () => {
  it("non usa fixture reali senza legame verificabile ai PDF ENEA del corpus", () => {
    const result = evaluateAprProductShadowReadiness("infissi", completeEvidence);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-sample-lineage-unverified");
  });

  it("rifiuta fixture collegate a PDF che non appartengono al corpus dichiarato", () => {
    const evidence = {
      ...completeEvidence,
      realParserFixtureSourcePdfIds: ["enea-pdf-1", "enea-pdf-x"],
    } as unknown as AprProductShadowReadinessEvidence;

    const result = evaluateAprProductShadowReadiness("infissi", evidence);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("evidence-sample-lineage-invalid");
  });

  it("mantiene separato il gate utente quando ogni fixture deriva da un PDF del corpus", () => {
    const evidence = {
      ...completeEvidence,
      realParserFixtureSourcePdfIds: ["enea-pdf-1", "enea-pdf-2"],
    } as unknown as AprProductShadowReadinessEvidence;

    const result = evaluateAprProductShadowReadiness("infissi", evidence);

    expect(result.technicalShadowReady).toBe(true);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toEqual(["global-shadow-user-gate-not-granted"]);
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
