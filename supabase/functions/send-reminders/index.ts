import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[send-reminders] Missing env: ${k}`);
}

// This function is called daily at 09:00 via Supabase Cron (pg_cron)
// It sends reminders to clients who have pending/sent tokens older than 3 days
// and haven't received a reminder in the last 7 days.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_AFTER_DAYS = 3;   // send first reminder after 3 days of inactivity
const REMINDER_INTERVAL_DAYS = 7; // subsequent reminders every 7 days
const MAX_REMINDERS = 3;          // stop after 3 reminders

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();

  try {
    // Find tokens that need a reminder
    const { data: tokens, error } = await supabase
      .from("client_form_tokens")
      .select("id, token, stato, created_at, sent_at, last_reminder_at, reminder_count, expires_at")
      .in("stato", ["pending", "inviato"])
      .gt("expires_at", now.toISOString()); // not yet expired

    if (error) throw error;

    const tokensToRemind = (tokens ?? []).filter((t) => {
      if ((t.reminder_count ?? 0) >= MAX_REMINDERS) return false;

      const lastActivity = t.last_reminder_at
        ? new Date(t.last_reminder_at)
        : t.sent_at
          ? new Date(t.sent_at)
          : new Date(t.created_at);

      const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

      const threshold = (t.reminder_count ?? 0) === 0
        ? REMINDER_AFTER_DAYS
        : REMINDER_INTERVAL_DAYS;

      return daysSinceActivity >= threshold;
    });

    console.log(`[send-reminders] ${tokensToRemind.length} tokens to remind out of ${tokens?.length ?? 0} pending`);

    const results = await Promise.allSettled(
      tokensToRemind.map(async (t) => {
        const resp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-cliente`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token_id: t.id,
              channel: "email",
              is_reminder: true,
            }),
          }
        );
        const body = await resp.json();
        console.log(`[send-reminders] token ${t.id}: ${JSON.stringify(body)}`);
        return { token_id: t.id, ...body };
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({ ok: true, processed: tokensToRemind.length, succeeded, failed }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-reminders] fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
