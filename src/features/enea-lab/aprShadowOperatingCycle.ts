import {
  buildAprShadowBlockerAttribution,
  type AprShadowBlockerAttributionResult,
} from "./aprShadowBlockerAttribution";
import {
  aprShadowBlockerAttributionLedgerToAttributions,
  reconcileAprShadowBlockerAttributionLedger,
  type AprShadowBlockerAttributionLedgerResult,
  type AprShadowBlockerAttributionLedgerState,
  type AprShadowBlockerAttributionWrite,
} from "./aprShadowBlockerAttributionLedger";
import {
  buildAprShadowDailyReviewPlan,
  type AprShadowDailyReviewPlanOptions,
  type AprShadowDailyReviewPlanResult,
} from "./aprShadowDailyReviewPlan";
import {
  calculateAprShadowMetricsByProduct,
  type AprShadowMetricsPortfolioResult,
} from "./aprShadowMetricsByProduct";
import {
  aprShadowLedgerToMetricCases,
  reconcileAprShadowReviewLedger,
  type AprShadowMachineSnapshot,
  type AprShadowReviewLedgerReconcileResult,
  type AprShadowReviewLedgerState,
} from "./aprShadowReviewLedger";

export interface AprShadowOperatingCycleInput {
  previousState: AprShadowReviewLedgerState;
  currentSnapshots: AprShadowMachineSnapshot[];
  reviewPlanOptions: AprShadowDailyReviewPlanOptions;
  /** Diagnosi blocker-per-blocker gia raccolte nei cicli precedenti. */
  previousBlockerAttributionState?: AprShadowBlockerAttributionLedgerState;
  /** Nuove attribuzioni umane raccolte nel ciclo corrente. */
  blockerAttributionWrites?: AprShadowBlockerAttributionWrite[];
  now?: Date;
}

export interface AprShadowOperatingCycleResult {
  cycleValid: boolean;
  evidenceBlockers: AprShadowReviewLedgerReconcileResult["evidenceBlockers"];
  attributionBlockers: AprShadowBlockerAttributionLedgerResult["evidenceBlockers"];
  planBlockers: AprShadowDailyReviewPlanResult["planBlockers"];
  ledgerState: AprShadowReviewLedgerState;
  blockerAttributionState: AprShadowBlockerAttributionLedgerState;
  /** KPI longitudinali del ledger locale entro la sua TTL. */
  longitudinalMetrics: AprShadowMetricsPortfolioResult | null;
  /** KPI del solo perimetro APR osservato nel ciclo corrente. */
  currentMetrics: AprShadowMetricsPortfolioResult | null;
  /** Qualita e candidati di correzione blocker sull'intero storico valido. */
  longitudinalBlockerAttribution: AprShadowBlockerAttributionResult | null;
  /** Cause multi-blocker ancora da attribuire nel solo perimetro corrente. */
  currentBlockerAttribution: AprShadowBlockerAttributionResult | null;
  /** Coda di review del solo perimetro corrente: lo storico non rientra nel lavoro di oggi. */
  dailyReviewPlan: AprShadowDailyReviewPlanResult | null;
}

/**
 * Orchestratore puro del ciclo operativo APR shadow.
 *
 * Il ledger conserva lo storico per misurare l'apprendimento nel tempo, ma il
 * piano giornaliero deve essere costruito esclusivamente sulle pratiche presenti
 * negli snapshot correnti. Senza questa separazione una pratica storica ancora
 * "unreviewed" resterebbe nel ledger (correttamente) ma tornerebbe ogni giorno
 * nella coda operativa (erroneamente), sottraendo capacita ai blocker attuali.
 *
 * Anche le diagnosi blocker-per-blocker sono legate al fingerprint APR corrente:
 * se dati, documenti o logica cambiano, l'attribuzione storica viene eliminata
 * prima di poter alimentare i candidati di correzione delle regole.
 *
 * Nessuna scrittura CRM/ENEA avviene qui: il risultato e solo stato locale,
 * metriche e piano di review. Evidenza incoerente o limiti invalidi fermano il
 * ciclo in modalita fail-closed.
 */
