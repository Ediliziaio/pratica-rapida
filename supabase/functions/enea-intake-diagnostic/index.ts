/**
 * Diagnostica minima dei tentativi ENEA pubblici: nessuna pratica viene creata,
 * nessun dato del cliente o documento viene raccolto. L'email aziendale serve
 * solo a trovare l'azienda; non e' conservata nell'evento.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const empty = () => new Response(null, { status: 204, headers: CORS });
const validText = (value: unknown, pattern: RegExp, limit: number) =>
  typeof value === "string" && value.length <= limit && pattern.test(value) ? value : null;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return empty();
  if (request.method !== "POST") return new Response(null, { status: 405, headers: CORS });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return empty();
    const body = JSON.parse(raw) as Record<string, unknown>;
    const details = body.details as Record<string, unknown> | null;
    if (!details || typeof details !== "object") return empty();
    const event = validText(details.event, /^(question_shown|validation_failed|submit_failed)$/, 20);
    const phase = validText(details.phase, /^[a-z_]{1,40}$/, 40);
    const code = validText(details.code, /^[A-Za-z0-9_:-]{1,48}$/, 48);
    const route = validText(details.route, /^\/(enea\/nuova|area-riservata-vecchia\/pratica-enea)$/, 100);
    const email = validText(body.company_email, /^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,30}$/, 235);
    const companyName = validText(body.company_name, /^[\p{L}\p{N} .,'&-]{2,120}$/u, 120);
    if (!event || !phase || !code || !route || (!email && !companyName)) return empty();

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const company = email
      ? (await db.from("companies").select("id").ilike("email", email).limit(1).maybeSingle()).data
      : null;
    const matched = company ?? (companyName
      ? (await db.from("companies").select("id").ilike("ragione_sociale", companyName.replace(/[%_]/g, "")).limit(1).maybeSingle()).data
      : null);
    if (!matched?.id) return empty();

    // I browser anonimi possono inviare eventi, ma non riempire senza limite
    // il registro operativo di un'azienda nota.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await db.from("audit_log").select("id", { count: "exact", head: true })
      .eq("company_id", matched.id).eq("azione", "enea_intake_diagnostic").gte("created_at", since);
    if (countError) return empty();
    if ((count ?? 0) >= 30) return empty();

    const fields = Array.isArray(details.fields)
      ? details.fields.filter((item): item is string => typeof item === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(item)).slice(0, 30)
      : [];
    const selected = details.selected_files && typeof details.selected_files === "object"
      ? Object.fromEntries(Object.entries(details.selected_files as Record<string, unknown>)
        .filter(([key, value]) => /^[a-z_]{1,30}$/.test(key) && typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100))
      : {};
    await db.from("audit_log").insert({
      company_id: matched.id,
      azione: "enea_intake_diagnostic",
      dettagli: {
        event, phase, code, route, fields,
        attempt_id: validText(details.attempt_id, /^[0-9a-f-]{36}$/i, 36),
        main_asset: validText(details.main_asset, /^\/assets\/[A-Za-z0-9._-]+\.js$/, 120),
        service: validText(details.service, /^(servizio_completo|documenti_forniti)$/, 20),
        documents_mode: validText(details.documents_mode, /^(moduli_cartacei|form_online)$/, 20),
        product: validText(details.product, /^[a-z_]{1,40}$/, 40),
        selected_files: selected,
      },
    });
  } catch (error) {
    // La diagnostica non puo' mai diventare un nuovo blocco del modulo.
    console.warn("[enea-intake-diagnostic] unavailable", error instanceof Error ? error.name : "unknown");
  }
  return empty();
});
