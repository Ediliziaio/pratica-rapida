import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.praticarapida.it").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "Metodo non consentito" }, 405);

  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ success: false, error: "Accesso richiesto" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authorization.slice("Bearer ".length);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: "Sessione non valida" }, 401);

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) throw roleError;
    const roles = new Set((roleRows ?? []).map((row) => row.role));
    if (!roles.has("super_admin") && !roles.has("operatore")) {
      return json({ success: false, error: "Operazione riservata allo staff" }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const practiceId = typeof payload?.practiceId === "string" ? payload.practiceId : "";
    if (payload?.action !== "send_for_signature" || !/^[0-9a-f-]{36}$/i.test(practiceId)) {
      return json({ success: false, error: "Richiesta non valida" }, 400);
    }

    const { data: practice, error: practiceError } = await admin
      .from("fotovoltaico_practices")
      .select("id, proprietario_nome, unifilare_choice, unifilare_status, reseller_id, companies:reseller_id(ragione_sociale,email)")
      .eq("id", practiceId)
      .maybeSingle();
    if (practiceError) throw practiceError;
    if (!practice) return json({ success: false, error: "Pratica non trovata" }, 404);
    if (practice.unifilare_choice !== "richiesto_a_pratica_rapida") {
      return json({ success: false, error: "Il servizio schema non è stato richiesto" }, 409);
    }
    if (["inviato_da_firmare", "firmato_ricevuto"].includes(practice.unifilare_status)) {
      return json({ success: true, alreadySent: true });
    }
    if (practice.unifilare_status !== "bozza_pronta") {
      return json({ success: false, error: "Prima devi caricare lo schema predisposto" }, 409);
    }

    const { count, error: attachmentError } = await admin
      .from("fotovoltaico_attachments")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", practiceId)
      .eq("category", "schema_unifilare_bozza");
    if (attachmentError) throw attachmentError;
    if (!count) return json({ success: false, error: "PDF dello schema non trovato" }, 409);

    const company = practice.companies as { ragione_sociale?: string | null; email?: string | null } | null;
    const destination = company?.email?.trim();
    if (!destination) return json({ success: false, error: "E-mail del rivenditore non presente in anagrafica" }, 409);

    const link = `${APP_URL}/fotovoltaico/pratiche/${practiceId}/schema`;
    const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: destination,
        template: "fotovoltaico_schema_da_firmare",
        idempotency_key: `fotovoltaico-unifilare-${practiceId}`,
        data: {
          proprietario_nome: practice.proprietario_nome || "impianto fotovoltaico",
          rivenditore: company?.ragione_sociale || "Rivenditore",
          link,
          practice_id: practiceId,
        },
      }),
    });
    const emailResult = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok || emailResult?.success !== true) {
      return json({ success: false, error: emailResult?.error ?? "E-mail non inviata" }, 502);
    }

    const { error: updateError } = await admin
      .from("fotovoltaico_practices")
      .update({
        unifilare_status: "inviato_da_firmare",
        unifilare_draft_sent_at: new Date().toISOString(),
        status: "attesa_rivenditore",
      })
      .eq("id", practiceId)
      .eq("unifilare_status", "bozza_pronta");
    if (updateError) throw updateError;

    return json({ success: true, alreadySent: false, destination });
  } catch (error) {
    await reportError(error, { fn: "photovoltaico-unifilare" });
    return json({ success: false, error: error instanceof Error ? error.message : "Errore interno" }, 500);
  }
});
