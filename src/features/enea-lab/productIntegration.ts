import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProdottoTipo } from "@/types/form-cliente";
import {
  hasExplicitAprShadowAuthorization,
  type AprGlobalShadowUserAuthorization,
} from "./aprShadowAuthorization";

export type AprProductLifecycle = "waiting_client" | "ready" | "historical" | "other";
export type AprProductIntegrationPhase = "screenings-validated" | "intake-only";
export type AprIntakeOnlyProduct = Exclude<ProdottoTipo, "schermature">;
export type AprInvoiceEvidenceScope = "first-class-column-only";
export type AprProductPriorityBlocker =
  | "completed-enea-ground-truth-missing"
  | "invoice-corpus-missing"
  | "invoice-corpus-index-incomplete"
  | "technical-portal-contract-unobserved";
export type AprProductPriorityNextAction =
  | "collect-completed-enea-ground-truth"
  | "collect-invoice-corpus"
  | "verify-invoice-corpus-index"
  | "observe-technical-portal-contract"
  | "build-shadow-parser-mapper";

type ProductInventoryQueueRow = {
  id: string | null;
  prodotto_installato: string | null;
  form_compilato_at: string | null;
  fatture_urls: string[] | null;
  documenti_aggiuntivi_urls: string[] | null;
  pratica_enea_conclusa_urls: string[] | null;
  pipeline_stages: { stage_type: string } | null;
};

export interface AprProductInventoryRow {
  id: string;
  productType: ProdottoTipo | "unknown";
  productLabel: string;
  lifecycle: AprProductLifecycle;
  hasCompletedClientForm: boolean;
  invoiceCount: number;
  additionalDocumentCount: number;
  completedEneaPdfCount: number;
  integrationPhase: AprProductIntegrationPhase | "needs-classification";
  shadowEvaluationAllowed: boolean;
  officialSubmissionAllowed: false;
}

export interface AprProductIntegrationSummary {
  total: number;
  unknown: number;
  byProduct: Record<ProdottoTipo, {
    total: number;
    activeReady: number;
    historicalWithCompletedEnea: number;
    /** fatture_urls è evidenza parziale: i moduli dinamici possono usare dati_form. */
    withInvoices: number;
    integrationPhase: AprProductIntegrationPhase;
  }>;
}

export interface AprProductPriorityEvidence {
  technicalPortalContractObserved?: Partial<Record<AprIntakeOnlyProduct, boolean>>;
}

export interface AprProductPriorityCandidate {
  productType: AprIntakeOnlyProduct;
  historicalWithCompletedEnea: number;
  withInvoices: number;
  activeReady: number;
  total: number;
  blockers: AprProductPriorityBlocker[];
  nextAction: AprProductPriorityNextAction;
  invoiceEvidenceScope: AprInvoiceEvidenceScope;
  shadowTechnicalMappingAllowed: false;
  officialSubmissionAllowed: false;
}

export interface AprProductPriorityDecision {
  recommendedNextProduct: AprIntakeOnlyProduct | null;
  candidates: AprProductPriorityCandidate[];
}

export const APR_PRODUCT_INTEGRATION_PHASES: Record<ProdottoTipo, AprProductIntegrationPhase> = {
  schermature: "screenings-validated",
  infissi: "intake-only",
  impianto_termico: "intake-only",
  insufflaggio: "intake-only",
};

const APR_INTAKE_ONLY_PRODUCTS: readonly AprIntakeOnlyProduct[] = [
  "infissi",
  "impianto_termico",
  "insufflaggio",
];
const APR_PRODUCT_INVENTORY_PAGE_SIZE = 500;

/** Detector fail-closed: un'etichetta sconosciuta o multi-prodotto resta unknown. */
export function detectAprProductType(value: string | null | undefined): ProdottoTipo | "unknown" {
  const normalized = (value ?? "").trim().toLocaleLowerCase("it");
  if (!normalized) return "unknown";

  const matches: ProdottoTipo[] = [];
  if (normalized.includes("insufflag")) matches.push("insufflaggio");
  if (normalized.includes("infiss") || normalized.includes("serrament")) matches.push("infissi");
  if (
    normalized.includes("schermat")
    || normalized.includes("tend")
    || normalized.includes("pergot")
    || normalized.includes("pergola")
  ) matches.push("schermature");
  if (
    normalized.includes("impianto termico")
    || normalized.includes("pompa di calore")
    || normalized.includes("caldaia")
    || normalized.includes("climatizz")
  ) matches.push("impianto_termico");

  // Una pratica che cita due famiglie supportate non deve contaminare il corpus
  // di un singolo adapter scegliendo semplicemente il primo match testuale.
  return matches.length === 1 ? matches[0] : "unknown";
}

