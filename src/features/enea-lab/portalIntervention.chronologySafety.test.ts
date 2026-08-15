import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import { buildEneaInterventionPortalScript } from "./portalIntervention";

function withInterventionDates(start: string, finish: string) {
  const source = ENEA_LAB_MOCK_PRACTICES[0];
  const base = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
  const values: Record<string, string> = {
    "intervento.data_inizio": start,
    "intervento.data_fine": finish,
  };

  return {
    ...base,
    sections: base.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id in values
        ? {
            ...field,
            value: values[field.id],
            status: "ready" as const,
            source: "Inserimento operatore" as const,
            testOnly: false,
          }
        : field),
    })),
  };
}

describe("sicurezza cronologia nel builder diretto Intervento ENEA", () => {
  it("compila entrambe le date quando la cronologia e coerente", () => {
    const preparation = buildEneaInterventionPortalScript(
      withInterventionDates("01/07/2026", "31/07/2026"),
    );

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "intervento.data_inizio",
      "intervento.data_fine",
    ]));
  });

  it("non prepara date singolarmente valide ma cronologicamente invertite", () => {
    const preparation = buildEneaInterventionPortalScript(
      withInterventionDates("31/12/2026", "01/01/2026"),
    );

    expect(preparation.readyFieldIds).not.toContain("intervento.data_inizio");
    expect(preparation.readyFieldIds).not.toContain("intervento.data_fine");
    expect(preparation.skippedFieldIds).toEqual(expect.arrayContaining([
      "intervento.data_inizio",
      "intervento.data_fine",
    ]));
    expect(preparation.script).not.toContain("31/12/2026");
    expect(preparation.script).not.toContain("01/01/2026");
  });
});
