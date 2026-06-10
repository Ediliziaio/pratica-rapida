// ============================================================
// OpenWA client helper — provider alternativo a Meta Cloud API.
//
// OpenWA (https://github.com/rmyndharis/OpenWA) è un gateway
// self-hosted basato su whatsapp-web.js: il numero è collegato
// via QR code (come WhatsApp Web) e NON passa dal Cloud API Meta.
//
// Differenze chiave vs Meta che il chiamante deve conoscere:
//  - Nessuna customer service window 24h: si può inviare testo
//    libero in qualsiasi momento.
//  - Nessun concetto di template approvato: i template del
//    portale vengono renderizzati in testo semplice sostituendo
//    i placeholder {{n}} prima dell'invio.
//  - wa_message_id ha formato "true_<chatId>_<hash>" (non "wamid.").
//
// Env richieste (Supabase Edge Functions secrets):
//  - OPENWA_BASE_URL    es. https://openwa.example.com (NO slash finale)
//  - OPENWA_API_KEY     API_MASTER_KEY del server OpenWA
//  - OPENWA_SESSION_ID  id della sessione collegata (es. "sess_abc123")
// ============================================================

export interface OpenWAConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

export function getOpenWAConfig(): OpenWAConfig | null {
  const baseUrl = Deno.env.get("OPENWA_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("OPENWA_API_KEY");
  const sessionId = Deno.env.get("OPENWA_SESSION_ID");
  if (!baseUrl || !apiKey || !sessionId) return null;
  return { baseUrl, apiKey, sessionId };
}

/** Converte un numero E.164 (con o senza +) nel chatId whatsapp-web.js. */
export function toChatId(phone: string): string {
  return `${phone.replace(/\D/g, "")}@c.us`;
}

export interface OpenWASendResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
  status: number;
  raw: Record<string, unknown>;
}

async function callOpenWA(
  cfg: OpenWAConfig,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<OpenWASendResult> {
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/sessions/${cfg.sessionId}/messages/${endpoint}`,
      {
        method: "POST",
        headers: {
          "X-API-Key": cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // OpenWA risponde sia { messageId } top-level (versioni recenti) che
    // { data: { messageId } } (formato documentato) — supporta entrambi.
    const data = raw.data as { messageId?: string } | undefined;
    const messageId = (raw.messageId as string | undefined) ?? data?.messageId ?? null;
    const err = raw.error as { message?: string } | undefined;
    return {
      success: res.ok && !!messageId,
      messageId,
      error: res.ok && messageId
        ? null
        : ((typeof raw.message === "string" ? raw.message : undefined) ?? err?.message ?? `OpenWA HTTP ${res.status}`),
      status: res.status,
      raw,
    };
  } catch (e) {
    return {
      success: false,
      messageId: null,
      error: `OpenWA unreachable: ${e instanceof Error ? e.message : String(e)}`,
      status: 0,
      raw: {},
    };
  }
}

export function sendOpenWAText(cfg: OpenWAConfig, phone: string, text: string) {
  return callOpenWA(cfg, "send-text", { chatId: toChatId(phone), text });
}

export function sendOpenWAMedia(
  cfg: OpenWAConfig,
  phone: string,
  mediaType: "image" | "document" | "audio" | "video",
  mediaUrl: string,
  opts: { caption?: string; filename?: string } = {},
): Promise<OpenWASendResult> {
  const chatId = toChatId(phone);
  // OpenWA SendMediaMessageDto è PIATTO: { chatId, url, caption?, filename? }
  // — NON il formato annidato { image: { url } } dei docs.
  const endpoint = `send-${mediaType}`;
  const body: Record<string, unknown> = { chatId, url: mediaUrl };
  if (opts.caption && mediaType !== "audio") body.caption = opts.caption;
  if (opts.filename && mediaType === "document") body.filename = opts.filename;
  return callOpenWA(cfg, endpoint, body);
}

/**
 * Renderizza un template del portale in testo semplice per OpenWA.
 * Sostituisce {{1}}, {{2}}, ... con i parametri body estratti dai
 * `components` in formato Meta (gli stessi che il portale già passa
 * a send-whatsapp), così i chiamanti esistenti non cambiano.
 */
export function renderTemplateText(
  template: { header_text?: string | null; body_text: string; footer_text?: string | null },
  components: unknown,
): string {
  const comps = (components as Array<{ type?: string; parameters?: Array<{ type?: string; text?: string }> }> | undefined) ?? [];
  const bodyParams = comps.find((c) => c.type === "body")?.parameters ?? [];
  let body = template.body_text ?? "";
  bodyParams.forEach((p, i) => {
    body = body.replaceAll(`{{${i + 1}}}`, p.text ?? "");
  });
  const parts: string[] = [];
  if (template.header_text) parts.push(`*${template.header_text}*`);
  parts.push(body);
  if (template.footer_text) parts.push(`_${template.footer_text}_`);
  return parts.join("\n\n");
}
