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

function getCfg() {
  const baseUrl = Deno.env.get("OPENWA_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("OPENWA_API_KEY");
  const sessionId = Deno.env.get("OPENWA_SESSION_ID");
  if (!baseUrl || !apiKey || !sessionId) return null;
  return { baseUrl, apiKey, sessionId };
}

async function callOpenWA(
  cfg: NonNullable<ReturnType<typeof getCfg>>,
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
  const cfg = getCfg();

  try {
    switch (payload.action) {
      case "status": {
        if (!cfg) {
          return json({ secrets, reachable: false, session: null, error: "Secrets OpenWA mancanti" });
        }
        const res = await callOpenWA(cfg, "GET", `/sessions/${cfg.sessionId}`);
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
        const res = await callOpenWA(cfg, "GET", `/sessions/${cfg.sessionId}/qr`);
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
        await callOpenWA(cfg, "POST", `/sessions/${cfg.sessionId}/stop`);
        const res = await callOpenWA(cfg, "POST", `/sessions/${cfg.sessionId}/start`);
        return json({
          success: res.ok,
          status: res.body.status ?? null,
          error: res.ok ? null : ((res.body.error as string) ?? (res.body.message as string) ?? `HTTP ${res.status}`),
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
