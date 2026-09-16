import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientEsportazione } from "./esportaPratica.ts";
import type { ClientImportazione } from "./importaPratica.ts";

// Le tabelle vengono interrogate per nome: enea_practices, companies e
// pipeline_stages sono nei tipi generati, ma qui serve un accesso uniforme e
// non si tocca types.ts a mano.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientLibero = SupabaseClient<any, any, any>;

// CRM vero: SOLA LETTURA. Solo select e download.
export function clientEsportazioneSupabase(supabase: ClientLibero): ClientEsportazione {
  return {
    async selectById(table, id) {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data as Record<string, unknown> | null) ?? null;
    },
    async download(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || null };
    },
  };
}

// CRM ombra: scrive con l'utente staff loggato nell'ombra (mai service role
// dal browser). Gli id restano quelli del CRM vero.
export function clientImportazioneSupabase(supabase: ClientLibero): ClientImportazione {
  return {
    async exists(table, id) {
      const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
      if (error) throw new Error(`${table}: ${error.message}`);
      return Boolean(data);
    },
    async insert(table, row) {
      const { error } = await supabase.from(table).insert(row);
      if (error) throw new Error(`${table}: ${error.message}`);
    },
    async findSystemStage(stageType, brand) {
      let query = supabase.from("pipeline_stages").select("id").eq("stage_type", stageType).is("reseller_id", null);
      if (brand) query = query.eq("brand", brand);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw new Error(`pipeline_stages: ${error.message}`);
      return (data as { id: string } | null)?.id ?? null;
    },
    async upload(bucket, path, bytes, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, bytes, { upsert: false, contentType: contentType ?? undefined });
      if (!error) return "caricato";
      if (/exists|duplicate|409/i.test(error.message)) return "gia_presente";
      throw new Error(`storage ${bucket}/${path}: ${error.message}`);
    },
  };
}
