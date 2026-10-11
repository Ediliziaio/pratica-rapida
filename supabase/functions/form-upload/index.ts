/**
 * form-upload — upload file dal FORM PUBBLICO (cliente anonimo).
 *
 * Il bucket `enea-documents` consente INSERT solo a `authenticated`, quindi il
 * cliente anonimo del form pubblico NON poteva caricare il libretto / allegati
 * (l'upload diretto falliva con RLS → "chiede di allegare ma non allega").
 *
 * Questa funzione (deploy con --no-verify-jwt) valida il form_token, risolve la
 * pratica e carica il file con il SERVICE ROLE (bypassa RLS in modo controllato:
 * il path è sempre {practice_id}/{kind}/...).
 *
 * Flusso principale (senza base64, quindi affidabile anche vicino ai 20 MB):
 *   1. Body: { action: "create_signed_upload", token, kind, filename, size, content_type }
 *   2. Risposta: { success, path, upload_token }
 *   3. Il browser carica il File direttamente su Storage con uploadToSignedUrl.
 *
 * Il vecchio body con `content_base64` resta supportato per i client in cache.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: {
    action?: string;
    token?: string;
    kind?: string;
    filename?: string;
    size?: number;
    content_type?: string;
    content_base64?: string;
  };
  try { body = await req.json(); } catch { return json({ success: false, error: "Bad JSON" }, 400); }

  const token = body.token?.trim();
  const filename = body.filename?.trim();
  const kind = (body.kind ?? "allegati").replace(/[^a-z0-9_-]/gi, "") || "allegati";
  if (!token || !filename) return json({ success: false, error: "token e filename obbligatori" }, 400);

  // 1. Valida il token → pratica
  const { data: practice, error: pErr } = await admin
    .from("enea_practices")
    .select("id, archived_at")
    .eq("form_token", token)
    .maybeSingle();
  if (pErr || !practice) return json({ success: false, error: "Token non valido" }, 403);
  if (practice.archived_at) return json({ success: false, error: "Pratica archiviata" }, 403);

  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${practice.id}/${kind}/${crypto.randomUUID()}.${ext}`;

  // 2a. Flusso corrente: genera un URL firmato e lascia che il browser invii
  //     il binario direttamente a Storage. Il vecchio JSON base64 aumentava il
  //     peso del file di circa il 33% e faceva fallire PDF validi ben prima del
  //     limite di 20 MB dichiarato nel form.
  if (body.action === "create_signed_upload") {
    const size = Number(body.size);
    if (!Number.isFinite(size) || size <= 0) {
      return json({ success: false, error: "Dimensione file non valida" }, 400);
    }
    if (size > 20 * 1024 * 1024) {
      return json({ success: false, error: "File troppo grande (max 20MB)" }, 400);
    }

    const { data: signed, error: signedErr } = await admin.storage
      .from("enea-documents")
      .createSignedUploadUrl(path);
    if (signedErr || !signed?.token) {
      return json({ success: false, error: signedErr?.message ?? "Impossibile preparare il caricamento" }, 400);
    }
    return json({ success: true, path, upload_token: signed.token });
  }

  // 2b. Compatibilita' con le vecchie pagine ancora aperte/in cache.
  const b64 = body.content_base64;
  if (!b64) return json({ success: false, error: "content_base64 obbligatorio" }, 400);

  // Decodifica base64 + limite 20MB
  let bytes: Uint8Array;
  try {
    const raw = b64.includes(",") ? b64.split(",")[1] : b64; // accetta data URI
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return json({ success: false, error: "Contenuto file non valido" }, 400);
  }
  if (bytes.byteLength > 20 * 1024 * 1024) return json({ success: false, error: "File troppo grande (max 20MB)" }, 400);

  // 3. Upload con service role
  const { error: upErr } = await admin.storage
    .from("enea-documents")
    .upload(path, bytes, { upsert: false, contentType: guessMime(ext) });
  if (upErr) return json({ success: false, error: upErr.message }, 400);

  return json({ success: true, path });
});

function guessMime(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/octet-stream";
}