function lifecycleFromRow(row: ProductInventoryQueueRow): AprProductLifecycle {
  const stage = row.pipeline_stages?.stage_type;
  if (stage === "archiviate") return "historical";
  if (stage === "pronte_da_fare" && Boolean(row.form_compilato_at)) return "ready";
  if (stage === "inviata" || stage === "attesa_compilazione" || stage === "pronte_da_fare") {
    return "waiting_client";
  }
  return "other";
}

export function mapAprProductInventoryRow(
  row: ProductInventoryQueueRow,
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization,
): AprProductInventoryRow | null {
  if (!row.id) return null;
  const productType = detectAprProductType(row.prodotto_installato);
  const integrationPhase = productType === "unknown"
    ? "needs-classification"
    : APR_PRODUCT_INTEGRATION_PHASES[productType];

  return {
    id: row.id,
    productType,
    productLabel: (row.prodotto_installato ?? "").trim() || "Prodotto non classificato",
    lifecycle: lifecycleFromRow(row),
    hasCompletedClientForm: Boolean(row.form_compilato_at),
    invoiceCount: row.fatture_urls?.length ?? 0,
    additionalDocumentCount: row.documenti_aggiuntivi_urls?.length ?? 0,
    completedEneaPdfCount: row.pratica_enea_conclusa_urls?.length ?? 0,
    integrationPhase,
    shadowEvaluationAllowed: productType === "schermature"
      && hasExplicitAprShadowAuthorization(globalShadowAuthorization),
    officialSubmissionAllowed: false,
  };
}

function emptyProductSummary(productType: ProdottoTipo): AprProductIntegrationSummary["byProduct"][ProdottoTipo] {
  return {
    total: 0,
    activeReady: 0,
    historicalWithCompletedEnea: 0,
    withInvoices: 0,
    integrationPhase: APR_PRODUCT_INTEGRATION_PHASES[productType],
  };
}

export function summarizeAprProductInventory(rows: AprProductInventoryRow[]): AprProductIntegrationSummary {
  const byProduct: AprProductIntegrationSummary["byProduct"] = {
    infissi: emptyProductSummary("infissi"),
    schermature: emptyProductSummary("schermature"),
    impianto_termico: emptyProductSummary("impianto_termico"),
    insufflaggio: emptyProductSummary("insufflaggio"),
  };
  let unknown = 0;

  for (const row of rows) {
    if (row.productType === "unknown") {
      unknown += 1;
      continue;
    }
    const summary = byProduct[row.productType];
    summary.total += 1;
    if (row.lifecycle === "ready") summary.activeReady += 1;
    if (row.lifecycle === "historical" && row.completedEneaPdfCount > 0) {
      summary.historicalWithCompletedEnea += 1;
    }
    if (row.invoiceCount > 0) summary.withInvoices += 1;
  }

  return { total: rows.length, unknown, byProduct };
}

function priorityBlockers(
  productType: AprIntakeOnlyProduct,
  product: AprProductIntegrationSummary["byProduct"][ProdottoTipo],
  evidence: AprProductPriorityEvidence,
): AprProductPriorityBlocker[] {
  const blockers: AprProductPriorityBlocker[] = [];
  if (product.historicalWithCompletedEnea === 0) {
    blockers.push("completed-enea-ground-truth-missing");
  }
  // fatture_urls non è un indice completo: i moduli dinamici salvano file anche
  // in dati_form. Se esistono pratiche ma la colonna è vuota, lo stato corretto
  // è "indice da verificare", non "fatture assenti".
  if (product.withInvoices === 0) {
    blockers.push(product.total === 0
      ? "invoice-corpus-missing"
      : "invoice-corpus-index-incomplete");
  }
  if (!evidence.technicalPortalContractObserved?.[productType]) {
    blockers.push("technical-portal-contract-unobserved");
  }
  return blockers;
}

