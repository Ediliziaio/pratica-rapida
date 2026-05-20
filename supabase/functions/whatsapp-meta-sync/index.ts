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
 * Action "create_template": crea un template su Meta + lo upserta in DB
 * in stato PENDING. Meta lo metterà in review e cambierà status via webhook
 * `message_template_status_update` (oppure a un sync successivo).
 *
 * Payload atteso:
 * {
 *   action: "create_template",
 *   template: {
 *     name: "sollecito_compilazione",
 *     category: "UTILITY",
 *     language: "it",
 *     components: [
 *       { type: "BODY", text: "Ciao {{1}}...", example: { body_text: [["Mario"]] } },
 *       { type: "FOOTER", text: "..." },
 *       { type: "HEADER", format: "TEXT", text: "..." }, // opzionale
 *       { type: "BUTTONS", buttons: [{ type: "URL", text: "Apri", url: "https://..." }] } // opzionale
 *     ]
 *   }
 * }
 */
async function handleCreateTemplate(
  supabase: ReturnType<typeof createClient>,
  payload: { template?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  if (!WABA_ID) return { success: false, error: "WA_BUSINESS_ACCOUNT_ID non configurato" };
  if (!ACCESS_TOKEN) return { success: false, error: "WA_ACCESS_TOKEN non configurato" };

  const tpl = payload.template;
  if (!tpl || typeof tpl !== "object") return { success: false, error: "Payload template mancante" };
  const name = (tpl as { name?: string }).name;
  const category = (tpl as { category?: string }).category;
  const language = (tpl as { language?: string }).language ?? "it";
  const components = (tpl as { components?: unknown }).components;
  if (!name || !category || !components) {
    return { success: false, error: "Mancano campi obbligatori: name, category, components" };
  }

  // Submit a Meta
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, category, language, components }),
    },
  );
  const result = await res.json();
  if (!res.ok) {
    return {
      success: false,
      error: result?.error?.message ?? `HTTP ${res.status}`,
      meta_response: result,
    };
  }

  // Estrazione componenti per upsert in DB (pattern simile a sync_templates)
  const comps = components as Array<{ type: string; format?: string; text?: string; buttons?: unknown }>;
  const body = comps.find((c) => c.type === "BODY");
  const header = comps.find((c) => c.type === "HEADER");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons = comps.find((c) => c.type === "BUTTONS");

  const { error: upsertErr } = await supabase
    .from("whatsapp_templates")
    .upsert(
      {
        meta_template_name: name,
        meta_template_id: result.id ?? null,
        language,
        category,
        status: result.status ?? "PENDING",
        header_type: header?.format ?? null,
        header_text: header?.text ?? null,
        body_text: body?.text ?? "",
        footer_text: footer?.text ?? null,
        buttons: (buttons?.buttons as unknown) ?? [],
        meta_last_synced_at: new Date().toISOString(),
      },
      { onConflict: "meta_template_name,language" },
    );
  if (upsertErr) {
    console.error("[create_template] upsert failed:", upsertErr);
    // non blocca — il template è già su Meta, riportiamo successo parziale
  }

  return {
    success: true,
    meta_template_id: result.id,
    meta_status: result.status,
    name,
    category,
  };
}

/**
 * Action "seed_default_templates": crea in batch i 5 template di base
 * preconfigurati per Pratica Rapida. Skippa quelli che già esistono su DB.
 */
async function handleSeedDefaultTemplates(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const defaults = getDefaultTemplates();
  const results: Array<{ name: string; success: boolean; error?: string; status?: string }> = [];

  // Check quali template esistono già in DB (skip per evitare conflict Meta)
  const names = defaults.map((d) => d.name);
  const { data: existing } = await supabase
    .from("whatsapp_templates")
    .select("meta_template_name")
    .in("meta_template_name", names);
  const existingSet = new Set((existing ?? []).map((r) => r.meta_template_name as string));

  for (const tpl of defaults) {
    if (existingSet.has(tpl.name)) {
      results.push({ name: tpl.name, success: true, status: "SKIPPED_EXISTS" });
      continue;
    }
    try {
      const res = await handleCreateTemplate(supabase, { template: tpl });
      results.push({
        name: tpl.name,
        success: !!res.success,
        error: res.success ? undefined : (res.error as string),
        status: res.success ? (res.meta_status as string) : "ERROR",
      });
    } catch (err) {
      results.push({
        name: tpl.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        status: "ERROR",
      });
    }
  }

  return {
    success: true,
    results,
    total: defaults.length,
    created: results.filter((r) => r.success && r.status !== "SKIPPED_EXISTS").length,
    skipped: results.filter((r) => r.status === "SKIPPED_EXISTS").length,
    failed: results.filter((r) => !r.success).length,
  };
}

