import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_TECHNICAL_SOURCE_POLICY_VERSION = "apr-infissi-technical-sources-v1" as const;
export const ENEA_INFISSI_AREA_DECIMALS = 1 as const;
export const APR_INFISSI_DEFAULT_THERMAL_TRANSMITTANCE_WM2K = 1.3 as const;

export type InfissiTechnicalSourceKind = "invoice" | "technical_document";

export interface InfissiTechnicalEvidenceRow {
  lineId: string;
  quantity: number;
  widthM?: number;
  heightM?: number;
  /** Superficie documentata del singolo gruppo di pezzi. Necessaria quando
   * il certificato rappresenta un unico serramento composto da piu quote e
   * non espone una coppia LxH complessiva (es. una posizione EKO-OKNA). */
  surfaceM2?: number;
  thermalTransmittanceWm2K?: number;
  measurementKind?: "overall_external" | "other_documented" | "documented_unspecified";
}

export interface InfissiTechnicalEvidence {
  kind: InfissiTechnicalSourceKind;
  sourceIds: readonly string[];
  rows: readonly InfissiTechnicalEvidenceRow[];
}

export interface ResolvedInfissoTechnicalRow {
  physicalRowId: string;
  sourceLineId: string;
  pieceIndex: number;
  widthM?: number;
  heightM?: number;
  exactAreaM2: number;
  eneaAreaM2: number;
  thermalTransmittanceWm2K: number;
  measurementKind: "overall_external" | "other_documented" | "documented_unspecified";
  dimensionSourceKind: InfissiTechnicalSourceKind;
  dimensionSourceIds: readonly string[];
  transmittanceSourceKind: InfissiTechnicalSourceKind | "authorized_fallback";
  transmittanceSourceIds: readonly string[];
}

export interface InfissiTechnicalResolution {
  version: typeof APR_INFISSI_TECHNICAL_SOURCE_POLICY_VERSION;
  status: "ready" | "operator_required";
  rows: readonly ResolvedInfissoTechnicalRow[];
  blockers: readonly string[];
  audit: Readonly<{
    invoiceSourceIds: readonly string[];
    technicalDocumentSourceIds: readonly string[];
    selectedDimensionSource: InfissiTechnicalSourceKind | null;
    physicalProductCount: number;
    exactAreaTotalM2: number;
    eneaRoundedAreaTotalM2: number;
    appliedRuleIds: readonly string[];
  }>;
}

interface ExpandedEvidenceRow {
  sourceLineId: string;
  pieceIndex: number;
  widthM?: number;
  heightM?: number;
  exactAreaM2: number;
  thermalTransmittanceWm2K?: number;
  measurementKind: "overall_external" | "other_documented" | "documented_unspecified";
}

const RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
  USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
  USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
  USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
] as const);

function finitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function evidenceIsDimensionComplete(evidence: InfissiTechnicalEvidence | undefined): evidence is InfissiTechnicalEvidence {
  return Boolean(evidence?.rows.length) && evidence!.rows.every((row) =>
    Number.isInteger(row.quantity)
    && row.quantity > 0
    && ((finitePositive(row.widthM) && finitePositive(row.heightM))
      || finitePositive(row.surfaceM2)),
  );
}

function expandEvidence(evidence: InfissiTechnicalEvidence): ExpandedEvidenceRow[] {
  return evidence.rows.flatMap((row) => Array.from({ length: row.quantity }, (_, index) => ({
    sourceLineId: row.lineId,
    pieceIndex: index + 1,
    ...(finitePositive(row.widthM) ? { widthM: row.widthM } : {}),
    ...(finitePositive(row.heightM) ? { heightM: row.heightM } : {}),
    exactAreaM2: finitePositive(row.surfaceM2)
      ? row.surfaceM2 / row.quantity
      : row.widthM! * row.heightM!,
    thermalTransmittanceWm2K: finitePositive(row.thermalTransmittanceWm2K)
      ? row.thermalTransmittanceWm2K
      : undefined,
    measurementKind: row.measurementKind ?? "documented_unspecified",
  })));
}

function dimensionKey(row: Pick<ExpandedEvidenceRow, "widthM" | "heightM" | "exactAreaM2">): string {
  return finitePositive(row.widthM) && finitePositive(row.heightM)
    ? `${row.widthM.toFixed(6)}x${row.heightM.toFixed(6)}`
    : `area:${row.exactAreaM2.toFixed(6)}`;
}

function sameDimensionMultiset(left: readonly ExpandedEvidenceRow[], right: readonly ExpandedEvidenceRow[]): boolean {
  if (left.length !== right.length) return false;
  const keys = (rows: readonly ExpandedEvidenceRow[]) => rows.map(dimensionKey).sort();
  return keys(left).every((key, index) => key === keys(right)[index]);
}

function matchingRowPool(rows: readonly ExpandedEvidenceRow[]): Map<string, ExpandedEvidenceRow[]> {
  const pool = new Map<string, ExpandedEvidenceRow[]>();
  for (const row of rows) {
    const key = dimensionKey(row);
    const existing = pool.get(key) ?? [];
    existing.push(row);
    pool.set(key, existing);
  }
  return pool;
}

export function roundInfissoAreaForEnea(exactAreaM2: number): number {
  if (!finitePositive(exactAreaM2)) throw new Error("infissi_area_invalid");
  const factor = 10 ** ENEA_INFISSI_AREA_DECIMALS;
  return Math.round((exactAreaM2 + Number.EPSILON) * factor) / factor;
}

