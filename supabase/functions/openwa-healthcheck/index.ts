// ============================================================
// openwa-healthcheck — monitor ESTERNO della sessione WhatsApp.
//
// Perché serve (oltre al webhook session.status):
//   Il webhook avvisa solo se il server OpenWA è VIVO e riesce a
//   inviare l'evento. Se cade l'intero VPS, il container crasha, o
//   la sessione muore in silenzio, NESSUN evento parte → nessun avviso.
//
//   Questa funzione gira su Supabase (infra indipendente dal VPS) e
//   "pinga" attivamente la sessione ogni pochi minuti via pg_cron.
//   Se il server è IRRAGGIUNGIBILE o la sessione NON è connessa →
//   manda email + notifica in-app ai super_admin (con throttle 6h).
//
// Schedulazione: pg_cron ogni 5 min (vedi istruzioni di deploy).
//
// Auth: header "X-Healthcheck-Token" = OPENWA_WEBHOOK_SECRET
//       (deploy con --no-verify-jwt).
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const HEALTHY = ["CONNECTED", "READY", "AUTHENTICATED", "WORKING"];
const TOKEN = Deno.env.get("OPENWA_WEBHOOK_SECRET") ?? "";

/**
 * Assicura (idempotente) che il webhook inbound sia registrato sul gateway
 * OpenWA per la sessione `sid`. Eventi ricevuti da openwa-webhook:
 * message.received, message.ack, session.status.
 *
 * Auth verso il ricevitore: passiamo SIA il `secret` (firma HMAC
 * X-OpenWA-Signature) SIA un header custom `x-webhook-token` — openwa-webhook
 * accetta entrambi, così funziona a prescindere dalla versione del gateway.
 *
 * Best-effort: qualunque errore viene solo loggato/ritornato, senza mai far
 * fallire l'healthcheck. Prima prova a leggere i webhook esistenti per non
 * duplicare; se l'endpoint di lettura non c'è, procede col POST.
 */
