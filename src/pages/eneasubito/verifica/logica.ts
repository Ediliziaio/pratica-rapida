/**
 * Le poche regole del modulo di EneaSubito.
 *
 * Qui c'era un preflight con tre esiti: si puo' fare / non si puo' fare /
 * serve un controllo nostro. Il Titolare lo ha eliminato l'11/10/2026, e la
 * ragione e' commerciale, non tecnica: il terzo esito diceva al cliente
 * «aspetta che ti facciamo sapere», cioe' gli apriva la porta per andarsene.
 * Un potenziale cliente non si lascia andare via.
 *
 * Quindi non si giudica piu' niente prima di incassare. Si chiede il minimo
 * — chi e' il beneficiario, dove scrivergli, la fattura — si incassa, e tutto
 * il resto si chiede dopo, con il modulo che Pratica Rapida usa gia'.
 *
 * Restano le due date: non decidono nulla, ma servono a scrivere sulla
 * pratica da quanto tempo sono finiti i lavori quando il dato arriva.
 */

export type Famiglia = "infissi" | "schermature" | "pompe_di_calore";

/** Giorni entro cui la comunicazione va trasmessa all'ENEA. */
export const TERMINE_GIORNI = 90;

/**
 * Giorni passati dalla fine dei lavori. `null` se la data non e' utilizzabile.
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

/** Quello che il modulo chiede prima del pagamento. Tre cose, non di piu'. */
export interface Richiesta {
  famiglia: Famiglia | null;
  /** Nome e cognome del beneficiario: l'intestatario della fattura. */
  nome: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Il primo passo e' completo?
 *
 * Da qui la pratica puo' gia' nascere, e deve: dal 15/10/2026 il modulo e'
 * in due schermate proprio perche' chi non ha la fattura sottomano non
 * sparisca nel nulla. Con nome e indirizzo in mano lo si puo' richiamare;
 * senza, per noi non e' mai esistito.
 */
export function datiCompleti(richiesta: Richiesta): boolean {
  return (
    richiesta.famiglia !== null &&
    richiesta.nome.trim().length >= 2 &&
    EMAIL_RE.test(richiesta.email.trim())
  );
}

/**
 * Si puo' mandare alla cassa? Tutto obbligatorio: senza fattura non si
 * incassa, e senza nome non sappiamo di chi e' la detrazione.
 */
export function completa(richiesta: Richiesta, fatturaScelta: boolean): boolean {
  return datiCompleti(richiesta) && fatturaScelta;
}
