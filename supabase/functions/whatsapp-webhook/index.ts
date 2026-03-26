import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN")!;

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET — Meta webhook verification challenge
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // POST — incoming events
  if (req.method === "POST") {
    const body = await req.json();
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    // Status updates (delivered, read, failed)
    const statuses = changes?.statuses ?? [];
    for (const status of statuses) {
      const { id, status: st, timestamp } = status;
      await supabase
        .from("communication_log")
        .update({
          status: st === "delivered" ? "delivered" : st === "read" ? "read" : "failed",
          read_at: st === "read" ? new Date(parseInt(timestamp) * 1000).toISOString() : undefined,
        })
        .eq("wa_message_id", id);
    }

    // Incoming messages
    const messages = changes?.messages ?? [];
    for (const msg of messages) {
      const from = msg.from;
      const text = msg.text?.body ?? "";

      // STOP opt-out
      if (text.trim().toUpperCase() === "STOP") {
        // Future: mark phone as opted out
        console.log(`STOP from ${from}`);
        continue;
      }

      // Find practice by phone
      const { data: practice } = await supabase
        .from("enea_practices")
        .select("id")
        .eq("cliente_telefono", `+${from}`)
        .maybeSingle();

      if (practice) {
        await supabase.from("communication_log").insert({
          practice_id: practice.id,
          channel: "whatsapp",
          direction: "inbound",
          recipient: from,
          body_preview: text.slice(0, 200),
          status: "read",
          wa_message_id: msg.id,
        });
      }
    }

    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
});
