/**
 * whatsapp-meta-sync — gestione integrazione Meta WhatsApp Business API
 *
 * Endpoints (POST con `action` nel body):
 *  - "status": ritorna lo stato della configurazione (secrets settati?
 *              token valido? webhook URL? business account info?)
 *  - "sync_templates": chiama Meta Graph API per pullare i template
 *              approvati e li upserta in `whatsapp_templates`
 *  - "test_send": invia un messaggio test (solo super_admin)
 *
 * Tutte le route richiedono che il chiamante sia super_admin.
 * Verifica auth via JWT del Supabase client (non service role).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[whatsapp-meta-sync] Missing env: ${k}`);
}

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

/**
 * Verifica che il chiamante sia super_admin. Ritorna user_id se OK,
 * altrimenti null. Usa il JWT dell'header Authorization (non service key).
 */
async function requireSuperAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  // Verifica ruolo super_admin
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: hasRole } = await admin.rpc("has_role" as never, {
    _user_id: user.id,
    _role: "super_admin",
  });
  return hasRole ? user.id : null;
}

interface MetaTemplate {
  id?: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: Array<{
    type: string;
    format?: string;
    text?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
  rejected_reason?: string;
}

/**
 * Action "status": chiama Meta /me + /WABA per verificare token valido e
 * mostrare info azienda. Ritorna anche presenza dei secret.
 */
async function handleStatus(): Promise<Record<string, unknown>> {
  const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  const APP_SECRET = Deno.env.get("WA_APP_SECRET");
  const VERIFY_TOKEN = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN");
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");

  const out: Record<string, unknown> = {
    secrets: {
      WA_PHONE_NUMBER_ID: !!PHONE_NUMBER_ID,
      WA_ACCESS_TOKEN: !!ACCESS_TOKEN,
      WA_APP_SECRET: !!APP_SECRET,
      WA_WEBHOOK_VERIFY_TOKEN: !!VERIFY_TOKEN,
      WA_BUSINESS_ACCOUNT_ID: !!WABA_ID,
    },
    webhook_url: `${SUPABASE_URL}/functions/v1/whatsapp-webhook`,
    business_account: null,
    phone_number: null,
    token_status: "unknown",
    token_error: null,
  };

  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    out.token_status = "missing_secrets";
    return out;
  }

  // Chiama Meta per verificare token + fetch phone number info
  try {
    const phoneRes = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const phoneData = await phoneRes.json();
    if (phoneRes.ok) {
      out.token_status = "valid";
      out.phone_number = phoneData;
    } else {
      out.token_status = "invalid";
      out.token_error = phoneData?.error?.message ?? `HTTP ${phoneRes.status}`;
    }
  } catch (err) {
    out.token_status = "network_error";
    out.token_error = err instanceof Error ? err.message : String(err);
  }

  // WABA info (opzionale, richiede WA_BUSINESS_ACCOUNT_ID)
  if (WABA_ID && out.token_status === "valid") {
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v18.0/${WABA_ID}?fields=name,timezone_id,message_template_namespace`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      );
      if (wabaRes.ok) out.business_account = await wabaRes.json();
    } catch {
      // non-blocking
    }
  }

  return out;
}

/**
 * Action "sync_templates": fetch tutti i template da Meta + upsert in DB.
 * Richiede WA_BUSINESS_ACCOUNT_ID perché Meta espone i template a livello
 * di Business Account (non Phone Number).
 */
async function handleSyncTemplates(supabase: ReturnType<typeof createClient>): Promise<Record<string, unknown>> {
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");

  if (!WABA_ID) {
    return { success: false, error: "WA_BUSINESS_ACCOUNT_ID non configurato — impossibile fetch template da Meta" };
  }
  if (!ACCESS_TOKEN) {
    return { success: false, error: "WA_ACCESS_TOKEN non configurato" };
  }

  // Pagina i risultati con cursor (Meta espone fino a 100 per page)
  const templates: MetaTemplate[] = [];
  let url: string | null = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=100`;
  let pages = 0;
  while (url && pages < 10) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    templates.push(...((data.data as MetaTemplate[]) ?? []));
    url = data.paging?.next ?? null;
    pages++;
  }

  // Upsert in DB. Per ogni template Meta:
  //  - estrae body_text dal componente BODY
  //  - estrae header_text/type da HEADER
  //  - estrae footer_text da FOOTER
  //  - estrae buttons da BUTTONS
  let upserted = 0;
  let errors = 0;
  for (const t of templates) {
    try {
      const components = t.components ?? [];
      const body = components.find((c) => c.type === "BODY");
      const header = components.find((c) => c.type === "HEADER");
      const footer = components.find((c) => c.type === "FOOTER");
      const buttons = components.find((c) => c.type === "BUTTONS");

      const row = {
        meta_template_name: t.name,
        meta_template_id: t.id ?? null,
        language: t.language,
        category: t.category ?? null,
        status: t.status,
        rejection_reason: t.rejected_reason ?? null,
        header_type: header?.format ?? null,
        header_text: header?.text ?? null,
        body_text: body?.text ?? "",
        footer_text: footer?.text ?? null,
        buttons: buttons?.buttons ?? [],
        meta_last_synced_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("whatsapp_templates")
        .upsert(row, { onConflict: "meta_template_name,language" });
      if (error) {
        console.error(`[sync_templates] upsert ${t.name}/${t.language} failed:`, error);
        errors++;
      } else {
        upserted++;
      }
    } catch (err) {
      console.error(`[sync_templates] template ${t.name} threw:`, err);
      errors++;
    }
  }

  return {
    success: true,
    synced: upserted,
    errors,
    total_fetched: templates.length,
  };
}

/**
 * Action "test_send": invia un template via la edge function send-whatsapp.
 * Sicuro per il super_admin (verificato sopra) — riusa il flow standard.
 */
async function handleTestSend(payload: { to?: string; template_name?: string; language?: string; components?: unknown }): Promise<Record<string, unknown>> {
  if (!payload.to || !payload.template_name) {
    return { success: false, error: "Mancano `to` o `template_name`" };
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: payload.to,
      template_name: payload.template_name,
      language: payload.language ?? "it",
      components: payload.components ?? [],
    }),
  });
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: solo super_admin
  const userId = await requireSuperAdmin(req);
  if (!userId) return json({ error: "forbidden: super_admin required" }, 403);

  let payload: { action?: string; [k: string]: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const action = payload.action;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    switch (action) {
      case "status":
        return json(await handleStatus());
      case "sync_templates":
        return json(await handleSyncTemplates(supabase));
      case "test_send":
        return json(await handleTestSend(payload as { to?: string; template_name?: string; language?: string; components?: unknown }));
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err) {
    await reportError(err, { fn: "whatsapp-meta-sync", action });
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
