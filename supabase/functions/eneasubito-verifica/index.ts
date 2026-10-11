/**
 * eneasubito-verifica — la pratica nasce qui.
 *
 * La chiama il modulo gratuito del secondo marchio, in due momenti:
 *
 *  1. appena il cliente ha scritto un'e-mail valida, prima della parte
 *     difficile. Serve a non perderlo: da quel momento la bozza esiste sul
 *     server, e se si ferma sappiamo a chi scrivere;
 *  2. quando il preflight ha dato l'esito, per registrarlo sulla pratica.
 *
 * E' una funzione a se' e non un ramo di `richiesta-pubblica`: quella serve
 * l'altro marchio in produzione tutti i giorni, e non si tocca per aggiungere
 * un canale. Scrive sulla stessa tabella — la macchina e' una sola, e deve
 * restare una sola — ma marcando `canale = 'eneasubito'`.
 *
 * Pubblica: va distribuita con --no-verify-jwt (vedi supabase/config.toml).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PRIVATI_COMPANY } from "../_shared/reseller.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Le tre famiglie del perimetro, con il nome che va scritto sulla pratica. */
const PRODOTTO: Record<string, string> = {
  infissi: "Infissi",
  schermature: "Schermature solari",
  pompe_di_calore: "Pompa di calore",
};

interface Corpo {
  /** Trappola per i programmi automatici: un umano non lo compila mai. */
  website?: string;
  /** Presente dalla seconda chiamata in poi: aggiorna invece di creare. */
  token?: string;
  email?: string;
  famiglia?: string;
  /** AAAA-MM-GG */
  fineLavori?: string;
  esito?: "si_puo_fare" | "non_si_puo_fare" | "serve_un_controllo";
  /** Le righe che il cliente ha visto come motivazione dell'esito. */
  motivi?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Richiesta illeggibile" }, 400);
  }

  // Trappola anti-spam: rispondiamo come se fosse andata bene, senza scrivere.
  if (corpo.website) return json({ ok: true, token: null });

  const email = corpo.email?.trim().toLowerCase() ?? "";
  if (!corpo.token && !EMAIL_RE.test(email)) {
    return json({ error: "Serve un indirizzo e-mail valido" }, 400);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // ── Aggiornamento di una bozza che esiste già ──────────────────────────
    if (corpo.token) {
      const { data: esistente } = await db
        .from("enea_practices")
        .select("id, form_token, canale")
        .eq("form_token", corpo.token)
        .maybeSingle();

      // Un token che non è di questo canale non si tocca: è una pratica
      // dell'altro marchio, e non deve poter essere modificata da qui.
      if (!esistente || esistente.canale !== "eneasubito") {
        return json({ error: "Richiesta non valida" }, 404);
      }

      await db
        .from("enea_practices")
        .update(campiDaCorpo(corpo, email))
        .eq("id", esistente.id);

      return json({ ok: true, token: esistente.form_token });
    }

    // ── Prima volta: si crea la pratica ────────────────────────────────────
    const contenitore = await contenitorePrivati(db);
    const { data: stage } = await db
      .from("pipeline_stages")
      .select("id")
      .is("reseller_id", null)
      .eq("stage_type", "inviata")
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: creata, error } = await db
      .from("enea_practices")
      .insert({
        reseller_id: contenitore,
        brand: "enea",
        canale: "eneasubito",
        current_stage_id: stage?.id ?? null,
        tipo_servizio: "servizio_completo",
        tipo_fatturazione: "cliente_finale",
        tipo_soggetto: "persona_fisica",
        pagamento_stato: "non_pagata",
        cliente_email: email,
        ...campiDaCorpo(corpo, email),
      })
      .select("id, form_token")
      .single();

    if (error || !creata) throw error ?? new Error("Creazione pratica fallita");

    return json({ ok: true, token: creata.form_token });
  } catch (e) {
    console.error("[eneasubito-verifica]", e);
    return json({ error: "Non siamo riusciti a salvare la richiesta" }, 500);
  }
});

/** Solo i campi che il modulo ha davvero raccolto finora. */
function campiDaCorpo(corpo: Corpo, email: string): Record<string, unknown> {
  const campi: Record<string, unknown> = {};
  if (email) campi.cliente_email = email;
  if (corpo.famiglia && PRODOTTO[corpo.famiglia]) {
    campi.prodotto_installato = PRODOTTO[corpo.famiglia];
  }
  if (corpo.fineLavori && /^\d{4}-\d{2}-\d{2}$/.test(corpo.fineLavori)) {
    campi.data_fine_lavori = corpo.fineLavori;
  }
  if (corpo.esito) {
    // L'esito finisce nelle note interne in lingua leggibile: chi apre la
    // pratica deve capire in due righe cosa ha visto il cliente, senza
    // decifrare sigle.
    const quando = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    const titolo = {
      si_puo_fare: "Verifica: si puo' fare",
      non_si_puo_fare: "Verifica: non si puo' fare",
      serve_un_controllo: "Verifica: serve un controllo nostro",
    }[corpo.esito];
    const righe = (corpo.motivi ?? []).map((m) => `· ${m}`).join("\n");
    campi.note_interne = `${titolo} (${quando})\n${righe}`.trim();
  }
  return campi;
}

async function contenitorePrivati(db: ReturnType<typeof createClient>): Promise<string> {
  const { data: esistente } = await db
    .from("companies")
    .select("id")
    .eq("ragione_sociale", PRIVATI_COMPANY)
    .limit(1)
    .maybeSingle();
  if (esistente) return esistente.id as string;

  const { data: creata, error } = await db
    .from("companies")
    .insert({ ragione_sociale: PRIVATI_COMPANY, settore: "sistema" })
    .select("id")
    .single();
  if (error || !creata) throw error ?? new Error("Contenitore privati non creato");
  return creata.id as string;
}
