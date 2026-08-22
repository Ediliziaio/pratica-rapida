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

export interface AprShadowBlockerQualityItem {
  code: string;
  affectedCases: number;
  reviewedCases: number;
  correctBlockCases: number;
  falseBlockCases: number;
  falseBlockRate: number | null;
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
  blockerQuality: AprShadowBlockerQualityItem[];
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

function blockedRows(rows: AprShadowMetricCase[]): AprShadowMetricCase[] {
  return rows.filter((row) => row.evaluated && row.blockerCodes.length > 0);
}

function normalizeBlockerCodes(rows: AprShadowMetricCase[]): AprShadowMetricCase[] {
  return rows.map((row) => ({
    ...row,
    blockerCodes: [...new Set(row.blockerCodes)],
  }));
}

function buildBlockerPareto(rows: AprShadowMetricCase[]): AprShadowBlockerParetoItem[] {
  const blocked = blockedRows(rows);
  if (blocked.length === 0) return [];

  const casesByCode = new Map<string, number>();
  for (const row of blocked) {
    for (const code of new Set(row.blockerCodes)) {
      casesByCode.set(code, (casesByCode.get(code) ?? 0) + 1);
    }
  }

  return [...casesByCode.entries()]
    .map(([code, affectedCases]) => ({
      code,
      affectedCases,
      affectedCaseRate: affectedCases / blocked.length,
    }))
    .sort((left, right) => {
      if (right.affectedCases !== left.affectedCases) {
        return right.affectedCases - left.affectedCases;
      }
      return left.code.localeCompare(right.code);
    });
}

function buildBlockerQuality(rows: AprShadowMetricCase[]): AprShadowBlockerQualityItem[] {
  const byCode = new Map<string, {
    affectedCases: number;
    reviewedCases: number;
    correctBlockCases: number;
    falseBlockCases: number;
  }>();

  for (const row of blockedRows(rows)) {
    const uniqueCodes = [...new Set(row.blockerCodes)];

    for (const code of uniqueCodes) {
      const current = byCode.get(code) ?? {
        affectedCases: 0,
        reviewedCases: 0,
        correctBlockCases: 0,
        falseBlockCases: 0,
      };
      current.affectedCases += 1;
      byCode.set(code, current);
    }

    // Il verdetto dell'operatore è oggi a livello pratica, non a livello blocker.
    // Se una pratica ha più cause di blocco non possiamo attribuire in modo
    // affidabile "correct-block" o "false-block" a ciascun codice: farlo
    // falserebbe il Pareto qualità. In quei casi il blocker resta non revisionato
    // ai fini del tasso per-codice finché non esisterà evidenza specifica.
    if (uniqueCodes.length !== 1) continue;

    const code = uniqueCodes[0];
    if (code == null) continue;
    const current = byCode.get(code);
    if (current == null) continue;

    if (row.operatorVerdict === "correct-block") {
      current.reviewedCases += 1;
      current.correctBlockCases += 1;
    } else if (row.operatorVerdict === "false-block") {
      current.reviewedCases += 1;
      current.falseBlockCases += 1;
    }
  }

  return [...byCode.entries()]
    .map(([code, value]) => ({
      code,
      ...value,
      falseBlockRate: value.reviewedCases === value.affectedCases
        ? value.falseBlockCases / value.affectedCases
        : null,
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
 * ricorrenti senza introdurre score arbitrari. Per ogni codice mostra anche il
 * false-block rate soltanto quando tutte le pratiche interessate sono state
 * revisionate, così i colli di bottiglia non possono apparire migliori lasciando
 * indietro i casi difficili. Se l'evidenza KPI è incoerente, l'intera coda viene
 * soppressa in modalità fail-closed.
 */
export function buildAprShadowReviewBacklog(
  rows: AprShadowMetricCase[],
): AprShadowReviewBacklogResult {
  // Un blocker descrive una condizione della pratica, non un evento. Se un
  // adapter ripete accidentalmente lo stesso codice, lo normalizziamo qui
  // prima di calcolare KPI e code: la pratica resta valida e non pesa due volte.
  const normalizedRows = normalizeBlockerCodes(rows);
  const metrics = calculateAprShadowMetrics(normalizedRows);
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
      blockerQuality: [],
    };
  }

  const blockedReviewQueue = normalizedRows
    .filter((row) => (
      row.evaluated
      && row.blockerCodes.length > 0
      && row.operatorVerdict === "unreviewed"
    ))
    .map(queueItem)
    .sort(compareQueueItems);

  const readyAuditQueue = normalizedRows
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
    blockerPareto: buildBlockerPareto(normalizedRows),
    blockerQuality: buildBlockerQuality(normalizedRows),
  };
}
