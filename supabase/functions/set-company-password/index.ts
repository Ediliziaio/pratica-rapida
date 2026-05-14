/**
 * set-company-password — super_admin endpoint per impostare manualmente una
 * password temporanea per l'account azienda_admin di un'azienda.
 *
 * Workflow:
 *  1. Verifica che il caller sia super_admin
 *  2. Risolve l'user_id dell'azienda via user_company_assignments + ruolo
 *     azienda_admin (o azienda_user fallback se nessun admin trovato)
 *  3. Aggiorna la password tramite supabase.auth.admin.updateUserById
 *  4. Imposta profiles.must_change_password = true così al prossimo accesso
 *     l'utente verrà reindirizzato a /cambia-password
 *
 * Body:
 *   { company_id: string, new_password: string }
 *
 * Risposta:
 *   { success: boolean, user_id?: string, email?: string, error?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[set-company-password] Missing env: ${k}`);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── 1. Validazione caller ─────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing auth header" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Token non valido", detail: userError?.message }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: callerRoles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin");
  if (!callerRoles?.length) {
    return json({ error: "Accesso negato: richiesto super_admin" }, 403);
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: { company_id?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON non valido" }, 400);
  }
  const company_id = body.company_id?.trim();
  const new_password = body.new_password;

  if (!company_id) return json({ error: "company_id obbligatorio" }, 400);
  if (!new_password || typeof new_password !== "string" || new_password.length < 8) {
    return json({ error: "Password minimo 8 caratteri" }, 400);
  }

  // ── 3. Trova target user (azienda_admin per quel company_id) ──────────────
  const { data: assignments, error: assignErr } = await admin
    .from("user_company_assignments")
    .select("user_id, user_roles!inner(role)")
    .eq("company_id", company_id);
  if (assignErr) return json({ error: "Errore lookup utente: " + assignErr.message }, 500);

  type Row = { user_id: string; user_roles: Array<{ role: string }> | { role: string } };
  const rows = (assignments ?? []) as unknown as Row[];

  // Preferenza: azienda_admin → fallback azienda_user
  const targetRow =
    rows.find((r) => {
      const roles = Array.isArray(r.user_roles) ? r.user_roles : [r.user_roles];
      return roles.some((x) => x.role === "azienda_admin");
    }) ??
    rows.find((r) => {
      const roles = Array.isArray(r.user_roles) ? r.user_roles : [r.user_roles];
      return roles.some((x) => x.role === "azienda_user");
    });

  if (!targetRow) {
    return json({ error: "Nessun utente azienda_admin/azienda_user trovato per questa azienda" }, 404);
  }
  const target_user_id = targetRow.user_id;

  // ── 4. Update password tramite admin API ──────────────────────────────────
  const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(
    target_user_id,
    { password: new_password },
  );
  if (updErr) {
    return json({ error: "Errore aggiornamento password: " + updErr.message }, 500);
  }

  // ── 5. Set must_change_password=true (idempotent upsert sul profile) ──────
  // L'utente potrebbe non avere ancora una riga in profiles — usiamo upsert.
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      { id: target_user_id, must_change_password: true, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (profileErr) {
    console.error("[set-company-password] profile upsert failed:", profileErr);
    // Non blocking: la password è stata cambiata, segnaliamo l'errore ma 200
    return json({
      success: true,
      user_id: target_user_id,
      email: updated.user?.email ?? null,
      warning: "Password cambiata ma flag must_change_password non impostato: " + profileErr.message,
    }, 200);
  }

  return json({
    success: true,
    user_id: target_user_id,
    email: updated.user?.email ?? null,
  }, 200);
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
