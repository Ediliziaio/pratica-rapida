/**
 * I messaggi a chi si e' fermato, e la regola che decide quale tocca.
 *
 * Il testo e le decisioni stanno in docs/ENEASUBITO_MESSAGGI_RIPRESA.md: qui
 * c'e' la stessa cosa in forma eseguibile. Se un testo va cambiato si cambia
 * la', poi si riporta — cosi' resta un posto solo dove leggere il perche'.
 *
 * **Perche' la regola sta qui e non dentro la funzione.** E' il punto dove si
 * fa il danno: un messaggio mandato due volte, o mandato a chi ha gia'
 * pagato, e' peggio di un messaggio non mandato. Stando qui si prova senza
 * database e senza spedire niente — i test sono in
 * src/lib/eneasubito-solleciti.test.ts.
 *
 * **Cinque e non dieci.** Dieci in due settimane sono quasi uno al giorno, e
 * a quella frequenza una parte dei destinatari preme «segnala spam». Quando
 * succede, Gmail e Outlook penalizzano il dominio eneasubito.it e smettono di
 * arrivare anche le conferme di pagamento e le pratiche finite. Si parte da
 * cinque, si guardano disiscrizioni e segnalazioni, e se restano basse se ne
 * aggiungono.
 */

/** Sotto quanti giorni si dice alla persona quanti gliene restano. */
export const GIORNI_PER_METTERE_FRETTA = 30;

/** Giorni entro cui la comunicazione va trasmessa all'ENEA. */
export const TERMINE_GIORNI = 90;

/** Il prezzo scontato dell'ultimo messaggio. Deciso dal Titolare il 16/10. */
export const PREZZO_SCONTATO = 79;

export interface Sollecito {
  /** Da 1 a 5. E' anche quello che si registra per non ripetersi. */
  numero: number;
  /** Ore dalla nascita della pratica dopo le quali tocca. */
  dopoOre: number;
  oggetto: string;
}

/**
 * Il calendario, deciso dal Titolare il 16/10/2026.
 *
 * Il primo messaggio **il giorno dopo**, non dopo un'ora. A un'ora la persona
 * puo' essere ancora al computer a cercare la fattura nel cassetto: le arriva
 * «la tua pratica e' aperta a meta'» mentre e' sulla pagina, come primo
 * contatto in assoluto da un marchio che non conosce, e sembra che la stiamo
 * guardando. Il giorno dopo si ricorda ancora e non la prendiamo in mezzo al
 * lavoro.
 */
export const SOLLECITI: Sollecito[] = [
  { numero: 1, dopoOre: 24, oggetto: "La tua pratica ENEA è aperta a metà" },
  { numero: 2, dopoOre: 24 * 3, oggetto: "Chi siamo, in quattro righe" },
  { numero: 3, dopoOre: 24 * 6, oggetto: "99 € contro dieci anni di detrazione" },
  { numero: 4, dopoOre: 24 * 9, oggetto: "I 90 giorni" },
  { numero: 5, dopoOre: 24 * 13, oggetto: "Ultimo messaggio" },
];

/** Prima di quest'ora non si scrive a nessuno. */
export const FASCIA_DA = { ora: 7, minuti: 30 };
/** Da quest'ora in poi non si scrive piu'. */
export const FASCIA_A = { ora: 23, minuti: 0 };

/**
 * Se e' un'ora in cui si puo' scrivere a una persona, in Italia.
 *
 * Senza questo, chi compila il modulo alle due di notte si becca la mail alle
 * due di notte del giorno dopo: l'orologio gira ogni ora e non guarda la
 * sveglia. Fuori fascia non si perde niente — il messaggio parte al primo
 * giro utile del mattino.
 */
export function inFasciaUtile(adesso = new Date()): boolean {
  // L'ora italiana, che non e' quella del server: l'ora legale la sposta due
  // volte l'anno e non la vogliamo calcolare a mano.
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(adesso);
  const numero = (tipo: string) => Number(parti.find((x) => x.type === tipo)?.value ?? NaN);
  const ora = numero("hour");
  const minuti = numero("minute");
  if (Number.isNaN(ora) || Number.isNaN(minuti)) return true;

  const adessoInMinuti = ora * 60 + minuti;
  return (
    adessoInMinuti >= FASCIA_DA.ora * 60 + FASCIA_DA.minuti &&
    adessoInMinuti < FASCIA_A.ora * 60 + FASCIA_A.minuti
  );
}

export interface StatoPratica {
  /** Quando e' nata, in ISO. */
  creataIl: string;
  pagata: boolean;
  archiviata: boolean;
  disiscritta: boolean;
  /** I numeri dei solleciti gia' partiti. */
  giaInviati: number[];
  /** Serve a non scrivere a chi non ci puo' leggere. */
  email: string | null;
}

/**
 * Quale sollecito tocca adesso, o `null` se non tocca niente.
 *
 * Si manda **uno alla volta**: se una pratica e' rimasta indietro — perche'
 * l'orologio non ha girato per un giorno, o perche' la spedizione era spenta
 * — non le si scaricano addosso tre messaggi insieme. Si riprende dal primo
 * che manca e si va avanti un'ora dopo l'altra.
 *
 * E non di notte: fuori dalla fascia utile tace e riprende al mattino.
 */
