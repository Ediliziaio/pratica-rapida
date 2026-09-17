import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { importSPKI, jwtVerify } from "https://esm.sh/jose@5.9.6";
import {
  getFicConfig,
  getIssuedDocument,
  isDocumentPaid,
  scheduleDocumentEmail,
  sendEInvoice,
  transformProformaToInvoice,
  type JsonObject,
} from "../_shared/fatture-in-cloud.ts";
import { reportError } from "../_shared/error.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ISSUER = "https://api-v2.fattureincloud.it";

async function verifyWebhook(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  const encodedPem = Deno.env.get("FIC_WEBHOOK_PUBLIC_KEY_B64")?.trim() ?? "";
  const audience = Deno.env.get("FIC_WEBHOOK_URL")?.trim() ?? "";
  if (!jwt || !encodedPem || !audience) throw new Error("Webhook FIC non configurato o privo di firma");
  const bytes = Uint8Array.from(atob(encodedPem), (char) => char.charCodeAt(0));
  const pem = new TextDecoder().decode(bytes);
  const publicKey = await importSPKI(pem, "ES256");
  await jwtVerify(jwt, publicKey, { issuer: ISSUER, audience });
}

function cloudEvent(req: Request, body: JsonObject) {
  const structured = typeof body.type === "string";
  return {
    id: String((structured ? body.id : req.headers.get("ce-id")) ?? "").trim(),
    type: String((structured ? body.type : req.headers.get("ce-type")) ?? "").trim(),
    subject: String((structured ? body.subject : req.headers.get("ce-subject")) ?? "").trim(),
    data: (structured ? body.data : body) as JsonObject,
  };
}

