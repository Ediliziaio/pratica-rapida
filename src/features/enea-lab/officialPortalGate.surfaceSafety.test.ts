import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyMapped() {
  const source = ENEA_LAB_MOCK_PRACTICES[0];
  const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
  const mapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });

  return {
    ...mapped,
    sections: mapped.sections.map((section) => ({
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
        else if (field.id === "schermature.risparmio_energia") value = "100 kWh/anno";
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
}

function withFieldValue(mapped: ReturnType<typeof readyMapped>, fieldId: string, value: string) {
  return {
    ...mapped,
    sections: mapped.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === fieldId ? { ...field, value } : field),
    })),
  };
}

function expectSurfaceGateBlocked(fieldId: string) {
  const mapped = withFieldValue(readyMapped(), fieldId, "0 m²");
  const analysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
  const issues = validatePreparedPractice(mapped.source, mapped, analysis);
  expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

  const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-13T00:30:00.000Z"));
  expect(payload.readyForOfficialSubmission).toBe(true);

  expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
    status: "blocked",
    reason: "official-data-incomplete",
    workflow: null,
  });
}

describe("gate ENEA: superfici fisicamente valide", () => {
  it("blocca una superficie schermatura nulla anche se il payload risulta formalmente pronto", () => {
    expectSurfaceGateBlocked("schermature.0.superficie");
  });

  it("blocca una superficie finestrata protetta nulla", () => {
    expectSurfaceGateBlocked("schermature.0.superficie_finestrata");
  });

  it("blocca il totale superfici nullo", () => {
    expectSurfaceGateBlocked("schermature.superficie_totale");
  });

  it("mantiene aperto il gate quando tutte le superfici sono positive", () => {
    const mapped = readyMapped();
    const analysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-13T00:30:00.000Z"));

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis).status).toBe("ready");
  });
});