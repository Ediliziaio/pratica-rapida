import type {
  AprIntakeOnlyProduct,
  AprProductInventoryRow,
} from "./productIntegration";

export type AprEvidenceSelectionScope = "practice-id-and-document-counts-only";

export interface AprEvidenceCandidate {
  practiceId: string;
  completedEneaPdfCount: number;
  invoiceCount: number;
  additionalDocumentCount: number;
  hasCompletedClientForm: boolean;
}

export interface AprProductEvidenceWorkQueueEntry {
  productType: AprIntakeOnlyProduct;
  completedGroundTruthCandidates: AprEvidenceCandidate[];
  shadowIntakeCandidates: AprEvidenceCandidate[];
  selectionScope: AprEvidenceSelectionScope;
  shadowTechnicalMappingAllowed: false;
  officialSubmissionAllowed: false;
}

const INTAKE_ONLY_PRODUCTS: readonly AprIntakeOnlyProduct[] = [
  "infissi",
  "impianto_termico",
  "insufflaggio",
];

function toCandidate(row: AprProductInventoryRow): AprEvidenceCandidate {
  return {
    practiceId: row.id,
    completedEneaPdfCount: row.completedEneaPdfCount,
    invoiceCount: row.invoiceCount,
    additionalDocumentCount: row.additionalDocumentCount,
    hasCompletedClientForm: row.hasCompletedClientForm,
  };
}

/**
 * Ordinamento lessicografico e verificabile, senza punteggi sintetici:
 * prima più PDF ENEA conclusivi, poi più fatture first-class, poi modulo
 * cliente completo, documenti aggiuntivi e infine ID pratica deterministico.
 */
function compareEvidenceRows(left: AprProductInventoryRow, right: AprProductInventoryRow): number {
  return (
    right.completedEneaPdfCount - left.completedEneaPdfCount
    || right.invoiceCount - left.invoiceCount
    || Number(right.hasCompletedClientForm) - Number(left.hasCompletedClientForm)
    || right.additionalDocumentCount - left.additionalDocumentCount
    || left.id.localeCompare(right.id)
  );
}

function normalizeLimit(limitPerList: number): number {
  if (!Number.isFinite(limitPerList)) return 5;
  return Math.max(0, Math.trunc(limitPerList));
}

/**
 * Work queue read-only per raccogliere le evidenze che sbloccano il prossimo
 * adapter APR. Espone soltanto ID pratica e conteggi documentali già presenti
 * nell'inventario, quindi non porta dati anagrafici fuori dal perimetro.
 *
 * Le pratiche storiche con PDF ENEA conclusivo alimentano la ground truth;
 * le pratiche attive complete alimentano il futuro confronto shadow. La queue
 * non promuove mai da sola un prodotto a mapping tecnico o invio ufficiale.
 */
export function buildAprProductEvidenceWorkQueue(
  rows: AprProductInventoryRow[],
  limitPerList = 5,
): AprProductEvidenceWorkQueueEntry[] {
  const limit = normalizeLimit(limitPerList);

  return INTAKE_ONLY_PRODUCTS.map((productType) => {
    const productRows = rows.filter((row) => row.productType === productType);
    const completedGroundTruthCandidates = productRows
      .filter((row) => row.lifecycle === "historical" && row.completedEneaPdfCount > 0)
      .sort(compareEvidenceRows)
      .slice(0, limit)
      .map(toCandidate);
    const shadowIntakeCandidates = productRows
      .filter((row) => row.lifecycle === "ready" && row.hasCompletedClientForm)
      .sort(compareEvidenceRows)
      .slice(0, limit)
      .map(toCandidate);

    return {
      productType,
      completedGroundTruthCandidates,
      shadowIntakeCandidates,
      selectionScope: "practice-id-and-document-counts-only" as const,
      shadowTechnicalMappingAllowed: false as const,
      officialSubmissionAllowed: false as const,
    };
  });
}
