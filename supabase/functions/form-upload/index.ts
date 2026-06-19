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
 * Body: { token: string, kind?: string, filename: string, content_base64: string }
 * Risposta: { success, path }
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

  let body: { token?: string; kind?: string; filename?: string; content_base64?: string };
  try { body = await req.json(); } catch { return json({ success: false, error: "Bad JSON" }, 400); }

  const token = body.token?.trim();
  const filename = body.filename?.trim();
  const b64 = body.content_base64;
  const kind = (body.kind ?? "allegati").replace(/[^a-z0-9_-]/gi, "") || "allegati";
  if (!token || !filename || !b64) return json({ success: false, error: "token, filename, content_base64 obbligatori" }, 400);

  // 1. Valida il token → pratica
  const { data: practice, error: pErr } = await admin
    .from("enea_practices")
    .select("id, archived_at")
    .eq("form_token", token)
    .maybeSingle();
  if (pErr || !practice) return json({ success: false, error: "Token non valido" }, 403);
  if (practice.archived_at) return json({ success: false, error: "Pratica archiviata" }, 403);

  // 2. Decodifica base64 + limite 20MB
  let bytes: Uint8Array;
  try {
    const raw = b64.includes(",") ? b64.split(",")[1] : b64; // accetta data URI
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return json({ success: false, error: "Contenuto file non valido" }, 400);
  }
  if (bytes.byteLength > 20 * 1024 * 1024) return json({ success: false, error: "File troppo grande (max 20MB)" }, 400);

  // 3. Upload con service role
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${practice.id}/${kind}/${crypto.randomUUID()}.${ext}`;
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
