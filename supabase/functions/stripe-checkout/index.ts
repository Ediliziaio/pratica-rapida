/**
 * stripe-checkout — crea una sessione di pagamento Stripe per un servizio a
 * pagamento (es. visura catastale). Chiamata dal form pubblico DOPO che
 * `richiesta-pubblica` ha creato la pratica.
 *
 * Flusso: pratica creata "in attesa pagamento" → questa funzione genera la
 * Checkout Session → il frontend reindirizza l'utente a Stripe → a pagamento
 * completato lo `stripe-webhook` segna la pratica come pagata.
 *
 * Body: { practice_id, amount_cents?, descrizione?, email?, pricing_key?, success? }
 * Risposta: { url }  (URL di Stripe Checkout a cui reindirizzare)
 *
 * `pricing_key`: se presente, l'importo viene letto da `platform_settings` e
 * `amount_cents` del client viene IGNORATO. Serve per i flussi dove la cifra
 * non deve essere manomettibile dal browser (es. pratica ENEA cliente privato).
 *
 * `success: "form"`: a pagamento riuscito manda l'utente sul suo modulo
 * `/form/:token` per completare i dati tecnici, invece che sulla pagina servizi.
 *
 * Secret richiesti: STRIPE_SECRET_KEY. Opzionale: PUBLIC_SITE_URL.
 * Deploy con --no-verify-jwt (chiamata pubblica dal form del sito).
 */

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  if (!STRIPE_KEY) return json({ error: "Stripe non configurato (STRIPE_SECRET_KEY)" }, 500);
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://www.praticarapida.it").replace(/\/+$/, "");

  let body: {
    practice_id?: string;
    amount_cents?: number;
    descrizione?: string;
    email?: string;
    pricing_key?: string;
    success?: "form" | "servizi";
  };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const practiceId = body.practice_id?.trim();
  if (!practiceId) return json({ error: "practice_id obbligatorio" }, 400);

  // Valida che la pratica esista (service role).
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: practice } = await admin
    .from("enea_practices")
    .select("id, cliente_email, form_token")
    .eq("id", practiceId)
    .maybeSingle();
  if (!practice) return json({ error: "Pratica non trovata" }, 404);

  // ── Importo ───────────────────────────────────────────────────────────────
  // Con `pricing_key` la cifra viene dal DB e quella del client viene
  // scartata: è l'unico modo per impedire che l'utente si scelga il prezzo
  // modificando la richiesta dal browser.
  let amount: number;
  if (body.pricing_key) {
    const { data: row } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", body.pricing_key)
      .maybeSingle();
    const cfg = (row?.value ?? {}) as { imponibile_cents?: number; iva_percent?: number; attivo?: boolean };
    if (!row || cfg.attivo === false) {
      return json({ error: "Servizio momentaneamente non disponibile" }, 409);
    }
    const imponibile = Math.round(cfg.imponibile_cents ?? 0);
    const iva = Number(cfg.iva_percent ?? 0);
    amount = Math.round(imponibile * (1 + iva / 100));
    if (!Number.isFinite(amount) || amount < 100) {
      console.error("[stripe-checkout] prezzo non configurato per", body.pricing_key, cfg);
      return json({ error: "Prezzo non configurato" }, 409);
    }
  } else {
    // Flussi storici (visura catastale): importo dal client con default €30 e
    // limiti di sicurezza per non accettare valori arbitrari.
    amount = Number.isFinite(body.amount_cents) ? Math.round(body.amount_cents as number) : 3000;
    if (amount < 100 || amount > 100000) amount = 3000; // 1€–1000€
  }

  // ── URL di ritorno ────────────────────────────────────────────────────────
  // Costruito qui e non passato dal client: un path arbitrario dal browser
  // sarebbe un open redirect a valle del pagamento.
  const successUrl =
    body.success === "form" && practice.form_token
      ? `${siteUrl}/form/${practice.form_token}?pagamento=ok`
      : `${siteUrl}/area-riservata-vecchia/servizi?pagamento=ok`;

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amount,
          product_data: { name: body.descrizione?.trim() || "Servizio Pratica Rapida" },
        },
      }],
      customer_email: body.email?.trim() || practice.cliente_email || undefined,
      // Colleghiamo la sessione alla pratica: il webhook usa questi metadata.
      // `post_payment: "form"` dice al webhook di mandare al cliente l'email
      // col link al modulo: la success_url da sola non basta, chi chiude la
      // scheda su Stripe resterebbe senza nessun modo di tornare al form.
      metadata: {
        practice_id: practiceId,
        ...(body.success === "form" ? { post_payment: "form" } : {}),
      },
      payment_intent_data: { metadata: { practice_id: practiceId } },
      success_url: successUrl,
      cancel_url: `${siteUrl}/area-riservata-vecchia/servizi?pagamento=annullato`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("[stripe-checkout] error:", e);
    return json({ error: e instanceof Error ? e.message : "Errore Stripe" }, 400);
  }
});
