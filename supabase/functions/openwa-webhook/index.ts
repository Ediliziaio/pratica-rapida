// ============================================================
// openwa-webhook — riceve gli eventi dal gateway OpenWA
// (https://github.com/rmyndharis/OpenWA, whatsapp-web.js).
//
// Equivalente di whatsapp-webhook (Meta) per il provider OpenWA:
// stesso modello dati (whatsapp_conversations + whatsapp_messages +
// communication_log + notifications), payload sorgente diverso.
//
// Eventi gestiti:
//  - message.received → insert inbound + notifica staff
//  - message.ack      → update status (sent/delivered/read)
//  - session.status   → alert super_admin se DISCONNECTED/FAILED
//
// Sicurezza: il webhook OpenWA è configurato con un header custom
// "X-Webhook-Token" che deve combaciare con OPENWA_WEBHOOK_SECRET.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const WEBHOOK_SECRET = Deno.env.get("OPENWA_WEBHOOK_SECRET") ?? "";

interface OpenWAInboundData {
  id?: string;
  from?: string; // "393331234567@c.us" oppure "272764799856779@lid"
  to?: string;
  body?: string;
  type?: string; // "chat" | "image" | "document" | ...
  isGroup?: boolean;
  fromMe?: boolean;
  // contact.number è il numero REALE risolto dall'adapter — unico modo di
  // identificare il mittente quando `from` è un "@lid" anonimo.
  contact?: { name?: string; pushName?: string; number?: string };
  media?: { mimetype?: string; filename?: string; data?: string }; // base64
}

interface OpenWAEvent {
  event?: string;
  sessionId?: string;
  data?: Record<string, unknown>;
}

/**
 * "393331234567@c.us" → "393331234567".
 * I chatId "@lid" (Linked ID, identità nascosta di WhatsApp) NON contengono
 * il numero di telefono → ritorna null e il chiamante usa il fallback
 * (campo `author`/`number` se presente, altrimenti skip con log).
 */
function chatIdToPhone(chatId: string | undefined): string | null {
  if (!chatId) return null;
  if (chatId.endsWith("@lid")) return null;
  const digits = chatId.split("@")[0]?.replace(/\D/g, "");
  return digits && digits.length >= 8 ? digits : null;
}

