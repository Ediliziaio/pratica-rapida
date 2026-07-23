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
  /** Nome stabile della sessione (sopravvive ai restart). Default "praticarapida". */
  sessionName?: string;
}

export function getOpenWAConfig(): OpenWAConfig | null {
  const baseUrl = Deno.env.get("OPENWA_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("OPENWA_API_KEY");
  const sessionId = Deno.env.get("OPENWA_SESSION_ID");
  if (!baseUrl || !apiKey || !sessionId) return null;
  const sessionName = Deno.env.get("OPENWA_SESSION_NAME") ?? "praticarapida";
  return { baseUrl, apiKey, sessionId, sessionName };
}

// Cache module-level dell'ID sessione risolto (l'isolate Supabase si riusa per
// alcune invocazioni → evita una GET /sessions ad ogni invio). TTL 60s.
let _resolvedSid: string | null = null;
let _resolvedAt = 0;

/**
 * Risolve l'ID REALE della sessione attiva. OpenWA, a ogni restart del
 * container, PERDE il record sessione e ne crea uno con ID nuovo (le
 * credenziali WhatsApp persistono però nel volume). Affidarsi all'ID fisso
 * in OPENWA_SESSION_ID significherebbe rompere gli invii a ogni riavvio.
 *
 * Strategia: lista /api/sessions e scegli la sessione per NOME
 * (OPENWA_SESSION_NAME, default "praticarapida"); in mancanza, la prima
 * connessa; in ultima istanza l'ID configurato. Così l'integrazione
 * sopravvive ai riavvii senza dover aggiornare il secret.
 */
export async function resolveSessionId(cfg: OpenWAConfig, force = false): Promise<string> {
  const now = Date.now();
  if (!force && _resolvedSid && now - _resolvedAt < 60_000) return _resolvedSid;
  try {
    // Timeout: se il gateway è giù/lento questa è la PRIMA fetch → senza bound
    // appende la function fino al 546. Scaduto → fallback all'ID configurato.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/api/sessions`, {
        headers: { "X-API-Key": cfg.apiKey },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
    if (res.ok) {
      const list = (await res.json().catch(() => [])) as Array<{ id?: string; name?: string; status?: string }>;
      if (Array.isArray(list) && list.length > 0) {
        const byName = list.find((s) => s.name === cfg.sessionName);
        const connected = list.find((s) =>
          ["connected", "ready", "authenticated", "working"].includes(String(s.status ?? "").toLowerCase())
        );
        const chosen = byName?.id ?? connected?.id ?? list[0].id;
        if (chosen) {
          _resolvedSid = chosen;
          _resolvedAt = now;
          return chosen;
        }
      }
    }
  } catch {
    // rete/parse KO → fallback all'ID configurato
  }
  return cfg.sessionId;
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

// Timeout DURO sull'invio: se il gateway è lento o l'origine dietro il tunnel
// Cloudflare è giù, la fetch resta appesa finché Supabase killa la function
// (HTTP 546 WORKER_RESOURCE_LIMIT). Con AbortController ritorna invece un
// errore pulito e loggabile. 25s è ben sotto il limite wall-clock dell'edge.
const SEND_TIMEOUT_MS = 25000;

async function postOnce(
  cfg: OpenWAConfig,
  sid: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<OpenWASendResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `${cfg.baseUrl}/api/sessions/${sid}/messages/${endpoint}`,
      {
        method: "POST",
        headers: {
          "X-API-Key": cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      },
    );
  } catch (e) {
    // timeout (abort) o errore rete → errore chiaro invece di hang/546
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      success: false,
      messageId: null,
      error: aborted
        ? `OpenWA timeout: il gateway non ha risposto entro ${SEND_TIMEOUT_MS / 1000}s (container giù o tunnel non raggiungibile).`
        : `OpenWA unreachable: ${e instanceof Error ? e.message : String(e)}`,
      status: 0,
      raw: {},
    };
  } finally {
    clearTimeout(t);
  }
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
}

