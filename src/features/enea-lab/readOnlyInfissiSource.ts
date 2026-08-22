import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyFormData } from "@/types/form-cliente";
import type { FormClienteData, ProdottoData } from "@/types/form-cliente";
import type { Database, Json } from "@/integrations/supabase/types";
import { detectAprProductType } from "./productIntegration";
import type { EneaLabDocumentKind, EneaLabDocumentPath, EneaLabSourcePractice } from "./types";

type InfissiQueueRow = {
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

const INFISSI_QUEUE_SELECT = `
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
  pipeline_stages(stage_type),
  companies:reseller_id(ragione_sociale)
`;

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("it");
}

function isExcludedReseller(value: string | null | undefined): boolean {
  return normalize(value).includes("erremme");
}

function normalizeProduct(value: unknown, fallback: ProdottoData): ProdottoData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const product = value as Record<string, unknown>;
  const legacyInfissi = ["materiale_vecchi", "vetro_vecchi", "materiale_nuovi", "vetro_nuovi"]
    .some((key) => key in product);
  if (product.tipo === "infissi" || legacyInfissi) return value as ProdottoData;
  return fallback;
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

function collectFormFiles(node: unknown, practiceId: string, fieldKey = ""): EneaLabDocumentPath[] {
  if (typeof node === "string") {
    return node.startsWith(`${practiceId}/`) ? [{ kind: documentKind(fieldKey), path: node }] : [];
  }
  if (Array.isArray(node)) return node.flatMap((item) => collectFormFiles(item, practiceId, fieldKey));
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, item]) => collectFormFiles(item, practiceId, key));
}

function uniquePaths(paths: EneaLabDocumentPath[]): EneaLabDocumentPath[] {
  const seen = new Set<string>();
  return paths.filter(({ path }) => !seen.has(path) && Boolean(seen.add(path)));
}

export function mapInfissiQueueRow(row: InfissiQueueRow): EneaLabSourcePractice | null {
  if (!row.id || detectAprProductType(row.prodotto_installato) !== "infissi") return null;
  if (isExcludedReseller(row.companies?.ragione_sociale)) return null;

  const form = mergeForm(emptyFormData(), row.dati_form);
  if (!form.richiedente.nome) form.richiedente.nome = row.cliente_nome ?? "";
  if (!form.richiedente.cognome) form.richiedente.cognome = row.cliente_cognome ?? "";
  if (!form.richiedente.email) form.richiedente.email = row.cliente_email ?? "";
  if (!form.richiedente.telefono) form.richiedente.telefono = row.cliente_telefono ?? "";
  if (!form.richiedente.cf) form.richiedente.cf = row.cliente_cf ?? "";

  const formFiles = collectFormFiles(row.dati_form, row.id);
  const documentPaths = uniquePaths([
    ...(row.fatture_urls ?? []).map((path) => ({ kind: "invoice" as const, path })),
    ...(row.documenti_aggiuntivi_urls ?? []).map((path) => ({ kind: "additional" as const, path })),
    ...formFiles,
  ]).filter(({ path }) => path.startsWith(`${row.id}/`));
  const completedEneaPaths = [...new Set(row.pratica_enea_conclusa_urls ?? [])]
    .filter((path) => path.startsWith(`${row.id}/`));
  const invoiceCount = documentPaths.filter(({ kind }) => kind === "invoice").length;
  const stageType = row.pipeline_stages?.stage_type;
  const isHistorical = stageType === "archiviate" && completedEneaPaths.length > 0;
  const isReady = stageType === "pronte_da_fare" && Boolean(row.form_compilato_at);

  return {
    id: row.id,
    code: `CRM-${row.id.slice(0, 8).toUpperCase()}`,
    reseller: row.companies?.ragione_sociale ?? "Rivenditore non indicato",
    clienteNome: row.cliente_nome ?? "",
    clienteCognome: row.cliente_cognome ?? "",
    prodottoInstallato: row.prodotto_installato ?? "Infissi",
    ricevutaAt: row.form_compilato_at ?? row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
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
 * Recupera in sola lettura una singola pratica Infissi per nome completo.
 * Il confronto è locale ed esatto dopo normalizzazione; nessun fuzzy match può
 * selezionare il cliente sbagliato. Erremme è esclusa a doppio livello: query e mapper.
 */
export async function loadReadOnlyInfissiPracticeByFullName(
  client: SupabaseClient<Database>,
  fullName: string,
): Promise<EneaLabSourcePractice | null> {
  const target = normalize(fullName);
  if (!target) return null;

  const { data, error } = await client
    .from("enea_practices_public")
    .select(INFISSI_QUEUE_SELECT)
    .eq("brand", "enea")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const candidates = ((data ?? []) as unknown as InfissiQueueRow[])
    .filter((row) => !isExcludedReseller(row.companies?.ragione_sociale))
    .map(mapInfissiQueueRow)
    .filter((practice): practice is EneaLabSourcePractice => practice !== null)
    .filter((practice) => normalize(`${practice.clienteNome} ${practice.clienteCognome}`) === target);

  // Duplicati omonimi non vengono risolti per euristica: fail-closed.
  return candidates.length === 1 ? candidates[0] : null;
}
