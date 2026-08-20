import type { AprIntakeOnlyProduct } from "./productIntegration";
import {
  hasExplicitAprShadowAuthorization,
  type AprGlobalShadowUserAuthorization,
} from "./aprShadowAuthorization";

export type { AprGlobalShadowUserAuthorization } from "./aprShadowAuthorization";

export type AprProductShadowReadinessBlocker =
  | "product-type-runtime-invalid"
  | "completed-enea-ground-truth-missing"
  | "real-parser-fixtures-missing"
  | "historical-audit-missing"
  | "historical-ground-truth-not-fully-audited"
  | "historical-mismatch-unresolved"
  | "unobserved-default-present"
  | "technical-portal-contract-unobserved"
  | "technical-performance-source-unobserved"
  | "product-parser-missing"
  | "product-mapper-missing"
  | "capability-gate-missing"
  | "regression-suite-not-green"
  | "evidence-metrics-invalid"
  | "evidence-runtime-shape-invalid"
  | "evidence-product-scope-unverified"
  | "evidence-product-scope-mismatch"
  | "evidence-sample-identity-unverified"
  | "evidence-sample-identity-invalid"
  | "evidence-sample-lineage-unverified"
  | "evidence-sample-lineage-invalid"
  | "global-shadow-user-gate-not-granted";

export interface AprProductShadowReadinessEvidence {
  /**
   * Prodotto a cui appartiene l'intero corpus di ground truth usato per questo
   * gate. Il valore resta opzionale a livello di tipo per gestire in sicurezza
   * snapshot legacy, ma la readiness tecnica resta fail-closed se manca.
   */
  evidenceProductType?: AprIntakeOnlyProduct;
  completedEneaPdfSamples: number;
  realParserFixtureSamples: number;
  historicalAuditsCompared: number;
  unresolvedHistoricalMismatches: number;
  unobservedDefaultFieldCount: number;
  /**
   * Identita canoniche dei campioni reali. I soli conteggi non bastano per la
   * readiness: lo stesso PDF duplicato non deve poter simulare tre campioni
   * indipendenti e un audit deve essere riconducibile a un PDF del corpus.
   */
  completedEneaPdfSampleIds?: readonly string[];
  realParserFixtureSampleIds?: readonly string[];
  historicalAuditedSampleIds?: readonly string[];
  /**
   * Per ogni fixture parser dichiara il PDF ENEA conclusivo reale da cui deriva.
   * Gli ID possono ripetersi se un singolo PDF produce piu fixture, ma ogni
   * sorgente deve appartenere al corpus completedEneaPdfSampleIds. In questo modo
   * fixture sintetiche o provenienti da un altro prodotto non possono simulare
   * evidenza reale sufficiente per la readiness tecnica.
   */
  realParserFixtureSourcePdfIds?: readonly string[];
  technicalPortalContractObserved: boolean;
  /**
   * True soltanto quando la sorgente reale della prestazione tecnica richiesta
   * dal prodotto e stata osservata e congelata: per esempio certificazione/
   * documento tecnico, fattura o altro input verificato. Il solo CRM strutturato
   * e la sola presenza di un PDF non bastano a promuovere il mapping tecnico.
   */
  technicalPerformanceSourceObserved?: boolean;
  productParserImplemented: boolean;
  productMapperImplemented: boolean;
  capabilityGateImplemented: boolean;
  regressionSuiteGreen: boolean;
  /**
   * Campo legacy mantenuto per leggere snapshot precedenti. Non autorizza più
   * l'attivazione operativa: il gate deve derivare dalla frase esplicita utente.
   */
  globalShadowUserGateGranted?: boolean;
  /** Autorizzazione esplicita dell'utente; nessun default e nessuna inferenza. */
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization;
}

export interface AprProductShadowReadinessResult {
  productType: AprIntakeOnlyProduct;
  technicalShadowReady: boolean;
  operationalShadowAllowed: boolean;
  blockers: AprProductShadowReadinessBlocker[];
  officialSubmissionAllowed: false;
}

