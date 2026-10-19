/**
 * Gli orari dell'assistenza: 9–18, decisi dal Titolare il 19/10/2026.
 *
 * Il pallino verde che dice «online» a mezzanotte e' una bugia piccola che
 * costa cara: chi scrive alle 23 aspetta una risposta subito, non la riceve,
 * e la mattina dopo non e' piu' un cliente. Dire «rispondiamo dalle 9» invece
 * e' una promessa che si puo' mantenere.
 */
export const APERTURA = 9;
export const CHIUSURA = 18;

/** L'ora italiana, che non e' quella del computer di chi guarda. */
function oraItaliana(adesso: Date): number {
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(adesso);
  const ora = Number(parti.find((p) => p.type === "hour")?.value ?? NaN);
  return Number.isNaN(ora) ? 12 : ora;
}

export function inOrario(adesso = new Date()): boolean {
  const ora = oraItaliana(adesso);
  return ora >= APERTURA && ora < CHIUSURA;
}

/** Cosa scrivere sotto «Assistenza», sul bottone. */
export function statoBreve(adesso = new Date()): string {
  return inOrario(adesso) ? "online" : `rispondiamo dalle ${APERTURA}`;
}

/** La frase che spiega quando arriva la risposta. */
export function quandoRispondiamo(adesso = new Date()): string {
  if (inOrario(adesso)) return "Rispondiamo entro poche ore.";
  // Prima delle 9 la risposta arriva in giornata; dopo le 18, domani.
  return oraItaliana(adesso) < APERTURA
    ? `Siamo aperti dalle ${APERTURA} alle ${CHIUSURA}: ti rispondiamo in mattinata.`
    : `Siamo aperti dalle ${APERTURA} alle ${CHIUSURA}: i messaggi che arrivano dopo le ${CHIUSURA} li lavoriamo il giorno dopo.`;
}
