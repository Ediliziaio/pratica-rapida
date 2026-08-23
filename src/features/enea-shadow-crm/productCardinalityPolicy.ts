export interface SourceProductLine<TAttributes extends Record<string, unknown>> {
  sourceLineId: string;
  quantity: number;
  perPieceSurfaceM2: number;
  attributes: TAttributes;
}

export interface TechnicalProductRow<TAttributes extends Record<string, unknown>> {
  rowId: string;
  sourceLineId: string;
  pieceNumber: number;
  surfaceM2: number;
  attributes: TAttributes;
}

export type ProductDisposition = "enea_included" | "enea_excluded";
export interface ClassifiedProductRow<TAttributes extends Record<string, unknown>> extends TechnicalProductRow<TAttributes> {
  disposition: ProductDisposition;
  reason: string;
}

/** Preserva la cardinalità fisica: una riga tecnica ENEA per ogni pezzo documentato. */
export function expandTechnicalProductRows<TAttributes extends Record<string, unknown>>(
  line: SourceProductLine<TAttributes>,
): TechnicalProductRow<TAttributes>[] {
  if (!line.sourceLineId.trim() || !Number.isInteger(line.quantity) || line.quantity < 1
    || !Number.isFinite(line.perPieceSurfaceM2) || line.perPieceSurfaceM2 <= 0) {
    throw new Error("Riga prodotto non espandibile senza quantità intera e superficie per pezzo valide.");
  }
  return Array.from({ length: line.quantity }, (_, index) => ({
    rowId: `${line.sourceLineId}:piece-${index + 1}`,
    sourceLineId: line.sourceLineId,
    pieceNumber: index + 1,
    surfaceM2: line.perPieceSurfaceM2,
    attributes: structuredClone(line.attributes),
  }));
}

/** La cardinalità 1:1 precede la classificazione: anche gli esclusi restano righe fisiche distinte nel ledger. */
export function expandClassifiedProductRows<TAttributes extends Record<string, unknown>>(
  line: SourceProductLine<TAttributes>,
  disposition: ProductDisposition,
  reason: string,
): ClassifiedProductRow<TAttributes>[] {
  if (!reason.trim()) throw new Error("Classificazione prodotto priva di motivo auditabile.");
  return expandTechnicalProductRows(line).map((row) => ({ ...row, disposition, reason }));
}

export function technicalCardinalityMatches(
  sourceLines: readonly { sourceLineId: string; quantity: number }[],
  rows: readonly { sourceLineId: string }[],
): boolean {
  if (sourceLines.some((line) => !line.sourceLineId.trim() || !Number.isInteger(line.quantity) || line.quantity < 1)) return false;
  return sourceLines.every((line) => rows.filter((row) => row.sourceLineId === line.sourceLineId).length === line.quantity)
    && rows.length === sourceLines.reduce((sum, line) => sum + line.quantity, 0);
}
