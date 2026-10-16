/**
 * eneasubito-solleciti — scrive a chi si e' fermato prima di pagare.
 *
 * La chiama un orologio del database ogni ora. Guarda le pratiche di
 * EneaSubito che hanno lasciato nome e indirizzo ma non hanno pagato, decide
 * quale dei cinque messaggi tocca (la regola e i testi stanno in
 * _shared/eneasubito-solleciti.ts, con i suoi test) e lo manda.
 *
 * **Tre cose non negoziabili, e sono il motivo per cui il codice e' cosi'.**
 *
 *  1. **Mai due volte lo stesso.** La riga si scrive PRIMA di spedire, e la
 *     tabella ha un vincolo di unicita': se due esecuzioni si accavallano, la
 *     seconda si rompe sull'inserimento e non spedisce. Meglio un messaggio
 *     perso che un messaggio doppio.
 *  2. **Mai a chi ha pagato, archiviato o si e' disiscritto.** Lo decide
 *     `qualeTocca`, e i dati glieli passiamo tutti.
 *  3. **Mai da un dominio che non e' autorizzato a spedire.** Finche'
 *     eneasubito.it non e' verificato su Resend, le mail finirebbero nello
 *     spam e brucerebbero la reputazione del dominio prima ancora di
 *     cominciare: per questo c'e' l'interruttore `SOLLECITI_ATTIVI`, che
 *     parte spento.
 *
 * Non e' un ramo di `send-email`: quella ha `modulistica@praticarapida.it`
 * scritto in ogni pie' di pagina, e userebbe l'indirizzo dell'altro marchio
 * nella casella dei clienti EneaSubito.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import {
  corpo,
  qualeTocca,
  TERMINE_GIORNI,
  type StatoPratica,
} from "../_shared/eneasubito-solleciti.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
/** Interruttore: finché non è «true» si prepara tutto senza spedire. */
const ATTIVI = (Deno.env.get("SOLLECITI_ATTIVI") ?? "").toLowerCase() === "true";
/** Chiave nell'indirizzo: la chiama solo l'orologio del database. */
const TOKEN = Deno.env.get("SOLLECITI_TOKEN") ?? "";

const DA = "EneaSubito <assistenza@eneasubito.it>";
const SITO = "https://www.eneasubito.it";
/** Quante ne tratta per giro: se qualcosa va storto, va storto in piccolo. */
const MASSIMO_PER_GIRO = 40;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/** Dal prodotto scritto sulla pratica alla parola da usare nel messaggio. */
function intervento(prodotto: string | null): string {
  const p = (prodotto ?? "").toLowerCase();
  if (p.includes("schermature")) return "le schermature solari";
  if (p.includes("pompa")) return "la pompa di calore";
  if (p.includes("infissi")) return "gli infissi";
  return "il tuo intervento";
}

/** Giorni che restano, o null se la data non ce l'hanno data. */
function giorniRimasti(fineLavori: string | null): number | null {
  if (!fineLavori || !/^\d{4}-\d{2}-\d{2}$/.test(fineLavori)) return null;
  const [a, m, g] = fineLavori.split("-").map(Number);
  const fine = Date.UTC(a, m - 1, g);
  if (Number.isNaN(fine)) return null;
  const oggi = new Date();
  const adesso = Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate());
  return TERMINE_GIORNI - Math.floor((adesso - fine) / 86_400_000);
}

async function spedisci(a: string, oggetto: string, testo: string): Promise<string | null> {
  if (!RESEND_API_KEY) return "RESEND_API_KEY mancante";
  const risposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: DA, to: [a], subject: oggetto, text: testo }),
  });
  if (risposta.ok) return null;
  return `Resend ${risposta.status}: ${(await risposta.text()).slice(0, 300)}`;
}

