import {
  buildAprShadowReviewBacklog,
  type AprShadowReviewQueueItem,
} from "./aprShadowReviewBacklog";
import {
  calculateAprShadowMetricsByProduct,
  type AprShadowMetricsProduct,
} from "./aprShadowMetricsByProduct";
import type { AprShadowMetricCase, AprShadowMetricsResult } from "./aprShadowMetrics";

export type AprShadowDailyReviewPlanBlocker = {
  field: "blockedLimit" | "readyAuditLimit";
  code: "invalid-daily-review-limit";
};

export interface AprShadowDailyReviewPlanOptions {
  blockedLimit: number;
  readyAuditLimit: number;
}

export interface AprShadowDailyReviewPlanResult {
  planValid: boolean;
  planBlockers: AprShadowDailyReviewPlanBlocker[];
  metrics: AprShadowMetricsResult;
  blocked: {
    selected: AprShadowReviewQueueItem[];
    deferred: number;
  };
  readyAudit: {
    selected: AprShadowReviewQueueItem[];
    deferred: number;
  };
}

function validDailyLimit(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function productOrder(left: AprShadowMetricsProduct, right: AprShadowMetricsProduct): number {
  return left.localeCompare(right);
}

function queueItemOrder(left: AprShadowReviewQueueItem, right: AprShadowReviewQueueItem): number {
  const product = productOrder(left.productType, right.productType);
  if (product !== 0) return product;
  return left.practiceId.localeCompare(right.practiceId);
}

function buildBlockerFrequency(rows: AprShadowMetricCase[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const row of rows) {
    if (!row.evaluated || row.blockerCodes.length === 0) continue;
    for (const code of new Set(row.blockerCodes)) {
      frequency.set(code, (frequency.get(code) ?? 0) + 1);
    }
  }
  return frequency;
}

function rankBlockedQueue(
  rows: AprShadowMetricCase[],
  queue: AprShadowReviewQueueItem[],
): AprShadowReviewQueueItem[] {
  const blockerFrequency = buildBlockerFrequency(rows);

  return [...queue].sort((left, right) => {
    // Le pratiche a causa singola hanno la massima leva per il loop di
    // apprendimento: il verdetto operatore può essere attribuito con certezza
    // a quel blocker. I casi multi-causa restano in coda, ma dopo quelli
    // diagnosticamente più puliti.
    const leftSingle = new Set(left.blockerCodes).size === 1;
    const rightSingle = new Set(right.blockerCodes).size === 1;
    if (leftSingle !== rightSingle) return leftSingle ? -1 : 1;

    const leftLeverage = Math.max(
      0,
      ...[...new Set(left.blockerCodes)].map((code) => blockerFrequency.get(code) ?? 0),
    );
    const rightLeverage = Math.max(
      0,
      ...[...new Set(right.blockerCodes)].map((code) => blockerFrequency.get(code) ?? 0),
    );
    if (rightLeverage !== leftLeverage) return rightLeverage - leftLeverage;

    return queueItemOrder(left, right);
  });
}

function reviewedShareByProduct(
  rows: AprShadowMetricCase[],
): Record<AprShadowMetricsProduct, number> {
  const portfolio = calculateAprShadowMetricsByProduct(rows);
  const share = {
    schermature: 1,
    infissi: 1,
    impianto_termico: 1,
    insufflaggio: 1,
    unknown: 1,
  } satisfies Record<AprShadowMetricsProduct, number>;

  if (!portfolio.portfolioEvidenceValid) return share;

  for (const product of Object.keys(share) as AprShadowMetricsProduct[]) {
    const metrics = portfolio.byProduct[product];
    if (metrics == null || metrics.counts.evaluated === 0) continue;
    share[product] = metrics.counts.reviewed / metrics.counts.evaluated;
  }

  return share;
}

function selectBalancedReadyAudits(
  rows: AprShadowMetricCase[],
  queue: AprShadowReviewQueueItem[],
  limit: number,
): AprShadowReviewQueueItem[] {
  if (limit === 0 || queue.length === 0) return [];

  const reviewedShare = reviewedShareByProduct(rows);
  const byProduct = new Map<AprShadowMetricsProduct, AprShadowReviewQueueItem[]>();
  for (const item of queue) {
    const current = byProduct.get(item.productType) ?? [];
    current.push(item);
    byProduct.set(item.productType, current);
  }
  for (const items of byProduct.values()) items.sort(queueItemOrder);

  const products = [...byProduct.keys()].sort((left, right) => {
    const shareDifference = reviewedShare[left] - reviewedShare[right];
    if (shareDifference !== 0) return shareDifference;
    return productOrder(left, right);
  });

  const selected: AprShadowReviewQueueItem[] = [];
  // Round-robin tra prodotti, partendo da quelli meno revisionati. Questo evita
  // che un adapter con molti casi ready monopolizzi il campione giornaliero e
  // nasconda escaped-error concentrati su prodotti meno rappresentati.
  while (selected.length < limit) {
    let progressed = false;
    for (const product of products) {
      if (selected.length >= limit) break;
      const next = byProduct.get(product)?.shift();
      if (next == null) continue;
      selected.push(next);
      progressed = true;
    }
    if (!progressed) break;
  }

  return selected;
}

/**
 * Piano giornaliero del feedback loop APR shadow.
 *
 * Working backwards dal tempo limitato dell'operatore: prima seleziona i
 * blocker con maggiore leva diagnostica, poi usa gli audit ready per colmare
 * i prodotti meno revisionati. Nessuno score sintetico viene usato per
 * dichiarare qualità: il piano decide solo cosa guardare oggi, mentre KPI e
 * verdetti restano quelli fail-closed di aprShadowMetrics.
 */
export function buildAprShadowDailyReviewPlan(
  rows: AprShadowMetricCase[],
  options: AprShadowDailyReviewPlanOptions,
): AprShadowDailyReviewPlanResult {
  const backlog = buildAprShadowReviewBacklog(rows);
  const planBlockers: AprShadowDailyReviewPlanBlocker[] = [];

  if (!validDailyLimit(options.blockedLimit)) {
    planBlockers.push({ field: "blockedLimit", code: "invalid-daily-review-limit" });
  }
  if (!validDailyLimit(options.readyAuditLimit)) {
    planBlockers.push({ field: "readyAuditLimit", code: "invalid-daily-review-limit" });
  }

  if (!backlog.evidenceValid || planBlockers.length > 0) {
    return {
      planValid: false,
      planBlockers,
      metrics: backlog.metrics,
      blocked: { selected: [], deferred: 0 },
      readyAudit: { selected: [], deferred: 0 },
    };
  }

  const blockedRanked = rankBlockedQueue(rows, backlog.blockedReviewQueue);
  const blockedSelected = blockedRanked.slice(0, options.blockedLimit);
  const readySelected = selectBalancedReadyAudits(
    rows,
    backlog.readyAuditQueue,
    options.readyAuditLimit,
  );

  return {
    planValid: true,
    planBlockers: [],
    metrics: backlog.metrics,
    blocked: {
      selected: blockedSelected,
      deferred: Math.max(0, backlog.blockedReviewQueue.length - blockedSelected.length),
    },
    readyAudit: {
      selected: readySelected,
      deferred: Math.max(0, backlog.readyAuditQueue.length - readySelected.length),
    },
  };
}
