import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return new Response("Collegamento non valido", { status: 400 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.from("lead_nurture_enrollments").update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "recipient_opt_out" }).eq("opt_out_token", token).select("lead_id").maybeSingle();
  if (error || !data) return new Response("Collegamento non valido", { status: 404 });
  await db.from("leads").update({ marketing_consent: false }).eq("id", data.lead_id);
  return new Response("Iscrizione annullata. Non riceverai altri messaggi automatici da Pratica Rapida.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
