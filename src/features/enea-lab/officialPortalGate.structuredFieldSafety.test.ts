import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";
import { buildEneaOfficialPortalWorkflowScript } from "./portalWorkflow";

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
        else if (field.id === "beneficiario.data_nascita") value = "01/01/1980";
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

function officialGate(mapped: ReturnType<typeof readyFixture>["mapped"], analysis: ReturnType<typeof readyFixture>["analysis"]) {
  const issues = validatePreparedPractice(mapped.source, mapped, analysis);
  const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T18:30:00.000Z"));
  return { issues, payload, gate: prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis) };
}

describe("gate ENEA: formati strutturati delle pagine non schermatura", () => {
  it("supera i controlli strutturati e si ferma al controllo energetico non osservato", () => {
    const { mapped, analysis } = readyFixture();
    const { issues, payload, gate } = officialGate(mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(gate).toEqual({
      status: "blocked",
      reason: "payload-inconsistent",
      workflow: null,
    });
  });

  it("blocca un codice fiscale beneficiario ready ma formalmente invalido", () => {
    const { mapped, analysis } = readyFixture();
    const altered = alterReadyField(mapped, "beneficiario.cf", "CF-NON-VALIDO");
    const { issues, payload, gate } = officialGate(altered, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(gate).toEqual({
      status: "blocked",
      reason: "payload-inconsistent",
      workflow: null,
    });
  });

  it("blocca una data di nascita ready ma incoerente con il codice fiscale personale", () => {
    const { mapped, analysis } = readyFixture();
    const altered = alterReadyField(mapped, "beneficiario.data_nascita", "02/01/1980");
    const { issues, payload, gate } = officialGate(altered, analysis);

    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(gate).toEqual({
      status: "blocked",
      reason: "payload-inconsistent",
      workflow: null,
    });
    expect(buildEneaOfficialPortalWorkflowScript(altered)).toMatchObject({
      mode: "blocked",
      script: "",
    });
  });

  it("blocca un sesso ready ma incoerente con il codice fiscale personale", () => {
    const { mapped, analysis } = readyFixture();
    const altered = alterReadyField(mapped, "beneficiario.sesso", "F");
    const { issues, payload, gate } = officialGate(altered, analysis);

    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(gate).toEqual({
      status: "blocked",
      reason: "payload-inconsistent",
      workflow: null,
    });
    expect(buildEneaOfficialPortalWorkflowScript(altered)).toMatchObject({
      mode: "blocked",
      script: "",
    });
  });

  it("mantiene fail-closed le date intervento in ordine cronologico inverso a ogni barriera", () => {
    const { mapped, analysis } = readyFixture();
    const withLateStart = alterReadyField(mapped, "intervento.data_inizio", "03/01/2026");
    const altered = alterReadyField(withLateStart, "intervento.data_fine", "02/01/2026");
    const { issues, payload, gate } = officialGate(altered, analysis);

    expect(issues).toContainEqual(expect.objectContaining({
      code: "start-after-finish",
      fieldId: "intervento.data_inizio",
      severity: "blocker",
    }));
    expect(payload.readyForOfficialSubmission).toBe(false);
    expect(gate).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });

    // Difesa indipendente: anche chi invoca direttamente il builder official,
    // saltando preparation/gate, non deve ottenere uno script con date invertite.
    expect(buildEneaOfficialPortalWorkflowScript(altered)).toMatchObject({
      mode: "blocked",
      script: "",
    });
  });
});
