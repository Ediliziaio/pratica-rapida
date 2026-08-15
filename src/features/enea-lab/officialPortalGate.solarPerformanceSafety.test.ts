import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readySolarFixture() {
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

describe("gate ENEA · prestazioni schermature solari", () => {
  it("blocca una Rsupp stale anche se i livelli precedenti dichiarano il payload pronto", () => {
    const { mapped, analysis } = readySolarFixture();
    const altered = {
      ...mapped,
      sections: mapped.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => field.id === "schermature.0.rsupp"
          ? {
              ...field,
              value: "0,08",
              status: "ready" as const,
              source: "Inserimento operatore" as const,
              testOnly: false,
            }
          : field),
      })),
    };

    const type = altered.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.0.tipo");
    expect(type?.value).toBe("Tenda o veneziana");
    const issues = validatePreparedPractice(altered.source, altered, analysis);
    const payload = buildEneaPayload(altered, issues, "official", new Date("2026-08-15T09:12:00.000Z"));
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(altered, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });
});
