/**
 * Come si legge la provenienza di una pratica di EneaSubito.
 *
 * I fatti grezzi li registra il sito (vedi pages/eneasubito/provenienza.ts).
 * Qui si traducono in una riga leggibile e in un gruppo, e si contano.
 *
 * La traduzione sta **soltanto** qui, e non nella scheda salvata, per una
 * ragione pratica: il giorno in cui si aggiunge un canale nuovo — poniamo la
 * pubblicita' dentro ChatGPT — basta aggiungere una regola e anche le pratiche
 * di sei mesi fa vengono rilette bene. Se l'etichetta fosse stata scritta
 * dentro la pratica, resterebbe sbagliata per sempre.
 *
 * Nessuna regola inventa niente: se i fatti non bastano, il gruppo e'
 * «Nessuna pubblicita' registrata», che e' una risposta onesta e si vede
 * subito. Attenzione a come si legge: parla del CANALE che ha portato la
 * persona, non della persona, che ha nome e cognome come tutte le altre.
 */

export interface ProvenienzaGrezza {
  sorgente?: string | null;
  mezzo?: string | null;
  campagna?: string | null;
  parola?: string | null;
  variante?: string | null;
  gclid?: string | null;
  rinvio?: string | null;
  pagina?: string | null;
  quando?: string | null;
}

/** I gruppi in cui si divide la spesa. Stabili: ci si ragiona sopra ogni mese. */
export type Gruppo =
  | "google_annunci"
  | "google_ricerca"
  | "altro_motore"
  | "chatgpt"
  | "campagna"
  | "altro_sito"
  | "diretto"
  | "sconosciuta";

export interface Lettura {
  gruppo: Gruppo;
  /** La riga che si legge nel CRM. */
  etichetta: string;
  /** Il dettaglio utile, quando c'e': la campagna, la parola cercata, il sito. */
  dettaglio?: string;
  /** Vero quando quella pratica e' costata pubblicita'. */
  aPagamento: boolean;
}

