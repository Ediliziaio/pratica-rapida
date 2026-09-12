export const SCREENING_ENERGY_SAVINGS_POLICY = Object.freeze({
  version: "screening-energy-savings-v1",
  coefficientKwhPerM2Year: 16.8,
  coefficientUnit: "kWh/anno per m²",
  resultUnit: "kWh/anno",
  roundingDecimals: 2,
  roundingMode: "nearest-0.01",
  formula: "somma(superficie schermature riconciliate in m²) × 16,8 kWh/anno per m²",
});

export interface ReconciledScreeningSurface {
  rowId: string;
  surfaceM2: number;
  reconciled: boolean;
  provenance: { sourceId: string; kind: "verified_source" | "operator_verified" };
}

export interface ScreeningEnergySavingsAudit {
  policyVersion: string;
  formula: string;
  coefficient: number;
  coefficientUnit: string;
  resultUnit: string;
  rounding: { decimals: number; mode: string };
  rows: readonly { rowId: string; surfaceM2: number; sourceId: string; provenance: string }[];
  totalSurfaceM2: number;
  resultKwhYear: number;
}

export type ScreeningEnergySavingsResult =
  | { status: "ready"; audit: ScreeningEnergySavingsAudit }
  | { status: "blocked"; issues: readonly string[] };

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateScreeningEnergySavings(
  rows: readonly ReconciledScreeningSurface[],
): ScreeningEnergySavingsResult {
  const issues: string[] = [];
  if (!rows.length) issues.push("nessuna-riga-schermatura");
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.rowId.trim() || seen.has(row.rowId)) issues.push(`identificativo-riga:${row.rowId || "assente"}`);
    seen.add(row.rowId);
    if (!row.reconciled) issues.push(`riga-non-riconciliata:${row.rowId}`);
    if (!Number.isFinite(row.surfaceM2) || row.surfaceM2 <= 0) issues.push(`superficie-non-valida:${row.rowId}`);
    if (!row.provenance.sourceId.trim()) issues.push(`provenienza-non-valida:${row.rowId}`);
  }
  if (issues.length) return { status: "blocked", issues: Object.freeze(issues) };

  const totalSurfaceM2 = round(rows.reduce((sum, row) => sum + row.surfaceM2, 0), 3);
  return {
    status: "ready",
    audit: Object.freeze({
      policyVersion: SCREENING_ENERGY_SAVINGS_POLICY.version,
      formula: SCREENING_ENERGY_SAVINGS_POLICY.formula,
      coefficient: SCREENING_ENERGY_SAVINGS_POLICY.coefficientKwhPerM2Year,
      coefficientUnit: SCREENING_ENERGY_SAVINGS_POLICY.coefficientUnit,
      resultUnit: SCREENING_ENERGY_SAVINGS_POLICY.resultUnit,
      rounding: Object.freeze({
        decimals: SCREENING_ENERGY_SAVINGS_POLICY.roundingDecimals,
        mode: SCREENING_ENERGY_SAVINGS_POLICY.roundingMode,
      }),
      rows: Object.freeze(rows.map((row) => Object.freeze({
        rowId: row.rowId,
        surfaceM2: row.surfaceM2,
        sourceId: row.provenance.sourceId,
        provenance: row.provenance.kind,
      }))),
      totalSurfaceM2,
      resultKwhYear: round(
        totalSurfaceM2 * SCREENING_ENERGY_SAVINGS_POLICY.coefficientKwhPerM2Year,
        SCREENING_ENERGY_SAVINGS_POLICY.roundingDecimals,
      ),
    }),
  };
}

