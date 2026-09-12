import { describe, expect, it } from "vitest";
import { buildPostPilotComparison, type PostPilotComparisonRequest } from "./postPilotComparison";

const energySavings: PostPilotComparisonRequest["energySavings"] = {
  policyVersion: "screening-energy-savings-v1",
  formula: "somma(superficie) × 16,8",
  coefficient: 16.8,
  coefficientUnit: "kWh/anno per m²",
  resultUnit: "kWh/anno",
  rows: [{ rowId: "riga-1", surfaceM2: 7, sourceId: "fattura-riga-1", provenance: "verified_source" }],
  totalSurfaceM2: 7,
  outputKwhYear: 117.6,
};

describe("matrice confronto post-pilot", () => {
  it("classifica ogni differenza senza promuovere il benchmark a fonte", () => {
    const matrix = buildPostPilotComparison({
      mode: "post_submit_read_only",
      submittedCpid: "CPID-TEST",
      energySavings,
      fields: [
        { field: "schermature.area", test: { value: 7, provenance: "verified_source", sourceId: "fattura-riga-1" }, benchmark: { value: 7, sourceAvailable: false } },
        { field: "impianto.potenza", test: { value: 24.7, provenance: "operational_assumption", sourceId: "policy-potenza-v1" }, benchmark: { value: 23.5, sourceAvailable: false } },
        { field: "intervento.data_fine", test: { value: "2026-07-30", provenance: "verified_source", sourceId: "fattura" }, benchmark: { value: "2026-07-31", sourceAvailable: false } },
        { field: "schermature.gtot", test: { value: 0.15, provenance: "verified_source", sourceId: "mapper" }, benchmark: { value: 0.08, sourceAvailable: false }, originalSource: { value: 0.08, sourceId: "fattura-riga-1" } },
      ],
    });

    expect(matrix.rows.map((row) => row.category)).toEqual([
      "coincidente",
      "assunzione_operativa_attesa",
      "inconcludente_per_fonte_assente",
      "conflitto_con_fonte_originaria",
    ]);
    expect(matrix.rows.every((row) => row.benchmark.sourceAvailable === false)).toBe(true);
  });

  it("collega output locale a formula, superfici e provenienze riconciliate", () => {
    const matrix = buildPostPilotComparison({ mode: "post_submit_read_only", submittedCpid: "CPID-TEST", fields: [], energySavings });
    expect(matrix.energySavings).toEqual(energySavings);
    expect(matrix.energySavings.rows[0].provenance).toBe("verified_source");
    expect(matrix.energySavings.outputKwhYear).toBe(117.6);
    expect(Object.isFrozen(matrix.energySavings.rows)).toBe(true);
  });

  it("rifiuta benchmark prima del CPID e audit locale incompleti", () => {
    expect(() => buildPostPilotComparison({ mode: "post_submit_read_only", submittedCpid: "", fields: [], energySavings }))
      .toThrow("Benchmark ammesso soltanto dopo invio");
    expect(() => buildPostPilotComparison({
      mode: "post_submit_read_only",
      submittedCpid: "CPID-TEST",
      fields: [],
      energySavings: { ...energySavings, rows: [] },
    })).toThrow("Righe risparmio energetico non riconciliate");
  });
});
