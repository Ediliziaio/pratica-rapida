/**
 * Il preflight di EneaSubito: decide se una pratica si può fare, prima che il
 * cliente paghi e prima che noi lavoriamo.
 *
 * Tre esiti, mai due. «Non lo so» è un esito legittimo e finisce a un
 * operatore: un «sì» sbagliato significa incassare 99 € per un lavoro che non
 * si può fare, cioè un rimborso e un cliente arrabbiato. Meglio una domanda.
 *
 * Due dei tre controlli non hanno bisogno di nessuna intelligenza:
 *   · il perimetro è un elenco chiuso;
 *   · i 90 giorni sono una sottrazione fra date.
 * Il terzo — la fattura si legge? — è l'unico incerto, ed è affidato al
 * lettore. Finché il lettore non è collegato, quel controllo risponde «non
 * disponibile» e la pratica cade nel terzo esito: nessun sì a vanvera.
 */

export type Famiglia = "infissi" | "schermature" | "pompe_di_calore" | "altro";

export type Esito = "si_puo_fare" | "non_si_puo_fare" | "serve_un_controllo";

/** Giorni entro cui la comunicazione va trasmessa all'ENEA. */
export const TERMINE_GIORNI = 90;

/** Sotto questa soglia avvisiamo che il tempo è poco, ma non blocchiamo. */
export const GIORNI_DI_ALLARME = 15;

/**
 * Giorni che servono a noi per lavorare e trasmettere dopo il pagamento.
 *
 * Il termine di legge vale sulla TRASMISSIONE, non sulla richiesta: se uno
 * arriva il novantesimo giorno e noi trasmettiamo il giorno dopo, il torto è
 * nostro. Dentro questo margine non promettiamo, avvisiamo che bisogna pagare
 * subito.
 */
export const GIORNI_DI_LAVORAZIONE = 3;

export interface Risposte {
  famiglia: Famiglia | null;
  /** Nome e cognome, come li scrive lui: non si pretende la forma esatta. */
  nome: string;
  /** Data di fine lavori in formato AAAA-MM-GG. */
  fineLavori: string;
  email: string;
  fatturaCaricata: boolean;
}

/** Cosa ci dice il lettore sulla fattura. */
export type LetturaFattura =
  | { stato: "letta"; totale: string; pezzi?: string; data?: string }
  | { stato: "illeggibile" }
  | { stato: "non_disponibile" };

export interface Motivo {
  segno: "ok" | "no" | "forse";
  testo: string;
}

export interface Verdetto {
  esito: Esito;
  titolo: string;
  spiegazione: string;
  motivi: Motivo[];
}

const NOMI_FAMIGLIA: Record<Exclude<Famiglia, "altro">, string> = {
  infissi: "Sostituzione infissi",
  schermature: "Schermature solari",
  pompe_di_calore: "Pompa di calore",
};

/**
 * Giorni passati dalla fine dei lavori. `null` se la data non è utilizzabile.
 * Confronta solo la parte di calendario: l'ora non c'entra e introdurrebbe
 * errori di un giorno a cavallo della mezzanotte.
 */
export function giorniDaFineLavori(fineLavori: string, oggi = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fineLavori)) return null;
  const [a, m, g] = fineLavori.split("-").map(Number);
  const fine = Date.UTC(a, m - 1, g);
  if (Number.isNaN(fine)) return null;
  const adesso = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.floor((adesso - fine) / 86_400_000);
}

export function giorniRimasti(fineLavori: string, oggi = new Date()): number | null {
  const passati = giorniDaFineLavori(fineLavori, oggi);
  return passati === null ? null : TERMINE_GIORNI - passati;
}

/**
 * Il verdetto. L'ordine dei controlli conta: prima quelli che chiudono la
 * partita da soli (perimetro, termine), poi quelli che possono solo rimandare
 * a un operatore. Così a chi è fuori perimetro non chiediamo la fattura.
 */
