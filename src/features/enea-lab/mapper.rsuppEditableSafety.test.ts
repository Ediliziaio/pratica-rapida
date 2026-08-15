import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("mapper ENEA · Rsupp verificabile", () => {
  it("deve rendere Rsupp modificabile senza trasformarla in un dato automatico", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!analysis) throw new Error("Fixture senza analisi documentale.");

    const baseField = mapSchermaturaPractice(source, analysis)
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "schermature.0.rsupp");

    expect(baseField).toMatchObject({
      required: false,
      editable: true,
      status: "missing",
      source: "Modulo cliente",
    });
    expect(baseField?.value).toBe("Non indicato");

    const verifiedField = mapSchermaturaPractice(source, analysis, {
      overrides: { "schermature.0.rsupp": "0,08" },
    })
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "schermature.0.rsupp");

    expect(verifiedField).toMatchObject({
      value: "0,08",
      required: false,
      editable: true,
      status: "ready",
      source: "Inserimento operatore",
    });
  });
});
