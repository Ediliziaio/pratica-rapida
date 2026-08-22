import { describe, expect, it } from "vitest";
import type { AprIntakeOnlyProduct } from "./productIntegration";
import {
  evaluateAprProductShadowReadiness,
  type AprProductShadowReadinessEvidence,
} from "./productShadowReadiness";

function completeEvidence(productType: AprIntakeOnlyProduct): AprProductShadowReadinessEvidence {
  return {
    evidenceProductType: productType,
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
  };
}

describe("APR product shadow readiness - product type runtime safety", () => {
  it("non usa il gate intake-only per le schermature anche se il valore arriva da runtime", () => {
    const invalidProduct = "schermature" as unknown as AprIntakeOnlyProduct;
    const evidence = {
      ...completeEvidence("infissi"),
      evidenceProductType: "schermature",
    } as unknown as AprProductShadowReadinessEvidence;

    const result = evaluateAprProductShadowReadiness(invalidProduct, evidence);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("product-type-runtime-invalid");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("resta fail-closed se prodotto ed evidenza condividono lo stesso valore runtime sconosciuto", () => {
    const invalidProduct = "prodotto-sconosciuto" as unknown as AprIntakeOnlyProduct;
    const evidence = {
      ...completeEvidence("infissi"),
      evidenceProductType: "prodotto-sconosciuto",
    } as unknown as AprProductShadowReadinessEvidence;

    const result = evaluateAprProductShadowReadiness(invalidProduct, evidence);

    expect(result.technicalShadowReady).toBe(false);
    expect(result.operationalShadowAllowed).toBe(false);
    expect(result.blockers).toContain("product-type-runtime-invalid");
  });
});
