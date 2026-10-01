/**
 * Testi delle pagine legali di EneaSubito.
 *
 * Impalcatura presa dalle pagine di Pratica Rapida, ma riscritta dove la
 * sostanza cambia — e cambia parecchio:
 *
 *  · il titolare non è una società italiana ma PR Consulting LLC, con sede
 *    negli Stati Uniti. Non è un dettaglio di nome: sposta il trattamento
 *    fuori dall'Unione e va detto nel documento;
 *  · l'interessato non è un rivenditore ma un privato cittadino, quindi
 *    cambiano le categorie di dati e le finalità;
 *  · i termini sono di un servizio al consumatore, non di un contratto fra
 *    imprese: ci stanno dentro le promesse fatte in pagina (verifica gratuita,
 *    prezzo, rimborso, tempi) e il recesso.
 *
 * I [SEGNAPOSTO] sono le cose che solo il Titolare può decidere. Finché ci
 * sono, le pagine non vanno pubblicate.
 */

export interface SezioneLegale {
  titolo: string;
  paragrafi?: string[];
  elenco?: string[];
}

export interface Documento {
  slug: "privacy" | "termini" | "cookie";
  titolo: string;
  titoloSeo: string;
  descrizione: string;
  aggiornato: string;
  sezioni: SezioneLegale[];
}

const TITOLARE = "PR Consulting LLC";