export function isAcceptedEneaInfissiAreaRounding(exactAreaM2: number, observedAreaM2: number): boolean {
  if (!finitePositive(exactAreaM2) || !finitePositive(observedAreaM2)) return false;
  return Math.abs(roundInfissoAreaForEnea(exactAreaM2) - observedAreaM2) < 1e-9;
}

export function resolveInfissiTechnicalSources(input: {
  practiceId: string;
  invoice?: InfissiTechnicalEvidence;
  technicalDocuments?: InfissiTechnicalEvidence;
}): InfissiTechnicalResolution {
  if (!input.practiceId.trim()) throw new Error("infissi_identity_required");
  if (input.invoice && input.invoice.kind !== "invoice") throw new Error("infissi_invoice_source_kind_invalid");
  if (input.technicalDocuments && input.technicalDocuments.kind !== "technical_document") {
    throw new Error("infissi_technical_source_kind_invalid");
  }

  const invoiceComplete = evidenceIsDimensionComplete(input.invoice);
  const technicalComplete = evidenceIsDimensionComplete(input.technicalDocuments);
  const invoiceRows = invoiceComplete ? expandEvidence(input.invoice!) : [];
  const technicalRows = technicalComplete ? expandEvidence(input.technicalDocuments!) : [];
  const blockers: string[] = [];

  if (!invoiceComplete && !technicalComplete) blockers.push("infissi_dimensions_and_cardinality_missing");
  if (invoiceComplete && technicalComplete && !sameDimensionMultiset(invoiceRows, technicalRows)) {
    blockers.push("infissi_invoice_technical_document_cardinality_or_dimensions_conflict");
  }

  const selectedEvidence = invoiceComplete ? input.invoice : technicalComplete ? input.technicalDocuments : undefined;
  const selectedRows = invoiceComplete ? invoiceRows : technicalRows;
  const secondaryRows = invoiceComplete && technicalComplete ? technicalRows : [];
  const secondaryPool = matchingRowPool(secondaryRows);
  const resolvedRows: ResolvedInfissoTechnicalRow[] = [];

  if (selectedEvidence && blockers.length === 0) {
    for (const [index, row] of selectedRows.entries()) {
      const match = secondaryPool.get(dimensionKey(row))?.shift();
      if (finitePositive(row.thermalTransmittanceWm2K)
        && match
        && finitePositive(match.thermalTransmittanceWm2K)
        && Math.abs(row.thermalTransmittanceWm2K - match.thermalTransmittanceWm2K) > 1e-9) {
        blockers.push(`infissi_transmittance_source_conflict:${row.sourceLineId}:${row.pieceIndex}`);
        continue;
      }

      const documentedTransmittance = finitePositive(row.thermalTransmittanceWm2K)
        ? row.thermalTransmittanceWm2K
        : match?.thermalTransmittanceWm2K;
      const transmittance = finitePositive(documentedTransmittance)
        ? documentedTransmittance
        : APR_INFISSI_DEFAULT_THERMAL_TRANSMITTANCE_WM2K;

      const transmittanceFromSecondary = !finitePositive(row.thermalTransmittanceWm2K) && Boolean(match);
      const transmittanceFromFallback = !finitePositive(documentedTransmittance);
      const exactAreaM2 = row.exactAreaM2;
      resolvedRows.push({
        physicalRowId: `${input.practiceId.trim()}:infisso:${index + 1}`,
        sourceLineId: row.sourceLineId,
        pieceIndex: row.pieceIndex,
        ...(finitePositive(row.widthM) ? { widthM: row.widthM } : {}),
        ...(finitePositive(row.heightM) ? { heightM: row.heightM } : {}),
        exactAreaM2,
        eneaAreaM2: roundInfissoAreaForEnea(exactAreaM2),
        thermalTransmittanceWm2K: transmittance,
        measurementKind: row.measurementKind,
        dimensionSourceKind: selectedEvidence.kind,
        dimensionSourceIds: selectedEvidence.sourceIds,
        transmittanceSourceKind: transmittanceFromFallback
          ? "authorized_fallback"
          : transmittanceFromSecondary ? "technical_document" : selectedEvidence.kind,
        transmittanceSourceIds: transmittanceFromFallback
          ? Object.freeze([])
          : transmittanceFromSecondary
          ? input.technicalDocuments!.sourceIds
          : selectedEvidence.sourceIds,
      });
    }
  }

  const ready = blockers.length === 0 && resolvedRows.length === selectedRows.length && resolvedRows.length > 0;
  const rows = ready ? resolvedRows : [];
  return Object.freeze({
    version: APR_INFISSI_TECHNICAL_SOURCE_POLICY_VERSION,
    status: ready ? "ready" : "operator_required",
    rows: Object.freeze(rows),
    blockers: Object.freeze(blockers),
    audit: Object.freeze({
      invoiceSourceIds: Object.freeze([...(input.invoice?.sourceIds ?? [])]),
      technicalDocumentSourceIds: Object.freeze([...(input.technicalDocuments?.sourceIds ?? [])]),
      selectedDimensionSource: selectedEvidence?.kind ?? null,
      physicalProductCount: rows.length,
      exactAreaTotalM2: rows.reduce((sum, row) => sum + row.exactAreaM2, 0),
      eneaRoundedAreaTotalM2: rows.reduce((sum, row) => sum + row.eneaAreaM2, 0),
      appliedRuleIds: RULE_IDS,
    }),
  });
}