async function ensureWebhook(
  baseUrl: string,
  apiKey: string,
  sid: string,
): Promise<{ ok: boolean; action: string; status?: number; detail?: unknown }> {
  const secret = Deno.env.get("OPENWA_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !supabaseUrl) return { ok: false, action: "skip_no_env" };
  const webhookUrl = `${supabaseUrl}/functions/v1/openwa-webhook`;
  const endpoint = `${baseUrl}/api/sessions/${sid}/webhooks`;
  const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };

  const fetchJson = async (method: string, url: string, body?: unknown) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      return { res, json };
    } finally {
      clearTimeout(t);
    }
  };

  try {
    // 1) Già registrato? (evita duplicati a ogni run del cron)
    try {
      const { res, json } = await fetchJson("GET", endpoint);
      if (res.ok) {
        const arr = Array.isArray(json) ? json : ((json as { data?: unknown[] }).data ?? []);
        const exists = Array.isArray(arr) && arr.some((w) =>
          typeof w === "object" && w !== null && (w as { url?: string }).url === webhookUrl
        );
        if (exists) return { ok: true, action: "already_registered" };
      }
    } catch { /* endpoint di lettura assente → procedi col POST */ }

    // 2) Registra
    const { res, json } = await fetchJson("POST", endpoint, {
      url: webhookUrl,
      events: ["message.received", "message.ack", "session.status"],
      secret,
      headers: { "x-webhook-token": secret },
    });
    // Log esplicito così vediamo nei function logs cosa risponde il gateway.
    console.log(`[openwa-healthcheck] webhook register → ${res.status}`, JSON.stringify(json).slice(0, 500));
    return { ok: res.ok, action: "registered", status: res.status, detail: json };
  } catch (e) {
    console.error("[openwa-healthcheck] ensureWebhook threw:", e);
    return { ok: false, action: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

serve(async (req) => {
  // Auth: cron passa l'header condiviso. Accetta anche il service-role bearer.
  const tokenOk = TOKEN && req.headers.get("x-healthcheck-token") === TOKEN;
  const bearerOk = req.headers.get("authorization") ===
    `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!tokenOk && !bearerOk) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseUrl = Deno.env.get("OPENWA_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("OPENWA_API_KEY");
  const sessionId = Deno.env.get("OPENWA_SESSION_ID");
  if (!baseUrl || !apiKey || !sessionId) {
    return Response.json({ ok: false, error: "OpenWA env mancanti" }, { status: 200 });
  }

  // 1) Lista le sessioni (timeout 8s → se scade = server giù/lento) e cerca la
  //    sessione per NOME. L'ID cambia a ogni restart del container, quindi NON
  //    ci affidiamo a OPENWA_SESSION_ID: controlliamo per nome/connessione.
  const sessionName = Deno.env.get("OPENWA_SESSION_NAME") ?? "praticarapida";
  let status = "UNREACHABLE";
  let reason = "";
  let resolvedSid = sessionId;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${baseUrl}/api/sessions`, {
      headers: { "X-API-Key": apiKey },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const list = (await res.json().catch(() => [])) as Array<{ id?: string; name?: string; status?: string }>;
      if (Array.isArray(list) && list.length > 0) {
        const sess = list.find((s) => s.name === sessionName)
          ?? list.find((s) => ["connected", "ready", "authenticated", "working"].includes(String(s.status ?? "").toLowerCase()))
          ?? list[0];
        status = (sess.status ?? "UNKNOWN").toUpperCase();
        if (sess.id) resolvedSid = sess.id;
      } else {
        // Nessuna sessione registrata = WhatsApp non collegato (record perso al restart)
        status = "NO_SESSION";
        reason = "nessuna sessione attiva sul server";
      }
    } else {
      status = "UNREACHABLE";
      reason = `HTTP ${res.status}`;
    }
  } catch (e) {
    status = "UNREACHABLE";
    reason = e instanceof Error ? e.message : String(e);
  }

  const isHealthy = HEALTHY.includes(status);
  if (isHealthy) {
    // Sessione connessa → assicura che il webhook inbound sia registrato sul
    // gateway. Alla ricreazione della sessione (restart/logout/riconnessione)
    // OpenWA perde la config webhook e i messaggi in ENTRATA smettono di
    // arrivare al CRM pur restando l'invio funzionante. Ri-registrandolo a
    // ogni healthcheck (ogni 5 min, idempotente) l'inbound si auto-ripristina.
    const webhook = await ensureWebhook(baseUrl, apiKey, resolvedSid);
    return Response.json({ ok: true, status, healthy: true, webhook });
  }

  // 2) NON sano → alert con throttle 6h (stessa campanella del webhook)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("notifications")
    .select("id")
    .eq("tipo", "integration_error")
    .ilike("titolo", "%WhatsApp%")
    .gte("created_at", sixHoursAgo)
    .limit(1)
    .maybeSingle();

  if (recent) {
    return Response.json({ ok: true, status, healthy: false, alerted: false, throttled: true });
  }

  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");
  const adminIds = (admins ?? []).map((a) => a.user_id).filter(Boolean);

  // Notifica in-app
  if (adminIds.length > 0) {
    const human = status === "UNREACHABLE"
      ? "Il server OpenWA non risponde (VPS spento o container in crash)."
      : `La sessione WhatsApp è in stato ${status}.`;
    await supabase.from("notifications").insert(
      adminIds.map((user_id) => ({
        user_id,
        tipo: "integration_error",
        titolo: "⚠️ WhatsApp (OpenWA) non attivo",
        messaggio: `${human} Apri Impostazioni → Integrazioni per ripristinare.`,
        link: "/admin/integrazioni",
      })),
    );
  }

  // Email "rumorosa" alla casella operativa modulistica@ (override via WA_ALERT_EMAIL)
  try {
    const alertEmail = Deno.env.get("WA_ALERT_EMAIL") ?? "modulistica@praticarapida.it";
    const emails: string[] = [alertEmail];

    const appUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://pannello.praticarapida.it";
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: emails,
        template: "whatsapp_disconnesso",
        data: {
          status: status === "UNREACHABLE" ? "SERVER NON RAGGIUNGIBILE" : status,
          reason: reason || "rilevato dal monitor automatico",
          action_url: `${appUrl}/admin/integrazioni`,
        },
      }),
    });
  } catch (mailErr) {
    console.error("[openwa-healthcheck] alert email failed:", mailErr);
  }

  return Response.json({ ok: true, status, healthy: false, alerted: true });
});
