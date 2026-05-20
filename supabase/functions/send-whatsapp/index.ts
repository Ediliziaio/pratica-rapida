import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WA_PHONE_NUMBER_ID",
  "WA_ACCESS_TOKEN",
];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[send-whatsapp] Missing env: ${k}`);
}

const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID")!;
const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

/**
 * Chiama Meta Graph API con retry esponenziale su errori transient.
 * Meta documenta 429 (rate limit) + 5xx come retry-safe. 4xx (es. token
 * invalid, recipient invalid) non sono retry-safe — fallisce subito.
 *
 * Backoff: 500ms, 1500ms, 3500ms (max 5.5s totali, ben sotto i 60s di
 * timeout edge function).
 */
async function callMetaWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<{ response: Response; result: Record<string, unknown>; attempts: number }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);
      const result = (await response.json()) as Record<string, unknown>;
      // Success
      if (response.ok) return { response, result, attempts: attempt };
      // Retry su 429 (rate limit) o 5xx (server transient)
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === maxRetries) {
        return { response, result, attempts: attempt };
      }
      // Backoff esponenziale: 500, 1500, 3500 ms
      const delay = 500 * (2 ** (attempt - 1)) + Math.random() * 200;
      console.warn(`[send-whatsapp] retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms (status=${response.status})`);
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      // Network error: retry
      lastError = err;
      if (attempt === maxRetries) throw err;
      const delay = 500 * (2 ** (attempt - 1));
      console.warn(`[send-whatsapp] network retry ${attempt}/${maxRetries} after ${delay}ms:`, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable: il loop sopra ritorna o throwa sempre
  throw lastError ?? new Error("retry loop exhausted");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: {
    to?: string;
    template_name?: string;
    language?: string;
    components?: unknown;
    practice_id?: string;
    // Per outbound da chat in-app: testo libero (richiede customer service window 24h)
    text_body?: string;
    // User che ha inviato (per audit chat)
    sent_by_user_id?: string;
    // Per outbound media: tipo + URL (signed Supabase Storage) + caption opzionale
    media_type?: "image" | "document" | "audio" | "video";
    media_url?: string;
    media_caption?: string;
    media_filename?: string; // solo per document
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Bad JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const {
    to, template_name, language, components, practice_id,
    text_body, sent_by_user_id,
    media_type, media_url, media_caption, media_filename,
  } = payload;

  if (!to || typeof to !== "string") {
    return new Response(JSON.stringify({ success: false, error: "Missing 'to'" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  // 3 modalità di invio (richiedono tutte la customer service window 24h
  // tranne template):
  //  - template: tradizionale, richiede `template_name`
  //  - text: testo libero, richiede `text_body`
  //  - media: allegato, richiede `media_type` + `media_url`
  const isMediaMode = !!media_url && !!media_type && !template_name;
  const isTextMode = !!text_body && !template_name && !isMediaMode;
  const isTemplateMode = !isTextMode && !isMediaMode;
  if (isTemplateMode && (!template_name || typeof template_name !== "string")) {
    return new Response(JSON.stringify({ success: false, error: "Missing template_name (or text_body / media_url)" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Normalizza il phone UNA volta (usato in più punti sotto).
  const phone = normalizePhone(to);

  // SERVER-SIDE customer service window check.
  // Meta vieta invio di text/media (non-template) oltre 24h dall'ultimo
  // inbound del cliente. La UI controlla già — questo è il fallback
  // server-side per impedire bypass via curl/client modificato.
  // Per template skippiamo il check (sono sempre consentiti).
  if (isTextMode || isMediaMode) {
    const { data: conv } = await supabase
      .from("whatsapp_conversations")
      .select("last_inbound_at")
      .eq("phone", phone)
      .maybeSingle();
    const lastInbound = conv?.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    const ageMs = Date.now() - lastInbound;
    if (!lastInbound || ageMs >= 24 * 3600 * 1000) {
      return new Response(JSON.stringify({
        success: false,
        error: "Customer service window chiusa (>24h dall'ultimo inbound). Usa un template approvato per riaprire la chat.",
        window_closed: true,
      }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  try {

  // (phone è già normalizzato sopra, prima del check finestra 24h)

  // Costruisce payload Meta in base alla modalità.
  let templatePayload: Record<string, unknown>;
  if (isMediaMode) {
    // Media payload: Meta accetta `link` (URL pubblico/signed) o `id`
    // (dopo upload diretto). Usiamo link → Meta scarica al volo dal
    // signed URL Supabase Storage.
    const mediaObj: Record<string, unknown> = { link: media_url };
    if (media_caption && (media_type === "image" || media_type === "video" || media_type === "document")) {
      mediaObj.caption = media_caption;
    }
    if (media_filename && media_type === "document") {
      mediaObj.filename = media_filename;
    }
    templatePayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: media_type,
      [media_type as string]: mediaObj,
    };
  } else if (isTextMode) {
    templatePayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text_body },
    };
  } else {
    templatePayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: template_name,
        language: { code: language ?? "it" },
        components: components ?? [],
      },
    };
  }

  const { response, result, attempts } = await callMetaWithRetry(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(templatePayload),
    },
  );

  const wa_message_id = (result.messages as Array<{ id?: string }> | undefined)?.[0]?.id;
  const error_message = (result.error as { message?: string } | undefined)?.message;
  const success = !!wa_message_id;

  // Costruisce una preview leggibile del body (per audit/contestazione):
  // serializza i parameters del primo body component, troncata a 500 char.
  // whatsapp_logs.body era sempre NULL prima — perdevamo il content esatto.
  let bodyPreview: string | null = null;
  if (isMediaMode) {
    const captionPart = media_caption ? ` — ${media_caption}` : "";
    const filenamePart = media_filename ? ` (${media_filename})` : "";
    bodyPreview = `[${media_type}${filenamePart}]${captionPart}`.slice(0, 480);
  } else if (isTextMode) {
    bodyPreview = (text_body ?? "").slice(0, 480);
  } else {
    try {
      const comps = (components as Array<{ type: string; parameters?: Array<{ type: string; text?: string }> }> | undefined) ?? [];
      const bodyComp = comps.find((c) => c.type === "body");
      if (bodyComp?.parameters) {
        bodyPreview = `[${template_name}] ` + bodyComp.parameters
          .map((p) => p.text ?? `<${p.type}>`)
          .join(" | ")
          .slice(0, 480);
      } else {
        bodyPreview = `[${template_name}]`;
      }
    } catch {
      bodyPreview = `[${template_name}]`;
    }
  }

  if (!success) {
    await reportError(new Error(`WhatsApp API failed after ${attempts} attempts: ${error_message ?? "no message id"}`), {
      fn: "send-whatsapp",
      template_name,
      practice_id,
      status: response.status,
      attempts,
      response: result,
    });

    // Detect configuration errors (token scaduto / invalido) e crea una
    // notifica per i super_admin così se ne accorgono subito invece di
    // scoprire i WA falliti scorrendo i log.
    // Pattern Meta: "Invalid OAuth access token - Cannot parse access token"
    //               "Error validating access token: Session has expired"
    //               "Access token has expired"
    const isTokenError = !!error_message && /oauth|access[_ ]?token|expired|session has expired/i.test(error_message);
    if (isTokenError) {
      try {
        // Throttle: massimo 1 alert ogni 6 ore per non spammare
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("tipo", "integration_error")
          .ilike("titolo", "%WhatsApp%")
          .gte("created_at", sixHoursAgo)
          .limit(1)
          .maybeSingle();
        if (!recent) {
          // Insert una notifica per ogni super_admin
          const { data: admins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "super_admin");
          if (admins && admins.length > 0) {
            await supabase.from("notifications").insert(
              admins.map((a) => ({
                user_id: a.user_id,
                tipo: "integration_error",
                titolo: "⚠️ WhatsApp non funziona",
                messaggio: `Token WhatsApp Business API scaduto/invalido. Errore: ${error_message?.slice(0, 200) ?? ""}. Aggiorna WA_ACCESS_TOKEN nei secrets Supabase Edge Functions.`,
                link: "/admin/impostazioni",
              })),
            );
          }
        }
      } catch (alertErr) {
        // non-blocking — il logging primario è già stato fatto
        console.warn("[send-whatsapp] notification insert failed:", alertErr);
      }
    }
  }

  if (practice_id) {
    await supabase.from("communication_log").insert({
      practice_id,
      channel: "whatsapp",
      direction: "outbound",
      recipient: phone,
      body_preview: bodyPreview ?? `Template: ${template_name}`,
      status: success ? "sent" : "failed",
      wa_message_id: wa_message_id ?? null,
      error_message: error_message ?? null,
    });
  }

  // Log su whatsapp_logs (pannello admin legacy) — popoliamo `body` con la
  // preview ricostruita dai parameters così l'audit ha visibilità sul content
  // reale, non solo sul nome del template.
  const resolvedMsgType = isMediaMode ? (media_type as string) : isTextMode ? "text" : "template";
  await supabase.from("whatsapp_logs").insert({
    client_id: null,
    pratica_id: practice_id ?? null,
    direction: "outbound",
    phone,
    message_type: resolvedMsgType,
    template_name: isTemplateMode ? template_name : null,
    body: bodyPreview,
    status: success ? "sent" : "failed",
    wa_message_id: wa_message_id ?? null,
  });

  // Chat thread (nuovo, Fase 2): popola whatsapp_conversations +
  // whatsapp_messages per la UI chat in-app. Upsert idempotente.
  try {
    const { data: conv } = await supabase
      .from("whatsapp_conversations")
      .upsert(
        {
          phone,
          ...(practice_id ? { practice_id } : {}),
        },
        { onConflict: "phone", ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (conv) {
      await supabase.from("whatsapp_messages").insert({
        conversation_id: conv.id,
        direction: "outbound",
        message_type: resolvedMsgType,
        body: isMediaMode ? (media_caption ?? null) : bodyPreview,
        template_name: isTemplateMode ? template_name : null,
        template_components: isTemplateMode ? (components ?? null) : null,
        media_url: isMediaMode ? media_url : null,
        media_mime_type: isMediaMode
          ? (media_type === "image" ? "image/*" : media_type === "document" ? "application/pdf" : media_type === "audio" ? "audio/*" : "video/*")
          : null,
        wa_message_id: wa_message_id ?? null,
        status: success ? "sent" : "failed",
        error_message: error_message ?? null,
        sent_by_user_id: sent_by_user_id ?? null,
        // Denormalize: practice_id viene dal payload (se chiamato da cron)
        // o dalla conversation esistente (se chiamato da chat in-app)
        practice_id: practice_id ?? null,
      });
    }
  } catch (chatErr) {
    // non-blocking: i log primari (communication_log + whatsapp_logs) sono
    // già stati scritti. La chat thread è "best-effort".
    console.warn("[send-whatsapp] chat thread insert failed:", chatErr);
  }

  return new Response(JSON.stringify({ success, wa_message_id }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
  } catch (err) {
    await reportError(err, { fn: "send-whatsapp", template_name, practice_id });
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
