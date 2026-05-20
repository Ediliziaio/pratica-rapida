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
const WA_ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") ?? "";

/**
 * Scarica un media inbound da Meta Graph API e lo salva in Supabase
 * Storage (bucket `whatsapp-media`). Necessario perché i media URL Meta
 * scadono in 5 minuti — se non li mirroriamo subito, sono persi.
 *
 * Ritorna: { storage_path, mime_type, signed_url } oppure null su errore.
 */
async function mirrorInboundMedia(
  supabase: ReturnType<typeof createClient>,
  mediaId: string,
  waMessageId: string,
): Promise<{ storage_path: string; mime_type: string; signed_url: string } | null> {
  if (!WA_ACCESS_TOKEN) {
    console.warn("[whatsapp-webhook] WA_ACCESS_TOKEN missing, skip media mirror");
    return null;
  }
  try {
    // 1. GET media URL da Meta
    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}?fields=url,mime_type`,
      { headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` } },
    );
    if (!metaRes.ok) {
      console.error(`[mirror-media] meta fetch failed for ${mediaId}: HTTP ${metaRes.status}`);
      return null;
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) {
      console.error(`[mirror-media] no url in Meta response for ${mediaId}`);
      return null;
    }

    // 2. Download del file binario (richiede il Bearer token)
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` },
    });
    if (!fileRes.ok) {
      console.error(`[mirror-media] download failed for ${mediaId}: HTTP ${fileRes.status}`);
      return null;
    }
    const blob = await fileRes.blob();
    const mimeType = meta.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream";

    // 3. Determine extension da mime
    const ext = mimeType.includes("jpeg") ? "jpg"
      : mimeType.includes("png") ? "png"
      : mimeType.includes("webp") ? "webp"
      : mimeType.includes("pdf") ? "pdf"
      : mimeType.includes("mp4") ? "mp4"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("mpeg") ? "mp3"
      : "bin";

    // 4. Upload a Storage (path: inbound/wa_message_id.ext)
    const path = `inbound/${waMessageId}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("whatsapp-media")
      .upload(path, blob, { contentType: mimeType, upsert: true });
    if (uploadErr) {
      console.error(`[mirror-media] storage upload failed:`, uploadErr);
      return null;
    }

    // 5. Signed URL (7 giorni — media inbound restano accessibili dalla chat)
    const { data: signed, error: signErr } = await supabase.storage
      .from("whatsapp-media")
      .createSignedUrl(path, 7 * 24 * 3600);
    if (signErr || !signed?.signedUrl) {
      console.error(`[mirror-media] signed url failed:`, signErr);
      return null;
    }

    return {
      storage_path: path,
      mime_type: mimeType,
      signed_url: signed.signedUrl,
    };
  } catch (err) {
    console.error(`[mirror-media] threw:`, err);
    return null;
  }
}

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

    // Status updates (delivered, read, failed) — aggiorna sia communication_log
    // (audit) sia whatsapp_messages (chat UI).
    const statuses = changes?.statuses ?? [];
    for (const status of statuses) {
      const { id, status: st, timestamp } = status;
      const ts = new Date(parseInt(timestamp) * 1000).toISOString();
      const normalizedStatus = st === "delivered" ? "delivered"
        : st === "read" ? "read"
        : st === "sent" ? "sent"
        : "failed";

      // communication_log (audit-centric)
      await supabase
        .from("communication_log")
        .update({
          status: normalizedStatus === "sent" ? "sent" : normalizedStatus,
          read_at: st === "read" ? ts : undefined,
        })
        .eq("wa_message_id", id);

      // whatsapp_messages (chat-centric) — popolato anche dei timestamps specifici
      const msgUpdate: Record<string, unknown> = { status: normalizedStatus };
      if (st === "delivered") msgUpdate.delivered_at = ts;
      if (st === "read") msgUpdate.read_at = ts;
      await supabase
        .from("whatsapp_messages")
        .update(msgUpdate)
        .eq("wa_message_id", id);
    }

    // Incoming messages
    //
    // Doppio storage:
    //  - communication_log: audit (legato a practice_id, immutabile)
    //  - whatsapp_conversations + whatsapp_messages: chat UI (thread per phone)
    //
    // Anche se non troviamo una practice (es. cliente nuovo, numero non
    // ancora salvato), CREIAMO comunque la conversation: l'admin la vedrà
    // nella inbox e potrà rispondere/linkare manualmente alla practice.
    const messages = changes?.messages ?? [];
    const contacts = (changes as { contacts?: Array<{ wa_id: string; profile?: { name?: string } }> })?.contacts ?? [];
    const profileNameMap = new Map<string, string>();
    for (const c of contacts) {
      if (c.profile?.name) profileNameMap.set(c.wa_id, c.profile.name);
    }

    for (const msg of messages) {
      const from = msg.from; // Meta invia "393331234567" (E.164 senza +)
      // Estrae il body in base al tipo di messaggio (Meta supporta text,
      // image, document, audio, video, location, contacts, sticker, ...).
      const msgAny = msg as Record<string, unknown> & { type?: string };
      const msgType = (msgAny.type as string) ?? "text";
      const text = (msgAny.text as { body?: string } | undefined)?.body ?? "";
      const caption = ((msgAny.image as { caption?: string } | undefined)?.caption)
        ?? ((msgAny.document as { caption?: string } | undefined)?.caption)
        ?? ((msgAny.video as { caption?: string } | undefined)?.caption)
        ?? "";
      const body = text || caption || `[${msgType}]`;
      const displayName = profileNameMap.get(from) ?? null;

      // Estrae il media_id se presente (per tipi: image, document, audio, video, sticker)
      const mediaTypes = ["image", "document", "audio", "video", "sticker"] as const;
      let inboundMediaId: string | null = null;
      for (const mt of mediaTypes) {
        const obj = msgAny[mt] as { id?: string } | undefined;
        if (obj?.id) {
          inboundMediaId = obj.id;
          break;
        }
      }

      // STOP opt-out
      if (text.trim().toUpperCase() === "STOP") {
        // Future: mark phone as opted out (TODO: aggiungere flag su conversation)
        console.log(`STOP from ${from}`);
        continue;
      }

      // Find practice by phone (matching robusto, vedi commit precedente)
      const digits = from.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      let practice: { id: string } | null = null;
      if (last10.length === 10) {
        const pattern = `%${last10.slice(0, 3)}%${last10.slice(3, 6)}%${last10.slice(6)}%`;
        const { data: matches } = await supabase
          .from("enea_practices")
          .select("id")
          .ilike("cliente_telefono", pattern)
          .limit(2);
        if (matches && matches.length === 1) {
          practice = matches[0];
        } else if (matches && matches.length > 1) {
          console.warn(`[whatsapp-webhook] ambiguous phone ${from} → ${matches.length} matches`);
        }
      }

      // 1. Cerca conversation esistente per phone (per non sovrascrivere
      //    practice_id/display_name già valorizzati). Il vecchio upsert
      //    aveva un bug: ogni inbound senza match practice azzerava
      //    il practice_id esistente sulla conversation.
      const { data: existingConv } = await supabase
        .from("whatsapp_conversations")
        .select("id, practice_id, display_name")
        .eq("phone", from)
        .maybeSingle();

      let convId: string;
      let resolvedPracticeId: string | null;
      if (existingConv) {
        // Update solo dei campi safe: display_name se mancante + practice_id
        // solo se PRIMA era null e ora abbiamo un match
        const patch: Record<string, unknown> = {};
        if (!existingConv.display_name && displayName) patch.display_name = displayName;
        if (!existingConv.practice_id && practice?.id) patch.practice_id = practice.id;
        if (Object.keys(patch).length > 0) {
          await supabase
            .from("whatsapp_conversations")
            .update(patch)
            .eq("id", existingConv.id);
        }
        convId = existingConv.id;
        resolvedPracticeId = existingConv.practice_id ?? practice?.id ?? null;
      } else {
        // Nessuna conversation esistente: crea nuova
        const { data: newConv, error: insertErr } = await supabase
          .from("whatsapp_conversations")
          .insert({
            phone: from,
            display_name: displayName,
            practice_id: practice?.id ?? null,
          })
          .select("id")
          .single();
        if (insertErr || !newConv) {
          console.error(`[whatsapp-webhook] insert conversation failed for ${from}:`, insertErr);
          continue;
        }
        convId = newConv.id;
        resolvedPracticeId = practice?.id ?? null;
      }

      // 2a. Se il messaggio contiene media, scarica subito da Meta e mirror
      //     in Supabase Storage. Senza questo il media URL Meta scade in 5
      //     minuti e il file diventa inaccessibile dalla chat UI.
      let mirroredMedia: { signed_url: string; mime_type: string } | null = null;
      if (inboundMediaId) {
        mirroredMedia = await mirrorInboundMedia(supabase, inboundMediaId, msg.id);
      }

      // 2b. Insert message (il trigger AFTER INSERT aggiorna last_message_at,
      //     unread_count, last_inbound_at sulla conversation)
      //     Denormalizza practice_id al momento dell'insert per audit (vedi
      //     migration 20260520000005).
      const { error: msgErr } = await supabase
        .from("whatsapp_messages")
        .insert({
          conversation_id: convId,
          direction: "inbound",
          message_type: msgType,
          body,
          wa_message_id: msg.id,
          status: "delivered",
          practice_id: resolvedPracticeId,
          media_url: mirroredMedia?.signed_url ?? null,
          media_mime_type: mirroredMedia?.mime_type ?? null,
        });
      if (msgErr) {
        // Dedup check: se è un duplicato (Meta a volte rinvia lo stesso webhook),
        // wa_message_id UNIQUE constraint lo blocca → ignoriamo.
        if (!msgErr.message.includes("duplicate")) {
          console.error(`[whatsapp-webhook] insert message failed:`, msgErr);
        }
      }

      // 3. Legacy: communication_log per audit (solo se collegato a practice)
      if (resolvedPracticeId) {
        await supabase.from("communication_log").insert({
          practice_id: resolvedPracticeId,
          channel: "whatsapp",
          direction: "inbound",
          recipient: from,
          body_preview: body.slice(0, 200),
          status: "read",
          wa_message_id: msg.id,
        });
      } else {
        console.log(`[whatsapp-webhook] inbound from ${from} → conversation ${convId} (no practice link)`);
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
