import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";
import type { EneaLabDocumentAnalysis } from "./types";

function readyDarkeningClosure() {
  const base = ENEA_LAB_MOCK_PRACTICES[0];
  const baseAnalysis = ENEA_LAB_MOCK_ANALYSIS[base.id];
  if (!baseAnalysis) throw new Error("Fixture senza analisi documentale.");

  const analysis: EneaLabDocumentAnalysis = {
    ...baseAnalysis,
    items: baseAnalysis.items.map((item) => ({
      ...item,
      description: "Tapparella motorizzata in alluminio",
      gTot: null,
    })),
  };
  const baseMapped = mapSchermaturaPractice(base, analysis, { includeTestConventions: true });
  const mapped = {
    ...baseMapped,
    sections: baseMapped.sections.map((section) => ({
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
        else if (/\.rsupp$/.test(field.id)) value = "0,08";
        else if (/\.modalita_calcolo$/.test(field.id)) value = "Calcolato secondo UNI EN 13125";
        else if (field.id === "schermature.spesa") value = "1000 €";
        else if (field.id === "schermature.risparmio_energia") value = "311 kWh/anno";
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

describe("gate ENEA · prestazioni chiusure oscuranti", () => {
  it("accetta Rsupp senza gTot fittizio e arriva al solo gate energetico non osservato", () => {
    const { mapped, analysis } = readyDarkeningClosure();
    const gTotFields = mapped.sections
      .flatMap((section) => section.fields)
      .filter((field) => /\.gtot$/.test(field.id));
    expect(gTotFields.length).toBeGreaterThan(0);
    expect(gTotFields.every((field) => field.required === false && field.status !== "ready")).toBe(true);

    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);
    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T04:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "payload-inconsistent",
      workflow: null,
    });
  });
});