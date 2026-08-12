import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyFixture() {
  const source = ENEA_LAB_MOCK_PRACTICES[0];
  const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
  if (!analysis || analysis.items.length < 2) throw new Error("Fixture senza almeno due schermature documentate.");

  const base = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });
  const mapped = {
    ...base,
    sections: base.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (!field.required) return field;
        let value = field.value;
        if (field.id === "intervento.data_inizio") value = "01/01/2026";
        else if (field.id === "intervento.data_fine") value = "02/01/2026";
        else if (field.id === "impianto.numero_generatori") value = "1";
        else if (field.id === "impianto.rendimento") value = "95";
        else if (field.id === "impianto.potenza") value = "25 kW";
        else if (/\.dimensioni$/.test(field.id)) value = "1000 × 1000 mm";
        else if (/\.superficie(?:_finestrata)?$/.test(field.id)) value = "1,0 m²";
        else if (field.id === "schermature.spesa") value = "1000 €";
        else if (/^(?:Non indicato|Intervento umano richiesto)$/i.test(value.trim())) value = "Valore verificato";
        return {
          ...field,
          value,
          status: "ready" as const,
          source: "Inserimento operatore" as const,
          testOnly: false,
        };
      }),
    })),
  };

  const issues = validatePreparedPractice(mapped.source, mapped, analysis);
  expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
  const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T08:00:00.000Z"));
  expect(payload.readyForOfficialSubmission).toBe(true);
  return { mapped, payload, analysis };
}

describe("coerenza interna analisi documentale nel gate ENEA", () => {
  it("blocca se il riepilogo della fattura dichiara più schermature di quelle presenti nel dettaglio", () => {
    const { mapped, payload, analysis } = readyFixture();
    const inconsistentAnalysis = {
      ...analysis,
      items: analysis.items.slice(0, -1),
    };

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true, inconsistentAnalysis);

    expect(gate).toEqual({ status: "blocked", reason: "official-data-incomplete", workflow: null });
  });
});
