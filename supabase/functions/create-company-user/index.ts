import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller identity via JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Token non valido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is super_admin
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "super_admin");

    if (!callerRoles?.length) {
      return new Response(JSON.stringify({ error: "Accesso negato: solo super_admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const {
      ragione_sociale,
      email,
      password,
      piva,
      codice_fiscale,
      telefono,
      indirizzo,
      citta,
      cap,
      provincia,
      settore,
    } = body;

    // Input validation
    if (!ragione_sociale || typeof ragione_sociale !== "string" || ragione_sociale.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Ragione sociale obbligatoria" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!email || typeof email !== "string" || !validateEmail(email.trim())) {
      return new Response(JSON.stringify({ error: "Email non valida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Create auth user
    const { data: newUserData, error: userError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        nome: ragione_sociale.trim(),
        cognome: "",
      },
    });

    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUserData.user.id;

    // Step 2: Create company
    const { data: company, error: companyError } = await adminClient
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

    if (companyError) {
      // Rollback: delete the created auth user
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: companyError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Assign role admin_interno to the new user
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: userId, role: "admin_interno" });

    if (roleError) {
      // Rollback
      await adminClient.from("companies").delete().eq("id", company.id);
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Assign user to company via user_company_assignments
    const { error: assignError } = await adminClient
      .from("user_company_assignments")
      .insert({ user_id: userId, company_id: company.id });

    if (assignError) {
      // Rollback
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("companies").delete().eq("id", company.id);
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: assignError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, company, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
