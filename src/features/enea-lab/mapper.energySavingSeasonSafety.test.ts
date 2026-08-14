import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

function energySavingField(mapped: ReturnType<typeof mapSchermaturaPractice>) {
  return mapped.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "schermature.risparmio_energia");
}

describe("mapper ENEA: stagionalita del risparmio energetico", () => {
  it("mantiene 0 kWh/anno per sole schermature solari quando il raffrescamento e assente", () => {
    const base = ENEA_LAB_MOCK_PRACTICES[0];
    const source = {
      ...base,
      form: {
        ...base.form,
        impianto: { ...base.form.impianto, aria_condizionata: false },
      },
    };
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[base.id], {
      includeTestConventions: false,
    });

    expect(energySavingField(mapped)).toMatchObject({
      value: "0 kWh/anno",
      status: "ready",
      source: "Calcolo ENEA",
    });
  });

  it("non deduce 0 kWh/anno per chiusure oscuranti dalla sola assenza di raffrescamento", () => {
    const base = ENEA_LAB_MOCK_PRACTICES[0];
    const source = {
      ...base,
      form: {
        ...base.form,
        impianto: { ...base.form.impianto, aria_condizionata: false },
      },
    };
    const analysis = {
      ...ENEA_LAB_MOCK_ANALYSIS[base.id],
      items: ENEA_LAB_MOCK_ANALYSIS[base.id].items.map((item) => ({
        ...item,
        description: "Persiana avvolgibile dimostrativa",
      })),
    };
    const mapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: false });

    const field = energySavingField(mapped);
    expect(field?.status).toBe("missing");
    expect(field?.value).not.toBe("0 kWh/anno");
  });
});
