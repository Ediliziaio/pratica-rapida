import {
  calculateAprShadowMetrics,
  type AprShadowMetricCase,
  type AprShadowMetricsEvidenceBlocker,
  type AprShadowMetricsResult,
} from "./aprShadowMetrics";

export type AprShadowBlockerAttributionVerdict = "correct-block" | "false-block";

export interface AprShadowBlockerAttribution {
  practiceId: string;
  blockerCode: string;
  verdict: AprShadowBlockerAttributionVerdict;
}

export type AprShadowBlockerAttributionEvidenceCode =
  | AprShadowMetricsEvidenceBlocker
  | "duplicate-blocker-attribution"
  | "unknown-attribution-practice"
  | "attribution-target-not-blocked"
  | "attribution-code-not-present"
  | "attribution-without-practice-review"
  | "attribution-inconsistent-with-practice-verdict";

export interface AprShadowBlockerAttributionQueueItem {
  practiceId: string;
  productType: AprShadowMetricCase["productType"];
  blockerCodes: string[];
  missingBlockerCodes: string[];
}

export interface AprShadowBlockerAttributionQualityItem {
  code: string;
  affectedCases: number;
  reviewedCases: number;
  correctBlockCases: number;
  falseBlockCases: number;
  falseBlockRate: number | null;
}

export interface AprShadowRuleCorrectionCandidate {
  code: string;
  affectedCases: number;
  falseBlockCases: number;
  falseBlockRate: number;
}

export interface AprShadowBlockerAttributionResult {
  evidenceValid: boolean;
  evidenceBlockers: Array<{
    practiceId: string;
    code: AprShadowBlockerAttributionEvidenceCode;
  }>;
  metrics: AprShadowMetricsResult;
  attributionQueue: AprShadowBlockerAttributionQueueItem[];
  blockerQuality: AprShadowBlockerAttributionQualityItem[];
  correctionCandidates: AprShadowRuleCorrectionCandidate[];
}

function uniqueBlockerCodes(row: AprShadowMetricCase): string[] {
  return [...new Set(row.blockerCodes)];
}

function isReviewedBlockVerdict(
  verdict: AprShadowMetricCase["operatorVerdict"],
): verdict is AprShadowBlockerAttributionVerdict {
  return verdict === "correct-block" || verdict === "false-block";
}

function emptyResult(
  metrics: AprShadowMetricsResult,
  evidenceBlockers: AprShadowBlockerAttributionResult["evidenceBlockers"],
): AprShadowBlockerAttributionResult {
  return {
    evidenceValid: false,
    evidenceBlockers,
    metrics,
    attributionQueue: [],
    blockerQuality: [],
    correctionCandidates: [],
  };
}

/**
 * Livello di attribuzione diagnostica del feedback APR shadow.
 *
 * Il verdetto a livello pratica e sufficiente per misurare correct/false block
 * quando esiste una sola causa. Nei casi multi-causa, invece, attribuire lo
 * stesso verdetto a tutti i blocker produrrebbe falsa precisione e correzioni
 * sul codice sbagliato. Questo modulo accetta quindi evidenza esplicita per
 * blocker, mantiene in coda le cause non ancora attribuite e promuove a
 * "correction candidate" soltanto blocker con copertura diagnostica completa.
 *
 * Nessuna scrittura CRM/ENEA avviene qui.
 */