const MOTORI = ["google.", "bing.", "duckduckgo.", "ecosia.", "yahoo.", "qwant."];
const ASSISTENTI = ["chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "copilot.microsoft.com"];

function contiene(valore: string | null | undefined, pezzi: string[]): boolean {
  const v = (valore ?? "").toLowerCase();
  return !!v && pezzi.some((pezzo) => v.includes(pezzo));
}

/**
 * Da cosa e' arrivato, in lingua leggibile.
 *
 * L'ordine dei controlli conta, e segue chi paga: un clic che ha un
 * identificativo di Google Ads e' un clic pagato, qualunque altra cosa dica
 * l'indirizzo. Poi le campagne che abbiamo marcato noi, poi quello che si
 * deduce dal sito di partenza, che e' l'informazione piu' debole.
 */
export function leggi(p: ProvenienzaGrezza | null | undefined): Lettura {
  if (!p || Object.keys(p).length === 0) {
    return {
      gruppo: "sconosciuta",
      etichetta: "Nessuna pubblicità registrata",
      aPagamento: false,
    };
  }

  const campagna = p.campagna?.trim() || undefined;
  const parola = p.parola?.trim() || undefined;
  const dettaglio = [campagna, parola].filter(Boolean).join(" · ") || undefined;

  // 1. Clic pagato su Google: lo dice l'identificativo, non l'indirizzo.
  if (p.gclid?.trim()) {
    return { gruppo: "google_annunci", etichetta: "Google — annuncio a pagamento", dettaglio, aPagamento: true };
  }

  // 2. Una campagna marcata da noi.
  const sorgente = p.sorgente?.trim().toLowerCase();
  const mezzo = p.mezzo?.trim().toLowerCase();
  if (sorgente) {
    const pagato = ["cpc", "ppc", "paid", "annuncio", "pubblicita"].includes(mezzo ?? "");
    if (contiene(sorgente, ["chatgpt", "openai"])) {
      return { gruppo: "chatgpt", etichetta: "ChatGPT", dettaglio, aPagamento: pagato };
    }
    if (sorgente === "google") {
      return {
        gruppo: pagato ? "google_annunci" : "google_ricerca",
        etichetta: pagato ? "Google — annuncio a pagamento" : "Google — campagna senza costo",
        dettaglio,
        aPagamento: pagato,
      };
    }
    return {
      gruppo: "campagna",
      etichetta: `Campagna — ${p.sorgente?.trim()}`,
      dettaglio,
      aPagamento: pagato,
    };
  }

  // 3. Quello che si deduce dal sito di partenza. Informazione debole: dice
  //    da dove e' passato, non perche' e' venuto.
  const rinvio = p.rinvio?.trim();
  if (rinvio) {
    if (contiene(rinvio, ASSISTENTI)) {
      return { gruppo: "chatgpt", etichetta: "ChatGPT o altro assistente", dettaglio: rinvio, aPagamento: false };
    }
    if (contiene(rinvio, ["google."])) {
      return { gruppo: "google_ricerca", etichetta: "Google — ricerca gratuita", dettaglio, aPagamento: false };
    }
    if (contiene(rinvio, MOTORI)) {
      return { gruppo: "altro_motore", etichetta: "Altro motore di ricerca", dettaglio: rinvio, aPagamento: false };
    }
    return { gruppo: "altro_sito", etichetta: "Da un altro sito", dettaglio: rinvio, aPagamento: false };
  }

  // 4. Nessun indizio: ha digitato il nome, o e' arrivato da un posto che non
  //    dice da dove viene (una chat, una mail aperta nell'app, un QR).
  return { gruppo: "diretto", etichetta: "Diretto — ha digitato il nome", aPagamento: false };
}

export interface RigaConteggio {
  gruppo: Gruppo;
  etichetta: string;
  /** Quante persone sono arrivate fino ad aprire una pratica. */
  arrivate: number;
  /**
   * Quante hanno pagato. E' questo il numero che conta: l'obiettivo del
   * Titolare e' tre VENDITE al giorno, non tre moduli aperti. La differenza
   * fra arrivate e pagate e' quanta gente si perde alla cassa.
   */
  pagate: number;
  incassato: number;
  aPagamento: boolean;
  /** I nomi di chi ha pagato, per il controllo a vista. */
  clienti: string[];
}

export interface PraticaDaContare {
  cliente_nome?: string | null;
  cliente_cognome?: string | null;
  prezzo?: number | string | null;
  pagamento_stato?: string | null;
  provenienza?: ProvenienzaGrezza | null;
}

/**
 * Raggruppa le pratiche per provenienza.
 *
 * L'incasso conta solo le pagate e non i rimborsi, come il riepilogo del mese:
 * due numeri che dicono la stessa cosa devono essere contati nello stesso modo,
 * se no si passa la giornata a capire perche' non tornano.
 */
export function raggruppa(pratiche: readonly PraticaDaContare[]): RigaConteggio[] {
  const mappa = new Map<Gruppo, RigaConteggio>();

  for (const pratica of pratiche) {
    const lettura = leggi(pratica.provenienza);
    const riga = mappa.get(lettura.gruppo) ?? {
      gruppo: lettura.gruppo,
      etichetta: lettura.etichetta,
      arrivate: 0,
      pagate: 0,
      incassato: 0,
      aPagamento: lettura.aPagamento,
      clienti: [],
    };
    riga.arrivate += 1;
    // Basta una pratica pagata perche' il gruppo sia costato: e' il caso in
    // cui una campagna e' marcata a pagamento solo su alcuni annunci.
    riga.aPagamento = riga.aPagamento || lettura.aPagamento;

    if (pratica.pagamento_stato === "pagata") {
      riga.pagate += 1;
      const nome = `${pratica.cliente_nome ?? ""} ${pratica.cliente_cognome ?? ""}`.trim();
      if (nome) riga.clienti.push(nome);
      const importo = Number(pratica.prezzo ?? 0);
      if (Number.isFinite(importo) && importo > 0) riga.incassato += importo;
    }
    mappa.set(lettura.gruppo, riga);
  }

  for (const riga of mappa.values()) riga.clienti.sort((a, b) => a.localeCompare(b, "it"));

  // Prima i gruppi che vendono di piu': in cima si legge dove sta il grosso.
  return [...mappa.values()].sort(
    (a, b) => b.pagate - a.pagate || b.arrivate - a.arrivate ||
      a.etichetta.localeCompare(b.etichetta, "it"),
  );
}

/**
 * Quanto e' costata una pratica VENDUTA, dato quanto si e' speso.
 *
 * Si divide per le pagate e non per le arrivate: il tetto di 20 € che il
 * Titolare si e' dato e' il costo di acquisire un cliente, e chi apre il
 * modulo e poi non paga non e' un cliente.
 *
 * `null` quando non si puo' dire: senza la spesa inserita a mano non si
 * inventa un costo. Un numero inventato qui diventerebbe la base di una
 * decisione su dove mettere i soldi.
 */
export function costoPerPratica(pagate: number, spesa: number | null | undefined): number | null {
  if (!Number.isFinite(spesa ?? NaN) || (spesa ?? 0) <= 0) return null;
  if (pagate <= 0) return null;
  return (spesa as number) / pagate;
}

/**
 * Quanti, fra quelli arrivati, hanno pagato. Da 0 a 1.
 *
 * `null` quando non e' arrivato nessuno: una percentuale su zero non
 * significa niente e messa a video sembrerebbe un dato.
 */
export function quotaDiConversione(arrivate: number, pagate: number): number | null {
  if (arrivate <= 0) return null;
  return pagate / arrivate;
}