export function qualeTocca(p: StatoPratica, adesso = new Date()): Sollecito | null {
  if (!inFasciaUtile(adesso)) return null;
  // Chi ha pagato ha finito: da li' in poi lo segue la pratica, non i
  // solleciti. Archiviata e disiscritta parlano da sole.
  if (p.pagata || p.archiviata || p.disiscritta) return null;
  if (!p.email || !p.email.includes("@")) return null;

  const nascita = Date.parse(p.creataIl);
  if (Number.isNaN(nascita)) return null;
  const oreTrascorse = (adesso.getTime() - nascita) / 3_600_000;
  if (oreTrascorse < 0) return null;

  const gia = new Set(p.giaInviati);
  for (const s of SOLLECITI) {
    if (gia.has(s.numero)) continue;
    if (oreTrascorse >= s.dopoOre) return s;
    // I solleciti sono in ordine: se questo non e' ancora maturo, nemmeno
    // quelli dopo lo sono.
    return null;
  }
  return null;
}

export interface DatiMessaggio {
  nome: string;
  /** «infissi», «schermature solari», «pompa di calore». */
  intervento: string;
  /** Giorni che restano, oppure null se la data non ce l'ha data. */
  giorniRimasti: number | null;
  /** Indirizzo a cui riprendere la compilazione. */
  linkRipresa: string;
  /** Indirizzo per togliersi dai messaggi. */
  linkDisiscrizione: string;
}

/** Il nome proprio, senza cognome: nei messaggi suona meglio. */
function soloNome(intero: string): string {
  const pulito = intero.trim().replace(/\s+/g, " ");
  const spazio = pulito.indexOf(" ");
  return spazio > 0 ? pulito.slice(0, spazio) : pulito || "ciao";
}

/**
 * Il corpo del messaggio, in testo semplice.
 *
 * Testo e non HTML elaborato: una mail che sembra scritta da una persona
 * finisce nella posta in arrivo molto piu' spesso di una piena di immagini e
 * bottoni colorati, e qui il mittente e' un dominio nuovo che deve ancora
 * farsi una reputazione.
 */
export function corpo(numero: number, d: DatiMessaggio): string {
  const nome = soloNome(d.nome);
  const fretta =
    d.giorniRimasti !== null &&
    d.giorniRimasti > 0 &&
    d.giorniRimasti <= GIORNI_PER_METTERE_FRETTA;

  const coda =
    `\n\n—\nEneaSubito · assistenza@eneasubito.it\n` +
    `Se preferisci non ricevere altri messaggi: ${d.linkDisiscrizione}`;

  switch (numero) {
    case 1:
      return (
        `Ciao ${nome},\n\n` +
        `hai cominciato la pratica ENEA per ${d.intervento} e ti manca un passo ` +
        `solo: la fattura del tuo fornitore. Una foto va benissimo.\n\n` +
        `Riprendi da dove eri: ${d.linkRipresa}\n\n` +
        `Ci vuole meno di un minuto, e da lì ce ne occupiamo noi.` +
        coda
      );

    case 2:
      return (
        `Ciao ${nome},\n\n` +
        `prima di chiederti 99 €, è giusto che tu sappia chi te li chiede.\n\n` +
        `Siamo tecnici del settore: facciamo comunicazioni ENEA tutti i giorni ` +
        `per imprese di installazione in tutta Italia. Lavoriamo online, senza ` +
        `sportello, ed è per questo che possiamo proporre i prezzi più bassi del ` +
        `mercato.\n\n` +
        `Quello che ricevi è la pratica in PDF con il codice CPID: quella ricevuta ` +
        `la emette l'ENEA, non noi. È la prova che la comunicazione è stata ` +
        `trasmessa, ed è quella che porti al commercialista.\n\n` +
        `E se guardando i documenti il tuo caso non rientra, i 99 € tornano indietro.\n\n` +
        `Riprendi la tua pratica: ${d.linkRipresa}` +
        coda
      );

    case 3:
      return (
        `Ciao ${nome},\n\n` +
        `due numeri, poi ti lascio.\n\n` +
        `Su 10.000 € di ${d.intervento}, la detrazione vale 5.000 €, che ti tornano ` +
        `in dieci anni con la dichiarazione dei redditi.\n\n` +
        `Quei 5.000 € arrivano se la comunicazione all'ENEA viene trasmessa. Senza, ` +
        `la spesa resta una spesa.\n\n` +
        `La pratica costa 99 €, una volta sola.\n\n` +
        `Riprendi la tua pratica: ${d.linkRipresa}` +
        coda
      );

    case 4:
      return (
        `Ciao ${nome},\n\n` +
        (fretta
          ? `ti restano ${d.giorniRimasti} giorni per trasmettere la comunicazione ` +
            `all'ENEA. Il termine è di 90 giorni dalla fine dei lavori, e dopo la ` +
            `detrazione si perde.\n\n`
          : `la comunicazione all'ENEA si trasmette entro 90 giorni dalla fine dei ` +
            `lavori. Dopo, la pratica non si può più fare e la detrazione si perde.\n\n`) +
        `È il motivo per cui ti stiamo scrivendo: tu la pratica l'hai aperta, manca ` +
        `solo la fattura.\n\n` +
        `Riprendi la tua pratica: ${d.linkRipresa}` +
        coda
      );

    case 5:
      return (
        `Ciao ${nome},\n\n` +
        `questo è l'ultimo che ti mando: dopo ti lasciamo in pace.\n\n` +
        `Se la pratica per ${d.intervento} la vuoi ancora, per le prossime 24 ore ` +
        `la facciamo a ${PREZZO_SCONTATO} € invece di 99.\n\n` +
        `Fai partire la pratica: ${d.linkRipresa}\n\n` +
        `Se invece hai risolto in un altro modo, ci fa piacere lo stesso. Grazie ` +
        `dell'attenzione.` +
        coda
      );

    default:
      throw new Error(`Sollecito ${numero} inesistente`);
  }
}