/** Salva un media base64 inbound su Storage e ritorna signed URL (7gg). */
async function storeInboundMedia(
  supabase: ReturnType<typeof createClient>,
  msgId: string,
  media: { mimetype?: string; filename?: string; data?: string },
): Promise<{ signed_url: string; mime_type: string } | null> {
  if (!media.data || !media.mimetype) return null;
  try {
    const bytes = Uint8Array.from(atob(media.data), (c) => c.charCodeAt(0));
    const ext = media.filename?.split(".").pop()
      ?? media.mimetype.split("/")[1]?.split(";")[0]
      ?? "bin";
    const path = `inbound/openwa_${msgId.replace(/[^a-zA-Z0-9_-]/g, "")}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("whatsapp-media")
      .upload(path, bytes, { contentType: media.mimetype, upsert: true });
    if (uploadErr) {
      console.error("[openwa-webhook] storage upload failed:", uploadErr);
      return null;
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from("whatsapp-media")
      .createSignedUrl(path, 7 * 24 * 3600);
    if (signErr || !signed?.signedUrl) {
      console.error("[openwa-webhook] signed url failed:", signErr);
      return null;
    }
    return { signed_url: signed.signedUrl, mime_type: media.mimetype };
  } catch (err) {
    console.error("[openwa-webhook] media store threw:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: header condiviso configurato sul webhook OpenWA
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-token") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let evt: OpenWAEvent;
  try {
    evt = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad JSON" }), { status: 400 });
  }

  try {
    switch (evt.event) {
      // ──────────────────────────────────────────────
      case "message.received": {
        const data = (evt.data ?? {}) as OpenWAInboundData;
        // Skippa gruppi e messaggi inviati da noi stessi (echo)
        if (data.isGroup || data.fromMe) return Response.json({ ok: true, skipped: true });

        // Risolvi il numero: prima dal chatId (formato @c.us), poi dal
        // contatto risolto dall'adapter (per i chatId @lid anonimi).
        const contactDigits = data.contact?.number?.replace(/\D/g, "");
        const from = chatIdToPhone(data.from)
          ?? (contactDigits && contactDigits.length >= 8 ? contactDigits : null);
        if (!from || !data.id) {
          console.warn(`[openwa-webhook] inbound skipped: from=${data.from} contact=${data.contact?.number ?? "-"} id=${data.id} type=${data.type}`);
          return Response.json({ ok: true, skipped: true, from: data.from ?? null });
        }
        console.log(`[openwa-webhook] inbound from=${from} type=${data.type} body_len=${(data.body ?? "").length}`);

        const msgType = data.type === "chat" ? "text" : (data.type ?? "text");
        const body = data.body || `[${msgType}]`;
        const displayName = data.contact?.name ?? data.contact?.pushName ?? null;

        // Match pratica per telefono (stessa logica di whatsapp-webhook)
        const last10 = from.slice(-10);
        let practiceId: string | null = null;
        if (last10.length === 10) {
          const pattern = `%${last10.slice(0, 3)}%${last10.slice(3, 6)}%${last10.slice(6)}%`;
          const { data: matches } = await supabase
            .from("enea_practices")
            .select("id")
            .ilike("cliente_telefono", pattern)
            .limit(2);
          if (matches && matches.length === 1) practiceId = matches[0].id;
        }

        // Conversation: update safe-fields o insert
        const { data: existingConv } = await supabase
          .from("whatsapp_conversations")
          .select("id, practice_id, display_name")
          .eq("phone", from)
          .maybeSingle();

        let convId: string;
        let resolvedPracticeId: string | null;
        if (existingConv) {
          const patch: Record<string, unknown> = {};
          if (!existingConv.display_name && displayName) patch.display_name = displayName;
          if (!existingConv.practice_id && practiceId) patch.practice_id = practiceId;
          if (Object.keys(patch).length > 0) {
            await supabase.from("whatsapp_conversations").update(patch).eq("id", existingConv.id);
          }
          convId = existingConv.id;
          resolvedPracticeId = existingConv.practice_id ?? practiceId;
        } else {
          const { data: newConv, error: insertErr } = await supabase
            .from("whatsapp_conversations")
            .insert({ phone: from, display_name: displayName, practice_id: practiceId })
            .select("id")
            .single();
          if (insertErr || !newConv) {
            console.error(`[openwa-webhook] insert conversation failed for ${from}:`, insertErr);
            return Response.json({ ok: false });
          }
          convId = newConv.id;
          resolvedPracticeId = practiceId;
        }

        // Media inbound: OpenWA invia base64 nel payload → mirror su Storage
        let mirrored: { signed_url: string; mime_type: string } | null = null;
        if (data.media?.data) {
          mirrored = await storeInboundMedia(supabase, data.id, data.media);
        }

        const { error: msgErr } = await supabase.from("whatsapp_messages").insert({
          conversation_id: convId,
          direction: "inbound",
          message_type: msgType,
          body,
          wa_message_id: data.id,
          status: "delivered",
          practice_id: resolvedPracticeId,
          media_url: mirrored?.signed_url ?? null,
          media_mime_type: mirrored?.mime_type ?? null,
        });
        // Dedup: OpenWA può consegnare lo STESSO messaggio due volte (evento
        // `message`/`message_create` + poller, o retry del webhook). wa_message_id
        // è UNIQUE → il secondo insert fallisce con "duplicate".
        // IMPORTANTE: in quel caso dobbiamo USCIRE SUBITO, altrimenti si creano
        // una seconda notifica + un secondo communication_log per lo stesso
        // messaggio (bug: "arrivano due avvisi contemporaneamente").
        // Unica eccezione: se ora abbiamo il media e prima era un placeholder
        // senza media, aggiorniamo la riga esistente — ma comunque NON
        // ri-notifichiamo.
        if (msgErr && msgErr.message.includes("duplicate")) {
          if (mirrored) {
            await supabase
              .from("whatsapp_messages")
              .update({ media_url: mirrored.signed_url, media_mime_type: mirrored.mime_type })
              .eq("wa_message_id", data.id)
              .is("media_url", null);
          }
          return Response.json({ ok: true, deduped: true });
        } else if (msgErr) {
          console.error("[openwa-webhook] insert message failed:", msgErr);
        }

        if (resolvedPracticeId) {
          await supabase.from("communication_log").insert({
            practice_id: resolvedPracticeId,
            channel: "whatsapp",
            direction: "inbound",
            recipient: from,
            body_preview: body.slice(0, 200),
            status: "read",
            wa_message_id: data.id,
          });
        }

        // Notifica staff (assigned_to oppure tutti gli internal users)
        try {
          const { data: convFull } = await supabase
            .from("whatsapp_conversations")
            .select("assigned_to, display_name, phone")
            .eq("id", convId)
            .maybeSingle();
          const targetUserIds: string[] = [];
          if (convFull?.assigned_to) {
            targetUserIds.push(convFull.assigned_to);
          } else {
            const { data: staff } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("role", ["super_admin", "operatore"]);
            for (const s of staff ?? []) {
              if (s.user_id && !targetUserIds.includes(s.user_id)) targetUserIds.push(s.user_id);
            }
          }
          if (targetUserIds.length > 0) {
            const senderName = convFull?.display_name || `+${from}`;
            const preview = body.slice(0, 80) + (body.length > 80 ? "…" : "");
            await supabase.from("notifications").insert(
              targetUserIds.map((user_id) => ({
                user_id,
                tipo: "whatsapp_inbound",
                titolo: `💬 Nuovo messaggio da ${senderName}`,
                messaggio: preview,
                link: `/admin/whatsapp-chat?conv=${convId}`,
              })),
            );
          }
        } catch (notifErr) {
          console.warn("[openwa-webhook] inbound notification failed:", notifErr);
        }
        return Response.json({ ok: true });
      }

      // ──────────────────────────────────────────────
      case "message.ack": {
        const data = evt.data as { messageId?: string; ackName?: string } | undefined;
        if (!data?.messageId || !data.ackName) return Response.json({ ok: true });
        // Mappa ack whatsapp-web.js → status interni (stessi di Meta)
        const statusMap: Record<string, string> = {
          server: "sent",
          device: "delivered",
          read: "read",
          played: "read",
        };
        const status = statusMap[data.ackName];
        if (status) {
          await supabase
            .from("whatsapp_messages")
            .update({ status })
            .eq("wa_message_id", data.messageId);
        }
        return Response.json({ ok: true });
      }

      // ──────────────────────────────────────────────
      case "session.status": {
        const data = evt.data as { status?: string; reason?: string } | undefined;
        const status = data?.status?.toUpperCase() ?? "";
        const reason = data?.reason ?? "";
        // Stati che indicano "WhatsApp NON funziona più": disconnessione,
        // auth fallita, ban (TOS_BLOCK/SMB_TOS_BLOCK), conflitto, logout.
        const DOWN_STATES = [
          "DISCONNECTED", "FAILED", "STOPPED", "UNPAIRED", "UNPAIRED_IDLE",
          "CONFLICT", "TOS_BLOCK", "SMB_TOS_BLOCK", "PROXYBLOCK", "BANNED", "TIMEOUT",
        ];
        if (DOWN_STATES.includes(status)) {
          // Throttle 6h: una sola campanella+email per finestra, per non
          // sommergere l'admin se l'evento si ripete.
          const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
          const { data: recent } = await supabase
            .from("notifications")
            .select("id")
            .eq("tipo", "integration_error")
            .ilike("titolo", "%WhatsApp%")
            .gte("created_at", sixHoursAgo)
            .limit(1)
            .maybeSingle();
          if (!recent) {
            // 1) Notifica in-app a tutti i super_admin
            const { data: admins } = await supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "super_admin");
            if (admins && admins.length > 0) {
              await supabase.from("notifications").insert(
                admins.map((a) => ({
                  user_id: a.user_id,
                  tipo: "integration_error",
                  titolo: "⚠️ WhatsApp (OpenWA) disconnesso",
                  messaggio: `La sessione OpenWA è in stato ${status}. Ri-scansiona il QR code da Impostazioni → Integrazioni per ripristinare l'invio messaggi.`,
                  link: "/admin/integrazioni",
                })),
              );
            }

            // 2) Email "rumorosa" alla casella operativa modulistica@
            //    (sovrascrivibile via env WA_ALERT_EMAIL).
            try {
              const alertEmail = Deno.env.get("WA_ALERT_EMAIL") ?? "modulistica@praticarapida.it";
              const emails: string[] = [alertEmail];

              const baseUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://pannello.praticarapida.it";
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  to: emails,
                  template: "whatsapp_disconnesso",
                  data: {
                    status,
                    reason,
                    action_url: `${baseUrl}/admin/integrazioni`,
                  },
                }),
              });
            } catch (mailErr) {
              console.error("[openwa-webhook] alert email failed:", mailErr);
            }
          }
        }
        return Response.json({ ok: true });
      }

      default:
        // Evento non gestito (message.sent, ecc.) — ack silenzioso
        return Response.json({ ok: true, ignored: evt.event ?? "unknown" });
    }
  } catch (err) {
    await reportError(err, { fn: "openwa-webhook", event: evt.event });
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
