import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[send-email] Missing env: ${k}`);
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = `Pratica Rapida <noreply@${Deno.env.get("EMAIL_FROM_DOMAIN") ?? "praticarapida.it"}>`;

// Numero telefonico per ruolo destinatario (#3 della checklist utente)
// Rivenditori → centralino interno 0398682691
// Clienti finali/privati → numero modulistica 0398682692
const PHONE_RESELLER  = "039 868 2691";
const PHONE_CLIENT    = "039 868 2692";
const SUPPORT_EMAIL   = "modulistica@praticarapida.it";

type RecipientType = "reseller" | "client";

/**
 * Mapping template trigger → destinatario, usato per scegliere il telefono
 * giusto nel footer auto-iniettato.
 *
 * - "client" → privati / clienti finali → 039 868 2692
 * - "reseller" → aziende rivenditrici → 039 868 2691
 * - "internal" → email staff interno (no footer pubblico)
 */
const TEMPLATE_RECIPIENT: Record<string, RecipientType | "internal"> = {
  // Cliente finale
  form_compilato:          "client",
  modulo_cliente_invio:    "client",
  modulo_cliente_reminder: "client",
  pratica_inviata:         "client",
  recensione:              "client",
  richiesta_form:          "client",
  sollecito_privato:       "client",

  // Rivenditore / azienda
  benvenuto_azienda:           "reseller",
  notifica_docs_mancanti:      "reseller",
  notifica_pratica_disponibile:"reseller",
  pratica_ricevuta:            "reseller",
  registrazione_azienda:       "reseller",
  sollecito_fornitore:         "reseller",
  recupera_password:           "reseller", // account portale = rivenditore in maggioranza

};

/** Footer comune con email modulistica + telefono per ruolo. */
function footer(recipientType: RecipientType = "client"): string {
  const phone = recipientType === "reseller" ? PHONE_RESELLER : PHONE_CLIENT;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
      <tr><td style="color:#6b7280;font-size:13px;line-height:1.6;">
        <strong style="color:#374151;">Servizio clienti Pratica Rapida</strong><br>
        <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f4f8b;text-decoration:none;">${SUPPORT_EMAIL}</a><br>
        LUN – VEN 9.00 – 18.00<br>
        <a href="tel:+39${phone.replace(/\s/g, '')}" style="color:#1f4f8b;text-decoration:none;">${phone}</a>
      </td></tr>
    </table>
  `;
}

/**
 * Inietta il footer (telefono per ruolo + email modulistica@) nell'HTML del
 * template, se non già presente. Idempotente: se l'HTML contiene già
 * "039 868" non duplica nulla.
 *
 * Strategia: cerca il footer copy "© ... Pratica Rapida · AEDIX" presente in
 * tutti i template e inserisce il blocco contatti PRIMA. Se non trova quel
 * marker, fallback: prepend prima della closing `</body>` finale.
 */
function injectFooter(html: string, template: string): string {
  const recipientType = TEMPLATE_RECIPIENT[template];
  // Skip template interni (notifiche staff) o template sconosciuti
  if (!recipientType || recipientType === "internal") return html;
  // Skip se l'HTML ha già un telefono — l'admin lo ha messo nel DB direttamente
  if (/039\s*868\s*269[12]/.test(html)) return html;

  const footerBlock = footer(recipientType);
  // Pattern 1: copyright row in fondo (standard di tutti i template DB)
  const copyMatch = html.match(/<tr><td[^>]*>\s*©[^<]*Pratica Rapida/i);
  if (copyMatch && copyMatch.index !== undefined) {
    // Trova la riga <tr> che apre il copyright e iniettiamo PRIMA
    const trStart = html.lastIndexOf("<tr>", copyMatch.index);
    if (trStart !== -1) {
      // Inserisco il footer come riga separata della stessa table
      const footerRow = `<tr><td style="padding:0 40px 24px;">${footerBlock}</td></tr>`;
      return html.slice(0, trStart) + footerRow + html.slice(trStart);
    }
  }
  // Fallback: prepend prima della closing </body>
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footerBlock}</body>`);
  }
  // Last resort: append in fondo
  return html + footerBlock;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLORS = {
  bg_header: "#1a1a2e",
  cta: "#e94560",
  text: "#333333",
};

function base(content: string, logoUrl = "") {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:${COLORS.bg_header};padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:${COLORS.text};line-height:1.6;">${content}</td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © ${new Date().getFullYear()} Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>`;
}