const COUNT_FIELDS: readonly (keyof Pick<
  AprProductShadowReadinessEvidence,
  | "completedEneaPdfSamples"
  | "realParserFixtureSamples"
  | "historicalAuditsCompared"
  | "unresolvedHistoricalMismatches"
  | "unobservedDefaultFieldCount"
>)[] = [
  "completedEneaPdfSamples",
  "realParserFixtureSamples",
  "historicalAuditsCompared",
  "unresolvedHistoricalMismatches",
  "unobservedDefaultFieldCount",
];

const REQUIRED_BOOLEAN_FIELDS: readonly (keyof Pick<
  AprProductShadowReadinessEvidence,
  | "technicalPortalContractObserved"
  | "productParserImplemented"
  | "productMapperImplemented"
  | "capabilityGateImplemented"
  | "regressionSuiteGreen"
>)[] = [
  "technicalPortalContractObserved",
  "productParserImplemented",
  "productMapperImplemented",
  "capabilityGateImplemented",
  "regressionSuiteGreen",
];

const SAMPLE_ID_FIELDS: readonly (keyof Pick<
  AprProductShadowReadinessEvidence,
  | "completedEneaPdfSampleIds"
  | "realParserFixtureSampleIds"
  | "historicalAuditedSampleIds"
  | "realParserFixtureSourcePdfIds"
>)[] = [
  "completedEneaPdfSampleIds",
  "realParserFixtureSampleIds",
  "historicalAuditedSampleIds",
  "realParserFixtureSourcePdfIds",
];

const APR_INTAKE_ONLY_PRODUCT_VALUES = new Set<string>([
  "infissi",
  "impianto_termico",
  "insufflaggio",
]);

function isAprIntakeOnlyProductValue(value: unknown): value is AprIntakeOnlyProduct {
  return typeof value === "string" && APR_INTAKE_ONLY_PRODUCT_VALUES.has(value);
}

function hasInvalidRuntimeShape(evidence: AprProductShadowReadinessEvidence): boolean {
  const runtimeEvidence = evidence as unknown as Record<string, unknown>;

  if (REQUIRED_BOOLEAN_FIELDS.some((field) => typeof runtimeEvidence[field] !== "boolean")) {
    return true;
  }

  const technicalPerformanceSourceObserved = runtimeEvidence.technicalPerformanceSourceObserved;
  if (
    technicalPerformanceSourceObserved !== undefined
    && typeof technicalPerformanceSourceObserved !== "boolean"
  ) {
    return true;
  }

  return SAMPLE_ID_FIELDS.some((field) => {
    const value = runtimeEvidence[field];
    return value !== undefined
      && (!Array.isArray(value) || value.some((item) => typeof item !== "string"));
  });
}

function hasInvalidEvidenceMetrics(evidence: AprProductShadowReadinessEvidence): boolean {
  if (COUNT_FIELDS.some((field) => {
    const value = evidence[field];
    return !Number.isFinite(value) || value < 0 || !Number.isInteger(value);
  })) {
    return true;
  }

  // I contatori devono descrivere un corpus realmente riconciliabile: non si
  // possono aver auditato più PDF conclusivi di quelli disponibili, né avere
  // più mismatch irrisolti degli audit effettivamente confrontati. Accettare
  // questi stati permetterebbe a conteggi duplicati/stale di simulare una
  // copertura completa e promuovere artificialmente la readiness tecnica.
  return evidence.historicalAuditsCompared > evidence.completedEneaPdfSamples
    || evidence.unresolvedHistoricalMismatches > evidence.historicalAuditsCompared;
}

function hasAnySampledEvidence(evidence: AprProductShadowReadinessEvidence): boolean {
  return evidence.completedEneaPdfSamples > 0
    || evidence.realParserFixtureSamples > 0
    || evidence.historicalAuditsCompared > 0;
}

function hasCanonicalUniqueIds(ids: unknown): ids is readonly string[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return false;
  }

  const stringIds = ids as string[];
  const normalized = stringIds.map((id) => id.trim());
  return normalized.every((id, index) => id.length > 0 && id === stringIds[index])
    && new Set(normalized).size === normalized.length;
}

