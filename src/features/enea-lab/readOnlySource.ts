import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyFormData } from "@/types/form-cliente";
import type { FormClienteData, ProdottoData, SchermaturaItem } from "@/types/form-cliente";
import type { Database, Json } from "@/integrations/supabase/types";
import { detectAprProductType } from "./productIntegration";
import type {
  EneaLabDocumentKind,
  EneaLabDocumentPath,
  EneaLabSourcePractice,
} from "./types";

type QueueRow = {
  id: string | null;
  cliente_nome: string | null;
  cliente_cognome: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  cliente_cf: string | null;
  prodotto_installato: string | null;
  data_fine_lavori: string | null;
  fatture_urls: string[] | null;
  documenti_aggiuntivi_urls: string[] | null;
  pratica_enea_conclusa_urls: string[] | null;
  dati_form: Json | null;
  form_compilato_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  pipeline_stages: { stage_type: string } | null;
  companies: { ragione_sociale: string } | null;
};

const QUEUE_SELECT = `
  id,
  cliente_nome,
  cliente_cognome,
  cliente_email,
  cliente_telefono,
  cliente_cf,
  prodotto_installato,
  data_fine_lavori,
  fatture_urls,
  documenti_aggiuntivi_urls,
  pratica_enea_conclusa_urls,
  dati_form,
  form_compilato_at,
  created_at,
  updated_at,
  pipeline_stages!inner(stage_type),
  companies:reseller_id(ragione_sociale)
`;

function normalizeSchermaturaItem(value: unknown): SchermaturaItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const tipo = typeof item.tipo === "string" ? item.tipo : item.tipo_prodotto;
  const direzione = item.direzione;
  return {
    tipo: typeof tipo === "string" ? tipo as SchermaturaItem["tipo"] : "",
    direzione: typeof direzione === "string" ? direzione as SchermaturaItem["direzione"] : "",
  };
}

function normalizeProduct(value: unknown, fallback: ProdottoData): ProdottoData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const product = value as Record<string, unknown>;
  const legacyItems = Array.isArray(product.schermature) ? product.schermature : [];
  const currentItems = Array.isArray(product.items) ? product.items : [];
  const items = (currentItems.length ? currentItems : legacyItems)
    .map(normalizeSchermaturaItem)
    .filter((item): item is SchermaturaItem => item !== null);

  if (product.tipo === "schermature" || items.length) return { tipo: "schermature", items };
  return value as ProdottoData;
}

function mergeForm(base: FormClienteData, raw: Json | null): FormClienteData {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return base;
  const draft = raw as Partial<FormClienteData>;

  return {
    ...base,
    ...draft,
    richiedente: { ...base.richiedente, ...(draft.richiedente ?? {}) },
    residenza: { ...base.residenza, ...(draft.residenza ?? {}) },
    appartamento_lavori: { ...base.appartamento_lavori, ...(draft.appartamento_lavori ?? {}) },
    cointestazione: { ...base.cointestazione, ...(draft.cointestazione ?? {}) },
    catastali: { ...base.catastali, ...(draft.catastali ?? {}) },
    edificio: { ...base.edificio, ...(draft.edificio ?? {}) },
    impianto: { ...base.impianto, ...(draft.impianto ?? {}) },
    prodotto: normalizeProduct(draft.prodotto, base.prodotto),
    documenti: { ...base.documenti, ...(draft.documenti ?? {}) },
  };
}

function documentKind(fieldKey: string): EneaLabDocumentKind {
  if (/fattur/i.test(fieldKey)) return "invoice";
  if (/bonific/i.test(fieldKey)) return "bank_transfer";
  if (/librett/i.test(fieldKey)) return "plant_book";
  return "additional";
}

function collectFormFiles(
  node: unknown,
  practiceId: string,
  fieldKey = "",
): EneaLabDocumentPath[] {
  if (typeof node === "string") {
    if (!node.startsWith(`${practiceId}/`)) return [];
    return [{ kind: documentKind(fieldKey), path: node }];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectFormFiles(item, practiceId, fieldKey));
  }
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, item]) =>
    collectFormFiles(item, practiceId, key),
  );
}

function uniquePaths(paths: EneaLabDocumentPath[]): EneaLabDocumentPath[] {
  const seen = new Set<string>();
  return paths.filter(({ path }) => {
    if (seen.has(path)) return false;
    seen.add(path);
    return true;
  });
}

