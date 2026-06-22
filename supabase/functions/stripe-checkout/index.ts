/**
 * stripe-checkout — crea una sessione di pagamento Stripe per un servizio a
 * pagamento (es. visura catastale). Chiamata dal form pubblico DOPO che
 * `richiesta-pubblica` ha creato la pratica.
 *
 * Flusso: pratica creata "in attesa pagamento" → questa funzione genera la
 * Checkout Session → il frontend reindirizza l'utente a Stripe → a pagamento
 * completato lo `stripe-webhook` segna la pratica come pagata.
 *
 * Body: { practice_id, amount_cents?, descrizione?, email? }
 * Risposta: { url }  (URL di Stripe Checkout a cui reindirizzare)
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

  let body: { practice_id?: string; amount_cents?: number; descrizione?: string; email?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const practiceId = body.practice_id?.trim();
  if (!practiceId) return json({ error: "practice_id obbligatorio" }, 400);

  // Importo: default €30 (3000 cent). Limiti di sicurezza per non accettare
  // valori arbitrari dal client.
  let amount = Number.isFinite(body.amount_cents) ? Math.round(body.amount_cents as number) : 3000;
  if (amount < 100 || amount > 100000) amount = 3000; // 1€–1000€

  // Valida che la pratica esista (service role).
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: practice } = await admin
    .from("enea_practices")
    .select("id, cliente_email")
    .eq("id", practiceId)
    .maybeSingle();
  if (!practice) return json({ error: "Pratica non trovata" }, 404);

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
      metadata: { practice_id: practiceId },
      payment_intent_data: { metadata: { practice_id: practiceId } },
      success_url: `${siteUrl}/area-riservata-vecchia/servizi?pagamento=ok`,
      cancel_url: `${siteUrl}/area-riservata-vecchia/servizi?pagamento=annullato`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("[stripe-checkout] error:", e);
    return json({ error: e instanceof Error ? e.message : "Errore Stripe" }, 400);
  }
});