export const DOCUMENTI: Documento[] = [
  {
    slug: "privacy",
    titolo: "Informativa sulla privacy",
    titoloSeo: "Informativa sulla privacy — EneaSubito",
    descrizione: "Chi tratta i tuoi dati quando usi EneaSubito, quali dati, perché e per quanto tempo.",
    aggiornato: "[DATA]",
    sezioni: [
      {
        titolo: "1. Chi tratta i tuoi dati",
        paragrafi: [
          `Il titolare del trattamento è ${TITOLARE}, con sede in [INDIRIZZO COMPLETO], Stati Uniti d'America. Per qualsiasi questione relativa ai tuoi dati puoi scrivere a privacy@eneasubito.it.`,
          "Poiché il titolare ha sede fuori dall'Unione europea e offre il servizio a persone che si trovano in Italia, il rappresentante nell'Unione ai sensi dell'art. 27 del GDPR è [RAPPRESENTANTE UE — da designare].",
        ],
      },
      {
        titolo: "2. Quali dati raccogliamo",
        elenco: [
          "Dati identificativi e di contatto: nome, cognome, codice fiscale, indirizzo di residenza, indirizzo e-mail, eventuale numero di telefono.",
          "Dati dell'immobile: indirizzo dei lavori, dati catastali (foglio, mappale, subalterno), caratteristiche dell'edificio e dell'impianto.",
          "Documenti che carichi: fattura dell'installatore, ricevuta del bonifico, certificati del produttore, eventuali altri allegati.",
          "Dati tecnici dell'intervento: tipo di lavoro, data di fine lavori, misure e valori ricavati dai documenti.",
          "Dati di navigazione strettamente necessari al funzionamento del sito.",
        ],
        paragrafi: [
          "I dati della tua carta non li raccogliamo e non li vediamo mai: il pagamento è gestito da Stripe, che li tratta come titolare autonomo.",
        ],
      },
      {
        titolo: "3. Perché li trattiamo",
        elenco: [
          "Per eseguire il servizio che ci hai chiesto: verificare se la pratica si può fare, compilarla e trasmetterla all'ENEA (art. 6.1.b GDPR).",
          "Per adempiere a obblighi di legge, in particolare quelli fiscali e di fatturazione (art. 6.1.c GDPR).",
          "Per la sicurezza del servizio, la prevenzione degli abusi e la difesa di un diritto, sulla base del nostro legittimo interesse (art. 6.1.f GDPR).",
        ],
        paragrafi: [
          "Non usiamo i tuoi dati per profilazione, non li vendiamo e non li cediamo a terzi per finalità pubblicitarie.",
        ],
      },
      {
        titolo: "4. Chi altro vede i tuoi dati",
        elenco: [
          "ENEA, quando trasmettiamo la comunicazione: è lo scopo stesso del servizio.",
          "Stripe, per il pagamento e l'emissione della fattura.",
          "I fornitori tecnici che ospitano il sito e la banca dati, e il servizio di posta elettronica che recapita le comunicazioni.",
        ],
        paragrafi: [
          "I dati possono inoltre essere comunicati alle autorità competenti, quando la legge lo richiede o per difendere un diritto in giudizio.",
        ],
      },
      {
        titolo: "5. Dove vengono trattati",
        paragrafi: [
          "Il titolare ha sede negli Stati Uniti, quindi i tuoi dati sono trattati anche fuori dallo Spazio economico europeo. I trasferimenti avvengono sulla base delle clausole contrattuali tipo approvate dalla Commissione europea e delle garanzie previste dai fornitori coinvolti.",
          "L'infrastruttura che ospita la banca dati si trova in [REGIONE DEI SERVER — da confermare].",
        ],
      },
      {
        titolo: "6. Per quanto tempo li conserviamo",
        paragrafi: [
          "Conserviamo i dati della pratica per il tempo necessario a dimostrare quello che abbiamo trasmesso e, comunque, per i termini previsti dalla normativa fiscale e tributaria: [ANNI].",
          "Se ci chiedi la verifica gratuita e non vai avanti, i dati e i documenti caricati vengono cancellati entro [GIORNI] giorni.",
        ],
      },
      {
        titolo: "7. I tuoi diritti",
        elenco: [
          "Sapere quali dati abbiamo e ottenerne copia (accesso).",
          "Farli correggere se sono sbagliati (rettifica).",
          "Chiederne la cancellazione o la limitazione, nei casi previsti dalla legge.",
          "Riceverli in un formato leggibile e portarli altrove (portabilità).",
          "Opporti al trattamento fondato sul legittimo interesse.",
          "Proporre reclamo al Garante per la protezione dei dati personali.",
        ],
        paragrafi: [
          "Per esercitarli basta scrivere a privacy@eneasubito.it. Rispondiamo entro i termini di legge.",
        ],
      },
    ],
  },

  {
    slug: "termini",
    titolo: "Termini di servizio",
    titoloSeo: "Termini di servizio — EneaSubito",
    descrizione: "Cosa comprende il servizio EneaSubito, quanto costa, quando ti rimborsiamo e in quanto tempo consegniamo.",
    aggiornato: "[DATA]",
    sezioni: [
      {
        titolo: "1. Chi siamo",
        paragrafi: [
          `EneaSubito è un marchio di ${TITOLARE}. È un servizio privato di assistenza alle pratiche: non siamo l'ENEA, non siamo un ente pubblico e non siamo affiliati ad alcuna amministrazione. Il portale ENEA è gratuito e accessibile a chiunque: quello che paghi è il nostro lavoro.`,
        ],
      },
      {
        titolo: "2. Cosa comprende il servizio",
        elenco: [
          "La verifica preliminare, gratuita, sulla fattibilità della tua pratica.",
          "Il controllo dei documenti che ci fornisci.",
          "La compilazione completa della comunicazione e la sua trasmissione al portale ENEA.",
          "La consegna via e-mail della ricevuta ufficiale con il codice CPID.",
          "L'assistenza via e-mail fino alla consegna.",
        ],
        paragrafi: [
          "Non comprende consulenza fiscale, la tua dichiarazione dei redditi, né alcuna garanzia sul riconoscimento della detrazione, che dipende dalla tua situazione fiscale e non da noi.",
        ],
      },
      {
        titolo: "3. La verifica gratuita e il suo esito",
        paragrafi: [
          "La verifica è gratuita e non impegna nessuno dei due. Può avere tre esiti: la pratica si può fare, non si può fare, oppure serve un controllo da parte di un operatore, nel qual caso ti rispondiamo entro 24 ore.",
          "L'esito si basa sulle informazioni e sui documenti che ci fornisci tu. Se risultano diversi da quelli reali, l'esito non vale.",
        ],
      },
      {
        titolo: "4. Prezzo e pagamento",
        paragrafi: [
          "Il servizio costa 99 €, pagati dopo l'esito della verifica e prima della trasmissione. Il pagamento avviene tramite Stripe; la fattura ti viene inviata per e-mail automaticamente.",
          "Il recupero dei dati catastali, se ce lo chiedi, è un servizio a parte ed è indicato con il suo prezzo al momento della richiesta.",
        ],
      },
      {
        titolo: "5. Quando ti rimborsiamo",
        elenco: [
          "Se, dopo il pagamento, risulta che la pratica non si può fare, ti rimborsiamo l'intero importo.",
          "Se i documenti non confermano quello che ci avevi dichiarato e per questo non possiamo procedere, ti rimborsiamo l'intero importo.",
          "Non è dovuto alcun rimborso quando la pratica è stata trasmessa e la ricevuta consegnata.",
        ],
      },
      {
        titolo: "6. Tempi",
        paragrafi: [
          "Trasmettiamo la pratica entro 48 ore lavorative da quando abbiamo tutti i dati e i documenti necessari, salvo blocchi temporanei del portale ENEA o cambiamenti normativi che impongano verifiche ulteriori.",
          "Ricordiamo che la comunicazione all'ENEA va trasmessa entro 90 giorni dalla fine dei lavori: il rispetto di quel termine dipende anche da quando ci contatti.",
        ],
      },
      {
        titolo: "7. Cosa chiediamo a te",
        paragrafi: [
          "Che i dati che inserisci siano veri e che i documenti siano leggibili e riferiti all'intervento dichiarato.",
          "Controlliamo quello che scrivi confrontandolo con la fattura. Sui dati personali e su quelli dell'immobile questo confronto non è possibile: ti chiediamo di verificarli quando ricevi la pratica. La correzione di dati errati non imputabili a noi comporta un costo di 10 €.",
        ],
      },
      {
        titolo: "8. Diritto di recesso",
        paragrafi: [
          "In quanto consumatore hai diritto di recedere entro 14 giorni dalla conclusione del contratto. Se ci chiedi di cominciare subito l'esecuzione e il servizio viene completato entro quel termine, il diritto di recesso si esaurisce con la consegna della pratica, come previsto dalla normativa sui contratti a distanza.",
          "[DA CONFERMARE: formulazione definitiva della clausola di recesso.]",
        ],
      },
      {
        titolo: "9. Legge applicabile",
        paragrafi: [
          "[DA DECIDERE: legge applicabile e foro competente, tenendo conto che il cliente è un consumatore residente in Italia.]",
        ],
      },
    ],
  },

  {
    slug: "cookie",
    titolo: "Cookie",
    titoloSeo: "Cookie — EneaSubito",
    descrizione: "Quali cookie usa EneaSubito: nessuno di profilazione, nessuno strumento pubblicitario.",
    aggiornato: "[DATA]",
    sezioni: [
      {
        titolo: "1. In breve",
        paragrafi: [
          "Questo sito non usa cookie di profilazione, non ti segue su altri siti e non ospita strumenti pubblicitari. Non c'è nessun banner da accettare perché non c'è niente da accettare.",
        ],
      },
      {
        titolo: "2. Cosa viene salvato sul tuo dispositivo",
        elenco: [
          "Quello che serve a far funzionare il sito e a non farti perdere quello che stai compilando: se interrompi il modulo, i dati restano sul tuo dispositivo così puoi riprendere.",
        ],
      },
      {
        titolo: "3. Servizi esterni",
        elenco: [
          "Stripe, solo nel momento in cui apri la pagina di pagamento, per la sicurezza della transazione.",
        ],
        paragrafi: [
          "È l'unico. I caratteri tipografici, le immagini e tutto il resto sono ospitati direttamente da noi: nessun altro servizio esterno viene contattato mentre leggi queste pagine, e nessuno riceve il tuo indirizzo IP.",
        ],
      },
      {
        titolo: "4. Come cancellarli",
        paragrafi: [
          "Puoi cancellare in qualsiasi momento quanto salvato dal sito dalle impostazioni del tuo browser. Cancellando i dati del sito perderai anche l'eventuale modulo lasciato a metà.",
        ],
      },
    ],
  },
];

export function trovaDocumento(slug: string | undefined): Documento | undefined {
  return DOCUMENTI.find((d) => d.slug === slug);
}
