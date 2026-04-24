import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Bad JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { to, template_name, language, components, practice_id } = payload;

  if (!to || typeof to !== "string") {
    return new Response(JSON.stringify({ success: false, error: "Missing 'to'" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!template_name || typeof template_name !== "string") {
    return new Response(JSON.stringify({ success: false, error: "Missing template_name" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const phone = normalizePhone(to);

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template_name,
          language: { code: language ?? "it" },
          components: components ?? [],
        },
      }),
    }
  );

  const result = await response.json();
  const wa_message_id = result.messages?.[0]?.id;
  const error_message = result.error?.message;
  const success = !!wa_message_id;

  if (practice_id) {
    await supabase.from("communication_log").insert({
      practice_id,
      channel: "whatsapp",
      direction: "outbound",
      recipient: phone,
      body_preview: `Template: ${template_name}`,
      status: success ? "sent" : "failed",
      wa_message_id: wa_message_id ?? null,
      error_message: error_message ?? null,
    });
  }

  // Log su whatsapp_logs (pannello admin)
  await supabase.from("whatsapp_logs").insert({
    client_id: null,
    pratica_id: practice_id ?? null,
    direction: "outbound",
    phone,
    message_type: "template",
    template_name,
    status: success ? "sent" : "failed",
    wa_message_id: wa_message_id ?? null,
  });

  return new Response(JSON.stringify({ success, wa_message_id }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
