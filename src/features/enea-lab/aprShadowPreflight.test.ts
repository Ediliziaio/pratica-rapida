import { describe, expect, it } from "vitest";
import {
  evaluateAprShadowPreflight,
  type AprShadowPreflightInput,
} from "./aprShadowPreflight";
import type { AprIntakeOnlyProduct } from "./productIntegration";
import type { AprProductShadowReadinessEvidence } from "./productShadowReadiness";

const CURRENT_REVISION = "0123456789abcdef0123456789abcdef01234567";
const STALE_REVISION = "89abcdef0123456789abcdef0123456789abcdef";

function completeEvidence(productType: AprIntakeOnlyProduct): AprProductShadowReadinessEvidence {
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

function baseInput(): AprShadowPreflightInput {
  return {
    currentCodeRevision: CURRENT_REVISION,
    regressionSuiteGreenRevision: CURRENT_REVISION,
    screeningsTechnicalShadowReady: true,
    productEvidence: {
      infissi: completeEvidence("infissi"),
      impianto_termico: completeEvidence("impianto_termico"),
      insufflaggio: completeEvidence("insufflaggio"),
    },
  };
}

describe("APR shadow preflight", () => {
  it("separa readiness tecnica dal gate esplicito dell'utente", () => {
    const result = evaluateAprShadowPreflight(baseInput());

    expect(result.regressionSuiteFresh).toBe(true);
    expect(result.globalShadowUserGateGranted).toBe(false);
    expect(result.screenings.technicalShadowReady).toBe(true);
    expect(result.screenings.operationalShadowAllowed).toBe(false);
    expect(result.products.infissi.technicalShadowReady).toBe(true);
    expect(result.products.infissi.operationalShadowAllowed).toBe(false);
    expect(result.activationBlockers).toContain("global-shadow-user-gate-not-granted");
    expect(result.nextActivationAction).toBe("await-explicit-user-gate");
    expect(result.nextProductIntegrationAction).toBe("all-intake-products-technically-ready");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("abilita solo shadow read-only dopo gate esatto e regressioni fresche", () => {
    const result = evaluateAprShadowPreflight({
      ...baseInput(),
      globalShadowAuthorization: {
        source: "user",
        phrase: "APR operativo ombra",
      },
    });

    expect(result.globalShadowUserGateGranted).toBe(true);
    expect(result.screenings.operationalShadowAllowed).toBe(true);
    expect(result.products.infissi.operationalShadowAllowed).toBe(true);
    expect(result.products.impianto_termico.operationalShadowAllowed).toBe(true);
    expect(result.products.insufflaggio.operationalShadowAllowed).toBe(true);
    expect(result.activationBlockers).toEqual([]);
    expect(result.nextActivationAction).toBe("start-read-only-shadow");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("blocca lo shadow operativo quando il verde appartiene a una revisione stale", () => {
    const result = evaluateAprShadowPreflight({
      ...baseInput(),
      regressionSuiteGreenRevision: STALE_REVISION,
      globalShadowAuthorization: {
        source: "user",
        phrase: "APR operativo ombra",
      },
    });

    expect(result.regressionSuiteFresh).toBe(false);
    expect(result.screenings.operationalShadowAllowed).toBe(false);
    expect(result.products.infissi.technicalShadowReady).toBe(false);
    expect(result.products.infissi.operationalShadowAllowed).toBe(false);
    expect(result.activationBlockers).toContain("regression-suite-attestation-stale");
    expect(result.nextActivationAction).toBe("refresh-regression-suite-attestation");
    expect(result.officialSubmissionAllowed).toBe(false);
  });

  it("non nasconde il lavoro prodotto dietro al gate utente", () => {
    const input = baseInput();
    const result = evaluateAprShadowPreflight({
      ...input,
      productEvidence: {
        ...input.productEvidence,
        infissi: {
          ...input.productEvidence.infissi,
          technicalPerformanceSourceObserved: false,
        },
      },
    });

    expect(result.screenings.technicalShadowReady).toBe(true);
    expect(result.nextActivationAction).toBe("await-explicit-user-gate");
    expect(result.products.infissi.technicalShadowReady).toBe(false);
    expect(result.products.infissi.readiness.blockers).toContain(
      "technical-performance-source-unobserved",
    );
    expect(result.nextProductIntegrationAction).toBe("continue-product-readiness");
  });

  it("rifiuta attestazioni di revisione non canoniche", () => {
    const result = evaluateAprShadowPreflight({
      ...baseInput(),
      regressionSuiteGreenRevision: ` ${CURRENT_REVISION}`,
    });

    expect(result.regressionSuiteFresh).toBe(false);
    expect(result.activationBlockers).toContain("regression-suite-attestation-missing");
    expect(result.nextActivationAction).toBe("refresh-regression-suite-attestation");
  });
});
