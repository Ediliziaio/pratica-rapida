/**
 * delete-company — super_admin elimina un rivenditore dal portale.
 *
 * Caso d'uso: account creati per errore (email sbagliata) che "fanno volume".
 * Le PRATICHE vengono CONSERVATE: prima di eliminare l'azienda le riassegniamo
 * a un'azienda placeholder ("⚠️ Rivenditore eliminato"), così non vengono
 * cancellate né bloccano la delete (reseller_id è NOT NULL in alcune versioni).
 *
 * Vengono invece rimossi: gli account utente collegati (auth.users → cascade su
 * user_roles, user_company_assignments, profiles) e la riga company.
 *
 * Body: { company_id: string }
 * Auth: solo super_admin.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PLACEHOLDER_NAME = "⚠️ Rivenditore eliminato";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. super_admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth header" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Token non valido" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin");
  if (!roles?.length) return json({ error: "Accesso negato: richiesto super_admin" }, 403);

  // 2. body
  let body: { company_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Body JSON non valido" }, 400); }
  const company_id = body.company_id?.trim();
  if (!company_id) return json({ error: "company_id obbligatorio" }, 400);

  try {
    // 3. Conserva le pratiche: se l'azienda ne ha, riassegnale al placeholder.
    const { count: practiceCount } = await admin
      .from("enea_practices")
      .select("id", { count: "exact", head: true })
      .eq("reseller_id", company_id);

    let reassigned = 0;
    if (practiceCount && practiceCount > 0) {
      // Trova o crea l'azienda placeholder.
      let placeholderId: string | null = null;
      const { data: ph } = await admin.from("companies").select("id").eq("ragione_sociale", PLACEHOLDER_NAME).maybeSingle();
      if (ph?.id) {
        placeholderId = ph.id;
      } else {
        const { data: created, error: cErr } = await admin
          .from("companies")
          .insert({ ragione_sociale: PLACEHOLDER_NAME, is_active: false })
          .select("id")
          .single();
        if (cErr) return json({ success: false, error: `Impossibile creare azienda placeholder: ${cErr.message}` }, 400);
        placeholderId = created.id;
      }
      const { error: rErr } = await admin
        .from("enea_practices")
        .update({ reseller_id: placeholderId })
        .eq("reseller_id", company_id);
      if (rErr) return json({ success: false, error: `Riassegnazione pratiche fallita: ${rErr.message}` }, 400);
      reassigned = practiceCount;
    }

    // 4. Elimina gli account utente collegati (cascade su roles/assignments/profiles).
    const { data: assignments } = await admin
      .from("user_company_assignments")
      .select("user_id")
      .eq("company_id", company_id);
    const userIds = [...new Set((assignments ?? []).map((a) => a.user_id).filter(Boolean))] as string[];
    for (const uid of userIds) {
      await admin.auth.admin.deleteUser(uid).catch((e) => console.warn(`deleteUser ${uid} failed:`, e));
    }

    // 5. Elimina la company.
    const { error: delErr } = await admin.from("companies").delete().eq("id", company_id);
    if (delErr) return json({ success: false, error: delErr.message }, 400);

    return json({ success: true, reassigned_practices: reassigned, deleted_users: userIds.length });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
