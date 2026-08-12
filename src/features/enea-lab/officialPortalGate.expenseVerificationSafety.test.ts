import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyMappedWithExpenseSource(
  expenseSource: "Calcolo ENEA" | "Inserimento operatore",
  expenseValue = "1000 €",
) {
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
        else if (field.id === "schermature.spesa") value = expenseValue;
        else if (/^(?:Non indicato|Intervento umano richiesto)$/i.test(value.trim())) value = "Valore verificato";

        return {
          ...field,
          value,
          status: "ready" as const,
          source: field.id === "schermature.spesa"
            ? expenseSource
            : "Inserimento operatore" as const,
          testOnly: false,
        };
      }),
    })),
  };
}

describe("gate ENEA: verifica manuale della spesa congrua", () => {
  it("non accetta come ufficiale il semplice totale fiscale calcolato dal parser", () => {
    const mapped = readyMappedWithExpenseSource("Calcolo ENEA");
    const analysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T18:30:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });

  it("non considera verificata una spesa nulla anche se inserita manualmente", () => {
    const mapped = readyMappedWithExpenseSource("Inserimento operatore", "0 €");
    const analysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T18:30:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    expect(prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis)).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });
  });

  it("consente il gate quando la spesa positiva è stata riscritta e verificata dall'operatore", () => {
    const mapped = readyMappedWithExpenseSource("Inserimento operatore");
    const analysis = ENEA_LAB_MOCK_ANALYSIS[mapped.source.id];
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-12T18:30:00.000Z"));
    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis);

    expect(gate.status).toBe("ready");
  });
});
