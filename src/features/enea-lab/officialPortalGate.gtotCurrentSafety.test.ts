import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyFixture() {
  const source = ENEA_LAB_MOCK_PRACTICES[0];
  const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
  if (!analysis) throw new Error("Fixture senza analisi documentale.");
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
  return { mapped, analysis };
}

function withGTot(
  mapped: ReturnType<typeof readyFixture>["mapped"],
  value: string,
  source: "Fattura" | "Inserimento operatore",
) {
  return {
    ...mapped,
    sections: mapped.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === "schermature.0.gtot"
        ? { ...field, value, source, status: "ready" as const }
        : field),
    })),
  };
}

describe("gate ENEA · gTot corrente", () => {
  it("blocca un gTot manuale fuori limite anche se i livelli precedenti lo dichiarano pronto", () => {
    const { mapped, analysis } = readyFixture();
    const altered = withGTot(mapped, "0,90", "Inserimento operatore");
    const issues = validatePreparedPractice(altered.source, altered, analysis);
    const payload = buildEneaPayload(altered, issues, "official", new Date("2026-08-13T02:00:00.000Z"));

    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(prepareEneaOfficialPortalCollaudo(altered, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });

  it("blocca un gTot marcato come fattura se non coincide più con l'analisi documentale corrente", () => {
    const { mapped, analysis } = readyFixture();
    const stale = withGTot(mapped, "0,30", "Fattura");
    const issues = validatePreparedPractice(stale.source, stale, analysis);
    const payload = buildEneaPayload(stale, issues, "official", new Date("2026-08-13T02:00:00.000Z"));

    expect(analysis.items[0]?.gTot).toBe(0.13);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(prepareEneaOfficialPortalCollaudo(stale, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });
});
