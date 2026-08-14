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
        if (field.id === "beneficiario.cf") value = "RSSMRA80A01H501U";
        else if (field.id === "beneficiario.sesso") value = "M";
        else if (field.id === "intervento.data_inizio") value = "01/01/2026";
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
  return { mapped, analysis };
}

function alterReadyField(mapped: ReturnType<typeof readyFixture>["mapped"], fieldId: string, value: string) {
  return {
    ...mapped,
    sections: mapped.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id === fieldId
        ? {
            ...field,
            value,
            status: "ready" as const,
            source: "Inserimento operatore" as const,
            testOnly: false,
          }
        : field),
    })),
  };
}

function prepare(mapped: ReturnType<typeof readyFixture>["mapped"], analysis: ReturnType<typeof readyFixture>["analysis"]) {
  const issues = validatePreparedPractice(mapped.source, mapped, analysis);
  const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T17:00:00.000Z"));
  return { issues, payload, gate: prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis) };
}

function expectBlockedDomain(fieldId: string, value: string) {
  const { mapped, analysis } = readyFixture();
  const altered = alterReadyField(mapped, fieldId, value);
  const { issues, payload, gate } = prepare(altered, analysis);

  expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
  expect(payload.readyForOfficialSubmission).toBe(true);
  expect(gate).toEqual({
    status: "blocked",
    reason: "payload-inconsistent",
    workflow: null,
  });
}

describe("gate ENEA: domini discreti delle pagine non schermatura", () => {
  it("parte da una fixture realmente pronta al collaudo", () => {
    const { mapped, analysis } = readyFixture();
    const { issues, payload, gate } = prepare(mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(gate.status).toBe("ready");
  });

  it("blocca una tipologia immobile ready ma fuori dal dominio ENEA", () => {
    expectBlockedDomain("immobile.tipologia", "Tipologia immobile non prevista");
  });

  it("blocca un tipo impianto ready ma fuori dal dominio ENEA", () => {
    expectBlockedDomain("impianto.tipo", "Impianto non previsto");
  });

  it("blocca un sesso beneficiario ready ma fuori dal dominio ENEA", () => {
    expectBlockedDomain("beneficiario.sesso", "X");
  });
});