export function buildAprShadowOperatingCycle(
  input: AprShadowOperatingCycleInput,
): AprShadowOperatingCycleResult {
  const now = input.now ?? new Date();
  const previousBlockerAttributionState = input.previousBlockerAttributionState ?? { records: [] };
  const blockerAttributionWrites = input.blockerAttributionWrites ?? [];
  const reconciled = reconcileAprShadowReviewLedger(
    input.previousState,
    input.currentSnapshots,
    now,
  );

  if (!reconciled.evidenceValid) {
    return {
      cycleValid: false,
      evidenceBlockers: reconciled.evidenceBlockers,
      attributionBlockers: [],
      planBlockers: [],
      ledgerState: reconciled.state,
      blockerAttributionState: previousBlockerAttributionState,
      longitudinalMetrics: null,
      currentMetrics: null,
      longitudinalBlockerAttribution: null,
      currentBlockerAttribution: null,
      dailyReviewPlan: null,
    };
  }

  const longitudinalRows = aprShadowLedgerToMetricCases(reconciled.state);
  const longitudinalMetrics = calculateAprShadowMetricsByProduct(longitudinalRows);
  const currentPracticeIds = new Set(input.currentSnapshots.map((snapshot) => snapshot.practiceId));
  const currentRows = longitudinalRows.filter((row) => currentPracticeIds.has(row.practiceId));
  const currentMetrics = calculateAprShadowMetricsByProduct(currentRows);

  if (!longitudinalMetrics.portfolioEvidenceValid || !currentMetrics.portfolioEvidenceValid) {
    return {
      cycleValid: false,
      evidenceBlockers: [
        ...longitudinalMetrics.overall.evidenceBlockers,
        ...currentMetrics.overall.evidenceBlockers,
      ],
      attributionBlockers: [],
      planBlockers: [],
      ledgerState: reconciled.state,
      blockerAttributionState: previousBlockerAttributionState,
      longitudinalMetrics: null,
      currentMetrics: null,
      longitudinalBlockerAttribution: null,
      currentBlockerAttribution: null,
      dailyReviewPlan: null,
    };
  }

  const attributionLedger = reconcileAprShadowBlockerAttributionLedger(
    previousBlockerAttributionState,
    reconciled.state,
    blockerAttributionWrites,
    now,
  );
  if (!attributionLedger.evidenceValid) {
    return {
      cycleValid: false,
      evidenceBlockers: [],
      attributionBlockers: attributionLedger.evidenceBlockers,
      planBlockers: [],
      ledgerState: reconciled.state,
      blockerAttributionState: attributionLedger.state,
      longitudinalMetrics,
      currentMetrics,
      longitudinalBlockerAttribution: null,
      currentBlockerAttribution: null,
      dailyReviewPlan: null,
    };
  }

  const longitudinalAttributions = aprShadowBlockerAttributionLedgerToAttributions(
    attributionLedger.state,
  );
  const longitudinalBlockerAttribution = buildAprShadowBlockerAttribution(
    longitudinalRows,
    longitudinalAttributions,
  );
  const currentAttributions = longitudinalAttributions.filter((attribution) => (
    currentPracticeIds.has(attribution.practiceId)
  ));
  const currentBlockerAttribution = buildAprShadowBlockerAttribution(
    currentRows,
    currentAttributions,
  );

  if (!longitudinalBlockerAttribution.evidenceValid || !currentBlockerAttribution.evidenceValid) {
    return {
      cycleValid: false,
      evidenceBlockers: [],
      attributionBlockers: [
        ...longitudinalBlockerAttribution.evidenceBlockers,
        ...currentBlockerAttribution.evidenceBlockers,
      ],
      planBlockers: [],
      ledgerState: reconciled.state,
      blockerAttributionState: attributionLedger.state,
      longitudinalMetrics,
      currentMetrics,
      longitudinalBlockerAttribution: null,
      currentBlockerAttribution: null,
      dailyReviewPlan: null,
    };
  }

  const dailyReviewPlan = buildAprShadowDailyReviewPlan(currentRows, input.reviewPlanOptions);
  if (!dailyReviewPlan.planValid) {
    return {
      cycleValid: false,
      evidenceBlockers: [],
      attributionBlockers: [],
      planBlockers: dailyReviewPlan.planBlockers,
      ledgerState: reconciled.state,
      blockerAttributionState: attributionLedger.state,
      longitudinalMetrics,
      currentMetrics,
      longitudinalBlockerAttribution,
      currentBlockerAttribution,
      dailyReviewPlan,
    };
  }

  return {
    cycleValid: true,
    evidenceBlockers: [],
    attributionBlockers: [],
    planBlockers: [],
    ledgerState: reconciled.state,
    blockerAttributionState: attributionLedger.state,
    longitudinalMetrics,
    currentMetrics,
    longitudinalBlockerAttribution,
    currentBlockerAttribution,
    dailyReviewPlan,
  };
}
