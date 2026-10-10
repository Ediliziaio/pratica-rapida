import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FORM_URL = "https://app.praticarapida.it/area-riservata-vecchia/pratica-enea";
const TEMPLATE = "sollecito_compilazione";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function romeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: pick("weekday"), hour: Number(pick("hour")), minute: Number(pick("minute")) };
}

export function isAllowedWhatsAppTime(now = new Date()): boolean {
  const { weekday, hour, minute } = romeParts(now);
  const minutes = hour * 60 + minute;
  if (weekday === "Sun") return false;
  if (weekday === "Sat") return minutes >= 8 * 60 + 30 && minutes < 14 * 60;
  return minutes >= 8 * 60 + 30 && minutes < 22 * 60;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_KEY}`) return json({ ok: false, error: "forbidden" }, 403);
  if (!isAllowedWhatsAppTime()) return json({ ok: true, skipped: "outside_whatsapp_hours" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: template, error: templateError } = await supabase
    .from("whatsapp_templates")
    .select("status")
    .eq("meta_template_name", TEMPLATE)
    .eq("language", "it")
    .maybeSingle();
  if (templateError || template?.status !== "APPROVED") {
    return json({ ok: false, error: "approved_template_unavailable" }, 503);
  }

  const { data: due, error: claimError } = await supabase
    .rpc("claim_due_meta_private_followups", { p_limit: 25 });
  if (claimError) return json({ ok: false, error: claimError.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const item of due ?? []) {
    const components = [{
      type: "body",
      parameters: [
        { type: "text", text: item.nome || "Cliente" },
        { type: "text", text: FORM_URL },
        { type: "text", text: item.followup_day === 1 ? "1 giorno" : "4 giorni" },
      ],
    }];

    let success = false;
    let messageId: string | null = null;
    let errorMessage: string | null = null;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: item.telefono,
          template_name: TEMPLATE,
          language: "it",
          components,
        }),
      });
      const result = await response.json().catch(() => ({}));
      success = response.ok && result.success === true;
      messageId = result.wa_message_id ?? null;
      errorMessage = success ? null : String(result.error ?? `HTTP ${response.status}`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    await supabase.from("meta_private_lead_followups").update({
      status: success ? "sent" : "failed",
      sent_at: success ? new Date().toISOString() : null,
      wa_message_id: messageId,
      error_message: errorMessage,
    }).eq("id", item.followup_id).eq("status", "sending");

    results.push({ id: item.followup_id, day: item.followup_day, success, error: errorMessage });
  }

  return json({ ok: true, processed: results.length, results });
});

