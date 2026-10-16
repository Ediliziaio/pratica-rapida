/**
 * Le domande della chat, con la risposta gia' scritta.
 *
 * Le ha dettate il Titolare il 16/10/2026 e sono rifinite insieme: il copione
 * completo, con il perche' di ogni modifica, sta in docs/ENEASUBITO_CHAT.md.
 * Qui non si inventa niente — se una risposta va cambiata si cambia la', e
 * poi si riporta.
 *
 * **La regola che governa questo file: si risponde sempre, subito.** Niente
 * modello che improvvisa: su un argomento dove la risposta sbagliata vale
 * migliaia di euro di detrazione, meglio sette risposte giuste e un «questa
 * la giro a un tecnico». Per questo le risposte sono testo fisso.
 *
 * `chiavi` sono le parole con cui la cerchiamo quando uno scrive a modo suo:
 * nessuna intelligenza, solo confronto di parole. Vanno messe al singolare e
 * senza accenti, perche' il confronto normalizza (vedi `cerca`).
 */

export interface Domanda {
  /** Identificativo stabile: si usa per contare quali vengono aperte. */
  id: string;
  /** La domanda come la farebbe un cliente. */
  domanda: string;
  /** La risposta, gia' pronta. Puo' contenere a capo. */
  risposta: string;
  /** Parole con cui si trova scrivendo in libertà. */
  chiavi: string[];
  /** Le prime che si vedono senza cercare niente. */
  inVetrina?: boolean;
}

