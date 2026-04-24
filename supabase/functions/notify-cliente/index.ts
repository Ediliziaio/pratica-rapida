import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = `Pratica Rapida <noreply@${Deno.env.get("EMAIL_FROM_DOMAIN") ?? "praticarapida.it"}>`;
const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID")!;
const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.praticarapida.it";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIPO_LABEL: Record<string, string> = {
  "schermature-solari": "Schermature Solari",
  "infissi": "Infissi",
  "impianto-termico": "Impianto Termico",
  "vepa": "VEPA – Vetrate Panoramiche",
};

const TIPO_PATH: Record<string, string> = {
  "schermature-solari": "schermature-solari",
  "infissi": "modulo-infissi",
  "impianto-termico": "impianto-termico",
  "vepa": "modulo-vepa",
};

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

async function sendEmail(
  to: string,
  nome: string,
  moduloUrl: string,
  tipoModulo: string,
  isReminder: boolean,
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>
) {
  const triggerEvent = isReminder ? "modulo_cliente_reminder" : "modulo_cliente_invio";
  const vars = {
    nome,
    link: moduloUrl,
    tipo_modulo: TIPO_LABEL[tipoModulo] ?? tipoModulo,
  };

  // Try to load template from DB
  const { data: tmpl } = await supabase
    .from("email_templates")
    .select("subject, html_body")
    .eq("trigger_event", triggerEvent)
    .eq("is_active", true)
    .maybeSingle();

  const subject = tmpl?.subject
    ? applyVars(tmpl.subject, vars)
    : isReminder ? "Reminder: completa il modulo ENEA" : "Compila il tuo modulo ENEA";

  const html = tmpl?.html_body
    ? applyVars(tmpl.html_body, vars)
    : `<p>Ciao ${nome}, compila il modulo: <a href="${moduloUrl}">${moduloUrl}</a></p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return await res.json();
}

async function sendWhatsApp(phone: string, nome: string, moduloUrl: string) {
  const normalizedPhone = normalizePhone(phone);
  // Uses a free-form text message (requires 24h customer service window)
  // For template-based, use the template flow in send-whatsapp function
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedPhone,
        type: "template",
        template: {
          name: "modulo_cliente_enea",
          language: { code: "it" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: nome },
                { type: "text", text: moduloUrl },
              ],
            },
          ],
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp error: ${err}`);
  }
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { token_id, channel, is_reminder = false } = await req.json() as {
      token_id: string;
      channel: "email" | "whatsapp" | "both";
      is_reminder?: boolean;
    };

    if (!token_id || !channel) {
      return new Response(JSON.stringify({ error: "token_id e channel sono obbligatori" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch token + pratica + cliente_finale
    const { data: token, error: tokenErr } = await supabase
      .from("client_form_tokens")
      .select(`
        id, token, tipo_modulo, stato, expires_at, reminder_count,
        pratiche(id, titolo, dati_pratica, clienti_finali(nome, cognome, email, telefono))
      `)
      .eq("id", token_id)
      .single();

    if (tokenErr || !token) {
      return new Response(JSON.stringify({ error: "Token non trovato" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (token.stato === "compilato") {
      return new Response(JSON.stringify({ error: "Modulo già compilato" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (new Date(token.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Token scaduto" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const pratica = token.pratiche as any;
    const cliente = pratica?.clienti_finali as any;
    const nome = cliente ? `${cliente.nome} ${cliente.cognome}`.trim() : "Cliente";
    const email = cliente?.email as string | null;
    const telefono = cliente?.telefono as string | null;
    const tipoPath = TIPO_PATH[token.tipo_modulo] ?? "modulo";
    const moduloUrl = `${APP_URL}/${tipoPath}/${token.token}`;
    const results: Record<string, unknown> = {};

    // Send email
    if ((channel === "email" || channel === "both") && email) {
      results.email = await sendEmail(email, nome, moduloUrl, token.tipo_modulo, is_reminder, supabase);
    } else if ((channel === "email" || channel === "both") && !email) {
      results.email = { skipped: "nessuna email disponibile" };
    }

    // Send WhatsApp
    if ((channel === "whatsapp" || channel === "both") && telefono) {
      results.whatsapp = await sendWhatsApp(telefono, nome, moduloUrl);
    } else if ((channel === "whatsapp" || channel === "both") && !telefono) {
      results.whatsapp = { skipped: "nessun telefono disponibile" };
    }

    // Update token state
    const updates: Record<string, unknown> = { stato: "inviato" };
    if (!token.sent_at) updates.sent_at = new Date().toISOString();
    if (is_reminder) {
      updates.reminder_count = (token.reminder_count ?? 0) + 1;
      updates.last_reminder_at = new Date().toISOString();
    }
    await supabase.from("client_form_tokens").update(updates).eq("id", token_id);

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
