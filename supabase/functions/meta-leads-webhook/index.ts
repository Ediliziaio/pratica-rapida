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
 *   - META_PAGE_ACCESS_TOKEN    token della Pagina "Praticarapida" con permesso leads_retrieval.
 *       DEVE essere un token che NON scade (es. token di un System User del
 *       Business Manager, oppure page token ricavato da un user token LONG-lived).
 *       Un token del Graph API Explorer scade in ~1-2 ore: il 19/09/2026 è
 *       successo proprio questo e i lead hanno smesso di entrare.
 *       Verifica: GET ...?action=status&token=<VERIFY_TOKEN>
 *   - (opz.) META_APP_SECRET    per verificare la firma X-Hub-Signature-256 dei POST
 *   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (già presenti di default)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v19.0";
// Verify token dell'handshake webhook (GET di verifica di Meta). NON è un
// segreto sensibile: serve solo a evitare che qualcuno registri a caso il
// callback. Fallback hardcoded così la sottoscrizione può essere verificata
// anche senza impostare il secret META_LEADS_VERIFY_TOKEN.
const VERIFY_TOKEN  = Deno.env.get("META_LEADS_VERIFY_TOKEN") ?? "pr_3dbfa0f498ea36c8b85729e89531a009";
const PAGE_TOKEN    = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
const APP_SECRET    = Deno.env.get("META_APP_SECRET") ?? "";
// Non pianificare automaticamente i contatti storici recuperati dal cron.
// Il recupero una-tantum dei destinatari precedenti resta un lotto separato,
// soggetto a conferma esplicita del Titolare.
const PRIVATE_FOLLOWUPS_ENABLED_FROM = new Date(
  Deno.env.get("META_PRIVATE_FOLLOWUPS_ENABLED_FROM") ?? "2026-10-10T19:40:28Z",
).getTime();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Ricava un PAGE access token a partire da META_PAGE_ACCESS_TOKEN, che l'admin
 * potrebbe aver salvato come token UTENTE. GET /{page_id}?fields=access_token
 * con un token utente (che gestisce la Pagina) restituisce il token della
 * Pagina; con un token già di Pagina restituisce se stesso. Robustezza: così
 * funziona sia che nel secret ci sia un user token sia un page token.
 */
const _pageTokenCache = new Map<string, string>();
async function resolvePageToken(pageId: string): Promise<string> {
  if (!PAGE_TOKEN) return "";
  const cached = _pageTokenCache.get(pageId);
  if (cached) return cached;
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=access_token&access_token=${PAGE_TOKEN}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && typeof j.access_token === "string" && j.access_token) {
      _pageTokenCache.set(pageId, j.access_token);
      return j.access_token;
    }
  } catch { /* fallback sotto */ }
  return PAGE_TOKEN;
}

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

