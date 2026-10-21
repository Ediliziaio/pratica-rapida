/**
 * eneasubito-incassa — addebita i 99 € quando la pratica è stata consegnata.
 *
 * «Paghi solo quando la pratica è inviata», deciso dal Titolare il
 * 21/10/2026. Alla cassa Stripe blocca la carta e basta; quando la pratica
 * entra in «Da inserire su Excel» il database chiama questa funzione, che:
 *
 *   - se il blocco c'è ancora, incassa (Stripe manda ricevuta e fattura);
 *   - se il blocco è scaduto o è stato annullato, apre una cassa normale e
 *     manda al cliente il link: «la tua pratica è pronta, paga qui».
 *
 * La chiama solo chi ha `x-solleciti-chiave` (la stessa chiave interna
 * dell'orologio dei solleciti). Rieseguirla non incassa due volte: una
 * pratica già pagata esce subito.
 *
 * Segreti: STRIPE_ENEASUBITO_SECRET_KEY, SOLLECITI_CHIAVE,
 * RESEND_API_KEY_ENEASUBITO.
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHIAVE_INTERNA = (Deno.env.get("SOLLECITI_CHIAVE") ?? "").trim();
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_ENEASUBITO") ?? "";
const DA = "EneaSubito <assistenza@eneasubito.it>";
const SITO = (Deno.env.get("ENEASUBITO_SITE_URL") ?? "https://www.eneasubito.it").replace(/\/+$/, "");
const IMPORTO_DI_RISERVA = 9900;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const data = req.headers.get("x-solleciti-chiave") ?? "";
  if (CHIAVE_INTERNA.length < 32 || data.length !== CHIAVE_INTERNA.length || data !== CHIAVE_INTERNA) {
    return json({ error: "non autorizzato" }, 401);
  }

  const chiaveStripe = Deno.env.get("STRIPE_ENEASUBITO_SECRET_KEY")?.trim();
  if (!chiaveStripe) return json({ error: "Il conto di incasso non e' collegato" }, 503);

  let praticaId = "";
  try {
    praticaId = String((await req.json())?.pratica_id ?? "").trim();
  } catch {
    return json({ error: "Richiesta illeggibile" }, 400);
  }
  if (!praticaId) return json({ error: "Pratica non indicata" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: pratica } = await db
    .from("enea_practices")
    .select("id, canale, form_token, cliente_nome, cliente_cognome, cliente_email, prodotto_installato, pagamento_stato, stripe_payment_intent, note_interne")
    .eq("id", praticaId)
    .maybeSingle();
  if (!pratica || pratica.canale !== "eneasubito") return json({ error: "Pratica non trovata" }, 404);
  if (pratica.pagamento_stato === "pagata") return json({ ok: true, gia_pagata: true });

  const stripe = new Stripe(chiaveStripe, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const quando = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const nota = (riga: string) => [pratica.note_interne, riga].filter(Boolean).join("\n");

  // ── 1. Il blocco c'è ancora: si incassa ─────────────────────────────────
  if (pratica.stripe_payment_intent) {
    let pagamento: Stripe.PaymentIntent | null = null;
    try {
      pagamento = await stripe.paymentIntents.retrieve(pratica.stripe_payment_intent);
      if (pagamento.status === "requires_capture") {
        pagamento = await stripe.paymentIntents.capture(pagamento.id);
      }
    } catch (e) {
      // Un blocco scaduto puo' rispondere con un errore invece che con lo
      // stato: in entrambi i casi si passa al link di pagamento.
      console.error("[eneasubito-incassa] incasso non riuscito", e);
    }
    if (pagamento?.status === "succeeded") {
      const incassato = Number(pagamento.amount_received ?? 0) / 100;
      const { error } = await db
        .from("enea_practices")
        .update({
          pagamento_stato: "pagata",
          data_incasso: new Date().toISOString().slice(0, 10),
          ...(incassato > 0 ? { prezzo: incassato } : {}),
          note_interne: nota(`Incassati ${incassato} € il ${quando}, alla consegna della pratica.`),
        })
        .eq("id", pratica.id);
      if (error) {
        // L'incasso e' fatto: va scritto. Rieseguendo, Stripe dice «gia'
        // incassato» e si passa di nuovo di qui.
        console.error("[eneasubito-incassa] incasso fatto ma non registrato", error);
        return json({ error: "Incassato ma non registrato" }, 500);
      }
      return json({ ok: true, incassata: incassato });
    }
  }

  // ── 2. Il blocco non c'è più: link di pagamento al cliente ──────────────
  if (!pratica.cliente_email) {
    await db.from("enea_practices")
      .update({ note_interne: nota(`Consegna del ${quando}: blocco della carta scaduto e nessuna e-mail per mandare il link. Da incassare a mano.`) })
      .eq("id", pratica.id);
    return json({ ok: false, motivo: "senza_email" }, 200);
  }

  const { data: riga } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "prezzo_eneasubito")
    .maybeSingle();
  const cfg = (riga?.value ?? {}) as { importo_cents?: number };
  const importo = Number.isFinite(cfg.importo_cents) && (cfg.importo_cents ?? 0) >= 100
    ? (cfg.importo_cents as number)
    : IMPORTO_DI_RISERVA;
  const intestatario = [pratica.cliente_nome, pratica.cliente_cognome].filter(Boolean).join(" ").trim();

  let link = "";
  try {
    const sessione = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: pratica.cliente_email,
      payment_intent_data: { receipt_email: pratica.cliente_email },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: importo,
          product_data: {
            name: "EneaSubito — Pratica ENEA",
            description: pratica.prodotto_installato
              ? `${pratica.prodotto_installato} — compilazione e trasmissione all'ENEA`
              : "Compilazione e trasmissione della comunicazione all'ENEA",
          },
        },
      }],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: "Pratica ENEA. Compilazione e trasmissione al portale ENEA.",
          footer: "EneaSubito è un servizio di PR Consulting LLC — eneasubito.it — assistenza@eneasubito.it",
          metadata: { canale: "eneasubito", pratica_id: pratica.id },
        },
      },
      client_reference_id: pratica.id,
      metadata: { pratica_id: pratica.id, canale: "eneasubito" },
      success_url: `${SITO}/completa/${pratica.form_token}`,
      cancel_url: SITO,
    });
    link = sessione.url ?? "";
  } catch (e) {
    console.error("[eneasubito-incassa] cassa non aperta", e);
  }
  if (!link) {
    await db.from("enea_practices")
      .update({ note_interne: nota(`Consegna del ${quando}: blocco della carta scaduto e link di pagamento non creato. Da incassare a mano.`) })
      .eq("id", pratica.id);
    return json({ ok: false, motivo: "link_non_creato" }, 502);
  }

  let mandata = false;
  if (RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: DA,
          to: [pratica.cliente_email],
          subject: "La tua pratica ENEA è stata inviata",
          text: [
            intestatario ? `Gentile ${intestatario},` : "Gentile cliente,",
            "",
            "la tua pratica ENEA è stata inviata.",
            "",
            "Il blocco dei 99 € sulla tua carta è scaduto prima della consegna, quindi non ti abbiamo addebitato nulla. Puoi pagare da qui:",
            link,
            "",
            "Il team di EneaSubito",
            "assistenza@eneasubito.it",
          ].join("\n"),
        }),
      });
      mandata = r.ok;
      if (!r.ok) console.error("[eneasubito-incassa] mail non partita", r.status, await r.text());
    } catch (e) {
      console.error("[eneasubito-incassa] mail non partita", e);
    }
  }

  await db.from("enea_practices")
    .update({
      note_interne: nota(mandata
        ? `Consegna del ${quando}: blocco della carta scaduto, mandato al cliente il link per pagare.`
        : `Consegna del ${quando}: blocco della carta scaduto, link creato ma mail NON partita: ${link}`),
    })
    .eq("id", pratica.id);
  return json({ ok: true, link_mandato: mandata });
});
