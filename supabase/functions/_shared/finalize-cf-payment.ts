import {
  getFicConfig,
  scheduleDocumentEmail,
  sendEInvoice,
  transformProformaToInvoice,
  type JsonObject,
} from "./fatture-in-cloud.ts";

type AdminClient = {
  from: (table: string) => any;
};

export interface FinalizeResult {
  ready: boolean;
  reason?: "test" | "invoicing_disabled" | "sdi_dry_run" | "invoice_email_pending";
  invoiceId?: number;
}

async function notifyAdmins(
  admin: AdminClient,
  practiceId: string,
  title: string,
  message: string,
  type = "pagamento_ricevuto",
) {
  const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
  if (!admins?.length) return;
  await admin.from("notifications").insert(admins.map((row: { user_id: string }) => ({
    user_id: row.user_id,
    tipo: type,
    titolo: title,
    messaggio: message,
    link: `/pratiche/${practiceId}`,
  })));
}

/**
 * Completa gli effetti successivi a un pagamento già verificato.
 *
 * Invariante principale: la pratica non entra mai in `pronte_da_fare` prima
 * che fattura, invio SDI e richiesta di invio e-mail siano stati registrati.
 * Gli aggiornamenti di stato fungono anche da claim per evitare duplicazioni.
 */
export async function finalizePaidCfOrder(
  admin: AdminClient,
  orderId: string,
): Promise<FinalizeResult> {
  const { data: order, error: orderError } = await admin
    .from("cf_payment_orders")
    .select("*, enea_practices:practice_id(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Ordine di pagamento non trovato");

  const practice = (order.enea_practices ?? {}) as JsonObject;
  const practiceId = String(order.practice_id);
  const paidAt = String(order.paid_at ?? new Date().toISOString());

  if (order.is_test_payment === true) {
    const { data: readyStage } = await admin.from("pipeline_stages")
      .select("id")
      .is("reseller_id", null)
      .eq("stage_type", "pronte_da_fare")
      .eq("brand", practice.brand ?? "enea")
      .limit(1)
      .maybeSingle();
    if (!readyStage?.id) throw new Error("Colonna 'Pronte da fare' non trovata");

    // Il collaudo non genera documenti fiscali, ma deve comunque verificare
    // l'intero passaggio operativo pagamento → pratica pronta. In caso
    // contrario il test risulterebbe positivo pur lasciando la pratica nella
    // colonna precedente, che è esattamente il guasto che deve intercettare.
    await admin.from("enea_practices").update({
      pagamento_stato: "pagata",
      data_incasso: paidAt,
      current_stage_id: readyStage.id,
    }).eq("id", practiceId);
    await admin.from("cf_payment_orders").update({
      status: "completed",
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    await notifyAdmins(
      admin,
      practiceId,
      "Collaudo pagamento ricevuto — € 1,00",
      "Pagamento Stripe di collaudo associato e pratica spostata in Pronte da fare. Nessuna fattura e nessun invio SDI sono stati eseguiti.",
    );
    return { ready: true, reason: "test" };
  }

  if (Deno.env.get("FIC_LIVE_INVOICING_ENABLED") !== "true") {
    await admin.from("cf_payment_orders").update({
      last_error_code: "LIVE_INVOICING_DISABLED",
      last_error_message: "Pagamento ricevuto; fatturazione automatica sospesa dal controllo di sicurezza.",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    await notifyAdmins(
      admin,
      practiceId,
      `Pagamento CF ricevuto — € ${(Number(order.totale_cents) / 100).toFixed(2)}`,
      "Pagamento verificato. La pratica resta bloccata perché la fatturazione automatica non è ancora autorizzata.",
    );
    return { ready: false, reason: "invoicing_disabled" };
  }

  const config = getFicConfig();
  let invoiceId = Number(order.fic_invoice_id ?? 0);
  let invoiceUrl = String(order.fic_invoice_url ?? "");

  if (!invoiceId) {
    const proformaId = Number(order.fic_proforma_id ?? 0);
    if (!Number.isInteger(proformaId) || proformaId <= 0) {
      throw new Error("Proforma tecnica Fatture in Cloud mancante");
    }
    const { data: claimed, error: claimError } = await admin.from("cf_payment_orders")
      .update({ status: "invoicing", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "paid")
      .is("fic_invoice_id", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      throw new Error("Fatturazione già in corso o da verificare: nessun secondo documento è stato creato");
    }

    const invoice = await transformProformaToInvoice(config, proformaId, paidAt);
    invoiceId = Number(invoice.data.id);
    invoiceUrl = String(invoice.data.url ?? "");
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      throw new Error("Fatture in Cloud non ha restituito l'ID fattura");
    }
    const now = new Date().toISOString();
    await admin.from("cf_payment_orders").update({
      status: "invoice_created",
      fic_invoice_id: invoiceId,
      fic_invoice_url: invoiceUrl || null,
      invoice_created_at: now,
      last_error_code: null,
      last_error_message: null,
      updated_at: now,
    }).eq("id", orderId);
  }

  // Ricarica i marker dopo l'eventuale creazione della fattura: una consegna
  // webhook ripetuta deve riprendere dall'ultimo effetto completato.
  const { data: current, error: currentError } = await admin.from("cf_payment_orders")
    .select("status,sdi_sent_at,customer_emailed_at,invoice_email_requested_at")
    .eq("id", orderId)
    .maybeSingle();
  if (currentError) throw currentError;

  const dryRun = Deno.env.get("FIC_SDI_DRY_RUN") !== "false";
  if (!current?.sdi_sent_at) {
    const { data: sdiClaim, error: sdiClaimError } = await admin.from("cf_payment_orders")
      .update({ status: "sdi_sending", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "invoice_created")
      .is("sdi_sent_at", null)
      .select("id")
      .maybeSingle();
    if (sdiClaimError) throw sdiClaimError;
    if (!sdiClaim) throw new Error("Invio SDI già in corso o da verificare");
    await sendEInvoice(config, invoiceId, dryRun);
    if (dryRun) {
      await admin.from("cf_payment_orders").update({
        status: "invoice_created",
        last_error_code: "SDI_DRY_RUN_OK",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      return { ready: false, reason: "sdi_dry_run", invoiceId };
    }
    await admin.from("cf_payment_orders").update({
      status: "sdi_pending",
      sdi_sent_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
  }

  const email = String(practice.cliente_email ?? "").trim();
  const name = `${String(practice.cliente_nome ?? "").trim()} ${String(practice.cliente_cognome ?? "").trim()}`.trim();
  if (!email) throw new Error("E-mail cliente mancante: fattura non inviata");

  if (!current?.customer_emailed_at) {
    if (!current?.invoice_email_requested_at) {
      await scheduleDocumentEmail(config, invoiceId, email, name, "invoice");
      const requestedAt = new Date().toISOString();
      await admin.from("cf_payment_orders").update({
        invoice_email_requested_at: requestedAt,
        updated_at: requestedAt,
      }).eq("id", orderId);
    }
    // `scheduleDocumentEmail` accoda l'invio. Lo stato "inviata" e lo sblocco
    // operativo arrivano soltanto dal webhook FIC `invoices.email_sent`.
    return { ready: false, reason: "invoice_email_pending", invoiceId };
  }

  const { data: readyStage } = await admin.from("pipeline_stages")
    .select("id")
    .is("reseller_id", null)
    .eq("stage_type", "pronte_da_fare")
    .eq("brand", practice.brand ?? "enea")
    .limit(1)
    .maybeSingle();
  if (!readyStage?.id) throw new Error("Colonna 'Pronte da fare' non trovata");

  await admin.from("enea_practices").update({
    pagamento_stato: "pagata",
    data_incasso: paidAt,
    current_stage_id: readyStage.id,
  }).eq("id", practiceId);
  await admin.from("cf_payment_orders").update({
    status: "ready",
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);

  await notifyAdmins(
    admin,
    practiceId,
    `CF pronto — pagato e fatturato € ${(Number(order.totale_cents) / 100).toFixed(2)}`,
    "Pagamento Stripe verificato; fattura emessa da Fatture in Cloud, inviata allo SDI e spedita al cliente via e-mail.",
  );
  return { ready: true, invoiceId };
}
