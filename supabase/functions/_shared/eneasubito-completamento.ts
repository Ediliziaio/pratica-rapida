/**
 * I messaggi a chi ha pagato e non ha finito di compilare.
 *
 * **Perche' esistono, e perche' sono diversi dagli altri.** I solleciti di
 * ripresa inseguono chi non ha ancora comprato: li' si convince. Questi
 * inseguono chi **ha gia' pagato** e si e' fermato sul modulo tecnico, che e'
 * la pagina su cui atterra tornando dalla cassa. Li' non c'e' niente da
 * convincere: quella persona ci ha dato dei soldi e noi non possiamo
 * lavorare. E' un debito, non una vendita.
 *
 * Da qui tre differenze:
 *  - **Si comincia subito**, dopo tre ore, non il giorno dopo: piu' passa il
 *    tempo, piu' quella persona si allontana dal momento in cui era sul
 *    pezzo.
 *  - **Non si vende niente**: nessuno sconto, nessun prezzo, nessuna leva.
 *    Si chiede una cosa sola, e si dice quanto costa in minuti.
 *  - **Sono quattro e poi si smette di scrivere**: a quel punto la questione
 *    non e' piu' un promemoria, e' una telefonata o un rimborso, e la decide
 *    il Titolare.
 *
 * Scoperto il 20/10/2026: il secondo cliente pagante si e' fermato qui, e il
 * CRM si rifiutava giustamente di mandare avanti la pratica perche' i dati
 * tecnici mancavano davvero. Nessuno lo richiamava, perche' i solleciti di
 * ripresa si fermano al pagamento — fino a quel giorno «ha pagato» voleva
 * dire «ha finito».
 */

export interface PassoCompletamento {
  /** Da 1 a 4. E' anche quello che si registra per non ripetersi. */
  numero: number;
  /** Ore dal pagamento dopo le quali tocca. */
  dopoOre: number;
  oggetto: string;
}

export const COMPLETAMENTO: PassoCompletamento[] = [
  { numero: 1, dopoOre: 3, oggetto: "Manca un passaggio alla tua pratica" },
  { numero: 2, dopoOre: 24, oggetto: "Ci servono ancora i dati dell'immobile" },
  { numero: 3, dopoOre: 24 * 3, oggetto: "La tua pratica è ferma a un passo" },
  { numero: 4, dopoOre: 24 * 7, oggetto: "Hai pagato e non siamo ancora partiti" },
];

export interface StatoPagata {
  /** Quando ha pagato, in ISO. */
  pagataIl: string;
  /** Quando ha finito il modulo: se c'e', non si scrive piu'. */
  compilatoIl: string | null;
  archiviata: boolean;
  disiscritta: boolean;
  /** I numeri dei messaggi gia' partiti, di questa serie. */
  giaInviati: number[];
  email: string | null;
}

/**
 * Quale messaggio tocca adesso, o `null` se non tocca niente.
 *
 * Uno alla volta e dal primo che manca, come per i solleciti di ripresa: se
 * l'orologio resta fermo due giorni, al ritorno non si scaricano tre
 * messaggi addosso a una persona che ha gia' pagato.
 */
export function qualeTocca(
  p: StatoPagata,
  adesso = new Date(),
  inOrario: (q: Date) => boolean = () => true,
): PassoCompletamento | null {
  if (!inOrario(adesso)) return null;
  // Ha finito: non si scrive piu'. E' la ragione per cui questi messaggi
  // esistono, quindi e' il primo controllo.
  if (p.compilatoIl) return null;
  if (p.archiviata || p.disiscritta) return null;
  if (!p.email || !p.email.includes("@")) return null;

  const pagamento = Date.parse(p.pagataIl);
  if (Number.isNaN(pagamento)) return null;
  const ore = (adesso.getTime() - pagamento) / 3_600_000;
  if (ore < 0) return null;

  const gia = new Set(p.giaInviati);
  for (const passo of COMPLETAMENTO) {
    if (gia.has(passo.numero)) continue;
    if (ore >= passo.dopoOre) return passo;
    return null;
  }
  return null;
}

export interface DatiCompletamento {
  nome: string;
  /** Dove si riprende il modulo: /completa/<codice>. */
  linkModulo: string;
  linkDisiscrizione: string;
}

/**
 * Il testo del messaggio.
 *
 * Niente negazioni e niente rimproveri: la persona ha pagato, l'unica cosa
 * che manca e' che torni su una pagina. Si dice cosa serve, quanto ci vuole,
 * e si da' il collegamento.
 */
export function corpo(numero: number, d: DatiCompletamento): string {
  const nome = d.nome.split(" ")[0] || "";
  const apertura = nome ? `Ciao ${nome},` : "Ciao,";
  const chiusura =
    `\n\nRiprendi da qui: ${d.linkModulo}` +
    `\n\n—\nEneaSubito · assistenza@eneasubito.it` +
    `\nPer smettere di ricevere questi messaggi: ${d.linkDisiscrizione}`;

  if (numero === 1) {
    return `${apertura}

il pagamento è arrivato, grazie. Resta un passaggio solo: i dati dell'immobile e dell'intervento, che servono per compilare la comunicazione all'ENEA.

Sono quattro campi e ci vogliono due minuti. Li trovi sulla visura o sull'ultima bolletta.${chiusura}`;
  }

  if (numero === 2) {
    return `${apertura}

la tua pratica è pagata e in attesa di una cosa sola: i dati dell'immobile.

Senza quelli l'ENEA non accetta la comunicazione, quindi è l'unico pezzo che non possiamo mettere noi. Appena ci sono, partiamo: la trasmettiamo entro 48 ore.${chiusura}`;
  }

  if (numero === 3) {
    return `${apertura}

la tua pratica è ferma a un passo dalla fine da qualche giorno. Hai già pagato e il lavoro è tutto nostro: manca solo che tu completi i dati dell'immobile.

Se qualcosa nel modulo non ti torna, scrivici: rispondiamo a questa mail e lo guardiamo insieme.${chiusura}`;
  }

  return `${apertura}

hai pagato la tua pratica e noi non siamo ancora partiti, perché mancano i dati dell'immobile.

Questo è l'ultimo promemoria automatico: da qui in poi, se preferisci, scrivici e la completiamo insieme passo per passo. Oppure, se hai cambiato idea, dillo e ne parliamo.${chiusura}`;
}
