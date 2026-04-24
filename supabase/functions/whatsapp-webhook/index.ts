import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

// Env var startup check
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WA_WEBHOOK_VERIFY_TOKEN",
];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[whatsapp-webhook] Missing env: ${k}`);
}
// WA_APP_SECRET is required for signature verification of POST bodies.
// If missing we fail closed on POST (but still allow GET verification).
if (!Deno.env.get("WA_APP_SECRET")) {
  console.warn("[whatsapp-webhook] WA_APP_SECRET not set — POST signature verification will reject all requests");
}

const VERIFY_TOKEN = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WA_APP_SECRET") ?? "";

// Constant-time comparison of two equal-length Uint8Arrays
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!APP_SECRET) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = new Uint8Array(mac);
  const received = hexToBytes(signatureHeader.slice(7));
  return timingSafeEqual(expected, received);
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
    // Read raw body once; we need the unparsed bytes for signature verification
    const rawBody = await req.text();

    // Verify X-Hub-Signature-256 — Meta signs the raw body with WA_APP_SECRET
    const signature = req.headers.get("x-hub-signature-256");
    const signatureOk = await verifyMetaSignature(rawBody, signature);
    if (!signatureOk) {
      console.error("[whatsapp-webhook] invalid or missing signature");
      await reportError(new Error("whatsapp-webhook invalid/missing signature"), {
        fn: "whatsapp-webhook",
        has_signature: !!signature,
      });
      return new Response("Invalid signature", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    try {

    const entry = (body as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> }).entry?.[0];
    const changes = entry?.changes?.[0]?.value as {
      statuses?: Array<{ id: string; status: string; timestamp: string }>;
      messages?: Array<{ id: string; from: string; text?: { body?: string } }>;
    } | undefined;

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
    } catch (err) {
      await reportError(err, { fn: "whatsapp-webhook" });
      return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
