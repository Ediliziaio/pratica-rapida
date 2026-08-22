import type { AprGlobalShadowUserAuthorization } from "./aprShadowAuthorization";
import type { AprProductShadowReadinessEvidence } from "./productShadowReadiness";
import type { AprInfissiPipelineResult } from "./infissiPipeline";

export interface AprInfissiReadinessEvidenceInput {
  pipeline: AprInfissiPipelineResult;
  sampleId: string;
  parserFixtureId: string;
  technicalPerformanceSourceObserved: boolean;
  regressionSuiteGreen: boolean;
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization;
}

/**
 * Adatta un caso Infissi verificato al gate multi-prodotto generale APR.
 * I conteggi sono deliberatamente 1:1 con identità e lineage esplicite, così
 * duplicare lo stesso PDF o una fixture sintetica non aumenta la readiness.
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
    productParserImplemented: canonicalFixtureId.length > 0,
    productMapperImplemented: true,
    capabilityGateImplemented: true,
    regressionSuiteGreen: input.regressionSuiteGreen,
    globalShadowAuthorization: input.globalShadowAuthorization,
  };
}