function normalizeAnswer(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Solo la risposta esplicita del ramo Meta privati abilita i follow-up. */
export function isPrivateMetaLead(fieldData: Array<{ name: string; values: string[] }>): boolean {
  return fieldData.some((field) =>
    (field.values ?? []).some((value) => {
      const answer = normalizeAnswer(value);
      return answer === "sono un privato" || answer === "privato" || answer === "cliente privato";
    })
  );
}

function shouldSchedulePrivateFollowups(
  fieldData: Array<{ name: string; values: string[] }>,
  metaCreatedAt: string | undefined,
  phone: string | null,
): boolean {
  const createdMs = metaCreatedAt ? new Date(metaCreatedAt).getTime() : Date.now();
  return !!phone
    && Number.isFinite(createdMs)
    && createdMs >= PRIVATE_FOLLOWUPS_ENABLED_FROM
    && isPrivateMetaLead(fieldData);
}

const PENDING_MARKER = "[meta_pending]";

/**
 * Il webhook ha ricevuto un leadgen_id ma la Graph API non ci dà i dati (di
 * solito: META_PAGE_ACCESS_TOKEN scaduto/revocato). Invece di perdere il lead
 * lo mettiamo comunque nel CRM come segnaposto e avvisiamo via email: appena
 * il token viene rinnovato, `import_recent` (anche da cron) lo completa.
 */
async function insertPendingLead(leadgenId: string, formId: string, graphError: string, stageId: string) {
  const marker = `[meta_lead:${leadgenId}]`;
  const { data: existing } = await supabase
    .from("leads").select("id").ilike("note", `%${marker}%`).limit(1);
  if (existing && existing.length > 0) return;
  const { error } = await supabase.from("leads").insert({
    nome: "Lead Meta (dati da recuperare)",
    note: [
      "⚠️ Dati non leggibili da Meta: rinnovare il secret META_PAGE_ACCESS_TOKEN.",
      `Errore Graph: ${graphError.slice(0, 300)}`,
      `Modulo Meta: ${formId || "n/d"}`, PENDING_MARKER, marker,
    ].join("\n"),
    source: "meta_ads", stage_id: stageId, page_url: "Meta Ads",
  });
  if (error) { console.error("[meta-leads-webhook] pending insert error:", error.message); return; }
  try {
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
          nome: "Lead Meta", cognome: "(dati da recuperare)",
          occupazione: "ATTENZIONE: token Meta non valido, i dati del lead non sono leggibili. Rinnovare META_PAGE_ACCESS_TOKEN.",
          email: "—", telefono: "—", citta: "—", fonte: "Meta Ads",
        },
      }),
    });
  } catch (mailErr) {
    console.error("[meta-leads-webhook] alert email failed:", mailErr);
  }
}

/**
 * Inserisce un lead nel CRM (dedup su marker leadgen_id) e, se nuovo, invia
 * l'email di notifica a modulistica@. Usato SIA dal webhook in tempo reale SIA
 * dall'import dei lead arretrati. Ritorna l'esito per il conteggio.
 */