function hasCanonicalIds(ids: unknown): ids is readonly string[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return false;
  }

  const stringIds = ids as string[];
  return stringIds.every((id) => id.length > 0 && id === id.trim());
}

function getSampleIdentityStatus(
  evidence: AprProductShadowReadinessEvidence,
): "verified" | "unverified" | "invalid" {
  if (!hasAnySampledEvidence(evidence)) return "verified";

  const completedIds = evidence.completedEneaPdfSampleIds as unknown;
  const fixtureIds = evidence.realParserFixtureSampleIds as unknown;
  const auditedIds = evidence.historicalAuditedSampleIds as unknown;
  if (completedIds == null || fixtureIds == null || auditedIds == null) {
    return "unverified";
  }

  if (
    !hasCanonicalUniqueIds(completedIds)
    || !hasCanonicalUniqueIds(fixtureIds)
    || !hasCanonicalUniqueIds(auditedIds)
    || completedIds.length !== evidence.completedEneaPdfSamples
    || fixtureIds.length !== evidence.realParserFixtureSamples
    || auditedIds.length !== evidence.historicalAuditsCompared
  ) {
    return "invalid";
  }

  const completedSet = new Set(completedIds);
  if (auditedIds.some((id) => !completedSet.has(id))) {
    return "invalid";
  }

  return "verified";
}

function getSampleLineageStatus(
  evidence: AprProductShadowReadinessEvidence,
): "verified" | "unverified" | "invalid" {
  if (evidence.realParserFixtureSamples === 0) return "verified";

  const completedIds = evidence.completedEneaPdfSampleIds as unknown;
  const sourcePdfIds = evidence.realParserFixtureSourcePdfIds as unknown;
  if (sourcePdfIds == null) return "unverified";

  if (
    !hasCanonicalUniqueIds(completedIds)
    || !hasCanonicalIds(sourcePdfIds)
    || sourcePdfIds.length !== evidence.realParserFixtureSamples
  ) {
    return "invalid";
  }

  const completedSet = new Set(completedIds);
  if (sourcePdfIds.some((id) => !completedSet.has(id))) {
    return "invalid";
  }

  return "verified";
}

/**
 * Gate di capacità APR per i prodotti ancora intake-only.
 *
 * Working backwards dall'uso shadow: la readiness tecnica è dimostrata soltanto
 * da evidenze reali e complete del prodotto corretto; non viene derivata dal
 * solo fatto che esistano file o codice. Il gate globale resta separato e può
 * essere concesso soltanto dall'utente tramite la frase canonica. Nessun esito
 * di questa funzione abilita l'invio ufficiale.
 */
