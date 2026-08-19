import {
  calculateAprShadowMetrics,
  type AprShadowMetricCase,
  type AprShadowMetricsResult,
} from "./aprShadowMetrics";

export interface AprShadowReviewQueueItem {
  practiceId: string;
  productType: AprShadowMetricCase["productType"];
  blockerCodes: string[];
  preparationMinutes: number | null;
}

export interface AprShadowBlockerParetoItem {
  code: string;
  affectedCases: number;
  affectedCaseRate: number;
}

export interface AprShadowReviewBacklogResult {
  evidenceValid: boolean;
  metrics: AprShadowMetricsResult;
  counts: {
    blockedAwaitingReview: number;
    readyAwaitingAudit: number;
    totalAwaitingReview: number;
  };
  blockedReviewQueue: AprShadowReviewQueueItem[];
  readyAuditQueue: AprShadowReviewQueueItem[];
  blockerPareto: AprShadowBlockerParetoItem[];
}

function queueItem(row: AprShadowMetricCase): AprShadowReviewQueueItem {
  return {
    practiceId: row.practiceId,
    productType: row.productType,
    blockerCodes: [...row.blockerCodes],
    preparationMinutes: row.preparationMinutes ?? null,
  };
}

function compareQueueItems(left: AprShadowReviewQueueItem, right: AprShadowReviewQueueItem): number {
  const productOrder = left.productType.localeCompare(right.productType);
  if (productOrder !== 0) return productOrder;
  return left.practiceId.localeCompare(right.practiceId);
}

function buildBlockerPareto(rows: AprShadowMetricCase[]): AprShadowBlockerParetoItem[] {
  const blockedRows = rows.filter((row) => row.evaluated && row.blockerCodes.length > 0);
  if (blockedRows.length === 0) return [];

  const casesByCode = new Map<string, number>();
  for (const row of blockedRows) {
    for (const code of new Set(row.blockerCodes)) {
      casesByCode.set(code, (casesByCode.get(code) ?? 0) + 1);
    }
  }

  return [...casesByCode.entries()]
    .map(([code, affectedCases]) => ({
      code,
      affectedCases,
      affectedCaseRate: affectedCases / blockedRows.length,
    }))
    .sort((left, right) => {
      if (right.affectedCases !== left.affectedCases) {
        return right.affectedCases - left.affectedCases;
      }
      return left.code.localeCompare(right.code);
    });
}

/**
 * Coda operativa del feedback loop APR shadow.
 *
 * Working backwards dalla review quotidiana: separa i blocchi da verificare
 * dagli audit delle pratiche dichiarate ready e rende visibili i blocker più
 * ricorrenti senza introdurre score arbitrari. Se l'evidenza KPI è incoerente,
 * l'intera coda viene soppressa in modalità fail-closed.
 */
export function buildAprShadowReviewBacklog(
  rows: AprShadowMetricCase[],
): AprShadowReviewBacklogResult {
  const metrics = calculateAprShadowMetrics(rows);
  if (!metrics.evidenceValid) {
    return {
      evidenceValid: false,
      metrics,
      counts: {
        blockedAwaitingReview: 0,
        readyAwaitingAudit: 0,
        totalAwaitingReview: 0,
      },
      blockedReviewQueue: [],
      readyAuditQueue: [],
      blockerPareto: [],
    };
  }

  const blockedReviewQueue = rows
    .filter((row) => (
      row.evaluated
      && row.blockerCodes.length > 0
      && row.operatorVerdict === "unreviewed"
    ))
    .map(queueItem)
    .sort(compareQueueItems);

  const readyAuditQueue = rows
    .filter((row) => (
      row.evaluated
      && row.blockerCodes.length === 0
      && row.operatorVerdict === "unreviewed"
    ))
    .map(queueItem)
    .sort(compareQueueItems);

  return {
    evidenceValid: true,
    metrics,
    counts: {
      blockedAwaitingReview: blockedReviewQueue.length,
      readyAwaitingAudit: readyAuditQueue.length,
      totalAwaitingReview: blockedReviewQueue.length + readyAuditQueue.length,
    },
    blockedReviewQueue,
    readyAuditQueue,
    blockerPareto: buildBlockerPareto(rows),
  };
}
