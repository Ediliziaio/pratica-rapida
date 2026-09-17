import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import {
  createProforma,
  extractBillingIdentity,
  getFicConfig,
  proformaPayload,
  scheduleDocumentEmail,
  type JsonObject,
} from "../_shared/fatture-in-cloud.ts";
import { reportError } from "../_shared/error.ts";
import {
  calculatePaymentPricing,
  createTestPaymentPricing,
  isCadastralServiceRequested,
} from "../_shared/fic-pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

const normalizeName = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Deno.env.get("FIC_PAYMENT_CREATION_ENABLED") !== "true") {
    return json({ error: "Pagamenti Fatture in Cloud non ancora attivati" }, 503);
  }

  let token = "";
  try {
    token = String((await req.json())?.token ?? "").trim();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  if (!token) return json({ error: "Token obbligatorio" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: practice } = await admin
    .from("enea_practices")
    .select("id,reseller_id,tipo_fatturazione,pagamento_stato,form_compilato_at,archived_at,cliente_nome,cliente_cognome,cliente_email,cliente_cf,cliente_indirizzo,dati_form,prodotto_installato")
    .eq("form_token", token)
    .maybeSingle();

  if (!practice || practice.archived_at) return json({ error: "Pratica non trovata" }, 404);
  const cadastralService = isCadastralServiceRequested(practice.dati_form);
  if (practice.tipo_fatturazione !== "cliente_finale" && !cadastralService) {
    return json({ error: "La pratica non richiede un pagamento al cliente finale" }, 409);
  }
  if (!practice.form_compilato_at) return json({ error: "Completa il modulo prima del pagamento" }, 409);
  if (practice.pagamento_stato === "pagata") {
    return json({ error: "Questa pratica risulta già pagata e non deve essere addebitata una seconda volta" }, 409);
  }

  const { data: existing } = await admin
    .from("cf_payment_orders")
    .select("status,provider,stripe_checkout_url,fic_document_url,last_error_message")
    .eq("practice_id", practice.id)
    .maybeSingle();
  const existingUrl = existing?.stripe_checkout_url || existing?.fic_document_url;
  if (existingUrl) {
    return json({ status: existing.status, payment_url: existingUrl, existing: true });
  }
  if (existing) {
    return json({
      error: existing.status === "failed"
        ? "La richiesta di pagamento è stata registrata ma richiede una verifica dello staff. Non ricompilare il modulo."
        : "La richiesta di pagamento è in preparazione. Riprova tra pochi secondi.",
      status: existing.status,
    }, 409);
  }

  try {
    const { data: settingRows } = await admin.from("platform_settings")
      .select("key,value")
      .in("key", ["cf_sima_home_company_id", "prezzo_cf_standard", "prezzo_cf_sima_home", "prezzo_servizio_catastale"]);
    const settings = Object.fromEntries((settingRows ?? []).map((row) => [row.key, row.value as JsonObject]));
    const simaId = String(settings.cf_sima_home_company_id?.company_id ?? "");
    const standard = settings.prezzo_cf_standard ?? {};
    const sima = settings.prezzo_cf_sima_home ?? {};
    const cadastral = settings.prezzo_servizio_catastale ?? {};
    const vatPercent = Number(standard.iva_percent ?? sima.iva_percent ?? cadastral.iva_percent ?? 22);
    if (standard.attivo === false || sima.attivo === false || (cadastralService && cadastral.attivo === false)) {
      return json({ error: "Prezzo CF non configurato" }, 503);
    }
    const customer = extractBillingIdentity(practice as JsonObject);
    const now = new Date().toISOString();
    const { data: testOverride, error: testOverrideError } = await admin
      .from("cf_payment_test_overrides")
      .select("practice_id,expected_customer_name,net_cents,vat_percent")
      .eq("practice_id", practice.id)
      .eq("enabled", true)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    if (testOverrideError) throw testOverrideError;
    if (testOverride && practice.tipo_fatturazione !== "cliente_finale") {
      return json({ error: "Il collaudo da 1 € è consentito soltanto su una pratica CF" }, 409);
    }
    if (testOverride && normalizeName(customer.name) !== normalizeName(String(testOverride.expected_customer_name))) {
      return json({ error: "La pratica non corrisponde al nominativo autorizzato per il collaudo" }, 409);
    }
    const isTestPayment = Boolean(testOverride);
    const price = testOverride ? createTestPaymentPricing(
      Number(testOverride.vat_percent),
      Number(testOverride.net_cents),
    ) : calculatePaymentPricing({
      tipoFatturazione: practice.tipo_fatturazione,
      resellerId: practice.reseller_id,
      simaResellerId: simaId,
      standardNetCents: Math.round(Number(standard.imponibile_cents ?? 0)),
      simaNetCents: Math.round(Number(sima.imponibile_cents ?? 0)),
      cadastralNetCents: Math.round(Number(cadastral.imponibile_cents ?? 0)),
      vatPercent,
      cadastralService,
      product: practice.prodotto_installato ?? "ENEA",
    });

    const paymentProvider = Deno.env.get("CF_PAYMENT_PROVIDER") === "stripe"
      ? "stripe_fatture_in_cloud"
      : "fatture_in_cloud_tspay";
    const { data: reserved, error: reserveError } = await admin.from("cf_payment_orders").insert({
      practice_id: practice.id,
      provider: paymentProvider,
      pricing_key: price.pricingKey,
      servizio_catastale: price.cadastralService,
      imponibile_cents: price.netCents,
      iva_percent: vatPercent,
      totale_cents: price.grossCents,
      is_test_payment: isTestPayment,
      status: "creating",
    }).select("id").single();
    if (reserveError) {
      if (reserveError.code === "23505") return json({ error: "Richiesta già in preparazione. Riprova tra pochi secondi." }, 409);
      throw reserveError;
    }

    const config = getFicConfig();
    const created = await createProforma(
      config,
      proformaPayload(practice.id, practice.prodotto_installato ?? "ENEA", customer, price),
    );
    const document = created.data ?? {};
    const proformaId = Number(document.id);
    const documentUrl = String(document.url ?? "").trim();
    if (!Number.isInteger(proformaId) || proformaId <= 0 || !documentUrl) {
      throw new Error("Fatture in Cloud non ha restituito ID e URL della proforma");
    }

    let paymentUrl = documentUrl;
    let stripeSessionId: string | null = null;
    if (paymentProvider === "stripe_fatture_in_cloud") {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
      if (!stripeKey) throw new Error("Stripe non configurato: STRIPE_SECRET_KEY mancante");
      const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://app.praticarapida.it").replace(/\/+$/, "");
      const stripe = new Stripe(stripeKey, {
        apiVersion: "2024-06-20",
        httpClient: Stripe.createFetchHttpClient(),
      });
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: customer.email,
        locale: "it",
        line_items: price.lines.map((line) => ({
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: line.netCents + Math.round(line.netCents * line.vatPercent / 100),
            product_data: { name: line.name },
          },
        })),
        metadata: {
          payment_order_id: String(reserved.id),
          practice_id: practice.id,
        },
        payment_intent_data: {
          metadata: {
            payment_order_id: String(reserved.id),
            practice_id: practice.id,
          },
        },
        success_url: `${siteUrl}/form/${token}?pagamento=ok`,
        cancel_url: `${siteUrl}/form/${token}?pagamento=annullato`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      }, { idempotencyKey: `cf-payment-order-${reserved.id}` });
      stripeSessionId = session.id;
      paymentUrl = String(session.url ?? "");
      if (!paymentUrl) throw new Error("Stripe non ha restituito il link di pagamento");
    }

    await admin.from("cf_payment_orders").update({
      status: "pending",
      fic_proforma_id: proformaId,
      // La proforma resta un documento tecnico se il checkout è Stripe: non
      // viene mostrata né spedita al cliente.
      fic_document_url: paymentProvider === "fatture_in_cloud_tspay" ? documentUrl : null,
      stripe_checkout_session_id: stripeSessionId,
      stripe_checkout_url: paymentProvider === "stripe_fatture_in_cloud" ? paymentUrl : null,
      updated_at: new Date().toISOString(),
    }).eq("practice_id", practice.id);
    if (isTestPayment) {
      const { error: consumeError } = await admin.from("cf_payment_test_overrides").update({
        consumed_at: new Date().toISOString(),
      }).eq("practice_id", practice.id).is("consumed_at", null);
      if (consumeError) {
        console.error("[fic-create-payment] proforma di collaudo creata, marcatura monouso fallita", consumeError);
        await reportError(consumeError, { fn: "fic-create-payment", practice_id: practice.id, phase: "consume-test-override" });
      }
    }
    const practiceUpdate: Record<string, unknown> = { pagamento_stato: "non_pagata" };
    if (practice.tipo_fatturazione === "cliente_finale") practiceUpdate.prezzo = price.netCents / 100;
    await admin.from("enea_practices").update(practiceUpdate).eq("id", practice.id);

    // Nel vecchio percorso TS Pay l'e-mail contiene la proforma da aprire. Con
    // Stripe non va inviata: il cliente deve vedere direttamente il checkout.
    if (paymentProvider === "fatture_in_cloud_tspay") {
      try {
        await scheduleDocumentEmail(config, proformaId, customer.email, customer.name, "proforma");
        await admin.from("cf_payment_orders").update({ proforma_emailed_at: new Date().toISOString() }).eq("practice_id", practice.id);
      } catch (emailError) {
        console.error("[fic-create-payment] proforma creata, email fallita", emailError);
        await admin.from("cf_payment_orders").update({
          last_error_code: "PROFORMA_EMAIL_FAILED",
          last_error_message: emailError instanceof Error ? emailError.message : String(emailError),
        }).eq("practice_id", practice.id);
      }
    }

    return json({ status: "pending", payment_url: paymentUrl, total_cents: price.grossCents });
  } catch (error) {
    await admin.from("cf_payment_orders").update({
      status: "failed",
      last_error_code: "PROFORMA_CREATE_FAILED",
      last_error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      retry_count: 1,
      updated_at: new Date().toISOString(),
    }).eq("practice_id", practice.id);
    await reportError(error, { fn: "fic-create-payment", practice_id: practice.id });
    return json({ error: "Richiesta registrata, ma il pagamento richiede una verifica dello staff. Non ricompilare il modulo." }, 502);
  }
});
