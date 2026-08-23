import { describe, expect, it } from "vitest";
import { buildPostDraftHistoricalBenchmark, buildPostPilotComparison, type PostPilotComparisonRequest } from "./postPilotComparison";

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

  it("ammette il PDF storico dopo la bozza soltanto come benchmark isolato", () => {
    const matrix = buildPostDraftHistoricalBenchmark({
      mode: "post_draft_read_only",
      authorizationRuleId: "user-2026-08-17-post-draft-historical-enea-benchmark-readonly",
      draftId: "414439",
      fields: [{
        field: "schermature.0.gtot",
        test: { value: 0.33, provenance: "verified_source", sourceId: "fattura-originaria" },
        benchmark: { value: 0.08, sourceAvailable: false },
        originalSource: { value: 0.33, sourceId: "fattura-originaria" },
      }],
      excludedFields: ["dati impianto termico", "risparmio energetico stimato", "finestre protette", "data fine lavori (TEST)"],
    });

    expect(matrix.mode).toBe("post_draft_read_only");
    expect(matrix.historicalValuesMayFeedMapper).toBe(false);
    expect(matrix.rows[0]).toMatchObject({ category: "inconcludente_per_fonte_assente" });
    expect(Object.isFrozen(matrix.rows)).toBe(true);
  });

  it("non segnala differenze cosmetiche fra PDF e bozza", () => {
    const matrix = buildPostDraftHistoricalBenchmark({
      mode: "post_draft_read_only",
      authorizationRuleId: "user-2026-08-17-post-draft-historical-enea-benchmark-readonly",
      draftId: "414439",
      fields: [
        { field: "beneficiario.nome", test: { value: "Tommaso", provenance: "verified_source", sourceId: "form" }, benchmark: { value: "tommaso", sourceAvailable: false } },
        { field: "beneficiario.comune_nascita", test: { value: "Firenze", provenance: "verified_source", sourceId: "form" }, benchmark: { value: "Firenze (FI)", sourceAvailable: false } },
        { field: "beneficiario.titolo", test: { value: "Detentore / affittuario", provenance: "verified_source", sourceId: "form" }, benchmark: { value: "Detentore o co-detentore (es. locatario, comodatario, usufruttuario, ecc.)", sourceAvailable: false } },
        { field: "schermature.0.gtot", test: { value: "0,08", provenance: "verified_source", sourceId: "fattura" }, benchmark: { value: "0.08", sourceAvailable: false } },
        { field: "immobile.tipologia", test: { value: "Casa singola o plurifamiliare", provenance: "verified_source", sourceId: "form" }, benchmark: { value: "costruzione isolata (es. mono o plurifamiliare)", sourceAvailable: false } },
      ],
      excludedFields: ["dati impianto termico", "risparmio energetico stimato", "finestre protette", "data fine lavori (TEST)"],
    });
    expect(matrix.rows.every((row) => row.category === "coincidente")).toBe(true);
  });

  it("rifiuta benchmark post-bozza senza autorizzazione o esclusioni complete", () => {
    const base = {
      mode: "post_draft_read_only" as const,
      authorizationRuleId: "user-2026-08-17-post-draft-historical-enea-benchmark-readonly" as const,
      draftId: "414439",
      fields: [{
        field: "beneficiario.cf",
        test: { value: "RSSMRA80A01H501U", provenance: "verified_source" as const, sourceId: "fattura" },
        benchmark: { value: "RSSMRA80A01H501U", sourceAvailable: false as const },
      }],
      excludedFields: ["dati impianto termico", "risparmio energetico stimato", "finestre protette", "data fine lavori (TEST)"],
    };
    expect(() => buildPostDraftHistoricalBenchmark({ ...base, authorizationRuleId: "non-autorizzato" as typeof base.authorizationRuleId }))
      .toThrow("Benchmark post-bozza non autorizzato o incompleto");
    expect(() => buildPostDraftHistoricalBenchmark({ ...base, excludedFields: base.excludedFields.slice(0, 3) }))
      .toThrow("Esclusioni obbligatorie del confronto non complete");
  });
});