export function valuta(risposte: Risposte, lettura: LetturaFattura, oggi = new Date()): Verdetto {
  const motivi: Motivo[] = [];

  // 1. Perimetro — elenco chiuso, nessun dubbio possibile.
  if (!risposte.famiglia) {
    return {
      esito: "serve_un_controllo",
      titolo: "Manca ancora qualcosa",
      spiegazione: "Dicci che lavoro hai fatto per avere la risposta.",
      motivi,
    };
  }
  if (risposte.famiglia === "altro") {
    return {
      esito: "non_si_puo_fare",
      titolo: "Questo intervento non lo trattiamo",
      spiegazione:
        "Ci occupiamo solo di infissi, schermature solari e pompe di calore. Per cappotto, " +
        "fotovoltaico, caldaie a condensazione, stufe a pellet e Conto Termico non siamo il posto " +
        "giusto, e preferiamo dirtelo subito invece di farti perdere tempo.",
      motivi: [{ segno: "no", testo: "L'intervento è fuori da quelli che trattiamo" }],
    };
  }
  motivi.push({ segno: "ok", testo: `${NOMI_FAMIGLIA[risposte.famiglia]} — intervento ammissibile` });

  // 2. I 90 giorni — una sottrazione, non un parere.
  const passati = giorniDaFineLavori(risposte.fineLavori, oggi);
  if (passati === null) {
    return {
      esito: "serve_un_controllo",
      titolo: "Manca ancora qualcosa",
      spiegazione: "Dicci quando sono finiti i lavori per avere la risposta.",
      motivi,
    };
  }
  if (passati < 0) {
    return {
      esito: "serve_un_controllo",
      titolo: "Controlla la data",
      spiegazione:
        "La data che hai messo è nel futuro. Se i lavori devono ancora finire, torna quando sono " +
        "conclusi: il termine dei 90 giorni parte da lì.",
      motivi: [...motivi, { segno: "forse", testo: "La data di fine lavori è nel futuro" }],
    };
  }
  const rimasti = TERMINE_GIORNI - passati;
  if (rimasti < 0) {
    return {
      esito: "serve_un_controllo",
      titolo: "Sei oltre i 90 giorni",
      spiegazione:
        `Dalla data che hai messo sono passati ${passati} giorni, e il termine è 90. La tua pratica ` +
        "la lavoriamo lo stesso e la spesa resta detraibile, ma il CAF ti chiederà di pagare un " +
        "ravvedimento. Se la data effettiva di fine lavori è più recente di quella che hai indicato, " +
        "correggila: vale quella.",
      motivi: [
        ...motivi,
        { segno: "forse", testo: `Dalla data indicata sono passati ${passati} giorni` },
        { segno: "forse", testo: "Fuori termine: il CAF chiedera' un ravvedimento" },
      ],
    };
  }
  if (rimasti < GIORNI_DI_LAVORAZIONE) {
    return {
      esito: "serve_un_controllo",
      titolo: "Siamo al limite: si decide oggi",
      spiegazione:
        `Mancano ${rimasti} giorni alla scadenza, e a noi serve qualche giorno per compilare e ` +
        "trasmettere. Si fa solo se si parte subito: scrivici adesso e ti diciamo entro poche ore se " +
        "ce la facciamo. Non ti facciamo pagare per una corsa che sappiamo già di perdere.",
      motivi: [...motivi, { segno: "forse", testo: `Restano ${rimasti} giorni: troppo pochi per promettere` }],
    };
  }
  motivi.push({
    segno: rimasti <= GIORNI_DI_ALLARME ? "forse" : "ok",
    testo:
      rimasti <= GIORNI_DI_ALLARME
        ? `Sei nei termini, ma di poco: mancano ${rimasti} giorni`
        : `Sei nei termini, mancano ${rimasti} giorni`,
  });

  // 3. La fattura. Deve esistere: non si incassa su una pratica di cui non
  //    abbiamo visto nemmeno l'ombra di un documento.
  if (!risposte.fatturaCaricata) {
    return {
      esito: "serve_un_controllo",
      titolo: "Manca la fattura",
      spiegazione:
        "Caricala anche solo fotografata col telefono: se non si legge te lo diciamo subito, " +
        "mentre ce l'hai ancora in mano.",
      motivi,
    };
  }

  if (lettura.stato === "letta") {
    const dettagli = [lettura.totale, lettura.pezzi, lettura.data].filter(Boolean).join(" · ");
    motivi.push({ segno: "ok", testo: `Fattura letta: ${dettagli}` });
    return {
      esito: "si_puo_fare",
      titolo: "La tua pratica si può fare",
      spiegazione:
        "Con quello che ci hai detto la pratica è fattibile. Paghi 99 €, ti chiediamo il resto dei " +
        "dati e la trasmettiamo. Se i documenti non confermano quello che ci hai dichiarato, ti " +
        "restituiamo tutto.",
      motivi: [...motivi, { segno: "ok", testo: "Il resto dei dati te lo chiediamo dopo" }],
    };
  }

  // Illeggibile o lettore non collegato: non si tira a indovinare.
  return {
    esito: "serve_un_controllo",
    titolo: "Ci serve un controllo",
    spiegazione:
      lettura.stato === "illeggibile"
        ? "Dalla fattura che hai caricato non riusciamo a leggere tutto quello che ci serve. La " +
          "guarda una persona e ti rispondiamo entro 24 ore: non devi fare altro."
        : "L'intervento e i termini sono a posto. Sulla fattura vogliamo guardare noi prima di " +
          "dirti di sì: ti rispondiamo entro 24 ore.",
    motivi: [...motivi, { segno: "forse", testo: "La fattura la controlla una persona" }],
  };
}
