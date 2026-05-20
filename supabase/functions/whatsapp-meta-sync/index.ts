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

  // Casi di "template non trovato su questo WABA" — succedono spesso quando:
  //  - L'admin ha switchato WABA e i template del vecchio WABA sono ancora
  //    in DB ma non esistono sul WABA corrente.
  //  - Il template è già stato cancellato in passato.
  // In questi casi vogliamo cancellare comunque dal DB locale (hard delete)
  // per pulire orphans senza richiedere SQL diretto.
  const metaError = result?.error;
  const errMsg = (metaError?.message as string) ?? "";
  const errCode = metaError?.code;
  const isNotFound = res.status === 404
    || errCode === 100
    || /not found|does not exist|non esiste|invalid template/i.test(errMsg);

  if (!res.ok && !isNotFound) {
    return { success: false, error: errMsg || `HTTP ${res.status}` };
  }

  if (isNotFound) {
    // Hard delete dal DB — l'orphan non serve a niente
    await supabase
      .from("whatsapp_templates")
      .delete()
      .eq("meta_template_name", payload.name);
    return { success: true, db_only: true, reason: "template_not_on_meta" };
  }

  // Soft-delete in DB (delete riuscito su Meta, manteniamo storico)
  await supabase
    .from("whatsapp_templates")
    .update({ is_active: false, status: "DISABLED" })
    .eq("meta_template_name", payload.name);

  return { success: true };
}

/**
 * Action "debug_template_access": diagnostica server-side dei permessi
 * del token sul WABA corrente. Chiama 4 endpoint Meta progressivi e
 * ritorna ogni risposta + scope effettivi del token via /debug_token.
 *
 * Permette di capire ESATTAMENTE dove fallisce senza esporre token in
 * chat. Risultato sicuro per audit (token mai esposto in response).
 */
