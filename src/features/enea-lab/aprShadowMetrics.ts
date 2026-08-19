import type { ProdottoTipo } from "@/types/form-cliente";

export type AprShadowOperatorVerdict =
  | "unreviewed"
  | "correct-block"
  | "false-block"
  | "correct-ready"
  | "escaped-error";

export type AprShadowMetricsEvidenceBlocker =
  | "invalid-practice-id"
  | "invalid-field-counts"
  | "invalid-preparation-time"
  | "invalid-blocker-code"
  | "duplicate-blocker-code"
  | "verdict-inconsistent-with-apr-result"
  | "unevaluated-case-has-apr-result"
  | "unknown-product-evaluated"
  | "duplicate-practice-id";

export interface AprShadowMetricCase {
  practiceId: string;
  productType: ProdottoTipo | "unknown";
  evaluated: boolean;
  blockerCodes: string[];
  mappedFieldCount: number;
  autoReadyFieldCount: number;
  operatorVerdict: AprShadowOperatorVerdict;
  preparationMinutes?: number | null;
}

export interface AprShadowMetricsResult {
  evidenceValid: boolean;
  evidenceBlockers: Array<{
    practiceId: string;
    code: AprShadowMetricsEvidenceBlocker;
  }>;
  counts: {
    inScope: number;
    evaluated: number;
    blocked: number;
    ready: number;
    reviewed: number;
    unknownProduct: number;
  };
  rates: {
    coverage: number | null;
    autoMapRate: number | null;
    blockerRate: number | null;
    reviewCoverage: number | null;
    falseBlockRate: number | null;
    escapedErrorRate: number | null;
    unknownProductRate: number | null;
  };
  medianPreparationMinutes: number | null;
}

const NULL_RATES: AprShadowMetricsResult["rates"] = {
  coverage: null,
  autoMapRate: null,
  blockerRate: null,
  reviewCoverage: null,
  falseBlockRate: null,
  escapedErrorRate: null,
  unknownProductRate: null,
};

function isValidFieldCount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function verdictMatchesAprResult(row: AprShadowMetricCase): boolean {
  if (!row.evaluated) return row.operatorVerdict === "unreviewed";
  const blocked = row.blockerCodes.length > 0;
  if (blocked) {
    return row.operatorVerdict === "unreviewed"
      || row.operatorVerdict === "correct-block"
      || row.operatorVerdict === "false-block";
  }
  return row.operatorVerdict === "unreviewed"
    || row.operatorVerdict === "correct-ready"
    || row.operatorVerdict === "escaped-error";
}

function validateEvidence(rows: AprShadowMetricCase[]): AprShadowMetricsResult["evidenceBlockers"] {
  const blockers: AprShadowMetricsResult["evidenceBlockers"] = [];
  const practiceIdCounts = new Map<string, number>();

  for (const row of rows) {
    const normalizedPracticeId = row.practiceId.trim();
    practiceIdCounts.set(
      normalizedPracticeId,
      (practiceIdCounts.get(normalizedPracticeId) ?? 0) + 1,
    );
  }
  for (const [practiceId, count] of practiceIdCounts) {
    if (count > 1) blockers.push({ practiceId, code: "duplicate-practice-id" });
  }

  for (const row of rows) {
    const normalizedPracticeId = row.practiceId.trim();
    // I KPI shadow devono essere riconducibili a una pratica reale e revisionabile.
    // Un identificativo vuoto o non canonico renderebbe possibile pesare due volte
    // la stessa pratica usando semplici differenze di whitespace.
    if (normalizedPracticeId.length === 0 || normalizedPracticeId !== row.practiceId) {
      blockers.push({ practiceId: row.practiceId, code: "invalid-practice-id" });
    }
    if (
      !isValidFieldCount(row.mappedFieldCount)
      || !isValidFieldCount(row.autoReadyFieldCount)
      || row.autoReadyFieldCount > row.mappedFieldCount
    ) {
      blockers.push({ practiceId: row.practiceId, code: "invalid-field-counts" });
    }
    if (
      row.preparationMinutes != null
      && (!Number.isFinite(row.preparationMinutes) || row.preparationMinutes < 0)
    ) {
      blockers.push({ practiceId: row.practiceId, code: "invalid-preparation-time" });
    }

    const normalizedBlockerCodes = row.blockerCodes.map((code) => code.trim());
    if (row.blockerCodes.some((code) => code.trim().length === 0 || code !== code.trim())) {
      blockers.push({ practiceId: row.practiceId, code: "invalid-blocker-code" });
    }
    if (new Set(normalizedBlockerCodes).size !== row.blockerCodes.length) {
      blockers.push({ practiceId: row.practiceId, code: "duplicate-blocker-code" });
    }
    // Se APR non ha valutato la pratica, non può aver prodotto né blocker né campi
    // mappati/auto-ready. Accettarli renderebbe il dataset internamente incoerente
    // e permetterebbe output orfani di entrare nel loop di apprendimento.
    if (
      !row.evaluated
      && (
        row.blockerCodes.length > 0
        || row.mappedFieldCount > 0
        || row.autoReadyFieldCount > 0
      )
    ) {
      blockers.push({ practiceId: row.practiceId, code: "unevaluated-case-has-apr-result" });
    }
    // Un'etichetta prodotto sconosciuta non ha un adapter shadow autorizzato:
    // può stare nel perimetro per misurare l'unknown-product rate, ma non deve
    // contribuire a coverage/ready/auto-map come se APR l'avesse davvero valutata.
    if (row.productType === "unknown" && row.evaluated) {
      blockers.push({ practiceId: row.practiceId, code: "unknown-product-evaluated" });
    }
    if (!verdictMatchesAprResult(row)) {
      blockers.push({ practiceId: row.practiceId, code: "verdict-inconsistent-with-apr-result" });
    }
  }

  return blockers;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint] ?? null;
  const left = sorted[midpoint - 1];
  const right = sorted[midpoint];
  return left == null || right == null ? null : (left + right) / 2;
}

