/**
 * Promemoria di pagamento al privato della pagina pubblica di Pratica Rapida.
 *
 * Deciso dal Titolare il 27/10/2026. Il privato che lascia i contatti sulla
 * pagina pubblica paga prima e compila dopo; chi lascia i dati e non paga
 * riceveva un solo «sollecito di compilazione» quaranta minuti dopo (il giro
 * H24 non guardava da quanto era arrivata la richiesta) e poi niente per sette
 * giorni. Qui c'e' la sua serie: quattro e-mail con il link per pagare, dopo
 * 1, 3, 6 e 10 giorni.
 *
 * Solo e-mail: i promemoria di pagamento non passano su WhatsApp. E solo
 * nelle fasce in cui si scrive ai clienti (AGENTS.md): lunedi'-venerdi'
 * 08:30-22:00, sabato 08:30-14:00, mai la domenica. L'eccezione H24 vale per
 * i soli solleciti di compilazione, e questi non lo sono.
 */

/** Dopo quanti giorni dalla richiesta parte ciascun promemoria. */
export const GIORNI_PROMEMORIA = [1, 3, 6, 10] as const;

/** Mai due promemoria a meno di cosi' tante ore, anche recuperando un ritardo. */
const ORE_MINIME_FRA_DUE = 20;

const MS_GIORNO = 24 * 60 * 60 * 1000;

function oraRoma(adesso: Date): { giorno: number; minuti: number } {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(adesso);
  const val = (t: string) => parti.find((p) => p.type === t)?.value ?? "";
  const giorni: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const ore = Number(val("hour")) % 24;
  return { giorno: giorni[val("weekday")] ?? 0, minuti: ore * 60 + Number(val("minute")) };
}

/** Vero se adesso, a Roma, si puo' scrivere a un cliente. */
export function inFasciaClienti(adesso: Date): boolean {
  const { giorno, minuti } = oraRoma(adesso);
  const apre = 8 * 60 + 30;
  if (giorno === 0) return false;
  if (giorno === 6) return minuti >= apre && minuti < 14 * 60;
  return minuti >= apre && minuti < 22 * 60;
}

export interface StatoPromemoria {
  /** Quando e' nata la richiesta. */
  creataIl: string;
  /** Quanti promemoria sono gia' partiti. */
  inviati: number;
  /** Quando e' partito l'ultimo (o null). */
  ultimoIl: string | null;
  pagata: boolean;
  archiviata: boolean;
  email: string | null;
}

/**
 * Quale promemoria tocca adesso (1-4), oppure null.
 *
 * Fuori fascia non tocca niente: si aspetta la prima fascia utile, non si
 * anticipa. Se la funzione e' rimasta ferma, recupera un messaggio alla volta
 * e mai due a meno di 20 ore.
 */
export function qualePromemoria(stato: StatoPromemoria, adesso: Date): number | null {
  if (stato.pagata || stato.archiviata || !stato.email) return null;
  if (stato.inviati >= GIORNI_PROMEMORIA.length) return null;
  if (!inFasciaClienti(adesso)) return null;

  const nata = Date.parse(stato.creataIl);
  if (Number.isNaN(nata)) return null;
  const giorniPassati = (adesso.getTime() - nata) / MS_GIORNO;
  if (giorniPassati < GIORNI_PROMEMORIA[stato.inviati]) return null;

  if (stato.ultimoIl) {
    const ultimo = Date.parse(stato.ultimoIl);
    if (!Number.isNaN(ultimo) && adesso.getTime() - ultimo < ORE_MINIME_FRA_DUE * 60 * 60 * 1000) return null;
  }
  return stato.inviati + 1;
}

/** La pratica e' un privato della pagina pubblica che deve ancora pagare? */
export function ePrivatoDelSitoDaPagare(p: {
  public_private_checkout_required?: boolean | null;
  pagamento_stato?: string | null;
}): boolean {
  return p.public_private_checkout_required === true && p.pagamento_stato !== "pagata";
}
