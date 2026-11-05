/**
 * eneasubito-blocca — blocca i 99 € quando il cliente manda la pratica.
 *
 * Il blocco dura circa sette giorni e non si puo' spostare: i sette giorni
 * devono partire da quando la pratica e' arrivata, non da quando il cliente
 * ha lasciato la carta (Titolare, 05/11/2026). Quindi alla cassa la carta si
 * salva e basta, e il blocco lo mette questa funzione, senza il cliente
 * davanti.
 *
 * Se la banca rifiuta si scrive nelle note e basta: la pratica si lavora lo
 * stesso, alla consegna `eneasubito-incassa` riprova o manda il link.
 *
 * La chiama il database, con `x-solleciti-chiave`. Rieseguirla non blocca due
 * volte. Segreti: STRIPE_ENEASUBITO_SECRET_KEY, SOLLECITI_CHIAVE.
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CHIAVE_INTERNA = (Deno.env.get("SOLLECITI_CHIAVE") ?? "").trim();
const IMPORTO_DI_RISERVA = 9900;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
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

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: pratica } = await db
    .from("enea_practices")
    .select("id, canale, cliente_email, pagamento_stato, stripe_payment_intent, stripe_cliente, stripe_metodo_pagamento, note_interne")
    .eq("id", praticaId)
    .maybeSingle();
  if (!pratica || pratica.canale !== "eneasubito") return json({ error: "Pratica non trovata" }, 404);
  if (pratica.pagamento_stato === "pagata" || pratica.stripe_payment_intent) {
    return json({ ok: true, gia_fatto: true });
  }
  if (!pratica.stripe_cliente || !pratica.stripe_metodo_pagamento) {
    return json({ ok: false, motivo: "senza_carta" });
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

  const stripe = new Stripe(chiaveStripe, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const quando = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const nota = (riga: string) => [pratica.note_interne, riga].filter(Boolean).join("\n");

  let pagamento: Stripe.PaymentIntent | null = null;
  try {
    pagamento = await stripe.paymentIntents.create({
      amount: importo,
      currency: "eur",
      capture_method: "manual",
      customer: pratica.stripe_cliente,
      payment_method: pratica.stripe_metodo_pagamento,
      off_session: true,
      confirm: true,
      metadata: { pratica_id: pratica.id, canale: "eneasubito" },
      ...(pratica.cliente_email ? { receipt_email: pratica.cliente_email } : {}),
    }, { idempotencyKey: `eneasubito-blocco-${pratica.id}` });
  } catch (e) {
    console.error("[eneasubito-blocca] blocco non riuscito", e);
  }

  if (pagamento?.status !== "requires_capture") {
    await db.from("enea_practices")
      .update({ note_interne: nota(`Pratica arrivata il ${quando}: la banca non ha accettato il blocco della carta. Alla consegna si riprova l'addebito, altrimenti parte il link per pagare.`) })
      .eq("id", pratica.id);
    return json({ ok: false, motivo: "blocco_rifiutato" });
  }

  const { error } = await db
    .from("enea_practices")
    .update({
      stripe_payment_intent: pagamento.id,
      note_interne: nota(`Carta bloccata il ${quando}, all'arrivo della pratica (pagamento ${pagamento.id}). L'addebito parte quando la pratica entra in «Da inserire su Excel».`),
    })
    .eq("id", pratica.id);
  if (error) {
    console.error("[eneasubito-blocca] blocco fatto ma non registrato", error);
    return json({ error: "Bloccata ma non registrata" }, 500);
  }
  return json({ ok: true, bloccata: true });
});
