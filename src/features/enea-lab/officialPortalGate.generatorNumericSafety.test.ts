import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { validateOperatorOverride } from "./operatorValidation";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyMappedWithGeneratorPower(value: string) {
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
        else if (field.id === "impianto.potenza") nextValue = value;
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

describe("gate ENEA · formato numerico generatore", () => {
  it("non deve trasformare due numeri separati da testo in una potenza unica", () => {
    const malformed = "25 x 2 kW";
    expect(validateOperatorOverride("impianto.potenza", malformed).valid).toBe(false);

    // Il gate deve restare indipendente dalla UI: un mapping stale o alterato
    // non può diventare 252 kW soltanto perché il builder elimina il testo.
    const { mapped, analysis } = readyMappedWithGeneratorPower(malformed);
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T12:30:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    // La barriera indipendente vive nel builder official: quando il gate tenta
    // di materializzare il workflow, il pacchetto non è più serializzabile e
    // viene quindi rifiutato come incoerente invece di produrre id-pn=252.
    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "payload-inconsistent",
      workflow: null,
    });
  });
});
