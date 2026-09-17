/**
 * Webhook Stripe per incasso CF e fatturazione Fatture in Cloud.
 * La pratica viene sbloccata solo dopo fattura, SDI ed e-mail.
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { finalizePaidCfOrder } from "../_shared/finalize-cf-payment.ts";
import { reportError } from "../_shared/error.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return new Response("Stripe non configurato", { status: 500 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, req.headers.get("stripe-signature") ?? "", webhookSecret);
  } catch (error) {
    console.error("[stripe-webhook] firma non valida", error);
    return new Response("Firma non valida", { status: 400 });
  }

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return Response.json({ received: true, ignored: "payment_not_paid" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const orderId = String(session.metadata?.payment_order_id ?? "").trim();

  // Compatibilità coi vecchi pagamenti Stripe, separati dal nuovo flusso CF.
  if (!orderId) {
    const practiceId = String(session.metadata?.practice_id ?? "").trim();
    if (!practiceId) return Response.json({ received: true, no_practice: true });
    await admin.from("enea_practices").update({
      pagamento_stato: "pagata",
      data_incasso: new Date().toISOString(),
    }).eq("id", practiceId);
    if (session.metadata?.post_payment === "form") {
      try {
        const { data: practice } = await admin.from("enea_practices")
          .select("cliente_nome,cliente_email,form_token,prodotto_installato")
          .eq("id", practiceId)
          .maybeSingle();
        if (practice?.cliente_email && practice.form_token) {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              to: practice.cliente_email,
              template: "pagamento_privato_ok",
              data: {
                nome: practice.cliente_nome ?? "",
                prodotto: practice.prodotto_installato ?? "l'intervento",
                importo: `€ ${((session.amount_total ?? 0) / 100).toFixed(2)}`,
                link: `https://app.praticarapida.it/form/${practice.form_token}`,
                practice_id: practiceId,
              },
            }),
          });
        }
      } catch (error) {
        console.error("[stripe-webhook] email legacy fallita", error);
      }
    }
    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
    if (admins?.length) {
      await admin.from("notifications").insert(admins.map((row) => ({
        user_id: row.user_id,
        tipo: "pagamento_ricevuto",
        titolo: `Pagamento ricevuto — € ${((session.amount_total ?? 0) / 100).toFixed(2)}`,
        messaggio: "Pagamento Stripe ricevuto sul percorso storico.",
        link: `/pratiche/${practiceId}`,
      })));
    }
    return Response.json({ received: true, legacy: true, practice_id: practiceId });
  }

  const { data: prior } = await admin.from("stripe_webhook_events")
    .select("status").eq("event_id", event.id).maybeSingle();
  if (["processed", "ignored", "processing"].includes(String(prior?.status ?? ""))) {
    return Response.json({ received: true, duplicate: true });
  }
  if (prior?.status === "failed") {
    await admin.from("stripe_webhook_events").update({ status: "processing", error_message: null }).eq("event_id", event.id);
  } else {
    const { error: insertError } = await admin.from("stripe_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
      payment_order_id: orderId,
      payload: event,
      status: "processing",
    });
    if (insertError?.code === "23505") return Response.json({ received: true, duplicate: true });
    if (insertError) throw insertError;
  }

  try {
    const { data: order, error: orderError } = await admin.from("cf_payment_orders")
      .select("id,practice_id,provider,status,totale_cents,stripe_checkout_session_id,is_test_payment")
      .eq("id", orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.provider !== "stripe_fatture_in_cloud") throw new Error("Ordine Stripe/FIC non valido");
    if (order.stripe_checkout_session_id !== session.id) throw new Error("Sessione Stripe non corrispondente");
    if (session.currency?.toLowerCase() !== "eur") throw new Error(`Valuta Stripe inattesa: ${session.currency ?? "mancante"}`);
    if (Number(session.amount_total) !== Number(order.totale_cents)) {
      throw new Error(`Importo Stripe non corrispondente: ${session.amount_total} != ${order.totale_cents}`);
    }
    if (String(session.metadata?.practice_id ?? "") !== String(order.practice_id)) {
      throw new Error("Pratica Stripe non corrispondente all'ordine");
    }

    const paidAt = new Date().toISOString();
    if (!["paid", "invoicing", "invoice_created", "sdi_sending", "sdi_pending", "ready", "completed"].includes(String(order.status))) {
      const paymentIntent = session.payment_intent as string | { id?: string } | null;
      const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
      const { data: claimed, error: claimError } = await admin.from("cf_payment_orders").update({
        status: "paid",
        paid_at: paidAt,
        stripe_payment_status: session.payment_status,
        stripe_payment_intent_id: paymentIntentId,
        stripe_event_id: event.id,
        last_error_code: null,
        last_error_message: null,
        updated_at: paidAt,
      }).eq("id", orderId).in("status", ["creating", "pending", "failed"]).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) throw new Error("Ordine non acquisibile per la fatturazione");
    }

    // Pagato è visibile subito, ma lo stage operativo non cambia ancora.
    await admin.from("enea_practices").update({ pagamento_stato: "pagata", data_incasso: paidAt })
      .eq("id", order.practice_id);
    const result = await finalizePaidCfOrder(admin, orderId);
    await admin.from("stripe_webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("event_id", event.id);
    return Response.json({ received: true, order_id: orderId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("stripe_webhook_events").update({ status: "failed", error_message: message.slice(0, 2000) })
      .eq("event_id", event.id);
    await admin.from("cf_payment_orders").update({
      last_error_code: "STRIPE_FIC_FINALIZATION_FAILED",
      last_error_message: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    await reportError(error, { fn: "stripe-webhook", event_id: event.id, payment_order_id: orderId });
    console.error("[stripe-webhook] finalizzazione fallita", error);
    return new Response("Finalizzazione pagamento non completata", { status: 500 });
  }
});
