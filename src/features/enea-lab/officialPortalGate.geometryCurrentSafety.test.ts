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

function withField(
  mapped: ReturnType<typeof readyFixture>["mapped"],
  fieldId: string,
  value: string,
  source: "Fattura" | "Calcolo ENEA" | "Inserimento operatore",
) {
  return {
    ...mapped,
    sections: mapped.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === fieldId
        ? { ...field, value, source, status: "ready" as const }
        : field),
    })),
  };
}

function expectGateBlocksOtherwiseReady(mapped: ReturnType<typeof readyFixture>["mapped"]) {
  const analysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
  if (!analysis) throw new Error("Fixture senza analisi documentale.");
  const issues = validatePreparedPractice(mapped.source, mapped, analysis);
  const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-13T03:00:00.000Z"));

  expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
  expect(payload.readyForOfficialSubmission).toBe(true);
  expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
    status: "blocked",
    reason: "official-data-incomplete",
    workflow: null,
  });
}

describe("gate ENEA · geometria schermature corrente", () => {
  it("blocca misure marcate come fattura se non coincidono con l'analisi documentale corrente", () => {
    const { mapped, analysis } = readyFixture();
    expect(analysis.items[0]).toMatchObject({ widthMm: 2900, heightMm: 1300, surfaceM2: 3.7 });

    const stale = withField(mapped, "schermature.0.dimensioni", "1000 × 1000 mm", "Fattura");
    expectGateBlocksOtherwiseReady(stale);
  });

  it("blocca una superficie marcata come calcolo ENEA se non deriva dalle misure correnti", () => {
    const { mapped } = readyFixture();
    const altered = withField(mapped, "schermature.0.superficie", "2,0 m²", "Calcolo ENEA");
    expectGateBlocksOtherwiseReady(altered);
  });
});
