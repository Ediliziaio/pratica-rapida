/**
 * La ricerca nominativa deve attraversare anche il soft-archive (`archived_at`).
 * Senza questa regola una pratica esistente nella fase Archiviate risulta
 * falsamente assente finche l'operatore non attiva manualmente il toggle.
 */
export function includeArchivedForCrmSearch(
  showArchived: boolean,
  primarySearch: string,
  advancedCustomerSearch: string,
): boolean {
  return showArchived || primarySearch.trim().length > 0 || advancedCustomerSearch.trim().length > 0;
}
