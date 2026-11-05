export type EneaServiceType = "servizio_completo" | "documenti_forniti";

/**
 * Restituisce il valore canonico accettato da enea_practices.
 * `pratica_only` e' un alias storico e non deve piu' essere scritto dalle
 * nuove pratiche.
 */
export function canonicalEneaServiceType(
  selectedType: EneaServiceType,
  isFgasOnly: boolean,
): EneaServiceType {
  return isFgasOnly || selectedType === "documenti_forniti"
    ? "documenti_forniti"
    : "servizio_completo";
}
