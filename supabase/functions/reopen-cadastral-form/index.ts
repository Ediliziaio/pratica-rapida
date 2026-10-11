/**
 * Riapre un modulo completato quando il cliente rinuncia al servizio Catasto.
 *
 * Invarianti:
 * - solo super_admin;
 * - nessun pagamento, fattura o invio fiscale già avvenuto;
 * - un checkout Stripe ancora aperto viene prima reso inutilizzabile;
 * - risposte e allegati restano invariati;
 * - il form torna a bozza e si riapre direttamente allo step Catasto.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@18.0.0?target=deno";
import { deleteIssuedDocument, getFicConfig } from "../_shared/fatture-in-cloud.ts";

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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Autenticazione mancante" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Token non valido" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: role } = await admin.from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) return json({ error: "Operazione riservata al super amministratore" }, 403);

  let practiceId = "";
  try {
    practiceId = String((await req.json())?.practice_id ?? "").trim();
  } catch {
    return json({ error: "Body JSON non valido" }, 400);
  }
  if (!practiceId) return json({ error: "practice_id obbligatorio" }, 400);

  const { data: practice, error: practiceError } = await admin.from("enea_practices")
    .select("id,form_token,dati_form,form_compilato_at,pagamento_stato,data_incasso,archived_at")
    .eq("id", practiceId)
    .maybeSingle();
  if (practiceError) return json({ error: practiceError.message }, 400);
  if (!practice || practice.archived_at) return json({ error: "Pratica non trovata o archiviata" }, 404);

  const form = asObject(practice.dati_form);
  const catastali = asObject(form.catastali);
  const requested = catastali.recupero_richiesto === true || catastali.recupero_richiesto === "true";
  if (!requested) return json({ error: "Il servizio Catasto non risulta richiesto" }, 409);

  const { data: order, error: orderError } = await admin.from("cf_payment_orders")
    .select("id,provider,status,paid_at,fic_proforma_id,fic_invoice_id,invoice_created_at,sdi_sent_at,customer_emailed_at,stripe_checkout_session_id")
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (orderError) return json({ error: orderError.message }, 400);

  const fiscalEffects = Boolean(
    practice.pagamento_stato === "pagata" || practice.data_incasso || order?.paid_at ||
    order?.fic_invoice_id || order?.invoice_created_at || order?.sdi_sent_at ||
    order?.customer_emailed_at ||
    (order && ["paid", "invoicing", "invoice_created", "sdi_sending", "sdi_pending", "ready", "completed", "refunded"].includes(String(order.status))),
  );
  if (fiscalEffects) {
    return json({ error: "Operazione bloccata: esiste già un pagamento o un effetto fiscale da verificare" }, 409);
  }

  if (order?.provider === "fatture_in_cloud_tspay" && order.status === "pending") {
    return json({ error: "Operazione bloccata: il link TS Pay deve essere annullato manualmente prima di riaprire il modulo" }, 409);
  }

  if (order?.stripe_checkout_session_id) {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
    if (!stripeKey) return json({ error: "Stripe non configurato: impossibile invalidare il checkout" }, 503);
    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.checkout.sessions.retrieve(String(order.stripe_checkout_session_id));
    if (session.payment_status === "paid") {
      return json({ error: "Operazione bloccata: Stripe indica che il pagamento è avvenuto" }, 409);
    }
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
  }

  // La proforma del percorso Stripe e' soltanto un supporto tecnico interno:
  // se il servizio viene annullato prima del pagamento non deve restare come
  // documento aperto in Fatture in Cloud.
  if (order?.fic_proforma_id) {
    await deleteIssuedDocument(getFicConfig(), Number(order.fic_proforma_id));
  }

  if (order?.id) {
    const { error } = await admin.from("cf_payment_orders").update({
      status: "cancelled",
      fic_proforma_id: null,
      fic_document_url: null,
      stripe_checkout_session_id: null,
      stripe_checkout_url: null,
      last_error_code: "CATASTRAL_SERVICE_CANCELLED",
      last_error_message: "Servizio catastale annullato dal super amministratore prima del pagamento.",
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (error) return json({ error: error.message }, 400);
  }

  const workflow = asObject(form._workflow);
  const reopenedAt = new Date().toISOString();
  const nextForm = {
    ...form,
    catastali: { ...catastali, recupero_richiesto: false },
    _workflow: {
      ...workflow,
      reopen_at: "catastali",
      reopened_at: reopenedAt,
      reason: "cadastral_service_cancelled_before_payment",
    },
  };
  const { data: updated, error: updateError } = await admin.from("enea_practices").update({
    dati_form: nextForm,
    form_compilato_at: null,
    pagamento_stato: "non_pagata",
    data_incasso: null,
    updated_at: reopenedAt,
  })
    .eq("id", practiceId)
    .neq("pagamento_stato", "pagata")
    .select("id,form_token")
    .maybeSingle();
  if (updateError) return json({ error: updateError.message }, 400);
  if (!updated) return json({ error: "Stato cambiato durante il controllo: nessuna modifica applicata" }, 409);

  return json({ success: true, practice_id: updated.id, form_token: updated.form_token });
});
