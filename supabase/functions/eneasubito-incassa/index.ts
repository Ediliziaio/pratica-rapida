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

/** Una mail dal nostro indirizzo. Vero se Resend l'ha accettata. */
async function manda(a: string, oggetto: string, testo: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DA, to: [a], subject: oggetto, text: testo }),
    });
    if (!r.ok) console.error("[eneasubito-incassa] mail non partita", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("[eneasubito-incassa] mail non partita", e);
    return false;
  }
}

/**
 * La fattura, fatta all'incasso e gia' saldata.
 *
 * Con la carta bloccata Stripe non la fa da solo dalla cassa (provato il
 * 21/10/2026: «Post-payment invoice creation does not support separate
 * authorization and capture»). Si crea qui, si segna pagata fuori da Stripe
 * — il pagamento e' quello appena incassato — e se ne restituisce il PDF.
 */
async function fattura(
  stripe: Stripe,
  pagamento: Stripe.PaymentIntent,
  praticaId: string,
  prodotto: string | null,
): Promise<{ pdf: string; pagina: string } | null> {
  const cliente = typeof pagamento.customer === "string" ? pagamento.customer : pagamento.customer?.id;
  if (!cliente) return null;
  const bozza = await stripe.invoices.create({
    customer: cliente,
    // Il conto e' americano: senza, la fattura nasce in dollari e rifiuta la
    // riga in euro (provato il 21/10/2026).
    currency: pagamento.currency,
    collection_method: "send_invoice",
    days_until_due: 0,
    auto_advance: false,
    description: prodotto
      ? `Pratica ENEA — ${prodotto}. Compilazione e trasmissione al portale ENEA.`
      : "Pratica ENEA. Compilazione e trasmissione al portale ENEA.",
    footer: "EneaSubito è un servizio di PR Consulting LLC — eneasubito.it — assistenza@eneasubito.it",
    metadata: { canale: "eneasubito", pratica_id: praticaId, pagamento: pagamento.id },
  });
  await stripe.invoiceItems.create({
    customer: cliente,
    invoice: bozza.id,
    currency: pagamento.currency,
    amount: pagamento.amount_received,
    description: "EneaSubito — Pratica ENEA",
  });
  await stripe.invoices.finalizeInvoice(bozza.id);
  const saldata = await stripe.invoices.pay(bozza.id, { paid_out_of_band: true });
  return { pdf: saldata.invoice_pdf ?? "", pagina: saldata.hosted_invoice_url ?? "" };
}

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

      // La fattura: se non riesce l'incasso resta valido, e lo si scrive
      // nelle note perche' la si faccia a mano.
      let rigaFattura = "";
      try {
        const f = await fattura(stripe, pagamento, pratica.id, pratica.prodotto_installato);
        if (f && pratica.cliente_email) {
          const partita = await manda(
            pratica.cliente_email,
            "La tua pratica ENEA: ricevuta e fattura",
            [
              "Gentile cliente,",
              "",
              `la tua pratica ENEA è stata inviata e abbiamo addebitato i ${incassato} € che avevamo bloccato sulla tua carta.`,
              "",
              `La fattura: ${f.pdf || f.pagina}`,
              "",
              "Grazie per esserti affidato a noi.",
              "Il team di EneaSubito",
              "assistenza@eneasubito.it",
            ].join("\n"),
          );
          rigaFattura = partita
            ? " Fattura fatta e mandata al cliente."
            : ` Fattura fatta ma mail NON partita: ${f.pdf || f.pagina}`;
        } else {
          rigaFattura = " Fattura NON fatta (manca il cliente su Stripe o l'e-mail): da fare a mano.";
        }
      } catch (e) {
        console.error("[eneasubito-incassa] fattura non fatta", e);
        rigaFattura = " Fattura NON fatta (errore di Stripe): da fare a mano.";
      }
      const { error } = await db
        .from("enea_practices")
        .update({
          pagamento_stato: "pagata",
          data_incasso: new Date().toISOString().slice(0, 10),
          ...(incassato > 0 ? { prezzo: incassato } : {}),
          note_interne: nota(`Incassati ${incassato} € il ${quando}, alla consegna della pratica.${rigaFattura}`),
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

  const mandata = await manda(
    pratica.cliente_email,
    "La tua pratica ENEA è stata inviata",
    [
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
  );

  await db.from("enea_practices")
    .update({
      note_interne: nota(mandata
        ? `Consegna del ${quando}: blocco della carta scaduto, mandato al cliente il link per pagare.`
        : `Consegna del ${quando}: blocco della carta scaduto, link creato ma mail NON partita: ${link}`),
    })
    .eq("id", pratica.id);
  return json({ ok: true, link_mandato: mandata });
});
