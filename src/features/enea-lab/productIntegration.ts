import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ProdottoTipo } from "@/types/form-cliente";

export type AprProductLifecycle = "waiting_client" | "ready" | "historical" | "other";
export type AprProductIntegrationPhase = "screenings-validated" | "intake-only";

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
    withInvoices: number;
    integrationPhase: AprProductIntegrationPhase;
  }>;
}

export const APR_PRODUCT_INTEGRATION_PHASES: Record<ProdottoTipo, AprProductIntegrationPhase> = {
  schermature: "screenings-validated",
  infissi: "intake-only",
  impianto_termico: "intake-only",
  insufflaggio: "intake-only",
};

/**
 * Detector deliberatamente fail-closed per l'inventario APR.
 * A differenza del form pubblico non usa un fallback a infissi: un'etichetta
 * sconosciuta deve restare unknown finché non viene classificata esplicitamente.
 */
export function detectAprProductType(value: string | null | undefined): ProdottoTipo | "unknown" {
  const normalized = (value ?? "").trim().toLocaleLowerCase("it");
  if (!normalized) return "unknown";
  if (normalized.includes("insufflag")) return "insufflaggio";
  if (normalized.includes("infiss") || normalized.includes("serrament")) return "infissi";
  if (
    normalized.includes("schermat")
    || normalized.includes("tend")
    || normalized.includes("pergot")
    || normalized.includes("pergola")
  ) return "schermature";
  if (
    normalized.includes("impianto termico")
    || normalized.includes("pompa di calore")
    || normalized.includes("caldaia")
    || normalized.includes("climatizz")
  ) return "impianto_termico";
  return "unknown";
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

export function mapAprProductInventoryRow(row: ProductInventoryQueueRow): AprProductInventoryRow | null {
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
    // In questa fase le schermature possono essere valutate end-to-end in shadow.
    // Gli altri prodotti entrano nel perimetro APR soltanto come intake diagnostico
    // finché parser, mapping e contratto portale specifici non sono verificati.
    shadowEvaluationAllowed: productType === "schermature",
    // Gate globale esplicito: nessun prodotto può inviare pratiche ufficiali.
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

/**
 * Inventario multi-prodotto APR: solo SELECT, nessun dato personale e nessuna
 * mutation. Serve a misurare il corpus disponibile prima di costruire i parser
 * e i mapper specifici per infissi, impianto termico e insufflaggio.
 */
export async function loadReadOnlyAprProductIntegrationInventory(
  client: SupabaseClient<Database>,
): Promise<AprProductInventoryRow[]> {
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
    .limit(500);

  if (error) throw error;

  return ((data ?? []) as unknown as ProductInventoryQueueRow[])
    .map(mapAprProductInventoryRow)
    .filter((row): row is AprProductInventoryRow => row !== null);
}