export function mapQueueRow(row: QueueRow): EneaLabSourcePractice | null {
  if (!row.id) return null;
  // La coda Schermature deve usare la stessa classificazione fail-closed del
  // layer multi-prodotto. Una pratica che cita due famiglie supportate non può
  // essere presa in carico da un adapter scegliendo il primo match testuale.
  if (detectAprProductType(row.prodotto_installato) !== "schermature") return null;

  const form = mergeForm(emptyFormData(), row.dati_form);
  if (!form.richiedente.nome) form.richiedente.nome = row.cliente_nome ?? "";
  if (!form.richiedente.cognome) form.richiedente.cognome = row.cliente_cognome ?? "";
  if (!form.richiedente.email) form.richiedente.email = row.cliente_email ?? "";
  if (!form.richiedente.telefono) form.richiedente.telefono = row.cliente_telefono ?? "";
  if (!form.richiedente.cf) form.richiedente.cf = row.cliente_cf ?? "";
  const createdAt = row.created_at ?? new Date(0).toISOString();
  const receivedAt = row.form_compilato_at ?? row.updated_at ?? createdAt;
  const stageType = row.pipeline_stages?.stage_type;
  const isReady = stageType === "pronte_da_fare" && Boolean(row.form_compilato_at);
  const isHistorical = stageType === "archiviate" && Boolean(row.pratica_enea_conclusa_urls?.length);
  const formFiles = collectFormFiles(row.dati_form, row.id);
  const documentPaths = uniquePaths([
    ...(row.fatture_urls ?? []).map((path) => ({ kind: "invoice" as const, path })),
    ...(row.documenti_aggiuntivi_urls ?? []).map((path) => ({ kind: "additional" as const, path })),
    ...formFiles,
  ]).filter(({ path }) => path.startsWith(`${row.id}/`));
  const completedEneaPaths = [...new Set(row.pratica_enea_conclusa_urls ?? [])]
    .filter((path) => path.startsWith(`${row.id}/`));
  const invoiceCount = documentPaths.filter(({ kind }) => kind === "invoice").length;

  return {
    id: row.id,
    code: `CRM-${row.id.slice(0, 8).toUpperCase()}`,
    reseller: row.companies?.ragione_sociale ?? "Rivenditore non indicato",
    clienteNome: row.cliente_nome ?? "Cliente",
    clienteCognome: row.cliente_cognome ?? "senza cognome",
    prodottoInstallato: row.prodotto_installato ?? "Schermature solari",
    ricevutaAt: receivedAt,
    dataFineLavori: row.data_fine_lavori,
    fattureCount: invoiceCount,
    documentiCount: documentPaths.length - invoiceCount,
    documentPaths,
    completedEneaPaths,
    queueStatus: isHistorical ? "historical" : isReady ? "ready" : "waiting_client",
    form,
  };
}

/**
 * Sorgente del CRM ombra: esegue esclusivamente SELECT sulla view già protetta
 * da RLS. Non usa mutation, RPC, storage write o funzioni di automazione.
 */
export async function loadReadOnlyEneaQueue(
  client: SupabaseClient<Database>,
): Promise<EneaLabSourcePractice[]> {
  const { data, error } = await client
    .from("enea_practices_public")
    .select(QUEUE_SELECT)
    .eq("brand", "enea")
    .is("archived_at", null)
    .in("pipeline_stages.stage_type", ["inviata", "attesa_compilazione", "pronte_da_fare"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return ((data ?? []) as unknown as QueueRow[])
    .map(mapQueueRow)
    .filter((practice): practice is EneaLabSourcePractice => practice !== null);
}

/**
 * Campione storico per il collaudo: legge soltanto pratiche ENEA archiviate che
 * possiedono un PDF conclusivo caricato. Il filtro non-null viene applicato già
 * in Supabase per minimizzare i record letti; il controllo del path resta locale
 * per escludere array vuoti o percorsi che non appartengono alla pratica.
 */
export async function loadReadOnlyEneaHistoricalQueue(
  client: SupabaseClient<Database>,
): Promise<EneaLabSourcePractice[]> {
  const { data, error } = await client
    .from("enea_practices_public")
    .select(QUEUE_SELECT)
    .eq("brand", "enea")
    .in("pipeline_stages.stage_type", ["archiviate"])
    .not("pratica_enea_conclusa_urls", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return ((data ?? []) as unknown as QueueRow[])
    .map(mapQueueRow)
    .filter((practice): practice is EneaLabSourcePractice =>
      practice !== null
      && practice.queueStatus === "historical"
      && Boolean(practice.completedEneaPaths?.length),
    );
}
