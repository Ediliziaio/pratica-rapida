/**
 * Da dove arriva chi compra.
 *
 * Senza questo, il tetto che il Titolare si e' dato — massimo 20 € di
 * pubblicita' per pratica — non e' applicabile: a fine mese si sa quanto si e'
 * speso e quante pratiche sono entrate, ma non quali soldi hanno portato quali
 * pratiche. Si spegne la campagna sbagliata e si tiene quella che non rende.
 *
 * Due principi, e sono gli stessi che valgono per i totali delle fatture:
 *
 *  1. **Si registra quello che e' successo, non quello che se ne deduce.**
 *     Qui dentro finiscono i fatti grezzi — il parametro nell'indirizzo, il
 *     sito da cui si arriva — e basta. L'etichetta leggibile («Google,
 *     annuncio a pagamento») si ricava al momento di leggerla, cosi' se un
 *     domani la regola di lettura migliora, migliora anche per le pratiche
 *     gia' registrate.
 *  2. **Primo tocco, non ultimo.** Chi arriva da un annuncio, se ne va e
 *     torna il giorno dopo digitando il nome, l'ha portato l'annuncio. La
 *     provenienza si prende all'ingresso e non si sovrascrive piu'.
 *
 * Niente cookie, niente servizi di terzi, nessun dato personale: solo il
 * parametro che abbiamo messo noi nell'annuncio e il NOME del sito da cui si
 * arriva, mai l'indirizzo completo — quello puo' contenere la ricerca che una
 * persona ha digitato.
 */

/** Quello che si registra. Tutti i campi sono facoltativi: spesso non c'e' niente. */
export interface Provenienza {
  /** Il parametro `utm_source` dell'annuncio: google, chatgpt, newsletter… */
  sorgente?: string;
  /** `utm_medium`: cpc, email, passaparola… */
  mezzo?: string;
  /** `utm_campaign`: il nome della campagna. */
  campagna?: string;
  /** `utm_term`: la parola cercata, quando Google ce la passa. */
  parola?: string;
  /** `utm_content`: quale variante dell'annuncio. */
  variante?: string;
  /** Identificativo del clic di Google Ads: serve a riconciliare la spesa. */
  gclid?: string;
  /** Solo il NOME del sito da cui si arriva (google.com), mai l'indirizzo intero. */
  rinvio?: string;
  /** La pagina su cui e' atterrato, senza parametri. */
  pagina?: string;
  /** Quando e' entrato, in formato ISO. */
  quando?: string;
}

const MEMORIA = "eneasubito-provenienza";

/** Oltre questa lunghezza si taglia: nessun parametro onesto e' piu' lungo. */
const MASSIMO = 120;

/**
 * Ripulisce un valore prima di conservarlo: niente caratteri di controllo,
 * niente valori chilometrici, niente spazi ai bordi. Quello che arriva
 * dall'indirizzo lo scrive chiunque, e va trattato come tale.
 */
function pulisci(valore: string | null | undefined): string | undefined {
  if (!valore) return undefined;
  const pulito = valore
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MASSIMO);
  return pulito || undefined;
}

/** Il nome del sito da cui si arriva. Mai il percorso, mai i parametri. */
export function nomeSito(rinvio: string | null | undefined): string | undefined {
  if (!rinvio) return undefined;
  try {
    const host = new URL(rinvio).hostname.replace(/^www\./, "");
    return pulisci(host);
  } catch {
    return undefined;
  }
}

/**
 * Legge la provenienza da un indirizzo e da chi ci ha mandati.
 *
 * Funzione pura: prende indirizzo e rinvio come testo, non guarda il browser.
 * Cosi' si puo' provare, ed e' il motivo per cui sta separata da `cattura`.
 */
