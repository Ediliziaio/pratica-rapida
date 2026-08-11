import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildMinimalWhatsappCrmContext,
  type WhatsappMinimalCrmContext,
} from "./minimalCrmContext";

/**
 * Projection volutamente minima per l'assistente WhatsApp.
 * Non seleziona anagrafica, CF, recapiti, note, importi o URL documentali.
 */
export const WHATSAPP_CRM_READ_SELECT = `
  id,
  prodotto_installato,
  documenti_mancanti,
  updated_at,
  pipeline_stages!enea_practices_current_stage_id_fkey(stage_type)
` as const;

export interface WhatsappCrmReadRow {
  id: string;
  prodotto_installato: string | null;
  documenti_mancanti: string[] | null;
  updated_at: string | null;
  pipeline_stages: { stage_type: string } | null;
}

export function mapWhatsappCrmReadRow(
  row: WhatsappCrmReadRow,
): WhatsappMinimalCrmContext {
  return buildMinimalWhatsappCrmContext({
    id: row.id,
    // enea_practices non ha oggi un codice pratica dedicato: non inventarlo.
    code: null,
    stage: row.pipeline_stages?.stage_type ?? null,
    product: row.prodotto_installato,
    updatedAt: row.updated_at,
    missingDocuments: row.documenti_mancanti ?? [],
  });
}

/**
 * Unico accesso CRM previsto per la V1 assist/draft: SELECT by practice_id.
 * Nessuna INSERT/UPDATE e nessun accesso a documenti o dati cliente.
 */
export async function loadWhatsappMinimalCrmContext(
  client: SupabaseClient<Database>,
  practiceId: string,
): Promise<WhatsappMinimalCrmContext | null> {
  const normalizedPracticeId = practiceId.trim();
  if (!normalizedPracticeId) return null;

  const { data, error } = await client
    .from("enea_practices")
    .select(WHATSAPP_CRM_READ_SELECT)
    .eq("id", normalizedPracticeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapWhatsappCrmReadRow(data as unknown as WhatsappCrmReadRow);
}
