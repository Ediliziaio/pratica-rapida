import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyMappedWithInterventionDates(startDate: string, endDate: string) {
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
        let nextValue = field.value;
        if (field.id === "intervento.data_inizio") nextValue = startDate;
        else if (field.id === "intervento.data_fine") nextValue = endDate;
        else if (field.id === "impianto.numero_generatori") nextValue = "1";
        else if (field.id === "impianto.rendimento") nextValue = "95";
        else if (field.id === "impianto.potenza") nextValue = "25 kW";
        else if (field.id === "immobile.superficie") nextValue = "90 m²";
        else if (/\.dimensioni$/.test(field.id)) nextValue = "1000 × 1000 mm";
        else if (/\.superficie(?:_finestrata)?$/.test(field.id)) nextValue = "1,0 m²";
        else if (field.id === "schermature.spesa") nextValue = "1000 €";
        else if (field.id === "schermature.risparmio_energia") nextValue = "100 kWh/anno";
        else if (/^(?:Non indicato|Intervento umano richiesto)$/i.test(nextValue.trim())) nextValue = "Valore verificato";

        return {
          ...field,
          value: nextValue,
          status: "ready" as const,
          source: "Inserimento operatore" as const,
          testOnly: false,
        };
      }),
    })),
  };

  return { mapped, analysis };
}

describe("gate ENEA · ordine date intervento", () => {
  it("non deve preparare il workflow official se la data di inizio è successiva alla data di fine", () => {
    const { mapped, analysis } = readyMappedWithInterventionDates("03/01/2026", "02/01/2026");
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T15:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis);
    expect(gate.status).toBe("blocked");
    expect(gate.workflow).toBeNull();
  });
});
