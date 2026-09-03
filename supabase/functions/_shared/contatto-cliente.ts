/**
 * Regola unica su CHI può ricevere messaggi dal CRM.
 *
 * Con "documenti forniti" il rivenditore ci consegna tutto lui e il suo
 * cliente finale NON va mai contattato: non ha chiesto niente a noi, spesso
 * non sa nemmeno che esistiamo. Con "servizio completo" invece il cliente è
 * parte del flusso (modulo da compilare, pratica conclusa da ricevere).
 *
 * Il controllo stava scritto a mano in ogni edge function come
 * `tipo_servizio === "documenti_forniti"`, e questo lasciava passare il valore
 * legacy `pratica_only` (lo stesso servizio, nome vecchio) e qualunque valore
 * nullo o sconosciuto: la pratica veniva trattata come servizio completo e al
 * cliente partivano email e WhatsApp. Qui la logica è invertita — si contatta
 * SOLO su servizio completo — così ogni valore che non riconosciamo ricade nel
 * caso prudente: silenzio.
 */

// Alias storico di "documenti_forniti": le pratiche create prima della
// rinomina, e quelle create dalla pagina interna Nuova Pratica finché scriveva
// ancora il vecchio valore, hanno questo tipo_servizio.
const DOCUMENTI_FORNITI_LEGACY = "pratica_only";

export interface PracticeContatto {
  tipo_servizio?: string | null;
  invia_pratica_al_cliente?: boolean | null;
}

/** True se la pratica è "documenti forniti" (nome nuovo o alias legacy). */
export function isDocumentiForniti(practice: PracticeContatto): boolean {
  return practice.tipo_servizio === "documenti_forniti" ||
    practice.tipo_servizio === DOCUMENTI_FORNITI_LEGACY;
}

/** True SOLO sul servizio completo: è l'unico caso in cui il cliente finale si
 *  aspetta di sentirci. Qualunque altro valore (documenti forniti, alias
 *  legacy, null, tipi futuri) risponde false. */
export function isServizioCompleto(practice: PracticeContatto): boolean {
  return practice.tipo_servizio === "servizio_completo";
}

/**
 * True se possiamo mandare al cliente finale i messaggi ordinari del flusso
 * (richiesta modulo, solleciti, conferme, richiesta recensione).
 * Con i documenti forniti la risposta è sempre no.
 */
export function puoContattareCliente(practice: PracticeContatto): boolean {
  return isServizioCompleto(practice);
}

/**
 * True SOLO nell'unica eccezione prevista dal form del rivenditore: sui
 * documenti forniti gli abbiamo chiesto "vuoi che a pratica conclusa la
 * mandiamo via mail al tuo cliente?" e lui ha risposto sì. È un'autorizzazione
 * esplicita, per singola pratica, e vale unicamente per quella mail finale —
 * mai per solleciti, WhatsApp o altri messaggi.
 */
export function puoInviarePraticaAlCliente(practice: PracticeContatto): boolean {
  return isDocumentiForniti(practice) && practice.invia_pratica_al_cliente === true;
}
