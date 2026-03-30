import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = `Pratica Rapida <noreply@${Deno.env.get("EMAIL_FROM_DOMAIN") ?? "praticarapida.it"}>`;

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
    © ${new Date().getFullYear()} Pratica Rapida · AEDIX · <a href="{{UNSUB_LINK}}" style="color:#888;">Annulla iscrizione</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function cta(text: string, url: string) {
  return `<div style="text-align:center;margin:24px 0"><a href="${url}" style="background:${COLORS.cta};color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">${text}</a></div>`;
}

function renderTemplate(template: string, data: Record<string, string>): { subject: string; html: string } {
  const r = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");

  switch (template) {
    case "pratica_ricevuta":
      return {
        subject: r("Pratica ricevuta — {{nome}} {{cognome}}"),
        html: base(`
          <h2>Pratica ricevuta ✓</h2>
          <p>Ciao <strong>${r("{{nome}}")}</strong>,</p>
          <p>Abbiamo ricevuto la pratica per il cliente <strong>${r("{{cliente_nome}}")} ${r("{{cliente_cognome}}")}</strong>.</p>
          <p>La stiamo elaborando e ti aggiorneremo a breve.</p>
          ${data.link ? cta("Visualizza pratica", r("{{link}}")) : ""}
          <p>Per assistenza: <a href="mailto:supporto@pratica-rapida.it">supporto@pratica-rapida.it</a></p>
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
          <h2>Pratica completata! 🎉</h2>
          <p>Gentile <strong>${r("{{nome}}")} ${r("{{cognome}}")}</strong>,</p>
          <p>La tua pratica <strong>${r("{{brand}}")}</strong> è stata completata con successo.</p>
          <p>I documenti sono stati inviati via email.</p>
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

    // ── Support ticket: conferma all'utente ────────────────────────────────
    case "ticket_conferma":
      return {
        subject: r("✓ Ticket ricevuto — {{oggetto}}"),
        html: base(`
          <h2 style="margin-top:0">Ticket ricevuto ✓</h2>
          <p>Ciao <strong>${r("{{nome}}")}</strong>,</p>
          <p>Il tuo ticket di assistenza è stato ricevuto. Ti risponderemo entro <strong>24 ore lavorative</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:6px;overflow:hidden;">
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;width:28%;border-bottom:1px solid #eee">Oggetto</td>
              <td style="padding:10px 16px;border-bottom:1px solid #eee">${r("{{oggetto}}")}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Priorità</td>
              <td style="padding:10px 16px;border-bottom:1px solid #eee">${r("{{priorita}}")}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;vertical-align:top">Descrizione</td>
              <td style="padding:10px 16px;white-space:pre-wrap">${r("{{descrizione}}")}</td>
            </tr>
          </table>
          <p style="color:#666;font-size:13px;margin-top:24px">
            Per ulteriori informazioni: <a href="mailto:supporto@pratica-rapida.it" style="color:${COLORS.cta}">supporto@pratica-rapida.it</a>
          </p>
        `),
      };

    // ── Support ticket: notifica al team interno ────────────────────────────
    case "ticket_nuovo":
      return {
        subject: r("[TICKET] {{priorita_upper}} — {{oggetto}} ({{company}})"),
        html: base(`
          <h2 style="margin-top:0">Nuovo ticket di assistenza</h2>
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:6px;overflow:hidden;">
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;width:28%;border-bottom:1px solid #eee">Azienda</td>
              <td style="padding:10px 16px;border-bottom:1px solid #eee"><strong>${r("{{company}}")}</strong></td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Utente</td>
              <td style="padding:10px 16px;border-bottom:1px solid #eee">${r("{{nome}}")} &lt;${r("{{email}}")}&gt;</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Oggetto</td>
              <td style="padding:10px 16px;border-bottom:1px solid #eee">${r("{{oggetto}}")}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;border-bottom:1px solid #eee">Priorità</td>
              <td style="padding:10px 16px;border-bottom:1px solid #eee">
                <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold;
                  background:${r("{{priorita}}") === "alta" ? "#fee2e2" : r("{{priorita}}") === "normale" ? "#fef9c3" : "#f0fdf4"};
                  color:${r("{{priorita}}") === "alta" ? "#b91c1c" : r("{{priorita}}") === "normale" ? "#854d0e" : "#166534"}">
                  ${r("{{priorita_upper}}")}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;color:#555;vertical-align:top">Descrizione</td>
              <td style="padding:10px 16px;white-space:pre-wrap">${r("{{descrizione}}")}</td>
            </tr>
          </table>
          ${data.link ? cta("Gestisci nel pannello", r("{{link}}")) : ""}
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
            Per assistenza o domande: <a href="mailto:supporto@praticarapida.it" style="color:#00843D;">supporto@praticarapida.it</a><br>
            Oppure chiamaci al <a href="tel:+390398682691" style="color:#00843D;">+39 039 868 2691</a> (Lun-Ven 9:00-18:00)
          </p>
        `),
      };

    default:
      return { subject: "Notifica da Pratica Rapida", html: base(`<p>${r("{{message}}")}</p>`) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { to, template, data } = await req.json();
  const { subject, html } = renderTemplate(template, data ?? {});

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  const emailData = await res.json();
  const success = res.ok;

  if (data?.practice_id) {
    await supabase.from("communication_log").insert({
      practice_id: data.practice_id,
      channel: "email",
      direction: "outbound",
      recipient: to,
      subject,
      body_preview: html.slice(0, 200),
      status: success ? "sent" : "failed",
      resend_email_id: emailData?.id ?? null,
      error_message: !success ? JSON.stringify(emailData) : null,
    });
  }

  // Log su email_logs (pannello admin)
  await supabase.from("email_logs").insert({
    client_id: data?.client_id ?? null,
    pratica_id: data?.practice_id ?? null,
    template_id: data?.template_id ?? null,
    to_email: to,
    subject,
    status: success ? "sent" : "failed",
    resend_id: emailData?.id ?? null,
  });

  return Response.json({ success, id: emailData?.id });
});
