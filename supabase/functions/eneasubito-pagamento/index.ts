/**
 * eneasubito-pagamento — apre la cassa per una pratica del secondo marchio.
 *
 * Separata da `stripe-checkout` per un motivo che non e' di ordine: quella
 * incassa con il conto Stripe dell'altra societa' ed emette fattura da
 * Fatture in Cloud. Qui incassa **PR Consulting LLC** con il suo conto, e la
 * fattura la emette Stripe all'incasso (`eneasubito-incassa`). Due catene distinte
 * che non si devono incrociare mai.
 *
 * L'importo NON arriva dal browser: si legge da `platform_settings`. Il
 * prezzo di una pratica non puo' dipendere da cosa ha in pancia la pagina.
 *
 * Segreti richiesti:
 *   STRIPE_ENEASUBITO_SECRET_KEY   chiave del conto della societa' americana
 *   ENEASUBITO_SITE_URL            opzionale, per i ritorni (default il dominio)
 *
 * Pubblica: --no-verify-jwt.
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

/** Riserva usata solo se in banca dati non c'e' ancora il prezzo. */
const IMPORTO_DI_RISERVA = 9900;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const chiave = Deno.env.get("STRIPE_ENEASUBITO_SECRET_KEY")?.trim();
  if (!chiave) {
    // Detto in chiaro: e' l'unica cosa che manca per incassare.
    return json({ error: "Il conto di incasso non e' ancora collegato" }, 503);
  }

  let corpo: { token?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Richiesta illeggibile" }, 400);
  }
  const token = corpo.token?.trim();
  if (!token) return json({ error: "Pratica non indicata" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: pratica } = await db
    .from("enea_practices")
    .select("id, canale, cliente_nome, cliente_cognome, cliente_email, pagamento_stato, archived_at, prodotto_installato, carta_bloccata_at")
    .eq("form_token", token)
    .maybeSingle();

  if (!pratica || pratica.canale !== "eneasubito") return json({ error: "Pratica non trovata" }, 404);
  if (pratica.archived_at) return json({ error: "Questa richiesta e' stata annullata" }, 409);
  if (pratica.pagamento_stato === "pagata") return json({ error: "Risulta gia' pagata" }, 409);
  if (pratica.carta_bloccata_at) {
    return json({ error: "La carta e' gia' registrata: l'addebito parte quando ricevi la pratica" }, 409);
  }

  // ── L'importo: dal database, mai dal browser ──────────────────────────────
  const { data: riga } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "prezzo_eneasubito")
    .maybeSingle();
  const cfg = (riga?.value ?? {}) as { importo_cents?: number; attivo?: boolean };
  if (cfg.attivo === false) return json({ error: "Le richieste sono momentaneamente sospese" }, 503);
  const importo = Number.isFinite(cfg.importo_cents) && (cfg.importo_cents ?? 0) >= 100
    ? (cfg.importo_cents as number)
    : IMPORTO_DI_RISERVA;

  const sito = (Deno.env.get("ENEASUBITO_SITE_URL") ?? "https://www.eneasubito.it").replace(/\/+$/, "");
  const stripe = new Stripe(chiave, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // ── La scheda cliente la facciamo noi ─────────────────────────────────────
  //
  // Senza, Stripe pesca quella che ha gia' con quella e-mail: il 12/10/2026 su
  // una fattura di EneaSubito e' uscita la ragione sociale e l'indirizzo
  // dell'altro marchio, perche' in quel conto esisteva una scheda vecchia
  // lasciata da LeadConnector. I due marchi non si devono sfiorare, e il nome
  // sulla fattura dev'essere quello del beneficiario che ci ha dato lui nel
  // modulo — e' l'unico che conta per la detrazione.
  //
  // `customer_update` con name e address a "never" impedisce che la pagina di
  // pagamento riscriva quel nome con quello che trova salvato altrove.
  const intestatario = [pratica.cliente_nome, pratica.cliente_cognome]
    .filter((pezzo) => (pezzo ?? "").trim())
    .join(" ")
    .trim();

  let cliente: string | undefined;
  try {
    const creato = await stripe.customers.create({
      ...(intestatario ? { name: intestatario } : {}),
      ...(pratica.cliente_email ? { email: pratica.cliente_email } : {}),
      metadata: { canale: "eneasubito", pratica_id: String(pratica.id) },
    });
    cliente = creato.id;
  } catch (e) {
    // Resta scritto nei registri; sotto il cliente riceve un errore da
    // riprovare.
    console.error("[eneasubito-pagamento] scheda cliente non creata", e);
  }

  // La carta si salva su questa scheda: senza scheda non la si ritrova alla
  // consegna, e lasciarla sarebbe inutile.
  if (!cliente) return json({ error: "Non siamo riusciti ad aprire il pagamento" }, 500);

  try {
    const sessione = await stripe.checkout.sessions.create({
      // Paghi solo quando la pratica e' inviata (Titolare, 21/10/2026), e i
      // sette giorni del blocco partono da quando il cliente manda la pratica
      // (Titolare, 05/11/2026): qui la carta si SALVA e basta, senza bloccare
      // niente. Il 29/10 una cliente ha lasciato la carta e mandato la pratica
      // il 05/11: il blocco era scaduto tre ore e mezza prima. Il blocco lo
      // mette `eneasubito-blocca` quando arriva la pratica, l'addebito
      // `eneasubito-incassa` quando entra in «Da inserire su Excel».
      mode: "setup",
      // Apple Pay e Google Pay compaiono da soli con "card" sui dispositivi
      // che li hanno: e' la strada che toglie la tastiera dal pagamento.
      payment_method_types: ["card"],
      customer: cliente,
      customer_update: { name: "never", address: "never" },
      setup_intent_data: {
        description: "EneaSubito — carta in garanzia per la pratica ENEA",
        metadata: { pratica_id: pratica.id, canale: "eneasubito" },
      },
      // Il pulsante di Stripe non dice l'importo: la frase sopra spiega
      // quanto, quando, e che adesso non si paga niente.
      custom_text: {
        submit: {
          message:
            `Nessun addebito adesso: la carta fa solo da garanzia. Quando ci mandi la pratica blocchiamo ${importo / 100} € sulla carta, e li addebitiamo quando hai ricevuto la tua pratica. Se non riusciamo a fartela avere, non paghi niente.`,
        },
      },
      // Il riferimento serve al webhook per ritrovare la pratica senza
      // fidarsi di niente che arrivi dal browser.
      client_reference_id: pratica.id,
      metadata: { pratica_id: pratica.id, canale: "eneasubito" },
      success_url: `${sito}/completa/${token}`,
      cancel_url: `${sito}/verifica`,
    });

    return json({ url: sessione.url });
  } catch (e) {
    console.error("[eneasubito-pagamento]", e);
    return json({ error: "Non siamo riusciti ad aprire il pagamento" }, 500);
  }
});
