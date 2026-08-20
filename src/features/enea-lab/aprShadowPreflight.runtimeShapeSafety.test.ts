import { describe, expect, it } from "vitest";
import { evaluateAprShadowPreflight, type AprShadowPreflightInput } from "./aprShadowPreflight";
import type { AprProductShadowReadinessEvidence } from "./productShadowReadiness";

const CURRENT_REVISION = "0123456789abcdef0123456789abcdef01234567";

function completeEvidence(productType: "infissi" | "impianto_termico" | "insufflaggio"): AprProductShadowReadinessEvidence {
  return {
    evidenceProductType: productType,
    completedEneaPdfSamples: 1,
    realParserFixtureSamples: 1,
    historicalAuditsCompared: 1,
    unresolvedHistoricalMismatches: 0,
    unobservedDefaultFieldCount: 0,
    completedEneaPdfSampleIds: [`${productType}-pdf-1`],
    realParserFixtureSampleIds: [`${productType}-fixture-1`],
    historicalAuditedSampleIds: [`${productType}-pdf-1`],
    realParserFixtureSourcePdfIds: [`${productType}-pdf-1`],
    technicalPortalContractObserved: true,
    technicalPerformanceSourceObserved: true,
    productParserImplemented: true,
    productMapperImplemented: true,
    capabilityGateImplemented: true,
    regressionSuiteGreen: true,
  };
}

function validInput(): AprShadowPreflightInput {
  return {
    currentCodeRevision: CURRENT_REVISION,
    regressionSuiteGreenRevision: CURRENT_REVISION,
    screeningsTechnicalShadowReady: true,
    productEvidence: {
      infissi: completeEvidence("infissi"),
      impianto_termico: completeEvidence("impianto_termico"),
      insufflaggio: completeEvidence("insufflaggio"),
    },
    globalShadowAuthorization: {
      source: "user",
      phrase: "APR operativo ombra",
    },
  };
}

describe("APR shadow preflight runtime-shape safety", () => {
  it("non interpreta un booleano testuale come readiness delle schermature", () => {
    const result = evaluateAprShadowPreflight({
      ...validInput(),
      screeningsTechnicalShadowReady: "false" as unknown as boolean,
    });

    expect(result.screenings.technicalShadowReady).toBe(false);
    expect(result.screenings.operationalShadowAllowed).toBe(false);
    expect(result.activationBlockers).toContain("screenings-technical-readiness-unverified");
    expect(result.nextActivationAction).toBe("verify-screenings-technical-readiness");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("non va in eccezione se il corpus prodotto ricostruito a runtime e nullo", () => {
    const result = evaluateAprShadowPreflight({
      ...validInput(),
      productEvidence: null as unknown as AprShadowPreflightInput["productEvidence"],
    });

    expect(result.screenings.operationalShadowAllowed).toBe(true);
    expect(result.products.infissi.technicalShadowReady).toBe(false);
    expect(result.products.infissi.readiness.blockers).toContain("evidence-runtime-shape-invalid");
    expect(result.products.impianto_termico.technicalShadowReady).toBe(false);
    expect(result.products.insufflaggio.technicalShadowReady).toBe(false);
    expect(result.nextProductIntegrationAction).toBe("continue-product-readiness");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("resta fail-closed anche se l'intero input runtime e nullo", () => {
    const result = evaluateAprShadowPreflight(null as unknown as AprShadowPreflightInput);

    expect(result.globalShadowUserGateGranted).toBe(false);
    expect(result.regressionSuiteFresh).toBe(false);
    expect(result.screenings.technicalShadowReady).toBe(false);
    expect(result.screenings.operationalShadowAllowed).toBe(false);
    expect(result.products.infissi.technicalShadowReady).toBe(false);
    expect(result.activationBlockers).toContain("regression-suite-attestation-missing");
    expect(result.activationBlockers).toContain("screenings-technical-readiness-unverified");
    expect(result.activationBlockers).toContain("global-shadow-user-gate-not-granted");
    expect(result.officialSubmissionAllowed).toBe(false);
  });
});
