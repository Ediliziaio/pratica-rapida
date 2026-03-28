import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing auth header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate the ES256 user JWT via Supabase Auth (works with both HS256 and ES256 tokens)
  // Note: verify_jwt is false at gateway level to allow ES256 tokens through;
  // we validate manually here via the auth service instead.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Token non valido", detail: userError?.message }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin client for DB operations (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Verify caller has super_admin role
  const { data: roles } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin");

  if (!roles?.length) {
    return new Response(JSON.stringify({ error: "Accesso negato: richiesto super_admin" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body JSON non valido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    ragione_sociale, email, password,
    piva, codice_fiscale, telefono,
    indirizzo, citta, cap, provincia, settore,
  } = body;

  if (!ragione_sociale?.trim()) {
    return new Response(JSON.stringify({ error: "Ragione sociale obbligatoria" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return new Response(JSON.stringify({ error: "Email non valida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!password || password.length < 8) {
    return new Response(JSON.stringify({ error: "Password minimo 8 caratteri" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 1 — Create auth user
  const { data: newUser, error: userErr } = await adminClient.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { nome: ragione_sociale.trim(), cognome: "" },
  });
  if (userErr) {
    return new Response(JSON.stringify({ error: userErr.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = newUser.user.id;

  // Step 2 — Create company
  const { data: company, error: companyErr } = await adminClient
    .from("companies")
    .insert({
      ragione_sociale: ragione_sociale.trim(),
      email: email.trim(),
      piva: piva ?? "",
      codice_fiscale: codice_fiscale ?? "",
      telefono: telefono ?? "",
      indirizzo: indirizzo ?? "",
      citta: citta ?? "",
      cap: cap ?? "",
      provincia: provincia ?? "",
      settore: settore ?? "",
    })
    .select()
    .single();
  if (companyErr) {
    await adminClient.auth.admin.deleteUser(userId);
    return new Response(JSON.stringify({ error: companyErr.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 3 — Assign role admin_interno
  const { error: roleErr } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role: "admin_interno" });
  if (roleErr) {
    await adminClient.from("companies").delete().eq("id", company.id);
    await adminClient.auth.admin.deleteUser(userId);
    return new Response(JSON.stringify({ error: roleErr.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 4 — Link user to company
  const { error: assignErr } = await adminClient
    .from("user_company_assignments")
    .insert({ user_id: userId, company_id: company.id });
  if (assignErr) {
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("companies").delete().eq("id", company.id);
    await adminClient.auth.admin.deleteUser(userId);
    return new Response(JSON.stringify({ error: assignErr.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, company, userId }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