export const DOMANDE: Domanda[] = [
  {
    id: "chi-siete",
    domanda: "Ma chi siete, mi posso fidare?",
    risposta:
      "Siamo tecnici del settore che offrono un servizio online, senza sportello e in smart working: è per questo che possiamo proporre i prezzi più bassi del mercato.",
    chiavi: ["chi siete", "fidare", "fiducia", "truffa", "sicuri", "azienda", "societa"],
    inVetrina: true,
  },
  {
    id: "quanto-costa",
    domanda: "Quanto costa?",
    risposta:
      "99 €, una volta sola. Dentro ci sono il controllo dei documenti, la compilazione, la trasmissione all'ENEA e la ricevuta col codice CPID.",
    chiavi: ["costa", "costo", "prezzo", "quanto", "99", "pagare"],
    inVetrina: true,
  },
  {
    id: "cosa-ricevo",
    domanda: "Cosa ricevo esattamente?",
    risposta:
      "La pratica in PDF, con il codice CPID. Quella ricevuta la emette l'ENEA, non noi: è la prova che la comunicazione è stata trasmessa. La porti al commercialista con la dichiarazione dei redditi.",
    chiavi: ["ricevo", "cosa mi arriva", "cpid", "pdf", "documento", "ricevuta"],
    inVetrina: true,
  },
  {
    id: "quanto-tempo",
    domanda: "Quanto ci mettete?",
    risposta: "48 ore lavorative da quando abbiamo la fattura.",
    chiavi: ["quanto tempo", "quando", "48", "tempi", "veloce", "pronta"],
    inVetrina: true,
  },
  {
    id: "dopo-il-modulo",
    domanda: "Una volta compilato il modulo, cosa devo fare?",
    risposta:
      "Niente. Se i documenti sono a posto ricevi la tua pratica ENEA entro 48 ore lavorative. Se serve qualcosa in più, ti scrive un nostro tecnico per mail.",
    chiavi: ["dopo", "compilato", "cosa devo fare", "poi"],
  },
  {
    id: "telefono",
    domanda: "Avete un numero di telefono?",
    risposta:
      "Lavoriamo solo online, per mail e con questa chat. È per questo che riusciamo a tenere i prezzi così bassi.",
    chiavi: ["telefono", "numero", "chiamare", "chiamata", "parlare", "sentire", "voce"],
    inVetrina: true,
  },
  {
    id: "dove-siete",
    domanda: "Di dove siete?",
    risposta:
      "Non abbiamo un ufficio fisico, lavoriamo in smart working online: è per questo che riusciamo a tenere i prezzi così bassi.",
    chiavi: ["dove siete", "sede", "ufficio", "indirizzo", "citta"],
  },
  {
    id: "non-si-puo-fare",
    domanda: "E se pago e poi la mia pratica non si può fare?",
    risposta: "I 99 € tornano indietro. Sta scritto nei Termini di servizio, articolo 5.",
    chiavi: ["rimborso", "non si puo", "indietro", "soldi", "garanzia"],
    inVetrina: true,
  },
  {
    id: "pagamento-sicuro",
    domanda: "Il pagamento è sicuro?",
    risposta:
      "Si paga con Stripe, lo stesso circuito dei negozi online. I dati della carta arrivano a loro: noi vediamo solo che il pagamento è andato a buon fine.",
    chiavi: ["pagamento", "sicuro", "carta", "stripe", "bonifico"],
  },
  {
    id: "fattura",
    domanda: "Riceverò la fattura?",
    risposta:
      "Certo. Viene emessa in automatico subito dopo il pagamento e te la mandiamo per mail.",
    chiavi: ["fattura", "ricevuta fiscale", "fatturazione"],
  },
  {
    id: "fattura-detraibile",
    domanda: "La fattura dei 99 € è detraibile?",
    risposta: "No: il costo del servizio resta a carico tuo.",
    chiavi: ["fattura detraibile", "detrarre il costo", "99 detraibile"],
  },
  {
    id: "prodotto-detraibile",
    domanda: "Come faccio a sapere se quello che ho comprato è detraibile?",
    risposta:
      "Il modulo prevede già tutti i prodotti detraibili: se il tuo non compare nell'elenco, vuol dire che per quell'intervento la pratica non si fa.",
    chiavi: ["detraibile", "detrazione", "rientra", "prodotto", "ammesso"],
    inVetrina: true,
  },
  {
    id: "non-proprietario",
    domanda: "Non sono proprietario della casa, posso detrarre?",
    risposta:
      "Dipende dal titolo che hai sull'immobile. Con un contratto d'affitto, un usufrutto o un comodato sì. Senza un titolo di detenzione la detrazione non spetta.",
    chiavi: ["proprietario", "affitto", "affittuario", "usufrutto", "comodato", "inquilino"],
  },
  {
    id: "cointestazione",
    domanda: "La casa è cointestata: di chi metto i dati?",
    risposta:
      "Di chi compare sulla fattura — che è anche chi ha fatto i bonifici. I proprietari della casa non c'entrano: conta l'intestatario della fattura. Se sulla fattura ci sono due nomi, durante la compilazione ti chiediamo anche il secondo.",
    chiavi: ["cointestata", "cointestato", "moglie", "marito", "due nomi", "intestatario", "coniuge"],
  },
  {
    id: "entro-quando",
    domanda: "Entro quando devo farla?",
    risposta:
      "Entro 90 giorni dalla fine dei lavori. Il termine corre dalla data che attesta l'impresa che li ha eseguiti.",
    chiavi: ["entro quando", "scadenza", "90 giorni", "termine", "tempo"],
    inVetrina: true,
  },
  {
    id: "oltre-90-giorni",
    domanda: "Sono passati più di 90 giorni, cosa posso fare?",
    risposta:
      "Due strade. La prima: chiedi al tuo installatore se può rilasciarti la dichiarazione di fine lavori con la data reale di ultimazione — spesso è più recente di quella della fattura, e se rientra nei 90 giorni la pratica si fa normalmente.\n\nLa seconda: la pratica si può trasmettere lo stesso. Il CAF ti chiederà di pagare un F24 di 250 € come ravvedimento, ma la detrazione non la perdi.",
    chiavi: ["90 giorni passati", "troppo tardi", "ritardo", "scaduto", "ravvedimento"],
  },
  {
    id: "data-fine-lavori",
    domanda: "Dove prendo la data di fine lavori?",
    risposta:
      "Dalla fattura, dall'ultimo bonifico, oppure dalla dichiarazione di fine lavori se il tuo installatore te l'ha rilasciata.",
    chiavi: ["data fine lavori", "fine lavori", "quando sono finiti"],
  },
  {
    id: "sbagliato-dato",
    domanda: "Ho sbagliato a compilare un dato.",
    risposta:
      "Scrivici a assistenza@eneasubito.it: modifichiamo la pratica senza problemi.",
    chiavi: ["sbagliato", "errore", "correggere", "modificare", "cambiare"],
  },
  {
    id: "appartamenti",
    domanda: "Non so il numero esatto degli appartamenti dell'edificio.",
    risposta: "Va bene anche un numero indicativo.",
    chiavi: ["appartamenti", "quanti appartamenti", "edificio"],
  },
  {
    id: "scale",
    domanda: "Il mio condominio ha più scale: le conto tutte?",
    risposta: "No, solo la tua.",
    chiavi: ["scale", "condominio", "palazzo"],
  },
  {
    id: "caldaia",
    domanda: "Non sono sicuro di che caldaia ho.",
    risposta:
      "L'impianto più diffuso è la caldaia ad acqua calda standard: se sei in dubbio indica quella e, se dai documenti risulta diversa, la correggiamo noi.",
    chiavi: ["caldaia", "impianto termico", "riscaldamento"],
  },
  {
    id: "finanziamento",
    domanda: "Ho fatto un finanziamento, i bonifici non li ho.",
    risposta:
      "Nessun problema: nel modulo indichi «finanziamento» e il totale lo prendiamo dalle fatture.",
    chiavi: ["finanziamento", "bonifico", "rate", "pagamento rateale"],
  },
  {
    id: "metri-quadri",
    domanda: "I metri quadri devono essere commerciali o calpestabili?",
    risposta:
      "Vanno bene entrambi. Se non sai la misura esatta, metti un valore vicino a quello reale.",
    chiavi: ["metri quadri", "mq", "superficie", "calpestabile", "commerciale"],
  },
  {
    id: "anno-costruzione",
    domanda: "Non so l'anno di costruzione.",
    risposta: "Va bene un dato indicativo.",
    chiavi: ["anno di costruzione", "quando e stata costruita", "eta della casa"],
  },
  {
    id: "spid",
    domanda: "Serve lo SPID?",
    risposta:
      "Trasmettiamo dal nostro accesso professionale. La ricevuta porta il tuo nome.",
    chiavi: ["spid", "accesso", "identita digitale", "cie"],
  },
  {
    id: "a-che-punto",
    domanda: "A che punto è la mia pratica?",
    risposta:
      "Se sono passate meno di 48 ore lavorative dal pagamento, è in lavorazione. Se ne sono passate di più, controlla anche la posta indesiderata: la mandiamo per mail. Se lì non c'è, scrivici e te la rimandiamo subito.",
    chiavi: ["a che punto", "stato", "aggiornamento", "novita", "quando arriva"],
  },
];

/** Le poche che si vedono subito, senza cercare. */
export const IN_VETRINA = DOMANDE.filter((d) => d.inVetrina);

/** Via accenti e maiuscole: chi scrive di fretta non li mette. */
function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cerca fra le domande salvate quelle che somigliano a quello che ha scritto.
 *
 * Nessun modello: si contano le parole in comune, e si tiene chi ne ha almeno
 * una lunga. Grezzo, ma per venticinque domande funziona ed e' prevedibile —
 * che su questo argomento conta piu' dell'essere brillanti.
 */
export function cerca(testo: string, quante = 4): Domanda[] {
  const parole = normalizza(testo).split(" ").filter((p) => p.length >= 4);
  if (parole.length === 0) return [];

  const punteggi = DOMANDE.map((d) => {
    const fieno = normalizza([d.domanda, ...d.chiavi].join(" "));
    const punti = parole.reduce((somma, p) => (fieno.includes(p) ? somma + p.length : somma), 0);
    return { d, punti };
  })
    .filter((x) => x.punti > 0)
    .sort((a, b) => b.punti - a.punti);

  return punteggi.slice(0, quante).map((x) => x.d);
}