function nextPriorityAction(blockers: AprProductPriorityBlocker[]): AprProductPriorityNextAction {
  if (blockers.includes("completed-enea-ground-truth-missing")) {
    return "collect-completed-enea-ground-truth";
  }
  if (blockers.includes("invoice-corpus-index-incomplete")) {
    return "verify-invoice-corpus-index";
  }
  if (blockers.includes("invoice-corpus-missing")) return "collect-invoice-corpus";
  if (blockers.includes("technical-portal-contract-unobserved")) {
    return "observe-technical-portal-contract";
  }
  return "build-shadow-parser-mapper";
}

/**
 * Priorità APR reversibile: ground truth ENEA prima, poi domanda attiva e volume.
 * withInvoices è solo l'ultimo tie-breaker perché fatture_urls non copre i file
 * dei moduli dinamici salvati in dati_form.
 */
export function rankAprNextProduct(
  summary: AprProductIntegrationSummary,
  evidence: AprProductPriorityEvidence = {},
): AprProductPriorityDecision {
  const candidates = APR_INTAKE_ONLY_PRODUCTS.map((productType) => {
    const product = summary.byProduct[productType];
    const blockers = priorityBlockers(productType, product, evidence);
    return {
      productType,
      historicalWithCompletedEnea: product.historicalWithCompletedEnea,
      withInvoices: product.withInvoices,
      activeReady: product.activeReady,
      total: product.total,
      blockers,
      nextAction: nextPriorityAction(blockers),
      invoiceEvidenceScope: "first-class-column-only" as const,
      shadowTechnicalMappingAllowed: false as const,
      officialSubmissionAllowed: false as const,
    };
  }).sort((left, right) => (
    right.historicalWithCompletedEnea - left.historicalWithCompletedEnea
    || right.activeReady - left.activeReady
    || right.total - left.total
    || right.withInvoices - left.withInvoices
    || left.productType.localeCompare(right.productType)
  ));

  const hasAnyCorpus = candidates.some((candidate) => (
    candidate.total > 0
    || candidate.withInvoices > 0
    || candidate.historicalWithCompletedEnea > 0
    || candidate.activeReady > 0
  ));

  return {
    recommendedNextProduct: hasAnyCorpus ? candidates[0]?.productType ?? null : null,
    candidates,
  };
}

/**
 * Inventario multi-prodotto APR: solo SELECT e nessuna mutation.
 * Per non leggere dati_form (che può contenere dati personali), il conteggio
 * fatture vede soltanto fatture_urls e deve quindi essere trattato come parziale.
 * La lettura è paginata per non troncare il corpus usato nelle priorità. La
 * semplice lettura dell'inventario non autorizza OMBRA: il gate deve essere
 * passato esplicitamente anche a questo percorso.
 */
export async function loadReadOnlyAprProductIntegrationInventory(
  client: SupabaseClient<Database>,
  globalShadowAuthorization?: AprGlobalShadowUserAuthorization,
): Promise<AprProductInventoryRow[]> {
  const rawRows: ProductInventoryQueueRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("enea_practices_public")
      .select(`
        id,
        prodotto_installato,
        form_compilato_at,
        fatture_urls,
        documenti_aggiuntivi_urls,
        pratica_enea_conclusa_urls,
        pipeline_stages!inner(stage_type)
      `)
      .eq("brand", "enea")
      .in("pipeline_stages.stage_type", ["inviata", "attesa_compilazione", "pronte_da_fare", "archiviate"])
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + APR_PRODUCT_INVENTORY_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as ProductInventoryQueueRow[];
    rawRows.push(...page);
    if (page.length < APR_PRODUCT_INVENTORY_PAGE_SIZE) break;
    from += APR_PRODUCT_INVENTORY_PAGE_SIZE;
  }

  return rawRows
    .map((row) => mapAprProductInventoryRow(row, globalShadowAuthorization))
    .filter((row): row is AprProductInventoryRow => row !== null);
}
