export type ReviewExclusionCarrier = {
  recensione_esclusa?: boolean | null;
};

/**
 * Una richiesta recensione non deve partire quando il Titolare ha escluso
 * esplicitamente la singola pratica. Il controllo e' booleano e fail-safe:
 * soltanto TRUE rappresenta un'esclusione; le pratiche storiche restano
 * compatibili con il default FALSE della colonna.
 */
export function isReviewExcluded(practice: ReviewExclusionCarrier | null | undefined): boolean {
  return practice?.recensione_esclusa === true;
}

/** Template che contengono una richiesta o un sollecito di recensione. */
export function isReviewRequestTemplate(template: string | null | undefined): boolean {
  if (!template) return false;
  return new Set([
    "recensione",
    "richiesta_recensione",
    "sollecito_recensione",
    "pratica_inviata_recensione",
    // Nome storico ancora approvato e attivo su Meta, con i pulsanti Google e
    // Trustpilot. Deve rispettare la stessa esclusione della variante v3.
    "invio_avvenuto_recensione",
  ]).has(template);
}
