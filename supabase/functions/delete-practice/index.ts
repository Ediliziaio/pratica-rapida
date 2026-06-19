/**
 * delete-practice — super_admin elimina definitivamente una pratica ENEA.
 *
 * La maggior parte delle tabelle figlie ha FK ON DELETE CASCADE / SET NULL,
 * quindi vengono gestite dal DB. UNICA eccezione: `call_bookings` ha una FK
 * SENZA ON DELETE → va svuotata prima, altrimenti la delete fallisce.
 *
 * Eliminando la pratica, il cron `process-automations` non la trova più →
 * nessuna automazione residua su quella pratica.
 *
 * Body: { practice_id: string }
 * Auth: solo super_admin (JWT del chiamante).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Verifica caller = super_admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth header" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Token non valido" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin");
  if (!roles?.length) return json({ error: "Accesso negato: richiesto super_admin" }, 403);

  // 2. Parse body
  let body: { practice_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON non valido" }, 400);
  }
  const practice_id = body.practice_id?.trim();
  if (!practice_id) return json({ error: "practice_id obbligatorio" }, 400);

  // 3. Svuota la sola tabella con FK NON-cascade (call_bookings), poi elimina la
  //    pratica: il resto dei figli cade per ON DELETE CASCADE / SET NULL.
  try {
    await admin.from("call_bookings").delete().eq("practice_id", practice_id);

    const { error: delErr } = await admin
      .from("enea_practices")
      .delete()
      .eq("id", practice_id);
    if (delErr) {
      // Se restasse un'altra FK senza cascade, l'errore lo segnala: lo
      // propaghiamo per diagnosi invece di fallire in modo opaco.
      return json({ success: false, error: delErr.message }, 400);
    }
    return json({ success: true, practice_id });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
