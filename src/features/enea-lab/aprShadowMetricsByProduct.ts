import type { ProdottoTipo } from "@/types/form-cliente";
import {
  calculateAprShadowMetrics,
  type AprShadowMetricCase,
  type AprShadowMetricsResult,
} from "./aprShadowMetrics";

export type AprShadowMetricsProduct = ProdottoTipo | "unknown";

export interface AprShadowMetricsPortfolioResult {
  portfolioEvidenceValid: boolean;
  overall: AprShadowMetricsResult;
  /**
   * Fail-closed: se il dataset complessivo è invalido, nessun KPI prodotto viene
   * esposto. Questo evita che una pratica duplicata tra due prodotti produca due
   * dashboard apparentemente valide.
   */
  byProduct: Record<AprShadowMetricsProduct, AprShadowMetricsResult | null>;
}

const PRODUCT_KEYS: readonly AprShadowMetricsProduct[] = [
  "schermature",
  "infissi",
  "impianto_termico",
  "insufflaggio",
  "unknown",
];

function emptyProductMetrics(): Record<AprShadowMetricsProduct, AprShadowMetricsResult | null> {
  return {
    schermature: null,
    infissi: null,
    impianto_termico: null,
    insufflaggio: null,
    unknown: null,
  };
}

/**
 * KPI shadow APR separati per prodotto.
 *
 * Il modello operativo richiede KPI per prodotto: un aggregato unico può
 * nascondere un escaped-error concentrato su un adapter specifico. L'aggregato
 * resta disponibile per capacità/coverage complessiva, ma la qualità va letta
 * anche per adapter.
 *
 * Se l'evidenza globale è strutturalmente invalida (es. stessa pratica duplicata
 * e attribuita a prodotti diversi), tutti i KPI prodotto vengono soppressi invece
 * di mostrare numeri parzialmente affidabili.
 */
export function calculateAprShadowMetricsByProduct(
  rows: AprShadowMetricCase[],
): AprShadowMetricsPortfolioResult {
  const overall = calculateAprShadowMetrics(rows);
  if (!overall.evidenceValid) {
    return {
      portfolioEvidenceValid: false,
      overall,
      byProduct: emptyProductMetrics(),
    };
  }

  const byProduct = emptyProductMetrics();
  for (const productType of PRODUCT_KEYS) {
    byProduct[productType] = calculateAprShadowMetrics(
      rows.filter((row) => row.productType === productType),
    );
  }

  return {
    portfolioEvidenceValid: true,
    overall,
    byProduct,
  };
}