function cta(text: string, url: string) {
  return `<div style="text-align:center;margin:24px 0"><a href="${url}" style="background:${COLORS.cta};color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">${text}</a></div>`;
}

/**
 * Lista esplicita di tutti i template name riconosciuti da renderTemplate.
 * Serve a distinguere "template noto" da "template sconosciuto" in modo
 * affidabile prima di invocare il rendering, così possiamo fail-closed
 * quando un caller passa un template inesistente (era la causa delle
 * mail vuote "Notifica da Pratica Rapida" arrivate ai clienti).
 * MANTENERE IN SYNC con i `case` dello switch in renderTemplate qui sotto.
 */
const HARDCODED_TEMPLATES = new Set<string>([
  "pratica_ricevuta",
  "sollecito_privato",
  "sollecito_fornitore",
  "form_compilato",
  "pratica_inviata",
  "recensione",
  "benvenuto_azienda",
  "richiesta_form",
  "notifica_docs_mancanti",
  "notifica_pratica_disponibile",
]);

function renderTemplate(template: string, data: Record<string, string>): { subject: string; html: string } {
  const r = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");

  switch (template) {
    case "pratica_ricevuta":
      return {
        subject: r("Pratica ricevuta — {{cliente_nome}} {{cliente_cognome}}"),
        html: base(`
          <h2>Pratica ricevuta ✓</h2>
          <p>Ciao <strong>${r("{{nome}}")}</strong>,</p>
          <p>Abbiamo ricevuto la pratica per il cliente <strong>${r("{{cliente_nome}}")} ${r("{{cliente_cognome}}")}</strong>.</p>
          <p>La stiamo elaborando e ti aggiorneremo a breve.</p>
          ${data.link ? cta("Visualizza pratica", r("{{link}}")) : ""}
          <p>Per assistenza: <a href="mailto:modulistica@praticarapida.it">modulistica@praticarapida.it</a></p>
        `),
      };

    case "sollecito_privato":
      return {
        subject: "Manca poco! Completa la tua pratica ENEA",
        html: base(`
          <h2>Ciao ${r("{{nome}}")},</h2>
          <p>La tua pratica ENEA è quasi completata! Abbiamo bisogno di alcuni tuoi dati per procedere.</p>
          <p>Ci vogliono solo <strong>5 minuti</strong>.</p>
          ${cta("Compila il modulo ora", r("{{link}}"))}
          <p style="color:#888;font-size:13px;">Scadenza: entro 30 giorni dalla richiesta.</p>
        `),
      };

    case "sollecito_fornitore":
      return {
        subject: r("Aggiornamento pratica cliente {{cliente_nome}}"),
        html: base(`
          <h2>Aggiornamento pratica</h2>
          <p>Sono trascorsi <strong>${r("{{giorni}}")}</strong> giorni dall'apertura della pratica per il cliente
          <strong>${r("{{cliente_nome}}")} ${r("{{cliente_cognome}}")}</strong>.</p>
          <p>Stato attuale: <strong>${r("{{stato}}")}</strong></p>
          <p>Tentativi di contatto: <strong>${r("{{tentativi}}")}</strong></p>
          ${data.link ? cta("Apri pratica", r("{{link}}")) : ""}
        `),
      };

    case "form_compilato":
      return {
        subject: "Modulo compilato — pratica in lavorazione",
        html: base(`
          <h2>Grazie ${r("{{nome}}")}!</h2>
          <p>I tuoi dati sono stati ricevuti correttamente.</p>
          <p>La tua pratica <strong>${r("{{brand}}")}</strong> è ora in lavorazione. Ti contatteremo appena ci saranno aggiornamenti.</p>
        `),
      };

    case "pratica_inviata":
      return {
        subject: r("La tua pratica {{brand}} è stata completata"),
        html: base(`
          <h2>Pratica completata ✓</h2>
          <p>Buongiorno <strong>${r("{{nome}}")} ${r("{{cognome}}")}</strong>,</p>
          <p>In allegato troverà la <strong>Pratica chiusa ed accettata</strong>.</p>
          <p>Tutti gli allegati sono da stampare, firmare nel riquadro dedicato al cliente
          (mentre il riquadro riguardante l'asseverazione tecnica <strong>NON</strong> è da firmare)
          e sono pronti da esibire in fase di dichiarazione dei redditi.</p>
          <p>Rimaniamo ovviamente disponibili in caso di ulteriori delucidazioni
          ricordando che in caso di smarrimento tutta la documentazione è comunque
          conservata nei nostri server e disponibile.</p>
          <p>Grazie e buona giornata.</p>
          ${footer("client")}
        `),
      };

    case "recensione":
      return {
        subject: "Come è andata la tua pratica ENEA?",
        html: base(`
          <h2>La tua opinione conta!</h2>
          <p>Gentile <strong>${r("{{nome}}")}</strong>, ti chiediamo 1 minuto per valutare il servizio.</p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${[1,2,3,4,5].map(n => `
              <td style="text-align:center;padding:8px">
                <a href="${r("{{base_url}}")}/recensione/${data.token}?stelle=${n}"
                   style="display:inline-block;background:${COLORS.bg_header};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:18px;">
                  ${"⭐".repeat(n)}
                </a>
              </td>`).join("")}
          </tr></table>
        `),
      };

    // ── Benvenuto nuova azienda — credenziali di accesso ──────────────────────
    case "benvenuto_azienda":
      return {
        subject: "✅ Benvenuto su Pratica Rapida — Le tue credenziali di accesso",
        html: base(`
          <h2 style="margin-top:0;color:#1a1a2e;">Benvenuto su Pratica Rapida! 🎉</h2>
          <p>Ciao <strong>${r("{{ragione_sociale}}")}</strong>,</p>
          <p>Il tuo account è stato creato con successo. Puoi accedere al tuo pannello con le seguenti credenziali:</p>

          <table width="100%" cellpadding="0" cellspacing="0"
            style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:12px 18px;font-weight:bold;color:#555;width:32%;border-bottom:1px solid #eee;">🌐 Pannello</td>
              <td style="padding:12px 18px;border-bottom:1px solid #eee;">
                <a href="${r("{{login_url}}")}" style="color:#00843D;font-weight:bold;">pannello.praticarapida.it</a>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 18px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">📧 Email</td>
              <td style="padding:12px 18px;border-bottom:1px solid #eee;">${r("{{email}}")}</td>
            </tr>
            <tr>
              <td style="padding:12px 18px;font-weight:bold;color:#555;">🔑 Password</td>
              <td style="padding:12px 18px;font-family:monospace;font-size:15px;letter-spacing:1px;">${r("{{password}}")}</td>
            </tr>
          </table>

          <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:13px;color:#795548;">
            ⚠️ <strong>Consiglio:</strong> al primo accesso ti suggeriamo di cambiare la password dalle impostazioni del tuo profilo.
          </div>

          ${cta("Accedi ora →", r("{{login_url}}"))}

          <p style="color:#888;font-size:13px;margin-top:24px;">
            Per assistenza o domande: <a href="mailto:modulistica@praticarapida.it" style="color:#00843D;">modulistica@praticarapida.it</a><br>
            Oppure chiamaci al <a href="tel:+390398682691" style="color:#00843D;">+39 039 868 2691</a> (Lun-Ven 9:00-18:00)
          </p>
        `),
      };

    case "richiesta_form":
      // Messaggio 1 - initial form request to cliente finale, includes reseller name + prodotto
      return {
        subject: r("Compilazione modulo ENEA — {{prodotto}}"),
        html: base(`
          <h2>Ciao ${r("{{nome}}")},</h2>
          <p><strong>${r("{{reseller}}")}</strong> ci ha incaricati di gestire la tua pratica ENEA relativa all'installazione di <strong>${r("{{prodotto}}")}</strong> presso la tua abitazione.</p>
          <p>Per procedere, ti chiediamo di compilare il modulo di raccolta dati (richiede circa 5 minuti).</p>
          ${cta("Compila il modulo", r("{{link}}"))}
          <p style="color:#888;font-size:13px;">
            Per assistenza scrivi a <a href="mailto:modulistica@praticarapida.it" style="color:#888;">modulistica@praticarapida.it</a><br>
            oppure su WhatsApp (solo messaggi, no chiamate vocali).
          </p>
        `),
      };

    case "notifica_docs_mancanti":
      // Notifica A - email to reseller when practice moved to documenti_mancanti
      return {
        subject: r("Documentazione mancante — {{cliente_nome}} {{cliente_cognome}}"),
        html: base(`
          <h2>Documenti aggiuntivi richiesti</h2>
          <p>La pratica ENEA del cliente <strong>${r("{{cliente_nome}}")} ${r("{{cliente_cognome}}")}</strong> richiede documentazione aggiuntiva per poter procedere.</p>
          <p><strong>Documenti richiesti:</strong></p>
          <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;margin:12px 0;border-radius:0 6px 6px 0;white-space:pre-wrap;">${r("{{note}}")}</div>
          ${data.link ? cta("Apri la pratica nel gestionale", r("{{link}}")) : ""}
          <p style="color:#888;font-size:13px;">Per assistenza: <a href="mailto:modulistica@praticarapida.it" style="color:#888;">modulistica@praticarapida.it</a></p>
        `),
      };

    case "notifica_pratica_disponibile":
      // Notifica C - email to reseller when practice moved to da_inviare (available in archivio)
      return {
        subject: r("Pratica ENEA completata — {{cliente_nome}} {{cliente_cognome}}"),
        html: base(`
          <h2>Pratica completata ✓</h2>
          <p>Buongiorno,</p>
          <p>ti comunichiamo che la pratica del cliente <strong>${r("{{cliente_nome}}")} ${r("{{cliente_cognome}}")}</strong> è conclusa e già inviatagli.</p>
          <p>Nella tua area riservata troverai: pratica ENEA e certificazioni relative all'intervento.</p>
          <p>Grazie.</p>
          ${cta("Vai all'area riservata", r("{{app_url}}"))}
          ${footer("reseller")}
        `),
      };

    default:
      // FAIL-CLOSED: in passato qui si tornava un fallback "Notifica da Pratica
      // Rapida" con corpo vuoto, che faceva arrivare mail "tagliate" a tutti i
      // clienti quando un caller invocava send-email con un template name non
      // esistente (es. "onboarding_welcome", "sollecito_recensione"). Ora il
      // controllo a monte (HARDCODED_TEMPLATES + email_templates DB) rifiuta la
      // richiesta con un 400 prima di arrivare qui — questo throw è solo una
      // safety net per il caso teorico in cui le due liste si siano
      // disallineate.
      throw new Error(`unknown_template: ${template}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: {
    to?: string | string[];
    template?: string;
    data?: Record<string, string>;
    /** Optional attachments — passed straight to Resend `attachments[]`.
     *  content: base64 (string) or remote URL (string). */
    attachments?: Array<{ filename: string; content?: string; path?: string; content_type?: string }>;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Bad JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { to, template, data, attachments } = payload;

  // Validate 'to' — allow string or array, each must be a well-formed email
  const toList = Array.isArray(to) ? to : [to];
  const invalid = toList.some((addr) => typeof addr !== "string" || !EMAIL_RE.test(addr.trim()));
  if (!to || invalid) {
    return new Response(JSON.stringify({ success: false, error: "Invalid 'to' email" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (typeof template !== "string" || !template) {
    return new Response(JSON.stringify({ success: false, error: "Missing template" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {

  // ── 1) DB-first: prova a caricare il template da public.email_templates ─────
  let dbTemplate: { subject: string; html_body: string } | null = null;
  try {
    const { data: row } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("trigger_event", template)
      .eq("is_active", true)
      .maybeSingle();
    if (row?.html_body && row?.subject) {
      dbTemplate = { subject: row.subject, html_body: row.html_body };
    }
  } catch {
    // se il DB non risponde, fallback a renderTemplate hardcoded sotto
  }

  let subject: string;
  let html: string;
  if (dbTemplate) {
    const safeData: Record<string, string> = data ?? {};
    const r = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(safeData[k] ?? ""));
    subject = r(dbTemplate.subject);
    html = r(dbTemplate.html_body);
  } else if (HARDCODED_TEMPLATES.has(template)) {
    // ── 2) Fallback: rendering hardcoded (utile in caso di DB offline / template non seedato)
    ({ subject, html } = renderTemplate(template, data ?? {}));
  } else {
    // ── FAIL-CLOSED: template sconosciuto → non inviamo una mail vuota.
    // Loggiamo l'errore e ritorniamo 400 al caller, che decide se ritentare
    // con un template valido o silenziare l'errore. Questo previene la classe
    // di bug "Notifica da Pratica Rapida vuota" che colpiva i clienti quando
    // un'automation rule referenziava un template_id inesistente.
    await reportError(new Error(`send-email: unknown template "${template}"`), {
      fn: "send-email",
      template,
      to,
      reason: "template_not_found_in_db_and_hardcoded",
    });
    return new Response(JSON.stringify({
      success: false,
      error: `Unknown template "${template}". Add a row to public.email_templates with trigger_event="${template}" and is_active=true, or use one of the hardcoded templates.`,
    }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── 3) Inietta il footer "Servizio clienti Pratica Rapida" con il telefono
  //      per ruolo (rivenditori 039 868 2691, clienti 039 868 2692) e l'email
  //      modulistica@. Idempotente: skip se già presente nel template DB.
  html = injectFooter(html, template);

  const resendBody: Record<string, unknown> = { from: FROM_EMAIL, to, subject, html };
  if (attachments && attachments.length > 0) {
    resendBody.attachments = attachments.map((a) => ({
      filename: a.filename,
      ...(a.content ? { content: a.content } : {}),
      ...(a.path ? { path: a.path } : {}),
      ...(a.content_type ? { content_type: a.content_type } : {}),
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(resendBody),
  });

  const emailData = await res.json();
  const success = res.ok;

  if (!success) {
    await reportError(new Error(`Resend API failed: ${res.status}`), {
      fn: "send-email",
      template,
      status: res.status,
      response: emailData,
    });
  }

  const recipient = Array.isArray(to) ? to.join(",") : to;

  if (data?.practice_id) {
    // Salviamo trigger_event + template in metadata per dedup affidabile lato
    // process-automations (prima si faceva match testuale sul subject — fragile
    // e rotto quando il subject cambiava). Vedi process-automations dedup.
    const meta: Record<string, unknown> = { template };
    if (data?.trigger_event) meta.trigger_event = data.trigger_event;
    await supabase.from("communication_log").insert({
      practice_id: data.practice_id,
      channel: "email",
      direction: "outbound",
      recipient,
      subject,
      body_preview: html.slice(0, 200),
      status: success ? "sent" : "failed",
      resend_email_id: emailData?.id ?? null,
      error_message: !success ? JSON.stringify(emailData) : null,
      metadata: meta,
    });
  }

  // Log su email_logs (pannello admin)
  await supabase.from("email_logs").insert({
    client_id: data?.client_id ?? null,
    pratica_id: data?.practice_id ?? null,
    template_id: data?.template_id ?? null,
    to_email: recipient,
    subject,
    status: success ? "sent" : "failed",
    resend_id: emailData?.id ?? null,
  });

  return new Response(JSON.stringify({ success, id: emailData?.id }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
  } catch (err) {
    await reportError(err, { fn: "send-email", template, to });
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