Deno.serve(async (req) => {
  const indirizzo = new URL(req.url);
  // Il giro a vuoto: dice QUANTI messaggi partirebbero e di quale numero, mai
  // a chi. Senza nomi ne' indirizzi non c'e' niente da proteggere, e si puo'
  // controllare che la macchina ragioni giusto anche prima di avere la
  // chiave.
  const soloProva = indirizzo.searchParams.get("prova") === "1";

  // Solo nel giro a vuoto: si puo' chiedere «cosa partirebbe fra tre giorni».
  // Serve a provare tutto il calendario sulle pratiche vere senza aspettare
  // dodici giorni e senza falsificare le date nel database.
  let adesso = new Date();
  if (soloProva) {
    const quando = indirizzo.searchParams.get("quando");
    if (quando) {
      const fra = Number(quando);
      // Un numero sono ore da adesso; altrimenti si accetta una data intera.
      const provato = Number.isFinite(fra)
        ? new Date(Date.now() + fra * 3_600_000)
        : new Date(quando);
      if (!Number.isNaN(provato.getTime())) adesso = provato;
    }
  }

  // Il giro vero chiede la chiave, e se la chiave non e' configurata si
  // rifiuta: una funzione che spedisce a dei clienti non deve restare aperta
  // perche' qualcuno si e' scordato di impostare un segreto.
  if (!soloProva) {
    if (!TOKEN) return json({ error: "SOLLECITI_TOKEN non configurato" }, 503);
    if (indirizzo.searchParams.get("token") !== TOKEN) {
      return json({ error: "non autorizzato" }, 401);
    }
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Le candidate: pratiche di questo canale, con un indirizzo, mai pagate.
  // Il limite non e' per prudenza ma per disciplina: se qualcosa va storto,
  // va storto su quaranta e non su tutte.
  const { data: pratiche, error } = await db
    .from("enea_practices")
    .select(
      "id, form_token, cliente_nome, cliente_cognome, cliente_email, prodotto_installato, data_fine_lavori, pagamento_stato, archived_at, created_at",
    )
    .eq("canale", "eneasubito")
    .neq("pagamento_stato", "pagata")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    console.error("[eneasubito-solleciti] lettura fallita", error);
    return json({ error: "lettura fallita" }, 500);
  }

  const [{ data: gia }, { data: fuori }] = await Promise.all([
    db.from("eneasubito_solleciti").select("pratica_id, numero"),
    db.from("eneasubito_disiscritti").select("email"),
  ]);

  const inviatiPer = new Map<string, number[]>();
  for (const r of gia ?? []) {
    const elenco = inviatiPer.get(r.pratica_id as string) ?? [];
    elenco.push(r.numero as number);
    inviatiPer.set(r.pratica_id as string, elenco);
  }
  const disiscritti = new Set((fuori ?? []).map((r) => String(r.email).toLowerCase()));

  const esito: { mandati: number; saltati: number; errori: string[]; anteprima: unknown[] } = {
    mandati: 0,
    saltati: 0,
    errori: [],
    anteprima: [],
  };
  // Perche' tacciono, in numeri e senza nomi: «zero messaggi» puo' voler dire
  // che la macchina ragiona giusto o che non ha letto niente, e sono due cose
  // molto diverse.
  const conto = { candidate: pratiche?.length ?? 0, senzaIndirizzo: 0, disiscritte: 0, troppoPresto: 0, finite: 0 };

  for (const p of pratiche ?? []) {
    if (esito.mandati >= MASSIMO_PER_GIRO) break;

    const email = String(p.cliente_email ?? "").trim().toLowerCase();
    const stato: StatoPratica = {
      creataIl: String(p.created_at),
      pagata: p.pagamento_stato === "pagata",
      archiviata: Boolean(p.archived_at),
      disiscritta: disiscritti.has(email),
      giaInviati: inviatiPer.get(p.id as string) ?? [],
      email: email || null,
    };

    const tocca = qualeTocca(stato, adesso);
    if (!tocca) {
      if (!stato.email) conto.senzaIndirizzo += 1;
      else if (stato.disiscritta) conto.disiscritte += 1;
      else if (stato.giaInviati.length >= 5) conto.finite += 1;
      else conto.troppoPresto += 1;
      esito.saltati += 1;
      continue;
    }

    const dati = {
      nome: `${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""}`.trim(),
      intervento: intervento(p.prodotto_installato as string | null),
      giorniRimasti: giorniRimasti(p.data_fine_lavori as string | null),
      linkRipresa: `${SITO}/verifica`,
      linkDisiscrizione: `${SITO}/stop/${p.form_token}`,
    };
    const testo = corpo(tocca.numero, dati);

    if (soloProva || !ATTIVI) {
      // Mai l'indirizzo: solo quale messaggio toccherebbe. Per controllare
      // che il conto torni basta questo.
      esito.anteprima.push({
        numero: tocca.numero,
        oggetto: tocca.oggetto,
        motivo: soloProva ? "prova" : "spedizione spenta",
      });
      esito.saltati += 1;
      continue;
    }

    // La riga si scrive PRIMA di spedire: se due esecuzioni si accavallano,
    // la seconda si rompe qui sul vincolo di unicita' e non manda niente.
    // Meglio un messaggio perso che un messaggio doppio.
    const { error: erroreSegno } = await db
      .from("eneasubito_solleciti")
      .insert({ pratica_id: p.id, numero: tocca.numero });
    if (erroreSegno) {
      esito.saltati += 1;
      continue;
    }

    const guasto = await spedisci(email, tocca.oggetto, testo);
    if (guasto) {
      // La riga resta, col motivo: cosi' non riparte ogni ora all'infinito.
      await db
        .from("eneasubito_solleciti")
        .update({ errore: guasto })
        .eq("pratica_id", p.id)
        .eq("numero", tocca.numero);
      esito.errori.push(`messaggio ${tocca.numero}: ${guasto}`);
      continue;
    }
    esito.mandati += 1;
  }

  console.log("[eneasubito-solleciti]", JSON.stringify({ ...esito, anteprima: esito.anteprima.length }));
  return json({
    ok: true,
    attivi: ATTIVI,
    ...(soloProva ? { momento: adesso.toISOString(), conto } : {}),
    ...esito,
  });
});
