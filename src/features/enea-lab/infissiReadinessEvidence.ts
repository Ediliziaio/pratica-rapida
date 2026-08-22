import type { AprGlobalShadowUserAuthorization } from "./aprShadowAuthorization";
import type { AprProductShadowReadinessEvidence } from "./productShadowReadiness";
import type { AprInfissiPipelineResult } from "./infissiPipeline";

export interface AprInfissiReadinessEvidenceInput {
  pipeline: AprInfissiPipelineResult;
  sampleId: string;
  parserFixtureId: string;
  productParserImplemented: boolean;
  technicalPerformanceSourceObserved: boolean;
  regressionSuiteGreen: boolean;
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization;
}

/**
 * Adatta un caso Infissi verificato al gate multi-prodotto generale APR.
 *
 * Una fixture presente NON equivale a un parser implementato: i due segnali
 * restano separati, così un file di esempio non può promuovere artificialmente
 * la readiness prima che esista davvero il parser della sorgente operativa.
 */
export function buildAprInfissiReadinessEvidence(
  input: AprInfissiReadinessEvidenceInput,
): AprProductShadowReadinessEvidence {
  const canonicalSampleId = input.sampleId.trim();
  const canonicalFixtureId = input.parserFixtureId.trim();
  const historicalAuditable = input.pipeline.historicalAudit.status !== "error";
  const unresolvedMismatch = input.pipeline.historicalAudit.status === "difference"
    || input.pipeline.technicalAudit.status === "difference";

  return {
    evidenceProductType: "infissi",
    completedEneaPdfSamples: canonicalSampleId ? 1 : 0,
    realParserFixtureSamples: canonicalFixtureId ? 1 : 0,
    historicalAuditsCompared: canonicalSampleId && historicalAuditable ? 1 : 0,
    unresolvedHistoricalMismatches: unresolvedMismatch ? 1 : 0,
    unobservedDefaultFieldCount: 0,
    completedEneaPdfSampleIds: canonicalSampleId ? [canonicalSampleId] : [],
    realParserFixtureSampleIds: canonicalFixtureId ? [canonicalFixtureId] : [],
    historicalAuditedSampleIds: canonicalSampleId && historicalAuditable ? [canonicalSampleId] : [],
    realParserFixtureSourcePdfIds: canonicalFixtureId && canonicalSampleId ? [canonicalSampleId] : [],
    technicalPortalContractObserved: input.pipeline.portalContract.valid,
    technicalPerformanceSourceObserved: input.technicalPerformanceSourceObserved,
    productParserImplemented: input.productParserImplemented,
    productMapperImplemented: true,
    capabilityGateImplemented: true,
    regressionSuiteGreen: input.regressionSuiteGreen,
    globalShadowAuthorization: input.globalShadowAuthorization,
  };
}
