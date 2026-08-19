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
  now?: Date;
}

export interface AprShadowOperatingCycleResult {
  cycleValid: boolean;
  evidenceBlockers: AprShadowReviewLedgerReconcileResult["evidenceBlockers"];
  planBlockers: AprShadowDailyReviewPlanResult["planBlockers"];
  ledgerState: AprShadowReviewLedgerState;
  /** KPI longitudinali del ledger locale entro la sua TTL. */
  longitudinalMetrics: AprShadowMetricsPortfolioResult | null;
  /** KPI del solo perimetro APR osservato nel ciclo corrente. */
  currentMetrics: AprShadowMetricsPortfolioResult | null;
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
 * nella coda operativa (erroneamente), sottraendo capacità ai blocker attuali.
 *
 * Nessuna scrittura CRM/ENEA avviene qui: il risultato è solo stato locale,
 * metriche e piano di review. Evidenza incoerente o limiti invalidi fermano il
 * ciclo in modalità fail-closed.
 */
export function buildAprShadowOperatingCycle(
  input: AprShadowOperatingCycleInput,
): AprShadowOperatingCycleResult {
  const now = input.now ?? new Date();
  const reconciled = reconcileAprShadowReviewLedger(
    input.previousState,
    input.currentSnapshots,
    now,
  );

  if (!reconciled.evidenceValid) {
    return {
      cycleValid: false,
      evidenceBlockers: reconciled.evidenceBlockers,
      planBlockers: [],
      ledgerState: reconciled.state,
      longitudinalMetrics: null,
      currentMetrics: null,
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
      planBlockers: [],
      ledgerState: reconciled.state,
      longitudinalMetrics: null,
      currentMetrics: null,
      dailyReviewPlan: null,
    };
  }

  const dailyReviewPlan = buildAprShadowDailyReviewPlan(currentRows, input.reviewPlanOptions);
  if (!dailyReviewPlan.planValid) {
    return {
      cycleValid: false,
      evidenceBlockers: [],
      planBlockers: dailyReviewPlan.planBlockers,
      ledgerState: reconciled.state,
      longitudinalMetrics,
      currentMetrics,
      dailyReviewPlan,
    };
  }

  return {
    cycleValid: true,
    evidenceBlockers: [],
    planBlockers: [],
    ledgerState: reconciled.state,
    longitudinalMetrics,
    currentMetrics,
    dailyReviewPlan,
  };
}
