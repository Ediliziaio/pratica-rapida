import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { ENEA_SCREENING_TYPE } from "./screeningRules";

describe("mapper ENEA · prestazioni chiusure oscuranti", () => {
  it("non rende obbligatorio il gTot e richiede la Rsupp verificata per una tapparella", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const baseAnalysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!baseAnalysis) throw new Error("Fixture senza analisi documentale.");

    const analysis = {
      ...baseAnalysis,
      items: baseAnalysis.items.map((item) => ({
        ...item,
        description: "Tapparella motorizzata in alluminio",
        gTot: null,
      })),
    };
    const mapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: false });
    const fields = new Map(
      mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
    );

    expect(fields.get("schermature.0.tipo")?.value).toBe(ENEA_SCREENING_TYPE.rollerShutter);
    expect(fields.get("schermature.0.gtot")).toMatchObject({
      value: "Non indicato",
      required: false,
      status: "missing",
    });
    expect(fields.get("schermature.0.rsupp")).toMatchObject({
      required: true,
      editable: true,
      status: "missing",
    });
    expect(fields.get("schermature.0.modalita_calcolo")).toMatchObject({
      required: true,
      editable: true,
      status: "missing",
    });
  });
});