export function buildAprShadowBlockerAttribution(
  rows: AprShadowMetricCase[],
  attributions: AprShadowBlockerAttribution[],
): AprShadowBlockerAttributionResult {
  const metrics = calculateAprShadowMetrics(rows);
  if (!metrics.evidenceValid) {
    return emptyResult(metrics, metrics.evidenceBlockers);
  }

  const rowByPractice = new Map(rows.map((row) => [row.practiceId, row]));
  const evidenceBlockers: AprShadowBlockerAttributionResult["evidenceBlockers"] = [];
  const attributionByKey = new Map<string, AprShadowBlockerAttribution>();

  for (const attribution of attributions) {
    const row = rowByPractice.get(attribution.practiceId);
    if (row == null) {
      evidenceBlockers.push({
        practiceId: attribution.practiceId,
        code: "unknown-attribution-practice",
      });
      continue;
    }

    const blockerCodes = uniqueBlockerCodes(row);
    if (!row.evaluated || blockerCodes.length === 0) {
      evidenceBlockers.push({
        practiceId: attribution.practiceId,
        code: "attribution-target-not-blocked",
      });
      continue;
    }
    if (!blockerCodes.includes(attribution.blockerCode)) {
      evidenceBlockers.push({
        practiceId: attribution.practiceId,
        code: "attribution-code-not-present",
      });
      continue;
    }
    if (!isReviewedBlockVerdict(row.operatorVerdict)) {
      evidenceBlockers.push({
        practiceId: attribution.practiceId,
        code: "attribution-without-practice-review",
      });
      continue;
    }

    const key = `${attribution.practiceId}\u0000${attribution.blockerCode}`;
    if (attributionByKey.has(key)) {
      evidenceBlockers.push({
        practiceId: attribution.practiceId,
        code: "duplicate-blocker-attribution",
      });
      continue;
    }

    if (row.operatorVerdict === "false-block" && attribution.verdict === "correct-block") {
      evidenceBlockers.push({
        practiceId: attribution.practiceId,
        code: "attribution-inconsistent-with-practice-verdict",
      });
      continue;
    }

    attributionByKey.set(key, attribution);
  }

  for (const row of rows) {
    const blockerCodes = uniqueBlockerCodes(row);
    if (blockerCodes.length <= 1 || row.operatorVerdict !== "correct-block") continue;

    const explicit = blockerCodes
      .map((code) => attributionByKey.get(`${row.practiceId}\u0000${code}`))
      .filter((item): item is AprShadowBlockerAttribution => item != null);
    if (explicit.length === blockerCodes.length && explicit.every((item) => item.verdict === "false-block")) {
      evidenceBlockers.push({
        practiceId: row.practiceId,
        code: "attribution-inconsistent-with-practice-verdict",
      });
    }
  }

  if (evidenceBlockers.length > 0) {
    return emptyResult(metrics, evidenceBlockers);
  }

  const qualityByCode = new Map<string, {
    affectedCases: number;
    reviewedCases: number;
    correctBlockCases: number;
    falseBlockCases: number;
  }>();

  for (const row of rows) {
    if (!row.evaluated || row.blockerCodes.length === 0) continue;
    const blockerCodes = uniqueBlockerCodes(row);

    for (const code of blockerCodes) {
      const current = qualityByCode.get(code) ?? {
        affectedCases: 0,
        reviewedCases: 0,
        correctBlockCases: 0,
        falseBlockCases: 0,
      };
      current.affectedCases += 1;

      const explicit = attributionByKey.get(`${row.practiceId}\u0000${code}`);
      const verdict = explicit?.verdict
        ?? (blockerCodes.length === 1 && isReviewedBlockVerdict(row.operatorVerdict)
          ? row.operatorVerdict
          : null);

      if (verdict === "correct-block") {
        current.reviewedCases += 1;
        current.correctBlockCases += 1;
      } else if (verdict === "false-block") {
        current.reviewedCases += 1;
        current.falseBlockCases += 1;
      }
      qualityByCode.set(code, current);
    }
  }

  const blockerQuality = [...qualityByCode.entries()]
    .map(([code, value]): AprShadowBlockerAttributionQualityItem => ({
      code,
      ...value,
      falseBlockRate: value.reviewedCases === value.affectedCases
        ? value.falseBlockCases / value.affectedCases
        : null,
    }))
    .sort((left, right) => {
      if (right.affectedCases !== left.affectedCases) return right.affectedCases - left.affectedCases;
      return left.code.localeCompare(right.code);
    });

  const attributionQueue = rows
    .filter((row) => (
      row.evaluated
      && uniqueBlockerCodes(row).length > 1
      && isReviewedBlockVerdict(row.operatorVerdict)
    ))
    .map((row): AprShadowBlockerAttributionQueueItem => {
      const blockerCodes = uniqueBlockerCodes(row);
      return {
        practiceId: row.practiceId,
        productType: row.productType,
        blockerCodes,
        missingBlockerCodes: blockerCodes.filter(
          (code) => !attributionByKey.has(`${row.practiceId}\u0000${code}`),
        ),
      };
    })
    .filter((item) => item.missingBlockerCodes.length > 0)
    .sort((left, right) => {
      const product = left.productType.localeCompare(right.productType);
      if (product !== 0) return product;
      return left.practiceId.localeCompare(right.practiceId);
    });

  const correctionCandidates = blockerQuality
    .filter((item): item is AprShadowBlockerAttributionQualityItem & { falseBlockRate: number } => (
      item.falseBlockRate != null && item.falseBlockCases > 0
    ))
    .map((item): AprShadowRuleCorrectionCandidate => ({
      code: item.code,
      affectedCases: item.affectedCases,
      falseBlockCases: item.falseBlockCases,
      falseBlockRate: item.falseBlockRate,
    }))
    .sort((left, right) => {
      if (right.falseBlockCases !== left.falseBlockCases) {
        return right.falseBlockCases - left.falseBlockCases;
      }
      if (right.falseBlockRate !== left.falseBlockRate) {
        return right.falseBlockRate - left.falseBlockRate;
      }
      return left.code.localeCompare(right.code);
    });

  return {
    evidenceValid: true,
    evidenceBlockers: [],
    metrics,
    attributionQueue,
    blockerQuality,
    correctionCandidates,
  };
}
