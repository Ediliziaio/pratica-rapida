/**
 * openwa-admin — pannello admin per il gateway OpenWA (whatsapp-web.js)
 *
 * Proxy sicuro tra la UI admin (/admin/integrazioni) e il server OpenWA:
 * la API key OpenWA resta nei secrets edge, mai esposta al browser.
 *
 * Endpoints (POST con `action` nel body):
 *  - "status": stato sessione (connected/qr_ready/...), telefono collegato,
 *              presenza secrets, raggiungibilità server
 *  - "qr":     QR code (data-url PNG) da scansionare per collegare il numero
 *  - "restart": stop + start della sessione (per ri-generare il QR o
 *              riconnettere dopo un logout)
 *
 * Tutte le route richiedono super_admin (stesso pattern di whatsapp-meta-sync).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";
import { getOpenWAConfig, resolveSessionId } from "../_shared/openwa.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function requireSuperAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: hasRole } = await admin.rpc("has_role" as never, {
    _user_id: user.id,
    _role: "super_admin",
  });
  return hasRole ? user.id : null;
}

// Config OpenWA: usa lo stesso getter del percorso di invio (include
// sessionName, necessario per risolvere la sessione per nome).
type OpenWACfg = NonNullable<ReturnType<typeof getOpenWAConfig>>;

async function callOpenWA(
  cfg: OpenWACfg,
  method: "GET" | "POST",
  path: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api${path}`, {
      method,
      headers: { "X-API-Key": cfg.apiKey, "Content-Type": "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: { error: `Server OpenWA irraggiungibile: ${e instanceof Error ? e.message : String(e)}` },
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await requireSuperAdmin(req);
  if (!userId) return json({ error: "Non autorizzato (richiesto super_admin)" }, 403);

  let payload: { action?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const secrets = {
    WA_PROVIDER: Deno.env.get("WA_PROVIDER") ?? "meta",
    OPENWA_BASE_URL: !!Deno.env.get("OPENWA_BASE_URL"),
    OPENWA_API_KEY: !!Deno.env.get("OPENWA_API_KEY"),
    OPENWA_SESSION_ID: !!Deno.env.get("OPENWA_SESSION_ID"),
    OPENWA_WEBHOOK_SECRET: !!Deno.env.get("OPENWA_WEBHOOK_SECRET"),
  };
  const cfg = getOpenWAConfig();

  // L'ID sessione in OPENWA_SESSION_ID cambia a ogni riavvio del container
  // OpenWA: usarlo fisso fa fallire status/qr/restart con 404 "not found"
  // (è la causa dell'errore "Errore riavvio: not found"). Risolviamo l'ID
  // REALE per nome, come fa già il percorso di invio (resolveSessionId).
  // force=true: le azioni admin sono rare, meglio sempre fresco.
  const sid = cfg ? await resolveSessionId(cfg, true) : "";

  try {
    switch (payload.action) {
      case "status": {
        if (!cfg) {
          return json({ secrets, reachable: false, session: null, error: "Secrets OpenWA mancanti" });
        }
        const res = await callOpenWA(cfg, "GET", `/sessions/${sid}`);
        // Auto-recovery: se la sessione risulta disconnessa (es. l'utente ha
        // scollegato il dispositivo dal telefono), riavviala subito così il
        // QR ricompare nel pannello senza intervento manuale. Lo start su
        // una sessione già in avvio risponde 400 → ignorato.
        const st = String(res.body.status ?? "").toLowerCase();
        if (res.ok && ["disconnected", "stopped", "failed", "auth_failed"].includes(st)) {
          callOpenWA(cfg, "POST", `/sessions/${sid}/start`).catch(() => {});
          (res.body as Record<string, unknown>).status = "initializing";
        }
        return json({
          secrets,
          reachable: res.status !== 0,
          session: res.ok
            ? {
                id: res.body.id,
                name: res.body.name,
                status: res.body.status,
                phone: res.body.phone ?? null,
                pushName: res.body.pushName ?? null,
                connectedAt: res.body.connectedAt ?? null,
              }
            : null,
          error: res.ok ? null : ((res.body.error as string) ?? (res.body.message as string) ?? `HTTP ${res.status}`),
          webhook_url: `${SUPABASE_URL}/functions/v1/openwa-webhook`,
        });
      }

      case "qr": {
        if (!cfg) return json({ error: "Secrets OpenWA mancanti" }, 400);
        const res = await callOpenWA(cfg, "GET", `/sessions/${sid}/qr`);
        const qr = (res.body.qrCode as string | undefined)
          ?? ((res.body.data as { image?: string } | undefined)?.image);
        if (!qr) {
          return json({
            qr: null,
            error: (res.body.error as string) ?? (res.body.message as string)
              ?? "QR non disponibile (sessione già connessa o non avviata)",
          });
        }
        return json({ qr });
      }

      case "restart": {
        if (!cfg) return json({ error: "Secrets OpenWA mancanti" }, 400);
        await callOpenWA(cfg, "POST", `/sessions/${sid}/stop`);
        const res = await callOpenWA(cfg, "POST", `/sessions/${sid}/start`);
        // 404 anche sull'ID risolto = nessuna sessione con quel nome sul
        // gateway (container ripartito senza sessione). Messaggio chiaro
        // invece del criptico "not found".
        const notFound = res.status === 404 || /not\s*found/i.test(String(res.body.error ?? res.body.message ?? ""));
        return json({
          success: res.ok,
          status: res.body.status ?? null,
          error: res.ok
            ? null
            : notFound
              ? "Nessuna sessione WhatsApp attiva sul server (il gateway è ripartito senza sessione). Va ricreata sul server OpenWA."
              : ((res.body.error as string) ?? (res.body.message as string) ?? `HTTP ${res.status}`),
        });
      }

      default:
        return json({ error: `Azione sconosciuta: ${payload.action}` }, 400);
    }
  } catch (err) {
    await reportError(err, { fn: "openwa-admin", action: payload.action });
    return json({ error: "Internal error" }, 500);
  }
});
