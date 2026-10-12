/**
 * Chi si puo' contattare a mano dal CRM.
 *
 * Il guardiano di `contatto-cliente` zittisce gli invii **automatici**: le
 * funzioni che scrivono al cliente da sole passano tutte da li'. Ma la
 * finestra di chat sulla scheda e l'invio multiplo sono invii **manuali**:
 * chiamano WhatsApp e la posta direttamente, e il guardiano non li vedeva.
 * Su un canale muto bastava aprire la chat e scrivere perche' il messaggio
 * partisse.
 *
 * La decisione del Titolare e' «nessun messaggio per nessun motivo», e
 * «nessun motivo» comprende la mano di una persona. Queste due funzioni
 * stanno qui, separate dall'interfaccia, perche' siano verificabili: se un
 * domani qualcuno le aggira, i test si rompono prima che si rompa il
 * silenzio.
 */
import { isCanaleMuto } from "../../supabase/functions/_shared/contatto-cliente";

interface PraticaContattabile {
  canale?: string | null;
}

/** True se dalla scheda di questa pratica si puo' aprire la chat e scrivere. */
export function puoAprireChatManuale(practice: PraticaContattabile): boolean {
  return !isCanaleMuto(practice);
}

/**
 * Divide le pratiche selezionate fra quelle a cui si puo' mandare un invio
 * multiplo e quelle escluse perche' di canale muto.
 *
 * Il conteggio delle escluse serve a dirlo: senza, si selezionano dieci
 * pratiche, ne partono otto e nessuno capisce perche'.
 */
export function dividiPerInvioMultiplo<T extends PraticaContattabile>(
  selezionate: readonly T[],
): { inviabili: T[]; escluse: T[] } {
  const inviabili: T[] = [];
  const escluse: T[] = [];
  for (const p of selezionate) (isCanaleMuto(p) ? escluse : inviabili).push(p);
  return { inviabili, escluse };
}