export function evaluateAprProductShadowReadiness(
  productType: AprIntakeOnlyProduct,
  evidence: AprProductShadowReadinessEvidence,
): AprProductShadowReadinessResult {
  if (evidence == null || typeof evidence !== "object" || Array.isArray(evidence)) {
    const blockers: AprProductShadowReadinessBlocker[] = [];
    if (!isAprIntakeOnlyProductValue(productType)) blockers.push("product-type-runtime-invalid");
    blockers.push("evidence-runtime-shape-invalid");
    return {
      productType,
      technicalShadowReady: false,
      operationalShadowAllowed: false,
      blockers,
      officialSubmissionAllowed: false,
    };
  }

  const technicalBlockers: AprProductShadowReadinessBlocker[] = [];
  const runtimeEvidence = evidence as unknown as Record<string, unknown>;
  const runtimeEvidenceProductType = runtimeEvidence.evidenceProductType;

  // I tipi TypeScript non sono una barriera runtime: snapshot ricostruiti da
  // storage o JSON possono contenere "schermature" o valori sconosciuti e non
  // devono poter riusare il gate riservato ai tre adapter intake-only.
  if (
    !isAprIntakeOnlyProductValue(productType)
    || (
      runtimeEvidenceProductType != null
      && !isAprIntakeOnlyProductValue(runtimeEvidenceProductType)
    )
  ) {
    technicalBlockers.push("product-type-runtime-invalid");
  }

  // La ground truth deve essere esplicitamente scoped allo stesso prodotto che
  // stiamo cercando di promuovere. Senza questo legame un conteggio valido ma
  // aggregato (per esempio PDF schermature) potrebbe soddisfare per errore il
  // gate degli infissi o dell'impianto termico.
  if (evidence.evidenceProductType == null) {
    technicalBlockers.push("evidence-product-scope-unverified");
  } else if (evidence.evidenceProductType !== productType) {
    technicalBlockers.push("evidence-product-scope-mismatch");
  }
  if (hasInvalidRuntimeShape(evidence)) {
    technicalBlockers.push("evidence-runtime-shape-invalid");
  }
  if (hasInvalidEvidenceMetrics(evidence)) {
    technicalBlockers.push("evidence-metrics-invalid");
  }
  const sampleIdentityStatus = getSampleIdentityStatus(evidence);
  if (sampleIdentityStatus === "unverified") {
    technicalBlockers.push("evidence-sample-identity-unverified");
  } else if (sampleIdentityStatus === "invalid") {
    technicalBlockers.push("evidence-sample-identity-invalid");
  }
  const sampleLineageStatus = getSampleLineageStatus(evidence);
  if (sampleLineageStatus === "unverified") {
    technicalBlockers.push("evidence-sample-lineage-unverified");
  } else if (sampleLineageStatus === "invalid") {
    technicalBlockers.push("evidence-sample-lineage-invalid");
  }
  if (evidence.completedEneaPdfSamples === 0) {
    technicalBlockers.push("completed-enea-ground-truth-missing");
  }
  if (evidence.realParserFixtureSamples === 0) {
    technicalBlockers.push("real-parser-fixtures-missing");
  }
  if (evidence.historicalAuditsCompared === 0) {
    technicalBlockers.push("historical-audit-missing");
  }
  if (
    evidence.completedEneaPdfSamples > 0
    && evidence.historicalAuditsCompared < evidence.completedEneaPdfSamples
  ) {
    technicalBlockers.push("historical-ground-truth-not-fully-audited");
  }
  if (evidence.unresolvedHistoricalMismatches > 0) {
    technicalBlockers.push("historical-mismatch-unresolved");
  }
  if (evidence.unobservedDefaultFieldCount > 0) {
    technicalBlockers.push("unobserved-default-present");
  }
  if (!evidence.technicalPortalContractObserved) {
    technicalBlockers.push("technical-portal-contract-unobserved");
  }
  // Hard gate separato dal contratto della pagina: conoscere i campi del portale
  // non dimostra ancora da dove provenga il valore tecnico da scrivere. Per i
  // prodotti nuovi APR deve prima osservare e congelare la sorgente documentale
  // della prestazione, altrimenti un mapper completo potrebbe essere solo un
  // insieme di valori dedotti o mancanti mascherati da readiness.
  if (evidence.technicalPerformanceSourceObserved !== true) {
    technicalBlockers.push("technical-performance-source-unobserved");
  }
  if (!evidence.productParserImplemented) technicalBlockers.push("product-parser-missing");
  if (!evidence.productMapperImplemented) technicalBlockers.push("product-mapper-missing");
  if (!evidence.capabilityGateImplemented) technicalBlockers.push("capability-gate-missing");
  if (!evidence.regressionSuiteGreen) technicalBlockers.push("regression-suite-not-green");

  const technicalShadowReady = technicalBlockers.length === 0;
  const explicitUserGateGranted = hasExplicitAprShadowAuthorization(
    evidence.globalShadowAuthorization,
  );
  const blockers = [...technicalBlockers];
  if (technicalShadowReady && !explicitUserGateGranted) {
    blockers.push("global-shadow-user-gate-not-granted");
  }

  return {
    productType,
    technicalShadowReady,
    operationalShadowAllowed: technicalShadowReady && explicitUserGateGranted,
    blockers,
    officialSubmissionAllowed: false,
  };
}
