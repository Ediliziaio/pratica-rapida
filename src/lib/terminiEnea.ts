/**
 * Il termine di presentazione della comunicazione ENEA.
 *
 * Novanta giorni dalla fine dei lavori. Oltre, la pratica non si trasmette
 * piu' e al cliente resta il ravvedimento.
 *
 * Sta qui, fuori dalla pagina, perche' questi due numeri decidono cosa
 * leggera' una persona prima di pagare: a ottanta giorni le si dice che il
 * tempo sta finendo, oltre i novanta le si spiega che dovra' sborsare 250
 * euro. Un errore di un giorno e' una frase sbagliata detta a un cliente.
 */

/** Giorni entro cui la comunicazione va trasmessa. */
export const TERMINE_GIORNI = 90;

/** Da quale giorno si comincia a dire che manca poco. */
export const GIORNI_PER_AVVISARE = 80;

/**
 * Giorni passati dalla fine dei lavori, o null se la data manca o e' futura.
 *
 * Si conta per giorni di calendario e non per ore: due date distano un
 * giorno anche se fra loro passano 23 ore e mezza.
 */
export function giorniDaFineLavori(
  fineLavori: Date | null | undefined,
  adesso = new Date(),
): number | null {
  if (!fineLavori) return null;
  const giorno = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const passati = Math.floor((giorno(adesso) - giorno(fineLavori)) / 86_400_000);
  return passati >= 0 ? passati : null;
}

/** Cosa mostrare accanto alla data. */
export type AvvisoTermine = "niente" | "manca_poco" | "scaduto";

export function avvisoTermine(giorniPassati: number | null): AvvisoTermine {
  if (giorniPassati === null) return "niente";
  if (giorniPassati > TERMINE_GIORNI) return "scaduto";
  if (giorniPassati >= GIORNI_PER_AVVISARE) return "manca_poco";
  return "niente";
}

/** Quanti giorni restano, quando ne restano. */
export function giorniRimasti(giorniPassati: number): number {
  return TERMINE_GIORNI - giorniPassati;
}