export function leggiProvenienza(
  indirizzo: string,
  rinvio?: string | null,
  adesso: Date = new Date(),
): Provenienza {
  let url: URL;
  try {
    url = new URL(indirizzo);
  } catch {
    return { quando: adesso.toISOString() };
  }
  const p = url.searchParams;
  const sito = nomeSito(rinvio);

  const provenienza: Provenienza = {
    sorgente: pulisci(p.get("utm_source")),
    mezzo: pulisci(p.get("utm_medium")),
    campagna: pulisci(p.get("utm_campaign")),
    parola: pulisci(p.get("utm_term")),
    variante: pulisci(p.get("utm_content")),
    gclid: pulisci(p.get("gclid")),
    // Il sito di partenza si registra solo se e' un altro sito: i passaggi
    // da una nostra pagina all'altra non sono una provenienza.
    rinvio: sito && sito !== url.hostname.replace(/^www\./, "") ? sito : undefined,
    pagina: pulisci(url.pathname) ?? "/",
    quando: adesso.toISOString(),
  };

  // Si tengono solo i campi che hanno davvero un valore: una riga piena di
  // caselle vuote fa sembrare che si sappia qualcosa che non si sa.
  for (const chiave of Object.keys(provenienza) as (keyof Provenienza)[]) {
    if (provenienza[chiave] === undefined) delete provenienza[chiave];
  }
  return provenienza;
}

/** Vero se non c'e' nessun fatto utile: ci sono solo la pagina e l'ora. */
export function provenienzaVuota(p: Provenienza): boolean {
  return !p.sorgente && !p.mezzo && !p.campagna && !p.gclid && !p.rinvio;
}

let inMemoria: Provenienza | null = null;

/**
 * Prende la provenienza all'ingresso e la tiene per tutta la visita.
 *
 * Si chiama una volta sola, all'avvio del sito. Il valore resta in memoria
 * mentre il visitatore gira fra le pagine, e in `sessionStorage` perche'
 * sopravviva a un ricaricamento: quella e' la memoria della singola scheda del
 * browser e si svuota da sola quando la chiude. Non e' un cookie e non segue
 * nessuno da un sito all'altro.
 *
 * Primo tocco: se c'e' gia' qualcosa di utile, non si sovrascrive.
 */
export function catturaProvenienza(
  indirizzo: string,
  rinvio?: string | null,
  adesso: Date = new Date(),
): Provenienza {
  const gia = provenienzaConservata();
  const nuova = leggiProvenienza(indirizzo, rinvio, adesso);

  if (gia && !provenienzaVuota(gia)) {
    inMemoria = gia;
    return gia;
  }
  // Se quella di prima non diceva niente, questa puo' solo migliorarla.
  const scelta = !provenienzaVuota(nuova) ? nuova : (gia ?? nuova);
  inMemoria = scelta;
  try {
    sessionStorage.setItem(MEMORIA, JSON.stringify(scelta));
  } catch {
    // Navigazione privata o spazio esaurito: resta quella in memoria.
  }
  return scelta;
}

function provenienzaConservata(): Provenienza | null {
  if (inMemoria) return inMemoria;
  try {
    const salvata = sessionStorage.getItem(MEMORIA);
    return salvata ? (JSON.parse(salvata) as Provenienza) : null;
  } catch {
    return null;
  }
}

/**
 * Dimentica quello che si e' catturato.
 *
 * In produzione non serve a niente e non va chiamata: la provenienza deve
 * restare appiccicata alla visita. Esiste perche' senza di lei la memoria di
 * modulo si porta dietro il valore da una prova all'altra e i test non
 * verificherebbero piu' niente.
 */
export function azzeraProvenienza(): void {
  inMemoria = null;
  try {
    sessionStorage.removeItem(MEMORIA);
  } catch {
    // Niente da fare: resta solo quella in memoria, gia' azzerata.
  }
}

/** La provenienza di questa visita, da allegare alla pratica. */
export function provenienzaDiQuestaVisita(): Provenienza | undefined {
  const p = provenienzaConservata();
  return p ?? undefined;
}
