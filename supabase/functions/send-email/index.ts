import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = `Pratica Rapida <noreply@${Deno.env.get("EMAIL_FROM_DOMAIN") ?? "pratica-rapida.it"}>`;

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