async function callOpenWA(
  cfg: OpenWAConfig,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<OpenWASendResult> {
  try {
    let sid = await resolveSessionId(cfg);
    let result = await postOnce(cfg, sid, endpoint, body);
    // Se la sessione non esiste (404 / "not found") l'ID in cache è stale
    // (container riavviato → nuovo ID). Ri-risolvi FORZANDO e ritenta una volta.
    if (!result.success && (result.status === 404 || /not\s*found/i.test(result.error ?? ""))) {
      sid = await resolveSessionId(cfg, true);
      result = await postOnce(cfg, sid, endpoint, body);
    }
    return result;
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

// ============================================================
// Risoluzione/validazione numero PRIMA dell'invio.
//
// Baileys (motore del gateway rmyndharis/OpenWA) NON garantisce che il
// `numero@c.us` costruito a mano da toChatId() sia il chatId reale del
// contatto: per i numeri "freddi" (mai avuta una chat col numero business)
// l'invio FALLISCE o non consegna in silenzio. Il send endpoint accetta
// anche numeri non-WhatsApp (risponde comunque 2xx/500 opaco senza
// messageId), quindi l'unico modo affidabile è validare prima con
//   GET /api/sessions/{sid}/contacts/check/{numero}
// che restituisce { number, exists, whatsappId } dove whatsappId è l'id
// canonico nel formato nativo del motore → è ciò che va usato come chatId.
// È il metodo raccomandato dalla doc del gateway stesso.
// ============================================================

/** Cache in-memory dei check numero: getNumberId interroga i server WhatsApp
 * ed è rate-limited. Positivi validi a lungo (un numero raramente lascia WA),
 * negativi più brevi (un numero può iscriversi dopo). L'isolate Supabase è
 * effimero → best-effort per ridurre check ripetuti sullo stesso numero. */
const _numCache = new Map<string, { chatId: string | null; at: number }>();
const NUM_TTL_OK = 24 * 60 * 60 * 1000;
const NUM_TTL_NO = 60 * 60 * 1000;

export interface ResolvedTarget {
  /** chatId canonico da usare per l'invio, o null se il numero non è su WhatsApp */
  chatId: string | null;
  /** true = numero confermato NON su WhatsApp → NON inviare */
  notOnWhatsApp: boolean;
  /** true = il gateway ha risposto al check; false = endpoint assente/irraggiungibile → fallback non verificato */
  verified: boolean;
}

/**
 * Valida/risolve il numero col gateway prima dell'invio. Difensivo: se
 * l'endpoint contacts/check non esiste (gateway più vecchio) o è
 * irraggiungibile, ricade sul chatId ingenuo (verified=false) per non
 * regredire rispetto al comportamento attuale.
 */
export async function resolveSendTarget(cfg: OpenWAConfig, phone: string): Promise<ResolvedTarget> {
  const digits = phone.replace(/\D/g, "");
  const cached = _numCache.get(digits);
  if (cached) {
    const ttl = cached.chatId ? NUM_TTL_OK : NUM_TTL_NO;
    if (Date.now() - cached.at < ttl) {
      return { chatId: cached.chatId, notOnWhatsApp: cached.chatId === null, verified: true };
    }
  }
  // Timeout DURO sulla check: getNumberId su Baileys interroga i server
  // WhatsApp e può essere lento/appendersi. Senza AbortController la fetch
  // resta appesa finché Supabase killa la function (HTTP 546
  // WORKER_RESOURCE_LIMIT). Se scade → fallback all'invio non verificato.
  const CHECK_TIMEOUT_MS = 7000;
  try {
    const sid = await resolveSessionId(cfg);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `${cfg.baseUrl}/api/sessions/${sid}/contacts/check/${digits}`,
        { headers: { "X-API-Key": cfg.apiKey }, signal: ctrl.signal },
      );
    } finally {
      clearTimeout(t);
    }
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { exists?: boolean; whatsappId?: string | null };
      // Numero su WA → usa whatsappId canonico (fallback al @c.us ingenuo se
      // il gateway non lo restituisce). Non su WA → chatId null (blocca invio).
      const chatId = body.exists ? (body.whatsappId ?? toChatId(phone)) : null;
      _numCache.set(digits, { chatId, at: Date.now() });
      return { chatId, notOnWhatsApp: !body.exists, verified: true };
    }
  } catch {
    // timeout/rete/parse KO → fallback non verificato sotto
  }
  return { chatId: toChatId(phone), notOnWhatsApp: false, verified: false };
}

/** Risultato standard per numero confermato non su WhatsApp: fallimento
 * chiaro invece del 500 opaco del gateway. */
function notOnWhatsAppResult(phone: string): OpenWASendResult {
  const digits = phone.replace(/\D/g, "");
  return {
    success: false,
    messageId: null,
    error: `Numero non su WhatsApp: ${digits} non risulta un account WhatsApp registrato (verificato via contacts/check).`,
    status: 422,
    raw: { code: "NUMBER_NOT_ON_WHATSAPP", number: digits },
  };
}

