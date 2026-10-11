/**
 * Contenuto delle tre pagine d'intervento di EneaSubito.
 *
 * Sono anche le prime tre pagine pensate per le ricerche: chi cerca «pratica
 * ENEA infissi» deve atterrare qui e trovare scritto quello che gli serve, non
 * un depliant. I testi stanno qui e non dentro i componenti così si correggono
 * senza toccare l'impaginazione.
 *
 * Nessuna percentuale di detrazione: le aliquote cambiano fra prima casa e
 * altri immobili e di anno in anno, e una cifra sbagliata su una pagina di
 * vendita è un guaio. Si parla di «detrazione prevista», mai di quanto.
 */

export interface Sezione {
  titolo: string;
  /** Testo che introduce la sezione, prima dell'elenco. */
  paragrafi?: string[];
  elenco?: string[];
  /** Testo che chiude la sezione, dopo l'elenco. */
  note?: string[];
}

export interface Intervento {
  slug: string;
  /** Titolo della scheda del browser e del risultato su Google. */
  titoloSeo: string;
  descrizione: string;
  h1: string;
  occhiello: string;
  intro: string;
  sezioni: Sezione[];
}

export const INTERVENTI: Intervento[] = [
  {
    slug: "infissi",
    titoloSeo: "Pratica ENEA per la sostituzione degli infissi — EneaSubito",
    descrizione:
      "Hai sostituito finestre o portefinestre? La comunicazione all'ENEA va trasmessa entro 90 giorni dalla fine dei lavori. Verifica gratis se la tua pratica si può fare, paghi 99 € solo se la risposta è sì.",
    h1: "Pratica ENEA per la sostituzione degli infissi",
    occhiello: "Infissi e serramenti",
    intro:
      "Se hai cambiato le finestre e vuoi portare la spesa in detrazione, la sostituzione va comunicata all'ENEA entro 90 giorni dalla fine dei lavori. È un adempimento telematico: non lo fa l'installatore se non ve lo siete detti, e non lo fa il commercialista.",
    sezioni: [
      {
        titolo: "Cosa rientra",
        paragrafi: [
          "La sostituzione di finestre, portefinestre e porte d'ingresso che separano un ambiente riscaldato dall'esterno o da un ambiente non riscaldato.",
        ],
        elenco: [
          "Finestre e portefinestre sostituite, compresi i cassonetti se rifatti insieme",
          "Porte d'ingresso, quando danno sull'esterno o su un vano non riscaldato",
          "Zanzariere, tapparelle e persiane, se compaiono sulla stessa fattura dell'intervento",
        ],
      },
      {
        titolo: "Cosa ti serve",
        elenco: [
          "La fattura dell'installatore, quella di saldo, con il dettaglio di quello che è stato montato",
          "Il certificato del produttore degli infissi, dove sono scritte le trasmittanze",
          "La ricevuta del bonifico, quello parlante con causale e codici fiscali",
          "I dati catastali dell'immobile — non li trovi? Te li cerchiamo noi",
        ],
      },
      {
        titolo: "Dove si incaglia quasi sempre",
        paragrafi: [
          "La fattura senza le misure. Moltissimi installatori scrivono «fornitura e posa di serramenti» e un importo, e basta: senza i metri quadri la pratica non si compila. Noi lo vediamo subito e ti diciamo cosa farti mandare, invece di scoprirlo al novantesimo giorno.",
          "Il certificato che non si trova. È il foglio del produttore, non dell'installatore, e spesso il cliente non sa nemmeno di averlo. Se manca, te lo chiediamo noi — ma solo dopo averti detto se la pratica si può fare.",
        ],
      },
    ],
  },
  {
    slug: "schermature-solari",
    titoloSeo: "Pratica ENEA per tende da sole e schermature solari — EneaSubito",
    descrizione:
      "Tende da sole, pergotende e pergole: la comunicazione all'ENEA va trasmessa entro 90 giorni dalla fine dei lavori. Verifica gratis se la tua pratica si può fare, paghi 99 € solo se la risposta è sì.",
    h1: "Pratica ENEA per tende da sole e schermature solari",
    occhiello: "Schermature solari",
    intro:
      "Le schermature solari sono gli interventi che d'estate tengono fuori il sole: tende da sole, pergotende, pergole con telo tecnico. Anche per queste la comunicazione all'ENEA va trasmessa entro 90 giorni dalla fine dei lavori.",
    sezioni: [
      {
        titolo: "Cosa rientra",
        elenco: [
          "Tende da sole montate su finestre, balconi o terrazzi",
          "Pergotende e pergole con telo tecnico retrattile",
          "Chiusure oscuranti applicate a finestre esistenti",
        ],
        note: [
          "Conta l'esposizione: la schermatura deve stare su una superficie che prende il sole, quindi va indicato su che lato è montata.",
        ],
      },
      {
        titolo: "Cosa ti serve",
        elenco: [
          "La fattura dell'installatore con il dettaglio di quello che è stato montato",
          "Il valore Gtot della schermatura — di solito è scritto sulla fattura stessa",
          "L'esposizione: su che lato dell'edificio è montata",
          "La ricevuta del bonifico",
          "I dati catastali dell'immobile — non li trovi? Te li cerchiamo noi",
        ],
      },
      {
        titolo: "Dove si incaglia quasi sempre",
        paragrafi: [
          "Il Gtot. È il valore che dice quanta luce solare la tenda lascia passare, e senza quello la pratica non si chiude. Nella maggior parte dei casi l'installatore lo scrive in fattura — quando non c'è, va chiesto a lui, ed è una delle prime cose che controlliamo.",
          "Le pergole senza telo tecnico. Una pergola che fa solo ombra con le lamelle non è la stessa cosa di una schermatura: se il tuo caso non rientra te lo diciamo subito, gratis, prima che tu paghi qualcosa.",
        ],
      },
    ],
  },
  {
    slug: "pompe-di-calore",
    titoloSeo: "Pratica ENEA per pompe di calore e climatizzatori — EneaSubito",
    descrizione:
      "Hai installato una pompa di calore per il riscaldamento? La comunicazione all'ENEA va trasmessa entro 90 giorni dalla fine dei lavori. Verifica gratis se la tua pratica si può fare, paghi 99 € solo se la risposta è sì.",
    h1: "Pratica ENEA per le pompe di calore",
    occhiello: "Pompe di calore",
    intro:
      "L'installazione di una pompa di calore per la climatizzazione invernale va comunicata all'ENEA entro 90 giorni dalla fine dei lavori, sia quando sostituisce un vecchio impianto sia quando si affianca a quello che c'è già.",
    sezioni: [
      {
        titolo: "Cosa rientra",
        elenco: [
          "Pompe di calore per la climatizzazione invernale, anche in sostituzione della caldaia",
          "Sistemi che riscaldano l'abitazione, non i soli condizionatori usati d'estate",
        ],
        note: [
          "La differenza che conta è questa: l'apparecchio deve servire a riscaldare. Un climatizzatore che fa solo freddo non rientra, e se è il tuo caso te lo diciamo subito.",
        ],
      },
      {
        titolo: "Cosa ti serve",
        elenco: [
          "La fattura dell'installatore con marca, modello e potenza dell'apparecchio",
          "Le schede tecniche o le certificazioni dell'apparecchio installato",
          "I dati dell'impianto di casa: che riscaldamento avevi prima, con che terminali",
          "La ricevuta del bonifico",
          "I dati catastali dell'immobile — non li trovi? Te li cerchiamo noi",
        ],
      },
      {
        titolo: "Dove si incaglia quasi sempre",
        paragrafi: [
          "I dati tecnici dell'apparecchio. Qui più che altrove servono i numeri del costruttore, e la fattura spesso riporta solo il modello. È il motivo per cui su questi interventi guardiamo le carte con più calma prima di dirti sì.",
          "L'impianto che c'era prima. Per compilare la pratica serve sapere cosa è stato sostituito e come è fatto il riscaldamento di casa: sono domande che ti facciamo dopo, a verifica superata.",
        ],
      },
    ],
  },
];

export function trovaIntervento(slug: string | undefined): Intervento | undefined {
  return INTERVENTI.find((i) => i.slug === slug);
}