/**
 * 5 template di base per Pratica Rapida. Tutti UTILITY (approval rapido Meta),
 * lingua italiana, body con placeholder {{N}} ed esempi obbligatori.
 *
 * Mapping intended:
 *  - sollecito_compilazione → days_waiting_7
 *  - sollecito_recensione   → recensione_7d_followup
 *  - modulo_cliente_enea    → notify-cliente (manuale)
 *  - pratica_ricevuta       → stage_changed (manuale, conferma ricezione)
 *  - pratica_completata     → stage_changed (manuale, chiusura pratica)
 */
function getDefaultTemplates(): Array<{
  name: string;
  category: string;
  language: string;
  components: Array<Record<string, unknown>>;
}> {
  return [
    {
      name: "sollecito_compilazione",
      category: "UTILITY",
      language: "it",
      components: [
        {
          type: "BODY",
          text: "Ciao {{1}}! 👋\n\nTi ricordiamo di compilare il modulo per la tua pratica ENEA. Puoi farlo in 5 minuti seguendo questo link:\n\n{{2}}\n\nHai ancora {{3}} per completare. Se hai bisogno di aiuto, rispondi a questo messaggio.\n\nGrazie!",
          example: { body_text: [["Mario", "https://app.praticarapida.it/form/abc123", "30 giorni"]] },
        },
        { type: "FOOTER", text: "Pratica Rapida - Edilizia.io" },
      ],
    },
    {
      name: "sollecito_recensione",
      category: "UTILITY",
      language: "it",
      components: [
        {
          type: "BODY",
          text: "Ciao {{1}}! 🌟\n\nLa tua pratica ENEA è stata completata con successo. Come è andata l'esperienza con noi?\n\nLa tua opinione conta tantissimo e ci aiuta a migliorare il servizio. Lascia una recensione veloce, ti ruba 30 secondi.",
          example: { body_text: [["Mario"]] },
        },
        { type: "FOOTER", text: "Pratica Rapida - Edilizia.io" },
      ],
    },
    {
      name: "modulo_cliente_enea",
      category: "UTILITY",
      language: "it",
      components: [
        {
          type: "BODY",
          text: "Ciao {{1}},\n\nper completare la tua pratica ENEA abbiamo bisogno di alcune informazioni. Compila il modulo in 5 minuti:\n\n{{2}}\n\nSe hai domande, rispondi pure a questo messaggio.\n\nGrazie,\nIl team di Pratica Rapida",
          example: { body_text: [["Mario", "https://app.praticarapida.it/form/abc123"]] },
        },
        { type: "FOOTER", text: "Pratica Rapida - Edilizia.io" },
      ],
    },
    {
      name: "pratica_ricevuta",
      category: "UTILITY",
      language: "it",
      components: [
        {
          type: "BODY",
          text: "Ciao {{1}},\n\nabbiamo ricevuto correttamente la tua pratica ENEA (rif. {{2}}). I nostri tecnici inizieranno la lavorazione nelle prossime ore.\n\nTi terremo aggiornato sullo stato. Per qualsiasi domanda rispondi pure qui.\n\nGrazie per averci scelto!",
          example: { body_text: [["Mario", "ENEA-2026-001234"]] },
        },
        { type: "FOOTER", text: "Pratica Rapida - Edilizia.io" },
      ],
    },
    {
      name: "pratica_completata",
      category: "UTILITY",
      language: "it",
      components: [
        {
          type: "BODY",
          text: "Ciao {{1}}! ✅\n\nLa tua pratica ENEA è stata completata e inviata con successo. Riceverai la conferma ufficiale via email entro 48 ore.\n\nGrazie per averci scelto. Per qualsiasi necessità futura siamo qui.",
          example: { body_text: [["Mario"]] },
        },
        { type: "FOOTER", text: "Pratica Rapida - Edilizia.io" },
      ],
    },
  ];
}

