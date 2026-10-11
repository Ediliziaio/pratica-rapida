/**
 * Il riepilogo del mese per EneaSubito, separato da quello di Pratica Rapida.
 *
 * Sono due aziende: le pratiche di Pratica Rapida finiscono nelle fatture di
 * fine mese ai fornitori, quelle di EneaSubito le fattura Stripe a nome della
 * LLC, una per cliente, nel momento in cui il cliente paga. Sommare i due
 * fatturati darebbe un numero che non corrisponde a nessuna contabilita', per
 * questo qui si contano a parte.
 *
 * L'importo e' quello che Stripe ha incassato davvero (scritto sulla pratica
 * dal webhook `eneasubito-pagato`): non si ricava da un listino e non si
 * ricalcola. Una pratica senza importo viene contata e segnalata, non stimata.
 */
/** Il valore che marca il canale sulle pratiche del secondo marchio. */
export const CANALE_ENEASUBITO = "eneasubito";

/**
 * Vero solo per le pratiche di EneaSubito.
 *
 * Tutto lo storico di Pratica Rapida ha `canale` nullo, e i canali suoi
 * ('rivenditore', 'privato_sito') restano fuori: qualunque riga che non sia
 * esattamente 'eneasubito' continua a contare nei numeri di prima. E' la
 * condizione che tiene separati i due fatturati, percio' sta scritta in un
 * posto solo ed e' coperta dai test.
 */
export function isEneaSubitoChannel(practice: { canale?: string | null }): boolean {
  return practice.canale === CANALE_ENEASUBITO;
}

export type EneaSubitoMonthPractice = {
  cliente_nome?: string | null;
  cliente_cognome?: string | null;
  revenue_at: string;
  prezzo: number | string | null;
  pagamento_stato: string | null;
};

export type EneaSubitoMonthSummary = {
  /** Quante pratiche sono entrate in "Da inserire su Excel" questo mese. */
  pratiche: number;
  /** Incassato del mese, rimborsi esclusi. */
  incassato: number;
  /** Nomi dei clienti, in ordine di nome, per il controllo a vista. */
  clienti: string[];
  /** Pratiche senza importo registrato: da guardare a mano. */
  senzaImporto: number;
};

const ROME_TIME_ZONE = "Europe/Rome";

function monthKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function summarizeEneaSubitoMonth(
  practices: EneaSubitoMonthPractice[],
  now = new Date(),
): EneaSubitoMonthSummary {
  const currentMonth = monthKey(now);
  let incassato = 0;
  let pratiche = 0;
  let senzaImporto = 0;
  const clienti: string[] = [];

  for (const practice of practices) {
    const revenueAt = new Date(practice.revenue_at);
    if (Number.isNaN(revenueAt.getTime()) || monthKey(revenueAt) !== currentMonth) continue;

    pratiche += 1;
    const nome = `${practice.cliente_nome ?? ""} ${practice.cliente_cognome ?? ""}`.trim();
    if (nome) clienti.push(nome);

    const importo = Number(practice.prezzo ?? 0);
    if (!Number.isFinite(importo) || importo <= 0) {
      senzaImporto += 1;
      continue;
    }
    if (practice.pagamento_stato === "rimborsata") continue;
    if (practice.pagamento_stato === "pagata") incassato += importo;
  }

  clienti.sort((a, b) => a.localeCompare(b, "it"));
  return { pratiche, incassato, clienti, senzaImporto };
}
