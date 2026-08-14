import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";
import type { EneaLabDocumentAnalysis } from "./types";

function readyMappedWithEnergy(
  kind: "solar" | "darkening",
  energyValue: string,
) {
  const base = ENEA_LAB_MOCK_PRACTICES[0];
  const source = {
    ...base,
    form: {
      ...base.form,
      impianto: { ...base.form.impianto, aria_condizionata: false },
    },
  };
  const baseAnalysis = ENEA_LAB_MOCK_ANALYSIS[base.id];
  const analysis: EneaLabDocumentAnalysis = kind === "darkening"
    ? {
        ...baseAnalysis,
        items: baseAnalysis.items.map((item) => ({
          ...item,
          description: "Persiana avvolgibile dimostrativa",
        })),
      }
    : baseAnalysis;
  const mapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });

  return {
    analysis,
    mapped: {
      ...mapped,
      sections: mapped.sections.map((section) => ({
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
          else if (field.id === "schermature.risparmio_energia") value = energyValue;
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
    },
  };
}

describe("gate ENEA: stagionalita del risparmio energetico", () => {
  it("blocca 0 kWh/anno per una chiusura oscurante quando manca una prova di assenza del riscaldamento", () => {
    const { mapped, analysis } = readyMappedWithEnergy("darkening", "0 kWh/anno");
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T04:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });

  it("continua ad ammettere 0 kWh/anno per sole schermature solari senza raffrescamento", () => {
    const { mapped, analysis } = readyMappedWithEnergy("solar", "0 kWh/anno");
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T04:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);
    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis).status).toBe("ready");
  });

  it("non tratta un valore testuale senza cifre come se fosse zero", () => {
    const { mapped, analysis } = readyMappedWithEnergy("solar", "Valore verificato");
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T04:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });

  it("blocca un risparmio positivo non verificato manualmente", () => {
    const { mapped, analysis } = readyMappedWithEnergy("solar", "311 kWh/anno");
    const staleMapped = {
      ...mapped,
      sections: mapped.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => field.id === "schermature.risparmio_energia"
          ? { ...field, source: "Calcolo ENEA" as const }
          : field),
      })),
    };
    const issues = validatePreparedPractice(staleMapped.source, staleMapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(staleMapped, issues, "official", new Date("2026-08-14T04:00:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(staleMapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });
});