async function handleDebugTemplateAccess(): Promise<Record<string, unknown>> {
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  const APP_SECRET = Deno.env.get("WA_APP_SECRET");
  const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID");

  const diagnosis: Record<string, unknown> = {
    secrets_check: {
      WA_BUSINESS_ACCOUNT_ID: WABA_ID ? `set (${WABA_ID.length} chars, starts with "${WABA_ID.slice(0, 6)}...")` : "MISSING",
      WA_PHONE_NUMBER_ID: PHONE_NUMBER_ID ? `set (${PHONE_NUMBER_ID.length} chars, starts with "${PHONE_NUMBER_ID.slice(0, 6)}...")` : "MISSING",
      WA_ACCESS_TOKEN: ACCESS_TOKEN ? `set (${ACCESS_TOKEN.length} chars, starts with "${ACCESS_TOKEN.slice(0, 4)}...")` : "MISSING",
      WA_APP_SECRET: APP_SECRET ? `set (${APP_SECRET.length} chars)` : "MISSING",
    },
  };

  if (!WABA_ID || !ACCESS_TOKEN) {
    diagnosis.conclusion = "Secrets mancanti — controlla Supabase Edge Function Secrets";
    return diagnosis;
  }

  // Test 1: /me — token validity check (richiede solo accesso al token)
  try {
    const meRes = await fetch(`https://graph.facebook.com/v18.0/me`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    const meData = await meRes.json();
    diagnosis.test_1_me = {
      status: meRes.status,
      ok: meRes.ok,
      response: meRes.ok ? { id: (meData as { id?: string }).id, name: (meData as { name?: string }).name } : meData,
    };
  } catch (err) {
    diagnosis.test_1_me = { error: String(err) };
  }

  // Test 2: GET /{WABA_ID} — base WABA info (richiede whatsapp_business_messaging O management)
  try {
    const wabaRes = await fetch(
      `https://graph.facebook.com/v18.0/${WABA_ID}?fields=name,timezone_id,message_template_namespace`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const wabaData = await wabaRes.json();
    diagnosis.test_2_waba_info = {
      url: `https://graph.facebook.com/v18.0/${WABA_ID}?fields=name,...`,
      status: wabaRes.status,
      ok: wabaRes.ok,
      response: wabaData,
    };
  } catch (err) {
    diagnosis.test_2_waba_info = { error: String(err) };
  }

  // Test 3: GET /{WABA_ID}/message_templates — richiede whatsapp_business_management
  try {
    const tplRes = await fetch(
      `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?limit=1&fields=name`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const tplData = await tplRes.json();
    diagnosis.test_3_list_templates = {
      url: `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?limit=1`,
      status: tplRes.status,
      ok: tplRes.ok,
      response: tplData,
    };
  } catch (err) {
    diagnosis.test_3_list_templates = { error: String(err) };
  }

  // Test 4: /debug_token — scope effettivi del token (richiede APP_ID|APP_SECRET come app token)
  // Recupero APP_ID dal /me?fields=id (l'id è l'app_id quando il token è System User)
  try {
    // Per debug_token serve un "app access token" formato `APP_ID|APP_SECRET`.
    // Recuperiamo l'app_id dal token corrente
    const appRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const appData = (await appRes.json()) as { id?: string };
    const appId = appData.id;
    if (appId && APP_SECRET) {
      const debugRes = await fetch(
        `https://graph.facebook.com/v18.0/debug_token?input_token=${ACCESS_TOKEN}&access_token=${appId}|${APP_SECRET}`,
      );
      const debugData = await debugRes.json();
      diagnosis.test_4_token_scopes = {
        status: debugRes.status,
        ok: debugRes.ok,
        // Restituiamo SOLO i campi sicuri (no token raw)
        response: debugRes.ok
          ? {
              type: (debugData as { data?: { type?: string } }).data?.type,
              is_valid: (debugData as { data?: { is_valid?: boolean } }).data?.is_valid,
              expires_at: (debugData as { data?: { expires_at?: number } }).data?.expires_at,
              scopes: (debugData as { data?: { scopes?: string[] } }).data?.scopes,
              app_id: (debugData as { data?: { app_id?: string } }).data?.app_id,
            }
          : debugData,
      };
    } else {
      diagnosis.test_4_token_scopes = { skipped: "manca app_id o app_secret" };
    }
  } catch (err) {
    diagnosis.test_4_token_scopes = { error: String(err) };
  }

  // Test 5: GET /{PHONE_NUMBER_ID} — verifica che il token abbia accesso al
  // Phone Number specifico. Se ritorna #200 qui, l'errore #200 su /messages
  // è SPIEGATO: il token non ha `whatsapp_business_messaging` su questo PN.
  if (PHONE_NUMBER_ID) {
    try {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      );
      const phoneData = await phoneRes.json();
      diagnosis.test_5_phone_number_access = {
        url: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}?fields=verified_name,...`,
        status: phoneRes.status,
        ok: phoneRes.ok,
        response: phoneData,
      };
    } catch (err) {
      diagnosis.test_5_phone_number_access = { error: String(err) };
    }

    // Test 6: GET /{WABA_ID}/phone_numbers — lista i numeri del WABA. Serve
    // per capire se il PHONE_NUMBER_ID appartiene davvero a questo WABA o
    // a un altro (causa frequente di #200: numero su un WABA su cui il
    // System User non ha permessi).
    try {
      const numsRes = await fetch(
        `https://graph.facebook.com/v18.0/${WABA_ID}/phone_numbers`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      );
      const numsData = await numsRes.json();
      const dataArr = (numsData as { data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string }> }).data;
      const matchesWaba = Array.isArray(dataArr) && dataArr.some((n) => n.id === PHONE_NUMBER_ID);
      diagnosis.test_6_phone_belongs_to_waba = {
        url: `https://graph.facebook.com/v18.0/${WABA_ID}/phone_numbers`,
        status: numsRes.status,
        ok: numsRes.ok,
        phone_belongs_to_waba: matchesWaba,
        numbers_visible: dataArr?.map((n) => ({ id: n.id, display: n.display_phone_number, name: n.verified_name })) ?? numsData,
      };
    } catch (err) {
      diagnosis.test_6_phone_belongs_to_waba = { error: String(err) };
    }
  } else {
    diagnosis.test_5_phone_number_access = { skipped: "WA_PHONE_NUMBER_ID non settato" };
    diagnosis.test_6_phone_belongs_to_waba = { skipped: "WA_PHONE_NUMBER_ID non settato" };
  }

  // Test 7: GET /{WABA_ID}/subscribed_apps — verifica se la App che ha
  // generato il token è iscritta agli eventi del WABA. Senza subscription
  // l'App può LEGGERE ma non sempre INVIARE messaggi (Meta restituisce
  // #200 in send anche con token corretto se l'app non è subscribed).
  // È la causa più subdola di #200 quando tutti gli altri test passano.
  try {
    const subRes = await fetch(
      `https://graph.facebook.com/v18.0/${WABA_ID}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const subData = await subRes.json();
    const subArr = (subData as { data?: Array<{ whatsapp_business_api_data?: { id?: string; name?: string } }> }).data;
    diagnosis.test_7_app_subscribed = {
      url: `https://graph.facebook.com/v18.0/${WABA_ID}/subscribed_apps`,
      status: subRes.status,
      ok: subRes.ok,
      apps_count: Array.isArray(subArr) ? subArr.length : 0,
      apps: subArr?.map((a) => a.whatsapp_business_api_data) ?? subData,
    };
  } catch (err) {
    diagnosis.test_7_app_subscribed = { error: String(err) };
  }

  // Test 8: POST /{PHONE_NUMBER_ID}/messages con payload TEMPLATE su numero
  // ben-formato (E.164 italiano fittizio). Meta valida nell'ordine:
  //   1) auth → 401
  //   2) account permissions sul WABA → #10/#200
  //   3) recipient whitelist (se App in Dev mode) → #200
  //   4) template ownership/exists → #132001
  //   5) payload params → #132xxx
  //   6) recipient reale/opt-in → #131xxx
  //
  // V1 di questo test usava `to: "0000000000"` e text dummy → Meta bocciava
  // al passo 5 con #100 prima di arrivare ai permessi recipient, mascherando
  // i problemi di Dev mode / whitelist. V2 usa formato E.164 valido +
  // payload template, così se il send reale fallisce per Dev-mode anche il
  // probe lo fa, e possiamo dirlo chiaramente.
  if (PHONE_NUMBER_ID) {
    try {
      const dryRes = await fetch(
        `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: "393999999999",      // E.164 IT valido, numero inesistente
            type: "template",
            template: {
              name: "hello_world",   // template di default presente su ogni WABA test
              language: { code: "en_US" },
            },
          }),
        },
      );
      const dryData = await dryRes.json();
      const errCode = (dryData as { error?: { code?: number } }).error?.code;
      const errMsg = (dryData as { error?: { message?: string } }).error?.message;
      const errSubcode = (dryData as { error?: { error_subcode?: number } }).error?.error_subcode;
      const errUserMsg = (dryData as { error?: { error_user_msg?: string } }).error?.error_user_msg;
      diagnosis.test_8_send_permission_probe = {
        status: dryRes.status,
        ok: dryRes.ok,
        meta_error_code: errCode,
        meta_error_message: errMsg,
        meta_error_subcode: errSubcode,
        meta_error_user_msg: errUserMsg,
        // Interpretazione:
        // - 200 → ❌ Permission error (App in Dev mode + recipient non whitelist, OPPURE WABA permission rotto)
        // - 132001 → ✅ permessi OK, ma template `hello_world` non esiste su questo WABA (= il WABA è custom, ok)
        // - 131030 / 131026 → ✅ permessi OK, recipient non in whitelist (Dev mode) o non opt-in
        // - 131009 / 131047 → ✅ permessi OK, numero invalido (atteso)
        // - 100 → ❓ payload format error
        interpretation:
          errCode === 200
            ? "❌ #200 anche con probe → permessi send NON OK (App in Dev mode + recipient non whitelist, o WABA permission)"
            : errCode === 132001
              ? "✅ permessi OK (#132001 = `hello_world` non su questo WABA, atteso se è un WABA personalizzato)"
              : errCode === 131030 || errCode === 131026
                ? "❌ #" + errCode + " → App probabilmente in Dev mode: recipient non in whitelist `Meta for Developers → App → WhatsApp → API Setup → To`"
                : errCode === 131009 || errCode === 131047
                  ? "✅ permessi OK (#" + errCode + " = numero invalido/non opt-in, atteso)"
                  : errCode === 100
                    ? "❓ #100 payload format error: " + errMsg
                    : `❓ codice inatteso #${errCode}: ${errMsg}`,
      };
    } catch (err) {
      diagnosis.test_8_send_permission_probe = { error: String(err) };
    }
  } else {
    diagnosis.test_8_send_permission_probe = { skipped: "WA_PHONE_NUMBER_ID non settato" };
  }

  // Test 9: GET /{WABA_ID}/message_templates?name=compilazione_avvenuta
  // verifica che il template specifico che sta fallendo esista DAVVERO su
  // questo WABA (non solo nel DB locale, che potrebbe essere stale post
  // switch WABA). Se non esiste → spiega tutto, e Meta sta restituendo
  // #200 invece di #132001 perché il send con un template non-esistente
  // su un WABA può triggerare permission check prima di template check.
  try {
    const tplRes = await fetch(
      `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?name=compilazione_avvenuta&fields=name,status,language,category`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const tplData = await tplRes.json();
    const arr = (tplData as { data?: Array<{ name?: string; status?: string; language?: string; category?: string }> }).data;
    diagnosis.test_9_failing_template_exists = {
      template_name: "compilazione_avvenuta",
      url: `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?name=compilazione_avvenuta`,
      status: tplRes.status,
      found_on_waba: Array.isArray(arr) && arr.length > 0,
      template_details: arr,
      raw: tplRes.ok ? undefined : tplData,
    };
  } catch (err) {
    diagnosis.test_9_failing_template_exists = { error: String(err) };
  }

  // Conclusione automatica — ordine di priorità:
  // scopes → probe template send #200 → subscription → template esistenza → read access
  const t3 = diagnosis.test_3_list_templates as { ok?: boolean; response?: { error?: { message?: string; code?: number } } };
  const t4 = diagnosis.test_4_token_scopes as { response?: { scopes?: string[] } };
  const t5 = diagnosis.test_5_phone_number_access as { ok?: boolean; response?: { error?: { message?: string; code?: number } } };
  const t6 = diagnosis.test_6_phone_belongs_to_waba as { ok?: boolean; phone_belongs_to_waba?: boolean };
  const t7 = diagnosis.test_7_app_subscribed as { ok?: boolean; apps_count?: number };
  const t8 = diagnosis.test_8_send_permission_probe as { meta_error_code?: number; meta_error_message?: string; ok?: boolean };
  const t9 = diagnosis.test_9_failing_template_exists as { found_on_waba?: boolean; template_details?: Array<{ status?: string }> };

  const scopes = t4?.response?.scopes ?? [];
  const hasManagement = scopes.includes("whatsapp_business_management");
  const hasMessaging = scopes.includes("whatsapp_business_messaging");
  const sendProbe200 = t8?.meta_error_code === 200;

  if (!hasMessaging && scopes.length > 0) {
    diagnosis.conclusion = "❌ Il token NON ha lo scope `whatsapp_business_messaging` — è questa la causa dell'errore #200 in invio. Rigenera il Permanent Token su Business Manager → System Users assegnando ENTRAMBI i permessi: `whatsapp_business_messaging` E `whatsapp_business_management`.";
  } else if (!hasManagement && scopes.length > 0) {
    diagnosis.conclusion = "❌ Il token NON ha lo scope `whatsapp_business_management` — i template non sono leggibili/scrivibili. Rigenera il Permanent Token con entrambi gli scope.";
  } else if (sendProbe200) {
    // Send probe ha confermato #200 anche con un template valido + numero E.164.
    // È la causa esatta del fallimento del send reale dell'utente.
    if (t7 && t7.ok && (t7.apps_count ?? 0) === 0) {
      diagnosis.conclusion = "❌ Meta #200 sul probe + NESSUNA app subscribed al WABA. SOLUZIONE: vai su Meta for Developers → App → WhatsApp → Configuration → bottone 'Subscribe' (oltre alle altre cose già fatte). L'app deve essere subscribed AL WABA, non basta che il token sia valido.";
    } else {
      diagnosis.conclusion = "❌ Meta #200 sul probe template (numero E.164 valido, template `hello_world` standard). Sei al 99% in **DEVELOPMENT MODE**. SOLUZIONI: (A) [consigliata] Vai su Meta for Developers → App Settings → Basic → in alto vedi 'App Mode: Development' con switch → flippa su 'Live' (richiede Privacy Policy URL già configurata, hai già fatto). Da Dev a Live ci vogliono ~30 sec. (B) [workaround] Aggiungi il numero +393483467567 in Meta for Developers → App → WhatsApp → API Setup → sezione 'To' → bottone 'Manage phone number list'. In Dev mode solo i numeri lì elencati possono ricevere messaggi.";
    }
  } else if (t9 && t9.found_on_waba === false) {
    diagnosis.conclusion = "❌ Il template `compilazione_avvenuta` NON esiste su questo WABA. È un residuo nel DB locale di un WABA precedente. SOLUZIONE: vai su /admin/whatsapp-config tab Template → bottone 'Sincronizza con Meta' (cancella i template stale e riprende quelli reali). Poi ricrea il template `compilazione_avvenuta` su Meta Business Manager.";
  } else if (t9 && t9.template_details && t9.template_details[0]?.status && t9.template_details[0].status !== "APPROVED") {
    diagnosis.conclusion = `❌ Il template \`compilazione_avvenuta\` esiste sul WABA ma è in stato \`${t9.template_details[0].status}\` (non APPROVED). I template non APPROVED non sono inviabili. Vai su Meta Business Manager → WhatsApp Manager → Message Templates per vedere il motivo e ri-sottomettere.`;
  } else if (t6 && t6.ok && t6.phone_belongs_to_waba === false) {
    diagnosis.conclusion = "❌ Il `WA_PHONE_NUMBER_ID` NON appartiene al `WA_BUSINESS_ACCOUNT_ID` configurato. Controlla che PHONE_NUMBER_ID e WABA siano coerenti.";
  } else if (t5 && !t5.ok) {
    diagnosis.conclusion = `❌ Phone Number non accessibile: ${t5.response?.error?.message ?? JSON.stringify(t5.response)}`;
  } else if (t3?.ok && t5?.ok) {
    diagnosis.conclusion = `✅ Tutti i test passano — config Meta OK, template esiste e APPROVED, probe send template torna #${t8?.meta_error_code} (atteso). Se l'invio del template specifico fallisce ancora, è un problema del singolo destinatario (non opt-in / numero non valido in formato +39).`;
  } else if (t3?.response?.error?.message) {
    diagnosis.conclusion = `❌ Meta error su list_templates: ${t3.response.error.message}`;
  } else {
    diagnosis.conclusion = "❓ Risultato non chiaro — manda l'intero JSON a Claude per analisi";
  }

  return diagnosis;
}

/**
 * Action "purge_orphan_templates": cancella DAL DB i template che non
 * esistono più sul WABA Meta corrente. Utile dopo switch WABA o per
 * pulizia generale. NON chiama Meta API — solo housekeeping locale.
 */
async function handlePurgeOrphans(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const WABA_ID = Deno.env.get("WA_BUSINESS_ACCOUNT_ID");
  const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN");
  if (!WABA_ID || !ACCESS_TOKEN) return { success: false, error: "Secrets mancanti" };

  // 1. Fetch lista template dal WABA Meta corrente
  const metaRes = await fetch(
    `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates?fields=name,language&limit=200`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  );
  if (!metaRes.ok) {
    const data = await metaRes.json();
    return { success: false, error: data?.error?.message ?? `HTTP ${metaRes.status}` };
  }
  const metaData = await metaRes.json();
  const metaSet = new Set(
    ((metaData.data as Array<{ name: string; language: string }>) ?? [])
      .map((t) => `${t.name}::${t.language}`),
  );

  // 2. Confronta col DB
  const { data: dbTemplates } = await supabase
    .from("whatsapp_templates")
    .select("id, meta_template_name, language");

  if (!dbTemplates) return { success: true, purged: 0 };

  const orphans = (dbTemplates as Array<{ id: string; meta_template_name: string; language: string }>)
    .filter((t) => !metaSet.has(`${t.meta_template_name}::${t.language}`));

  // 3. Hard-delete gli orphans
  if (orphans.length > 0) {
    const ids = orphans.map((o) => o.id);
    const { error } = await supabase
      .from("whatsapp_templates")
      .delete()
      .in("id", ids);
    if (error) return { success: false, error: error.message };
  }

  return {
    success: true,
    purged: orphans.length,
    purged_names: orphans.map((o) => `${o.meta_template_name} (${o.language})`),
  };
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
      case "purge_orphan_templates":
        return json(await handlePurgeOrphans(supabase));
      case "debug_template_access":
        return json(await handleDebugTemplateAccess());
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
