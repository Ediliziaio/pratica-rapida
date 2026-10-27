/**
 * Quando la data dell'intervento e' obbligatoria per aprire la pratica.
 *
 * ENEA accetta la dichiarazione entro 90 giorni dalla fine dei lavori: senza
 * quella data non si sa nemmeno se la pratica si puo' ancora fare. Per questo
 * la richiesta la pretende — con una sola eccezione.
 *
 * L'eccezione e' il cliente privato della pagina pubblica. Al primo contatto
 * la data quasi non la sa: sta sull'ultima fattura, sul bonifico o su un
 * documento dell'installatore, e per trovarla deve alzarsi e cercare. Era il
 * muro su cui si fermava la maggior parte delle richieste. Gliela chiediamo
 * nel modulo, dopo il pagamento, con l'avviso dei 90 giorni (vedi
 * src/lib/terminiEnea.ts).
 *
 * Il rivenditore no: la data ce l'ha sempre sotto mano, e per lui resta
 * obbligatoria esattamente come prima.
 */

/** I moduli che senza data dell'intervento non si possono aprire. */
const MODULI_CON_DATA = ["pratica-enea", "pratica-fgas"];

export function serveLaDataDellIntervento(richiesta: {
  modulo?: string | null;
  /** Vero solo per il privato che compila la pagina pubblica. */
  isPrivato?: boolean;
}): boolean {
  if (richiesta.isPrivato === true) return false;
  return MODULI_CON_DATA.includes(richiesta.modulo ?? "");
}
