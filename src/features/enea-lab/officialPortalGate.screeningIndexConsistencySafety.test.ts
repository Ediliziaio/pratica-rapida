import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { prepareEneaOfficialPortalCollaudo } from "./officialPortalGate";
import { buildEneaPayload, validatePreparedPractice } from "./preparation";

function readyMappedWithStaleExtraScreening() {
  const source = ENEA_LAB_MOCK_PRACTICES[0];
  const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
  if (!analysis) throw new Error("Fixture senza analisi documentale.");
  const base = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });

  const ready = {
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

  const countField = ready.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "schermature.numero");
  const extraIndex = Number(countField?.value);
  if (!Number.isInteger(extraIndex) || extraIndex < 1) throw new Error("Fixture senza numero schermature valido.");
  const templateType = ready.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "schermature.0.tipo");
  if (!templateType) throw new Error("Fixture senza tipo schermatura.");

  const mapped = {
    ...ready,
    sections: ready.sections.map((section) => section.fields.some((field) => field.id === "schermature.0.tipo")
      ? {
          ...section,
          fields: [
            ...section.fields,
            {
              ...templateType,
              id: `schermature.${extraIndex}.tipo`,
              label: `Elemento ${extraIndex + 1} · Tipo`,
              status: "ready" as const,
              source: "Inserimento operatore" as const,
              testOnly: false,
            },
          ],
        }
      : section),
  };

  return { mapped, analysis, expectedCount: extraIndex };
}

describe("gate ENEA · coerenza indici schermature", () => {
  it("blocca una schermatura stale oltre il numero riepilogativo prima di generare un passo portale extra", () => {
    const { mapped, analysis, expectedCount } = readyMappedWithStaleExtraScreening();
    const issues = validatePreparedPractice(mapped.source, mapped, analysis);
    expect(issues.filter((issue) => issue.severity === "blocker")).toEqual([]);

    const payload = buildEneaPayload(mapped, issues, "official", new Date("2026-08-14T07:15:00.000Z"));
    expect(payload.readyForOfficialSubmission).toBe(true);

    const gate = prepareEneaOfficialPortalCollaudo(mapped, payload, true, analysis);
    expect(gate).toEqual({
      status: "blocked",
      reason: "official-data-incomplete",
      workflow: null,
    });

    if (gate.status === "ready") {
      expect(gate.workflow.screeningItemCount).toBe(expectedCount);
    }
  });
});
