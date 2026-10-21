/**
 * eneasubito-pagato — il webhook del conto di EneaSubito.
 *
 * Separato da `stripe-webhook`: quello finalizza con Fatture in Cloud e lo
 * SDI per l'altra societa'. Qui la fattura l'ha gia' emessa Stripe, quindi
 * resta una cosa sola da fare: segnare la pratica pagata e metterla in coda
 * perche' il cliente completi i dati che mancano.
 *
 * Segreti richiesti:
 *   STRIPE_ENEASUBITO_SECRET_KEY
 *   STRIPE_ENEASUBITO_WEBHOOK_SECRET
 *
 * Pubblica: --no-verify-jwt (la chiama Stripe, non un utente).
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Metodo non consentito", { status: 405 });

  // I segreti incollati a mano portano spesso un a capo finale: Stripe lo
  // conta nella firma e scarterebbe eventi veri.
  const chiave = Deno.env.get("STRIPE_ENEASUBITO_SECRET_KEY")?.trim();
  const segretoWebhook = Deno.env.get("STRIPE_ENEASUBITO_WEBHOOK_SECRET")?.trim();
  if (!chiave || !segretoWebhook) return new Response("Conto non collegato", { status: 500 });

  const stripe = new Stripe(chiave, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const grezzo = await req.text();
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(
      grezzo,
      req.headers.get("stripe-signature") ?? "",
      segretoWebhook,
    );
  } catch (e) {
    console.error("[eneasubito-pagato] firma non valida", e);
    return new Response("Firma non valida", { status: 400 });
  }

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(evento.type)) {
    return Response.json({ ricevuto: true, ignorato: evento.type });
  }
  const sessione = evento.data.object as Stripe.Checkout.Session;

  // Paghi solo quando la pratica e' inviata (21/10/2026): la cassa ora blocca
  // la carta e basta, e Stripe chiude la sessione con «unpaid». Si riconosce
  // dal pagamento in attesa di incasso, non dallo stato della sessione.
  let cartaBloccata = false;
  let pagamentoId = "";
  if (sessione.payment_status !== "paid") {
    pagamentoId = typeof sessione.payment_intent === "string"
      ? sessione.payment_intent
      : sessione.payment_intent?.id ?? "";
    if (pagamentoId) {
      try {
        const pagamento = await stripe.paymentIntents.retrieve(pagamentoId);
        cartaBloccata = pagamento.status === "requires_capture";
      } catch (e) {
        console.error("[eneasubito-pagato] pagamento non leggibile", e);
        return new Response("Pagamento non leggibile", { status: 500 });
      }
    }
    if (!cartaBloccata) return Response.json({ ricevuto: true, ignorato: "non_pagata" });
  }

  const praticaId = String(sessione.metadata?.pratica_id ?? sessione.client_reference_id ?? "").trim();
  if (!praticaId) return Response.json({ ricevuto: true, ignorato: "senza_riferimento" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Solo pratiche di questo canale: un riferimento sbagliato non deve poter
  // toccare le pratiche dell'altro marchio.
  const { data: pratica } = await db
    .from("enea_practices")
    .select("id, canale, pagamento_stato, carta_bloccata_at, current_stage_id")
    .eq("id", praticaId)
    .maybeSingle();
  if (!pratica || pratica.canale !== "eneasubito") {
    return Response.json({ ricevuto: true, ignorato: "canale_non_corrispondente" });
  }
  // Stripe puo' consegnare lo stesso evento piu' volte.
  if (pratica.pagamento_stato === "pagata") return Response.json({ ricevuto: true, gia_registrato: true });
  if (cartaBloccata && pratica.carta_bloccata_at) return Response.json({ ricevuto: true, gia_registrato: true });

  // Pagata: ora tocca al cliente completare i dati che mancano.
  const { data: stage } = await db
    .from("pipeline_stages")
    .select("id")
    .is("reseller_id", null)
    .eq("stage_type", "attesa_compilazione")
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  const quando = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });

  if (cartaBloccata) {
    const { error: erroreBlocco } = await db
      .from("enea_practices")
      .update({
        carta_bloccata_at: new Date().toISOString(),
        stripe_payment_intent: pagamentoId,
        ...(stage?.id ? { current_stage_id: stage.id } : {}),
        note_interne:
          `Carta bloccata il ${quando} (pagamento ${pagamentoId}). L'addebito parte quando la pratica entra in «Da inserire su Excel».`,
      })
      .eq("id", pratica.id);
    if (erroreBlocco) {
      console.error("[eneasubito-pagato] blocco non registrato", erroreBlocco);
      return new Response("Aggiornamento fallito", { status: 500 });
    }
    return Response.json({ ricevuto: true, pratica: pratica.id, carta_bloccata: true });
  }

  // Il prezzo lo diciamo a Stripe e Stripe ce lo rimanda: lo scriviamo come
  // ce lo da' lui, senza ricalcolarlo. Serve al cruscotto per avere il totale
  // del mese di EneaSubito senza doverlo indovinare da un listino.
  const incassato = Number(sessione.amount_total ?? 0) / 100;
  const { error } = await db
    .from("enea_practices")
    .update({
      pagamento_stato: "pagata",
      data_incasso: new Date().toISOString().slice(0, 10),
      ...(incassato > 0 ? { prezzo: incassato } : {}),
      // Chi paga dal link mandato alla consegna ha gia' la sua colonna: non
      // si torna indietro.
      ...(stage?.id && !pratica.current_stage_id ? { current_stage_id: stage.id } : {}),
      note_interne: `Pagamento ricevuto il ${quando}. Fattura emessa da Stripe (sessione ${sessione.id}).`,
    })
    .eq("id", pratica.id);

  if (error) {
    console.error("[eneasubito-pagato] aggiornamento fallito", error);
    return new Response("Aggiornamento fallito", { status: 500 });
  }
  return Response.json({ ricevuto: true, pratica: pratica.id });
});