serve(async (req) => {
  try {
    await verifyWebhook(req);
  } catch (error) {
    console.error("[fic-webhook] firma non valida", error);
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method === "GET") {
    const challenge = req.headers.get("x-fic-verification-challenge")
      ?? new URL(req.url).searchParams.get("x-fic-verification-challenge");
    if (!challenge) return new Response("Missing challenge", { status: 400 });
    return Response.json({ verification: challenge });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: JsonObject;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const event = cloudEvent(req, body);
  if (!event.id || !event.type) return new Response("Invalid CloudEvent", { status: 400 });
  const ids = Array.isArray(event.data?.ids)
    ? (event.data.ids as unknown[]).map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: previous } = await admin.from("fic_webhook_events").select("status").eq("event_id", event.id).maybeSingle();
  if (previous?.status === "processed" || previous?.status === "ignored") {
    return Response.json({ received: true, duplicate: true });
  }
  await admin.from("fic_webhook_events").upsert({
    event_id: event.id,
    event_type: event.type,
    subject: event.subject || null,
    resource_ids: ids,
    payload: body,
    status: "processing",
    error_message: null,
  }, { onConflict: "event_id" });

  try {
    if (event.type === "it.fattureincloud.webhooks.subscriptions.welcome") {
      await admin.from("fic_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("event_id", event.id);
      return Response.json({ received: true, welcome: true });
    }

    const config = getFicConfig();
    if (event.type === "it.fattureincloud.webhooks.issued_documents.proformas.update") {
      for (const proformaId of ids) {
        const { data: order } = await admin
          .from("cf_payment_orders")
          .select("*, enea_practices:practice_id(*)")
          .eq("fic_proforma_id", proformaId)
          .maybeSingle();
        if (!order) continue;

        const current = await getIssuedDocument(config, proformaId);
        if (!isDocumentPaid(current.data, order.totale_cents)) continue;
        const paidAt = new Date().toISOString();
        if (["creating", "pending", "paid"].includes(String(order.status))) {
          await admin.from("cf_payment_orders").update({ status: "paid", paid_at: order.paid_at ?? paidAt, updated_at: paidAt })
            .eq("id", order.id)
            .in("status", ["creating", "pending", "paid"]);
        }
        await admin.from("enea_practices").update({ pagamento_stato: "pagata", data_incasso: order.paid_at ?? paidAt }).eq("id", order.practice_id);

        // Il pagamento confermato sblocca la pratica indipendentemente dalla
        // fatturazione: il relativo interruttore governa soltanto gli effetti
        // fiscali, non deve lasciare una pratica pagata fuori dal flusso operativo.
        const practice = (order.enea_practices ?? {}) as JsonObject;
        const { data: readyStage } = await admin.from("pipeline_stages")
          .select("id")
          .is("reseller_id", null)
          .eq("stage_type", "pronte_da_fare")
          .eq("brand", practice.brand ?? "enea")
          .limit(1)
          .maybeSingle();
        if (readyStage?.id) {
          await admin.from("enea_practices").update({ current_stage_id: readyStage.id }).eq("id", order.practice_id);
        }

        // Un pagamento di collaudo verifica soltanto TS Pay e l'associazione
        // alla pratica. Non deve mai produrre documenti fiscali reali.
        if (order.is_test_payment === true) {
          const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
          if (admins?.length) {
            await admin.from("notifications").insert(admins.map((row) => ({
              user_id: row.user_id,
              tipo: "pagamento_ricevuto",
              titolo: "Collaudo pagamento ricevuto — € 1,00",
              messaggio: "Test TS Pay associato alla pratica. Nessuna fattura e nessun invio SDI sono stati eseguiti.",
              link: `/pratiche/${order.practice_id}`,
            })));
          }
          continue;
        }

        // Interruttore Cabina di Regia: senza approvazione esplicita il denaro
        // viene rilevato, ma nessuna fattura viene creata o inviata allo SDI.
        if (Deno.env.get("FIC_LIVE_INVOICING_ENABLED") !== "true") {
          const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
          if (admins?.length) {
            await admin.from("notifications").insert(admins.map((row) => ({
              user_id: row.user_id,
              tipo: "pagamento_ricevuto",
              titolo: `Pagamento CF ricevuto — € ${(order.totale_cents / 100).toFixed(2)}`,
              messaggio: "Pagamento associato alla pratica. Fatturazione automatica ancora sospesa per controllo.",
              link: `/pratiche/${order.practice_id}`,
            })));
          }
          continue;
        }

        let invoiceId = Number(order.fic_invoice_id ?? 0);
        let invoiceUrl = String(order.fic_invoice_url ?? "");
        if (!invoiceId) {
          // Claim atomico: soltanto una consegna webhook può creare la fattura.
          const { data: claimed, error: claimError } = await admin.from("cf_payment_orders")
            .update({ status: "invoicing", updated_at: new Date().toISOString() })
            .eq("id", order.id)
            .eq("status", "paid")
            .is("fic_invoice_id", null)
            .select("id")
            .maybeSingle();
          if (claimError) throw claimError;
          if (!claimed) continue;

          const invoice = await transformProformaToInvoice(config, proformaId);
          invoiceId = Number(invoice.data.id);
          invoiceUrl = String(invoice.data.url ?? "");
          if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new Error("FIC non ha restituito l'ID fattura");
          await admin.from("cf_payment_orders").update({
            status: "invoice_created",
            fic_invoice_id: invoiceId,
            fic_invoice_url: invoiceUrl || null,
            invoice_created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
        }

        const dryRun = Deno.env.get("FIC_SDI_DRY_RUN") !== "false";
        if (!dryRun && order.sdi_sent_at) continue;
        // Secondo claim atomico: impedisce invii SDI concorrenti anche se FIC
        // consegna più eventi diversi per lo stesso documento.
        const { data: sdiClaimed, error: sdiClaimError } = await admin.from("cf_payment_orders")
          .update({ status: "sdi_sending", updated_at: new Date().toISOString() })
          .eq("id", order.id)
          .eq("status", "invoice_created")
          .is("sdi_sent_at", null)
          .select("id")
          .maybeSingle();
        if (sdiClaimError) throw sdiClaimError;
        if (!sdiClaimed) continue;

        await sendEInvoice(config, invoiceId, dryRun);
        if (dryRun) {
          await admin.from("cf_payment_orders").update({ status: "invoice_created", last_error_code: "SDI_DRY_RUN_OK" }).eq("id", order.id);
          continue;
        }

        // Registrare prima l'effetto fiscale: un errore email successivo non
        // deve mai causare un secondo invio della stessa fattura allo SDI.
        const sdiSentAt = new Date().toISOString();
        await admin.from("cf_payment_orders").update({
          status: "sdi_pending",
          sdi_sent_at: sdiSentAt,
          last_error_code: null,
          last_error_message: null,
          updated_at: sdiSentAt,
        }).eq("id", order.id);

        const email = String(practice.cliente_email ?? "").trim();
        const name = `${String(practice.cliente_nome ?? "").trim()} ${String(practice.cliente_cognome ?? "").trim()}`.trim();
        if (!order.customer_emailed_at && email) {
          try {
            await scheduleDocumentEmail(config, invoiceId, email, name, "invoice");
            await admin.from("cf_payment_orders").update({
              customer_emailed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", order.id);
          } catch (emailError) {
            console.error("[fic-webhook] fattura inviata allo SDI, email fallita", emailError);
            await admin.from("cf_payment_orders").update({
              last_error_code: "INVOICE_EMAIL_FAILED",
              last_error_message: emailError instanceof Error ? emailError.message.slice(0, 1000) : String(emailError).slice(0, 1000),
              updated_at: new Date().toISOString(),
            }).eq("id", order.id);
          }
        }
        const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
        if (admins?.length) {
          await admin.from("notifications").insert(admins.map((row) => ({
            user_id: row.user_id,
            tipo: "pagamento_ricevuto",
            titolo: `Pagamento CF ricevuto — € ${(order.totale_cents / 100).toFixed(2)}`,
            messaggio: "Pagamento associato alla pratica; fattura creata e inviata allo SDI.",
            link: `/pratiche/${order.practice_id}`,
          })));
        }
      }
    } else if (event.type === "it.fattureincloud.webhooks.issued_documents.e_invoices.status_update") {
      for (const invoiceId of ids) {
        const { data: order } = await admin.from("cf_payment_orders").select("id,practice_id").eq("fic_invoice_id", invoiceId).maybeSingle();
        if (!order) continue;
        const invoice = await getIssuedDocument(config, invoiceId);
        const eiStatus = String(invoice.data.ei_status ?? "");
        if (["accepted", "not_delivered", "no_response", "manual_accepted"].includes(eiStatus)) {
          await admin.from("cf_payment_orders").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", order.id);
        } else if (["error", "discarded", "rejected", "manual_rejected"].includes(eiStatus)) {
          await admin.from("cf_payment_orders").update({
            status: "failed",
            last_error_code: `SDI_${eiStatus.toUpperCase()}`,
            last_error_message: "La fattura elettronica richiede un intervento manuale.",
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
          const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
          if (admins?.length) {
            await admin.from("notifications").insert(admins.map((row) => ({
              user_id: row.user_id,
              tipo: "errore_fatturazione",
              titolo: "Fattura CF da verificare",
              messaggio: `Stato SDI: ${eiStatus}. La pratica resta pagata ma richiede controllo.`,
              link: `/pratiche/${order.practice_id}`,
            })));
          }
        }
      }
    } else {
      await admin.from("fic_webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", event.id);
      return Response.json({ received: true, ignored: event.type });
    }

    await admin.from("fic_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("event_id", event.id);
    return Response.json({ received: true, event_id: event.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("fic_webhook_events").update({ status: "failed", error_message: message.slice(0, 2000) }).eq("event_id", event.id);
    await reportError(error, { fn: "fic-webhook", event_id: event.id, event_type: event.type });
    return new Response("Processing failed", { status: 500 });
  }
});
