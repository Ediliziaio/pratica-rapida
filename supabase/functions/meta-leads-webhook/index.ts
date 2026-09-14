/**
 * meta-leads-webhook — riceve i lead dai moduli Meta Ads (Lead Ads) e li
 * inserisce nella tabella `leads` del CRM (colonna "Nuovo Lead").
 *
 * Flusso:
 *   Meta Ads (form istantaneo) → utente compila → Meta manda un evento
 *   webhook `leadgen` a questa function → leggiamo i dati del lead via
 *   Graph API → INSERT in `leads` (source="meta_ads").
 *
 * Si sottoscrive alla PAGINA, quindi cattura i lead di QUALSIASI modulo
 * collegato alla Pagina (anche moduli creati in futuro).
 *
 * Secrets richiesti (Supabase → Edge Functions → Secrets):
 *   - META_LEADS_VERIFY_TOKEN   stringa a piacere, usata solo in fase di verifica webhook
 *   - META_PAGE_ACCESS_TOKEN    token della Pagina "Praticarapida" con permesso leads_retrieval
 *   - (opz.) META_APP_SECRET    per verificare la firma X-Hub-Signature-256 dei POST
 *   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (già presenti di default)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v19.0";
const VERIFY_TOKEN  = Deno.env.get("META_LEADS_VERIFY_TOKEN") ?? "";
const PAGE_TOKEN    = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
const APP_SECRET    = Deno.env.get("META_APP_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Restituisce l'id della prima fase della pipeline (order 0), fallback "lead". */
async function firstStageId(): Promise<string> {
  try {
    const { data } = await supabase.from("platform_settings")
      .select("value").eq("key", "crm_pipeline_stages").single();
    const stages = (data?.value as Array<{ id: string; order: number }>) ?? [];
    const first = [...stages].sort((a, b) => a.order - b.order)[0];
    return first?.id ?? "lead";
  } catch {
    return "lead";
  }
}

/** Verifica la firma X-Hub-Signature-256 (se META_APP_SECRET è impostato). */
async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return true; // firma non richiesta se il secret non è impostato
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}` === header;
}

/** Mappa i campi del form Meta sulle colonne di `leads`. */
function mapFields(fieldData: Array<{ name: string; values: string[] }>) {
  const get = (...keys: string[]) => {
    for (const f of fieldData) {
      if (keys.includes(f.name.toLowerCase())) return (f.values?.[0] ?? "").trim();
    }
    return "";
  };

  let nome = get("first_name", "nome");
  let cognome = get("last_name", "cognome");
  const full = get("full_name", "name", "nome_completo");
  if (!nome && full) {
    const parts = full.split(/\s+/);
    nome = parts.shift() ?? full;
    cognome = cognome || parts.join(" ");
  }

  const email    = get("email", "e-mail");
  const telefono = get("phone_number", "phone", "telefono", "cellulare");
  const citta    = get("city", "città", "citta", "comune");

  // Tutto il resto (domande custom) finisce nella nota, così non si perde nulla.
  const known = new Set([
    "first_name", "nome", "last_name", "cognome", "full_name", "name", "nome_completo",
    "email", "e-mail", "phone_number", "phone", "telefono", "cellulare",
    "city", "città", "citta", "comune",
  ]);
  const extra = fieldData
    .filter(f => !known.has(f.name.toLowerCase()) && (f.values?.[0] ?? "").trim())
    .map(f => `${f.name}: ${f.values[0]}`);

  return { nome: nome || "Lead", cognome: cognome || null, email: email || null,
           telefono: telefono || null, citta: citta || null, extra };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  // ── Verifica webhook (GET) ────────────────────────────────────────────────
  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: { entry?: Array<{ changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> };
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  const stageId = await firstStageId();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const v = change.value ?? {};
      const leadgenId = String(v.leadgen_id ?? "");
      const formId    = String(v.form_id ?? "");
      if (!leadgenId) continue;

      try {
        // Recupera i dati del lead dalla Graph API.
        const resp = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,form_id,created_time&access_token=${PAGE_TOKEN}`,
        );
        const lead = await resp.json();
        if (!resp.ok) {
          console.error("[meta-leads-webhook] Graph error:", JSON.stringify(lead));
          continue;
        }

        const m = mapFields(lead.field_data ?? []);

        // Dedup: se il leadgen_id è già stato importato, salta.
        const marker = `[meta_lead:${leadgenId}]`;
        const { data: existing } = await supabase
          .from("leads").select("id").ilike("note", `%${marker}%`).limit(1);
        if (existing && existing.length > 0) continue;

        const noteLines = [
          ...m.extra,
          `Modulo Meta: ${formId || lead.form_id || "n/d"}`,
          marker, // usato per il dedup, non mostrato in UI in modo prominente
        ];

        const { error } = await supabase.from("leads").insert({
          nome: m.nome,
          cognome: m.cognome,
          email: m.email,
          telefono: m.telefono,
          citta: m.citta,
          note: noteLines.join("\n"),
          source: "meta_ads",
          stage_id: stageId,
          page_url: "Meta Ads",
        });
        if (error) {
          console.error("[meta-leads-webhook] insert error:", error.message);
        } else {
          // Notifica interna: nuovo lead → email a modulistica@ (override via
          // env LEADS_ALERT_EMAIL). "Di cosa si occupa" = risposte custom del
          // modulo Meta (m.extra), che è la parte più informativa del lead.
          try {
            const occupazione = m.extra.length > 0 ? m.extra.join(" · ") : "non specificato";
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                to: Deno.env.get("LEADS_ALERT_EMAIL") ?? "modulistica@praticarapida.it",
                template: "nuovo_lead",
                data: {
                  nome: m.nome,
                  cognome: m.cognome ?? "",
                  occupazione,
                  email: m.email ?? "—",
                  telefono: m.telefono ?? "—",
                  citta: m.citta ?? "—",
                  fonte: "Meta Ads",
                },
              }),
            });
          } catch (mailErr) {
            console.error("[meta-leads-webhook] alert email failed:", mailErr);
          }
        }
      } catch (e) {
        console.error("[meta-leads-webhook] error:", e);
      }
    }
  }

  // Meta richiede una risposta 200 rapida per non ritentare.
  return new Response("EVENT_RECEIVED", { status: 200, headers: CORS });
});
