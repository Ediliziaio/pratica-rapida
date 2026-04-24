import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[create-company-user] Missing env: ${k}`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  // Step 3 — Assign role azienda_admin (NOT admin_interno which is reserved for internal staff)
  const { error: roleErr } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role: "azienda_admin" });
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

  // Step 5 — Send welcome email with credentials
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromDomain = Deno.env.get("EMAIL_FROM_DOMAIN") ?? "praticarapida.it";
  const loginUrl = Deno.env.get("APP_URL") ?? "https://pannello.praticarapida.it/auth";

  if (resendKey) {
    const subject = "✅ Benvenuto su Pratica Rapida — Le tue credenziali di accesso";
    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;">Pratica Rapida</h1>
  </td></tr>
  <tr><td style="padding:32px 40px;color:#333333;line-height:1.6;">
    <h2 style="margin-top:0;color:#1a1a2e;">Benvenuto su Pratica Rapida! 🎉</h2>
    <p>Ciao <strong>${ragione_sociale.trim()}</strong>,</p>
    <p>Il tuo account è stato creato con successo. Puoi accedere al tuo pannello con le seguenti credenziali:</p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border-collapse:collapse;margin:20px 0;background:#f9f9f9;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:12px 18px;font-weight:bold;color:#555;width:32%;border-bottom:1px solid #eee;">🌐 Pannello</td>
        <td style="padding:12px 18px;border-bottom:1px solid #eee;">
          <a href="${loginUrl}" style="color:#00843D;font-weight:bold;">pannello.praticarapida.it</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">📧 Email</td>
        <td style="padding:12px 18px;border-bottom:1px solid #eee;">${email.trim()}</td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-weight:bold;color:#555;">🔑 Password</td>
        <td style="padding:12px 18px;font-family:monospace;font-size:15px;letter-spacing:1px;">${password}</td>
      </tr>
    </table>
    <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:13px;color:#795548;">
      ⚠️ <strong>Consiglio:</strong> al primo accesso ti suggeriamo di cambiare la password dalle impostazioni del profilo.
    </div>
    <div style="text-align:center;margin:28px 0">
      <a href="${loginUrl}" style="background:#00843D;color:#ffffff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:bold;font-size:16px;">Accedi ora →</a>
    </div>
    <p style="color:#888;font-size:13px;margin-top:24px;">
      Per assistenza: <a href="mailto:supporto@praticarapida.it" style="color:#00843D;">supporto@praticarapida.it</a> ·
      <a href="tel:+390398682691" style="color:#00843D;">+39 039 868 2691</a> (Lun-Ven 9:00-18:00)
    </p>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888;">
    © ${new Date().getFullYear()} Pratica Rapida · AEDIX
  </td></tr>
</table></td></tr></table></body></html>`;

    // Fire-and-forget — don't fail the whole request if email fails
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Pratica Rapida <noreply@${fromDomain}>`,
        to: email.trim(),
        subject,
        html: htmlBody,
      }),
    }).catch(() => {/* non bloccante */});
  }

  return new Response(JSON.stringify({ success: true, company, userId }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
