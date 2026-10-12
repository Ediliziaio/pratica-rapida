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
 *    imprese: ci stanno dentro le promesse fatte in pagina (prezzo, rimborso,
 *    tempi) e il recesso.
 *
 * L'11/10/2026 la verifica gratuita preliminare e' stata eliminata dal
 * Titolare: il cliente paga e poi completa i dati. Questi testi sono stati
 * riallineati, perche' un contratto che descrive un passaggio che non esiste
 * piu' e' peggio di nessun contratto.
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
    aggiornato: "1 ottobre 2026",
    sezioni: [
      {
        titolo: "1. Chi tratta i tuoi dati",
        paragrafi: [
          `Il titolare del trattamento è ${TITOLARE}, società di diritto statunitense. Per qualsiasi questione relativa ai tuoi dati, o per esercitare i diritti elencati più sotto, scrivi a privacy@eneasubito.it: è il recapito che usiamo per queste richieste, e rispondiamo entro i termini di legge.`,
          // L'indirizzo postale completo e l'eventuale rappresentante nell'Unione
          // (art. 27 GDPR) si aggiungono qui quando il Titolare li comunica: è una
          // riga in più, non un rifacimento.
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
          "Da dove sei arrivato: il nome del sito che ti ha portato qui (per esempio google.com) e, se hai cliccato un nostro annuncio, il riferimento di quell'annuncio. Non conserviamo l'indirizzo completo della pagina di partenza, che potrebbe contenere quello che hai cercato.",
        ],
        paragrafi: [
          "I dati della tua carta non li raccogliamo e non li vediamo mai: il pagamento è gestito da Stripe, che li tratta come titolare autonomo.",
        ],
      },
      {
        titolo: "3. Perché li trattiamo",
        elenco: [
          "Per eseguire il servizio che ci hai chiesto: controllare che la pratica si possa fare, compilarla e trasmetterla all'ENEA (art. 6.1.b GDPR).",
          "Per sapere quale dei nostri annunci funziona e quanto ci costa: è il nostro legittimo interesse a non sprecare soldi in pubblicità (art. 6.1.f GDPR). Non ti profiliamo e non ti seguiamo su altri siti.",
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
          "La banca dati e i documenti che carichi sono ospitati presso fornitori di infrastruttura che operano sotto le medesime garanzie contrattuali.",
        ],
      },
      {
        titolo: "6. Per quanto tempo li conserviamo",
        paragrafi: [
          "Conserviamo i dati della pratica per dieci anni: è il tempo entro cui può essere chiesto conto della detrazione, ed è il termine previsto per la documentazione contabile.",
          "Se apri una richiesta e non la porti a termine, i dati e i documenti che hai caricato vengono cancellati entro 90 giorni.",
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
    aggiornato: "1 ottobre 2026",
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
          "Il controllo di fattibilità della tua pratica.",
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
        titolo: "3. Come si svolge",
        paragrafi: [
          "Per avviare la pratica ti chiediamo tre cose: il nome e cognome dell'intestatario della fattura, un indirizzo e-mail e la fattura dell'installatore. Con queste la richiesta è aperta e si paga.",
          "Subito dopo il pagamento ti mandiamo per e-mail un collegamento personale da cui completare i dati restanti: dati catastali, certificati del produttore, estremi del pagamento e date. La pratica viene trasmessa quando quei dati sono completi.",
          "Il controllo di fattibilità lo facciamo noi su quello che ci fornisci tu. Se i documenti risultano diversi da quanto dichiarato, vale l'articolo 5.",
        ],
      },
      {
        titolo: "4. Prezzo e pagamento",
        paragrafi: [
          "Il servizio costa 99 €, pagati all'apertura della richiesta e prima della trasmissione. Il pagamento avviene tramite Stripe; la fattura ti viene inviata per e-mail automaticamente.",
          "Il recupero dei dati catastali, se ce lo chiedi, è un servizio a parte ed è indicato con il suo prezzo al momento della richiesta.",
        ],
      },
      {
        titolo: "5. Quando ti rimborsiamo",
        elenco: [
          "Se risulta che la pratica non si può fare, ti rimborsiamo l'intero importo.",
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
          "Pagando ci chiedi espressamente di cominciare subito: è il senso del servizio, visto che i 90 giorni corrono. Se la pratica viene trasmessa e consegnata prima che siano passati i 14 giorni, il recesso si esaurisce con la consegna, come previsto per i servizi completamente eseguiti su richiesta del consumatore. Finché non abbiamo trasmesso, puoi recedere e ti rimborsiamo.",
        ],
      },
      {
        titolo: "9. Legge applicabile",
        paragrafi: [
          "Il contratto è regolato dalla legge italiana. Per le controversie è competente il giudice del luogo di residenza o di domicilio del consumatore, quando si trova in Italia: è una tutela che la legge ti riconosce e che non intendiamo aggirare.",
        ],
      },
    ],
  },

  {
    slug: "cookie",
    titolo: "Cookie",
    titoloSeo: "Cookie — EneaSubito",
    descrizione: "Quali cookie usa EneaSubito: nessuno di profilazione, nessuno strumento pubblicitario.",
    aggiornato: "1 ottobre 2026",
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
          "Da quale annuncio o da quale sito sei arrivato, per la sola durata di questa visita: si cancella da solo quando chiudi la scheda del browser. Non è un cookie e non ti segue da nessuna parte.",
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
