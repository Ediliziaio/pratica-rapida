import { describe, expect, it } from "vitest";
import { calculateScreeningEnergySavings, SCREENING_ENERGY_SAVINGS_POLICY } from "./energySavingsPolicy";

describe("policy locale risparmio schermature", () => {
  const row = (rowId: string, surfaceM2: number) => ({
    rowId, surfaceM2, reconciled: true,
    provenance: { sourceId: `fattura:${rowId}`, kind: "verified_source" as const },
  });

  it("calcola 16,8 kWh/anno per m² con audit completo e arrotondamento a due decimali", () => {
    const result = calculateScreeningEnergySavings([row("r1", 2.345), row("r2", 4.655)]);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.audit).toMatchObject({
      policyVersion: "screening-energy-savings-v1",
      coefficient: 16.8,
      coefficientUnit: "kWh/anno per m²",
      resultUnit: "kWh/anno",
      totalSurfaceM2: 7,
      resultKwhYear: 117.6,
      rounding: { decimals: 2, mode: "nearest-0.01" },
    });
    expect(result.audit.rows).toHaveLength(2);
    expect(result.audit.formula).toContain("16,8");
    expect(SCREENING_ENERGY_SAVINGS_POLICY.coefficientKwhPerM2Year).toBe(16.8);
  });

  it("blocca l'intero calcolo se una riga non è riconciliata o non ha provenienza valida", () => {
    expect(calculateScreeningEnergySavings([
      row("r1", 2),
      { ...row("r2", 3), reconciled: false },
    ])).toEqual(expect.objectContaining({ status: "blocked", issues: expect.arrayContaining(["riga-non-riconciliata:r2"]) }));
    expect(calculateScreeningEnergySavings([
      { ...row("r1", 2), provenance: { sourceId: "", kind: "verified_source" as const } },
    ])).toEqual(expect.objectContaining({ status: "blocked", issues: expect.arrayContaining(["provenienza-non-valida:r1"]) }));
  });
});