/**
 * KPI del loop di apprendimento APR in modalità shadow.
 *
 * I tassi di qualità restano fail-closed: false-block ed escaped-error non
 * vengono mostrati finché tutti i casi del relativo denominatore non sono stati
 * revisionati dall'operatore. Evidenze strutturalmente incoerenti annullano tutti
 * i tassi, così un dataset parziale o corrotto non può apparire artificialmente
 * migliore.
 */
export function calculateAprShadowMetrics(rows: AprShadowMetricCase[]): AprShadowMetricsResult {
  const evidenceBlockers = validateEvidence(rows);
  const evaluatedRows = rows.filter((row) => row.evaluated);
  const blockedRows = evaluatedRows.filter((row) => row.blockerCodes.length > 0);
  const readyRows = evaluatedRows.filter((row) => row.blockerCodes.length === 0);
  const reviewedRows = evaluatedRows.filter((row) => row.operatorVerdict !== "unreviewed");
  const unknownProduct = rows.filter((row) => row.productType === "unknown").length;

  const counts: AprShadowMetricsResult["counts"] = {
    inScope: rows.length,
    evaluated: evaluatedRows.length,
    blocked: blockedRows.length,
    ready: readyRows.length,
    reviewed: reviewedRows.length,
    unknownProduct,
  };

  if (evidenceBlockers.length > 0) {
    return {
      evidenceValid: false,
      evidenceBlockers,
      counts,
      rates: { ...NULL_RATES },
      medianPreparationMinutes: null,
    };
  }

  const mappedFields = evaluatedRows.reduce((sum, row) => sum + row.mappedFieldCount, 0);
  const autoReadyFields = evaluatedRows.reduce((sum, row) => sum + row.autoReadyFieldCount, 0);
  const blockedReviewComplete = blockedRows.every((row) => row.operatorVerdict !== "unreviewed");
  const readyReviewComplete = readyRows.every((row) => row.operatorVerdict !== "unreviewed");
  const falseBlocks = blockedRows.filter((row) => row.operatorVerdict === "false-block").length;
  const escapedErrors = readyRows.filter((row) => row.operatorVerdict === "escaped-error").length;
  const preparationMinutes = evaluatedRows
    .map((row) => row.preparationMinutes)
    .filter((value): value is number => value != null);

  return {
    evidenceValid: true,
    evidenceBlockers: [],
    counts,
    rates: {
      coverage: rows.length > 0 ? evaluatedRows.length / rows.length : null,
      autoMapRate: mappedFields > 0 ? autoReadyFields / mappedFields : null,
      blockerRate: evaluatedRows.length > 0 ? blockedRows.length / evaluatedRows.length : null,
      reviewCoverage: evaluatedRows.length > 0 ? reviewedRows.length / evaluatedRows.length : null,
      falseBlockRate: blockedRows.length > 0 && blockedReviewComplete
        ? falseBlocks / blockedRows.length
        : null,
      escapedErrorRate: readyRows.length > 0 && readyReviewComplete
        ? escapedErrors / readyRows.length
        : null,
      unknownProductRate: rows.length > 0 ? unknownProduct / rows.length : null,
    },
    medianPreparationMinutes: median(preparationMinutes),
  };
}
