import type { AprIntakeOnlyProduct } from "./productIntegration";

export type AprProductShadowReadinessBlocker =
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
  | "global-shadow-user-gate-not-granted";

export interface AprProductShadowReadinessEvidence {
  completedEneaPdfSamples: number;
  realParserFixtureSamples: number;
  historicalAuditsCompared: number;
  unresolvedHistoricalMismatches: number;
  unobservedDefaultFieldCount: number;
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
  /** Gate esplicito dell'utente: "APR operativo ombra". Default false. */
  globalShadowUserGateGranted?: boolean;
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

/**
 * Gate di capacità APR per i prodotti ancora intake-only.
 *
 * Working backwards dall'uso shadow: la readiness tecnica è dimostrata soltanto
 * da evidenze reali e complete; non viene derivata dal solo fatto che esistano
 * file o codice. Il gate globale resta separato e può essere concesso soltanto
 * dall'utente. Nessun esito di questa funzione abilita l'invio ufficiale.
 */
export function evaluateAprProductShadowReadiness(
  productType: AprIntakeOnlyProduct,
  evidence: AprProductShadowReadinessEvidence,
): AprProductShadowReadinessResult {
  const technicalBlockers: AprProductShadowReadinessBlocker[] = [];

  if (hasInvalidEvidenceMetrics(evidence)) {
    technicalBlockers.push("evidence-metrics-invalid");
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
  const blockers = [...technicalBlockers];
  if (technicalShadowReady && evidence.globalShadowUserGateGranted !== true) {
    blockers.push("global-shadow-user-gate-not-granted");
  }

  return {
    productType,
    technicalShadowReady,
    operationalShadowAllowed: technicalShadowReady && evidence.globalShadowUserGateGranted === true,
    blockers,
    officialSubmissionAllowed: false,
  };
}
