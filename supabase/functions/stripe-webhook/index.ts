/**
 * stripe-webhook — riceve gli eventi Stripe e segna la pratica come PAGATA.
 *
 * Su `checkout.session.completed` (pagamento riuscito) legge `practice_id` dai
 * metadata e aggiorna enea_practices: pagamento_stato='pagata' + data_incasso,
 * poi notifica lo staff.
 *
 * Secret richiesti: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 * Deploy con --no-verify-jwt (Stripe chiama senza JWT; l'auth è la FIRMA).
 *
 * Setup lato Stripe: Dashboard → Developers → Webhooks → endpoint
 *   https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/stripe-webhook
 *   evento: checkout.session.completed → copia il "Signing secret" in
 *   STRIPE_WEBHOOK_SECRET.
 */

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  const WH_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!STRIPE_KEY || !WH_SECRET) return new Response("Stripe non configurato", { status: 500 });

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    // Verifica della FIRMA: garantisce che l'evento arrivi davvero da Stripe.
    event = await stripe.webhooks.constructEventAsync(raw, sig ?? "", WH_SECRET);
  } catch (e) {
    console.error("[stripe-webhook] firma non valida:", e instanceof Error ? e.message : e);
    return new Response("Firma non valida", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const practiceId = session.metadata?.practice_id;
  if (!practiceId) return Response.json({ received: true, no_practice: true });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    await admin
      .from("enea_practices")
      .update({ pagamento_stato: "pagata", data_incasso: new Date().toISOString() })
      .eq("id", practiceId);

    // Notifica staff: pratica pagata online.
    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
    if (admins?.length) {
      const importo = ((session.amount_total ?? 0) / 100).toFixed(2);
      await admin.from("notifications").insert(
        admins.map((a) => ({
          user_id: a.user_id,
          tipo: "pagamento_ricevuto",
          titolo: `💶 Pagamento ricevuto — € ${importo}`,
          messaggio: "Una richiesta dal sito è stata pagata online (Stripe). La pratica è ora 'pagata'.",
          link: `/pratiche/${practiceId}`,
        })),
      );
    }
  } catch (e) {
    console.error("[stripe-webhook] update fallito:", e);
    return new Response("Errore interno", { status: 500 });
  }

  return Response.json({ received: true, practice_id: practiceId, status: "pagata" });
});
