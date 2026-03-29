import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = `Pratica Rapida <noreply@${Deno.env.get("EMAIL_FROM_DOMAIN") ?? "pratica-rapida.it"}>`;
const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID")!;
const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.pratica-rapida.it";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIPO_LABEL: Record<string, string> = {
  "schermature-solari": "Schermature Solari",
  "infissi": "Infissi",
  "impianto-termico": "Impianto Termico",
};

function htmlEmail(nome: string, moduloUrl: string, isReminder: boolean) {
  const heading = isReminder
    ? "Ricordati di compilare il modulo!"
    : "Abbiamo bisogno di alcune informazioni";
  const intro = isReminder
    ? `Ciao <strong>${nome}</strong>, ti ricordiamo che hai un modulo in attesa di compilazione per la tua pratica ENEA.`
    : `Ciao <strong>${nome}</strong>, per procedere con la tua pratica ENEA abbiamo bisogno di alcune informazioni tecniche.`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
    <p style="color:#aaaacc;margin:6px 0 0;font-size:13px;">Pratiche ENEA e Conto Termico</p>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333;line-height:1.7;">
    <h2 style="color:#1a1a2e;margin-top:0;">${heading}</h2>
    <p>${intro}</p>
    <p>Ci vogliono solo <strong>5 minuti</strong> per completare il modulo online.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="${moduloUrl}" style="background:#e94560;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
        Compila il modulo ora →
      </a>
    </div>
    <p style="color:#888;font-size:13px;">Oppure copia questo link nel tuo browser:<br>
      <a href="${moduloUrl}" style="color:#e94560;word-break:break-all;">${moduloUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:13px;color:#888;">Per assistenza: <a href="mailto:supporto@pratica-rapida.it" style="color:#e94560;">supporto@pratica-rapida.it</a></p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © ${new Date().getFullYear()} Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>`;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

async function sendEmail(to: string, nome: string, moduloUrl: string, isReminder: boolean) {
  const subject = isReminder
    ? "Reminder: completa il modulo ENEA"
    : "Compila il tuo modulo ENEA";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html: htmlEmail(nome, moduloUrl, isReminder),
    }),
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
    const moduloUrl = `${APP_URL}/modulo/${token.token}`;
    const results: Record<string, unknown> = {};

    // Send email
    if ((channel === "email" || channel === "both") && email) {
      results.email = await sendEmail(email, nome, moduloUrl, is_reminder);
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