async function ingestLead(
  leadgenId: string,
  formId: string,
  fieldData: Array<{ name: string; values: string[] }>,
  stageId: string,
  metaCreatedAt?: string,
): Promise<"inserted" | "duplicate" | "error"> {
  const m = mapFields(fieldData);
  const marker = `[meta_lead:${leadgenId}]`;
  const { data: existing } = await supabase
    .from("leads").select("id, note").ilike("note", `%${marker}%`).limit(1);
  const noteLines = [...m.extra, `Modulo Meta: ${formId || "n/d"}`, marker];

  if (existing && existing.length > 0) {
    // Segnaposto creato dal webhook quando il token era KO: ora che abbiamo i
    // dati veri lo completiamo (senza re-inviare la notifica).
    if (existing[0].note?.includes(PENDING_MARKER) && fieldData.length > 0) {
      const { error } = await supabase.from("leads").update({
        nome: m.nome, cognome: m.cognome, email: m.email, telefono: m.telefono, citta: m.citta,
        note: noteLines.join("\n"),
        meta_leadgen_id: leadgenId, meta_form_id: formId || null,
        meta_created_at: metaCreatedAt || null, meta_field_data: fieldData,
      }).eq("id", existing[0].id);
      if (error) { console.error("[meta-leads-webhook] update error:", error.message); return "error"; }
      if (shouldSchedulePrivateFollowups(fieldData, metaCreatedAt, m.telefono)) {
        const { error: scheduleError } = await supabase.rpc("schedule_meta_private_lead_followups", {
          p_lead_id: existing[0].id,
          p_meta_created_at: metaCreatedAt || new Date().toISOString(),
        });
        if (scheduleError) {
          console.error("[meta-leads-webhook] private follow-up schedule error:", scheduleError.message);
        }
      }
      return "inserted";
    }
    return "duplicate";
  }

  const { data: insertedLead, error } = await supabase.from("leads").insert({
    nome: m.nome, cognome: m.cognome, email: m.email, telefono: m.telefono, citta: m.citta,
    note: noteLines.join("\n"), source: "meta_ads", stage_id: stageId, page_url: "Meta Ads",
    meta_leadgen_id: leadgenId, meta_form_id: formId || null,
    meta_created_at: metaCreatedAt || null, meta_field_data: fieldData,
  }).select("id").single();
  if (error) { console.error("[meta-leads-webhook] insert error:", error.message); return "error"; }

  if (insertedLead && shouldSchedulePrivateFollowups(fieldData, metaCreatedAt, m.telefono)) {
    const { error: scheduleError } = await supabase.rpc("schedule_meta_private_lead_followups", {
      p_lead_id: insertedLead.id,
      p_meta_created_at: metaCreatedAt || new Date().toISOString(),
    });
    if (scheduleError) {
      console.error("[meta-leads-webhook] private follow-up schedule error:", scheduleError.message);
    }
  }

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
          nome: m.nome, cognome: m.cognome ?? "", occupazione,
          email: m.email ?? "—", telefono: m.telefono ?? "—", citta: m.citta ?? "—",
          fonte: "Meta Ads",
        },
      }),
    });
  } catch (mailErr) {
    console.error("[meta-leads-webhook] alert email failed:", mailErr);
  }
  return "inserted";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  // ── Azione una-tantum: iscrive la Pagina all'app per il campo `leadgen`
  //    (subscribed_apps) usando il PAGE_TOKEN già in env. Serve per far sì che
  //    Meta consegni i lead REALI della Pagina al webhook. Protetta dal
  //    VERIFY_TOKEN così solo chi lo conosce può innescarla.
  //    GET ...?action=subscribe_page&token=<VERIFY_TOKEN>[&page_id=<id>]
  if (req.method === "GET" && url.searchParams.get("action") === "subscribe_page") {
    if (url.searchParams.get("token") !== VERIFY_TOKEN) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!PAGE_TOKEN) {
      return Response.json({ ok: false, error: "META_PAGE_ACCESS_TOKEN non impostato nei secret" }, { headers: CORS });
    }
    const pageId = url.searchParams.get("page_id") ?? "322933287559293"; // Praticarapida
    const pageToken = await resolvePageToken(pageId);
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${pageToken}`,
      { method: "POST" },
    );
    const j = await r.json().catch(() => ({}));
    return Response.json({ ok: r.ok, status: r.status, page_id: pageId, result: j }, { headers: CORS });
  }

  // ── Diagnostica: stato del token e app iscritte alla Pagina (non espone il token).
  //    GET ...?action=status&token=<VERIFY_TOKEN>[&page_id=<id>]
  if (req.method === "GET" && url.searchParams.get("action") === "status") {
    if (url.searchParams.get("token") !== VERIFY_TOKEN) {
      return new Response("Forbidden", { status: 403 });
    }
    const pageId = url.searchParams.get("page_id") ?? "322933287559293";
    const pageToken = await resolvePageToken(pageId);
    const g = async (path: string) => {
      const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
      return await r.json().catch(() => ({}));
    };
    const [secretDebug, pageDebug, subscribed] = await Promise.all([
      g(`debug_token?input_token=${PAGE_TOKEN}&access_token=${PAGE_TOKEN}`),
      g(`debug_token?input_token=${pageToken}&access_token=${pageToken}`),
      g(`${pageId}/subscribed_apps?access_token=${pageToken}`),
    ]);
    const pick = (d: { data?: Record<string, unknown>; error?: unknown }) => d.data
      ? { app_id: d.data.app_id, application: d.data.application, type: d.data.type,
          is_valid: d.data.is_valid, expires_at: d.data.expires_at,
          data_access_expires_at: d.data.data_access_expires_at, scopes: d.data.scopes,
          error: d.data.error }
      : { error: d.error };
    return Response.json({
      secret_token: pick(secretDebug), page_token: pick(pageDebug),
      page_resolved: pageToken !== PAGE_TOKEN, subscribed_apps: subscribed,
    }, { headers: CORS });
  }

  // ── Azione una-tantum: importa i lead ARRETRATI degli ultimi N giorni
  //    (default 7) da tutti i moduli della Pagina, inserendoli nel CRM +
  //    email, con dedup. GET ...?action=import_recent&token=<VERIFY_TOKEN>[&days=7][&page_id=<id>]
  if (req.method === "GET" && url.searchParams.get("action") === "import_recent") {
    if (url.searchParams.get("token") !== VERIFY_TOKEN) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!PAGE_TOKEN) {
      return Response.json({ ok: false, error: "META_PAGE_ACCESS_TOKEN non impostato nei secret" }, { headers: CORS });
    }
    const pageId = url.searchParams.get("page_id") ?? "322933287559293";
    const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") ?? "7", 10) || 7));
    const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
    const pageToken = await resolvePageToken(pageId);
    const stageId = await firstStageId();

    const fr = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/leadgen_forms?limit=200&access_token=${pageToken}`);
    const fj = await fr.json().catch(() => ({}));
    if (!fr.ok) return Response.json({ ok: false, step: "leadgen_forms", result: fj }, { headers: CORS });

    let scanned = 0, inserted = 0, duplicates = 0, errors = 0;
    const forms = (fj.data ?? []) as Array<{ id: string; name?: string }>;
    for (const form of forms) {
      let next: string | null =
        `https://graph.facebook.com/${GRAPH_VERSION}/${form.id}/leads?limit=100&access_token=${pageToken}`;
      let guard = 0;
      while (next && guard < 50) {
        guard++;
        const lr: Response = await fetch(next);
        // deno-lint-ignore no-explicit-any
        const lj: any = await lr.json().catch(() => ({}));
        if (!lr.ok) { console.error("[meta-leads-webhook] import error:", JSON.stringify(lj)); errors++; break; }
        let reachedOld = false;
        for (const lead of (lj.data ?? []) as Array<{ id: string; created_time?: string; field_data?: Array<{ name: string; values: string[] }> }>) {
          scanned++;
          const created = lead.created_time ? Math.floor(new Date(lead.created_time).getTime() / 1000) : 0;
          if (created && created < sinceUnix) { reachedOld = true; break; } // /leads è ordinato desc
          const res = await ingestLead(String(lead.id), String(form.id), lead.field_data ?? [], stageId, lead.created_time);
          if (res === "inserted") inserted++;
          else if (res === "duplicate") duplicates++;
          else errors++;
        }
        next = (!reachedOld && lj.paging?.next) ? (lj.paging.next as string) : null;
      }
    }
    return Response.json({ ok: true, days, forms: forms.length, scanned, inserted, duplicates, errors }, { headers: CORS });
  }

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
      const pageId    = String(v.page_id ?? "322933287559293");
      if (!leadgenId) continue;

      try {
        // Recupera i dati del lead dalla Graph API col token della Pagina.
        const pageToken = await resolvePageToken(pageId);
        const resp = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,form_id,created_time&access_token=${pageToken}`,
        );
        const lead = await resp.json();
        if (!resp.ok) {
          console.error("[meta-leads-webhook] Graph error:", JSON.stringify(lead));
          await insertPendingLead(leadgenId, formId, String(lead?.error?.message ?? resp.status), stageId);
          continue;
        }

        await ingestLead(leadgenId, formId || String(lead.form_id ?? ""), lead.field_data ?? [], stageId, lead.created_time);
      } catch (e) {
        console.error("[meta-leads-webhook] error:", e);
      }
    }
  }

  // Meta richiede una risposta 200 rapida per non ritentare.
  return new Response("EVENT_RECEIVED", { status: 200, headers: CORS });
});