export async function sendOpenWAText(cfg: OpenWAConfig, phone: string, text: string): Promise<OpenWASendResult> {
  const target = await resolveSendTarget(cfg, phone);
  if (target.notOnWhatsApp) return notOnWhatsAppResult(phone);
  return callOpenWA(cfg, "send-text", { chatId: target.chatId, text });
}

export async function sendOpenWAMedia(
  cfg: OpenWAConfig,
  phone: string,
  mediaType: "image" | "document" | "audio" | "video",
  mediaUrl: string,
  opts: { caption?: string; filename?: string } = {},
): Promise<OpenWASendResult> {
  const target = await resolveSendTarget(cfg, phone);
  if (target.notOnWhatsApp) return notOnWhatsAppResult(phone);
  // OpenWA SendMediaMessageDto è PIATTO: { chatId, url, caption?, filename? }
  // — NON il formato annidato { image: { url } } dei docs.
  const endpoint = `send-${mediaType}`;
  const body: Record<string, unknown> = { chatId: target.chatId, url: mediaUrl };
  if (opts.caption && mediaType !== "audio") body.caption = opts.caption;
  if (opts.filename && mediaType === "document") body.filename = opts.filename;
  return callOpenWA(cfg, endpoint, body);
}

/**
 * Fallback per i template DI SISTEMA invocati dal codice (on-practice-created,
 * on-stage-changed) ma non presenti in whatsapp_templates. Senza questi, con
 * provider OpenWA l'invio fallirebbe con "template non trovato". Il DB ha
 * SEMPRE la precedenza: se l'admin crea il template con lo stesso nome,
 * viene usato quello.
 */
export const OPENWA_TEMPLATE_FALLBACKS: Record<string, { header_text?: string; body_text: string; footer_text?: string }> = {
  contatta_cliente: {
    body_text:
      "Ciao {{1}}! 👋\n\nSiamo *Pratica Rapida*: per conto di *{{2}}* gestiamo la pratica ENEA del tuo acquisto.\n\nPer completarla ci servono alcuni dati — compila il modulo qui sotto, bastano 5 minuti:\n\n👉 {{3}}\n\nGrazie!",
  },
  conferma_dati_ricevuti: {
    body_text:
      "Ciao {{1}}! ✅\n\nAbbiamo ricevuto correttamente i tuoi dati: la tua pratica ENEA è ora *in lavorazione*.\n\nTi aggiorneremo appena completata. Grazie per la fiducia!",
  },
  // Usato da process-automations (recensione_7d_followup, pratica_pagata) sul
  // canale WhatsApp. 2 parametri: {{1}} nome, {{2}} email destinazione.
  pratica_inviata_recensione: {
    body_text:
      "Ciao {{1}}! ✅\n\nLa tua pratica ENEA è stata *completata e inviata*: trovi conferma e ricevuta all'indirizzo {{2}}.\n\nSe ti va, ci aiuteresti con una breve recensione sulla tua esperienza con *Pratica Rapida*? Bastano 30 secondi e per noi vale tantissimo. 🙏\n\nGrazie di cuore!",
  },
  // notify-cliente → primo invio modulo al cliente. {{1}} nome, {{2}} link form.
  modulo_cliente_enea: {
    body_text:
      "Gentile {{1}}, 👋\n\nper completare la sua pratica ENEA la invitiamo a compilare il modulo con i dati richiesti:\n\n👉 {{2}}\n\nÈ semplice e veloce. Per qualsiasi dubbio può rispondere direttamente a questo messaggio. Grazie!\n\n_Servizio Clienti Pratica Rapida_",
  },
  // on-stage-changed (da_inviare) → notifica chiusura. {{1}} nome.
  pratica_completata: {
    body_text:
      "Gentile {{1}}, ✅\n\nla sua pratica ENEA è stata *completata e inviata* con successo.\n\nGrazie per la fiducia!\n_Servizio Clienti Pratica Rapida_",
  },
  // process-automations (days_waiting_7) → sollecito. {{1}} nome, {{2}} link form, {{3}} durata attesa.
  sollecito_compilazione: {
    body_text:
      "Gentile {{1}}, le ricordiamo di completare il modulo necessario per la sua pratica ENEA — risulta in attesa da {{3}}.\n\nPuò compilarlo qui:\n👉 {{2}}\n\nUna volta inviati i dati procederemo con l'elaborazione entro 24/48h. Per dubbi può rispondere a questo messaggio.\n\n_Servizio Clienti Pratica Rapida_",
  },
};

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
