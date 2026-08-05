import type { SupabaseClient } from "@supabase/supabase-js";
import { detectProdottoTipo, emptyFormData } from "@/types/form-cliente";
import type { FormClienteData } from "@/types/form-cliente";
import type { Database, Json } from "@/integrations/supabase/types";
import type { EneaLabSourcePractice } from "./types";

type QueueRow = {
  id: string | null;
  cliente_nome: string | null;
  cliente_cognome: string | null;
  prodotto_installato: string | null;
  data_fine_lavori: string | null;
  fatture_urls: string[] | null;
  documenti_aggiuntivi_urls: string[] | null;
  dati_form: Json | null;
  form_compilato_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  pipeline_stages: { stage_type: string } | null;
  companies: { ragione_sociale: string } | null;
};

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
    prodotto: draft.prodotto && typeof draft.prodotto === "object"
      ? draft.prodotto
      : base.prodotto,
    documenti: { ...base.documenti, ...(draft.documenti ?? {}) },
  };
}

function countFormFiles(
  node: unknown,
  practiceId: string,
  fieldKey = "",
): { invoices: number; documents: number } {
  if (typeof node === "string") {
    if (!node.startsWith(`${practiceId}/`)) return { invoices: 0, documents: 0 };
    return /fattur/i.test(fieldKey)
      ? { invoices: 1, documents: 0 }
      : { invoices: 0, documents: 1 };
  }
  if (Array.isArray(node)) {
    return node.reduce(
      (total, item) => {
        const current = countFormFiles(item, practiceId, fieldKey);
        return {
          invoices: total.invoices + current.invoices,
          documents: total.documents + current.documents,
        };
      },
      { invoices: 0, documents: 0 },
    );
  }
  if (!node || typeof node !== "object") return { invoices: 0, documents: 0 };
  return Object.entries(node).reduce(
    (total, [key, item]) => {
      const current = countFormFiles(item, practiceId, key);
      return {
        invoices: total.invoices + current.invoices,
        documents: total.documents + current.documents,
      };
    },
    { invoices: 0, documents: 0 },
  );
}

export function mapQueueRow(row: QueueRow): EneaLabSourcePractice | null {
  if (!row.id) return null;
  if (detectProdottoTipo(row.prodotto_installato) !== "schermature") return null;

  const form = mergeForm(emptyFormData(), row.dati_form);
  const createdAt = row.created_at ?? new Date(0).toISOString();
  const receivedAt = row.form_compilato_at ?? row.updated_at ?? createdAt;
  const stageType = row.pipeline_stages?.stage_type;
  const isReady = stageType === "pronte_da_fare" && Boolean(row.form_compilato_at);
  const formFiles = countFormFiles(row.dati_form, row.id);

  return {
    id: row.id,
    code: `CRM-${row.id.slice(0, 8).toUpperCase()}`,
    reseller: row.companies?.ragione_sociale ?? "Rivenditore non indicato",
    clienteNome: row.cliente_nome ?? "Cliente",
    clienteCognome: row.cliente_cognome ?? "senza cognome",
    prodottoInstallato: row.prodotto_installato ?? "Schermature solari",
    ricevutaAt: receivedAt,
    dataFineLavori: row.data_fine_lavori,
    fattureCount: (row.fatture_urls?.length ?? 0) + formFiles.invoices,
    documentiCount:
      (row.documenti_aggiuntivi_urls?.length ?? 0) + formFiles.documents,
    queueStatus: isReady ? "ready" : "waiting_client",
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
    .select(`
      id,
      cliente_nome,
      cliente_cognome,
      prodotto_installato,
      data_fine_lavori,
      fatture_urls,
      documenti_aggiuntivi_urls,
      dati_form,
      form_compilato_at,
      created_at,
      updated_at,
      pipeline_stages!inner(stage_type),
      companies:reseller_id(ragione_sociale)
    `)
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