/**
 * Action "delete_template": elimina un template su Meta (richiede approval
 * Meta, può essere ri-creato successivamente con stesso nome). NB: in DB
 * resta lo storico per audit — toggliamo solo is_active=false.
 */
async function handleDeleteTemplate(
  supabase: ReturnType<typeof createClient>,
  payload: { name?: string; language?: string },
): Promise<Record<string, unknown>> {
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  if (!WABA_ID || !ACCESS_TOKEN) return { success: false, error: "Secrets mancanti" };
  if (!payload.name) return { success: false, error: "Manca `name`" };

  // Meta: DELETE /{waba_id}/message_templates?name=...
  const params = new URLSearchParams({ name: payload.name });
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?${params}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    },
  );
  const result = await res.json();
  if (!res.ok) return { success: false, error: result?.error?.message ?? `HTTP ${res.status}` };

  // Soft-delete in DB
  await supabase
    .from("whatsapp_templates")
    .update({ is_active: false, status: "DISABLED" })
    .eq("meta_template_name", payload.name);

  return { success: true };
}

/**
 * Action "list_phone_numbers": ritorna i numeri di telefono associati al
 * WABA. Permette all'admin di vedere Test Number + numeri di produzione
 * registrati, con quality rating e verification status.
 */
async function handleListPhoneNumbers(): Promise<Record<string, unknown>> {
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  if (!WABA_ID || !ACCESS_TOKEN) return { success: false, error: "Secrets mancanti" };

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,is_pin_enabled`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  );
  const data = await res.json();
  if (!res.ok) return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };

  return {
    success: true,
    phone_numbers: data.data ?? [],
    current_phone_id: Deno.env.get("WA_PHONE_NUMBER_ID"),
  };
}

/**
 * Action "request_phone_verification": invia un OTP via SMS o voice al
 * numero per la verifica iniziale (necessaria prima dell'attivazione su
 * WhatsApp Business). Richiede che il numero sia già stato aggiunto al
 * WABA da Meta Business Manager (non possiamo aggiungerlo via API:
 * richiede UI Meta).
 *
 * Payload: { phone_number_id, code_method: "SMS" | "VOICE", language: "it" }
 */
async function handleRequestPhoneVerification(
  payload: { phone_number_id?: string; code_method?: string; language?: string },
): Promise<Record<string, unknown>> {
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  if (!ACCESS_TOKEN) return { success: false, error: "WA_ACCESS_TOKEN non configurato" };
  if (!payload.phone_number_id) return { success: false, error: "Manca phone_number_id" };

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${payload.phone_number_id}/request_code`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code_method: payload.code_method ?? "SMS",
        language: payload.language ?? "it",
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };

  return { success: true, ...data };
}

/**
 * Action "verify_phone_otp": verifica il codice OTP ricevuto dal numero
 * (registra il numero su WhatsApp Business e lo rende usabile).
 *
 * Payload: { phone_number_id, code: "123456" }
 */
async function handleVerifyPhoneOtp(
  payload: { phone_number_id?: string; code?: string },
): Promise<Record<string, unknown>> {
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  if (!ACCESS_TOKEN) return { success: false, error: "WA_ACCESS_TOKEN non configurato" };
  if (!payload.phone_number_id || !payload.code) return { success: false, error: "Mancano phone_number_id o code" };

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${payload.phone_number_id}/verify_code`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: payload.code }),
    },
  );
  const data = await res.json();
  if (!res.ok) return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };

  return { success: true, ...data };
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
      case "create_template":
        return json(await handleCreateTemplate(supabase, payload as { template?: Record<string, unknown> }));
      case "seed_default_templates":
        return json(await handleSeedDefaultTemplates(supabase));
      case "delete_template":
        return json(await handleDeleteTemplate(supabase, payload as { name?: string; language?: string }));
      case "list_phone_numbers":
        return json(await handleListPhoneNumbers());
      case "request_phone_verification":
        return json(await handleRequestPhoneVerification(payload as { phone_number_id?: string; code_method?: string; language?: string }));
      case "verify_phone_otp":
        return json(await handleVerifyPhoneOtp(payload as { phone_number_id?: string; code?: string }));
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
