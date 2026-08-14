import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { validateOperatorOverride } from "./operatorValidation";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyMappedWithGlazedSurface(value: string) {
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
        if (field.id === "intervento.data_inizio") nextValue = "01/01/2026";
        else if (field.id === "intervento.data_fine") nextValue = "02/01/2026";
        else if (field.id === "impianto.numero_generatori") nextValue = "1";
        else if (field.id === "impianto.rendimento") nextValue = "95";
        else if (field.id === "impianto.potenza") nextValue = "25 kW";
        else if (/\.dimensioni$/.test(field.id)) nextValue = "1000 × 1000 mm";
        else if (/\.superficie$/.test(field.id)) nextValue = "1,0 m²";
        else if (/\.superficie_finestrata$/.test(field.id)) nextValue = value;
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

describe("gate ENEA · formato numerico superfici", () => {
  it("non deve trasformare due numeri separati da testo in una superficie unica", () => {
    const malformed = "2 x 9 m²";
    expect(validateOperatorOverride("schermature.0.superficie_finestrata", malformed).valid).toBe(false);

    // Anche bypassando la validazione UI e costruendo direttamente un mapping
    // ready, l'ultima barriera deve continuare a rifiutare il valore ambiguo.
    const { mapped, analysis } = readyMappedWithGlazedSurface(malformed);
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T06:45:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });
});