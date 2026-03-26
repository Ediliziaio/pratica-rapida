import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID")!;
const ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN")!;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { to, template_name, language, components, practice_id } = await req.json();
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

  return Response.json({ success, wa_message_id });
});
