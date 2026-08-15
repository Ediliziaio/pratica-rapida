import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("mapper ENEA · Rsupp verificabile", () => {
  it("deve rendere Rsupp modificabile dall'operatore senza trasformarla in un dato automatico", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!analysis) throw new Error("Fixture senza analisi documentale.");

    const field = mapSchermaturaPractice(source, analysis)
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "schermature.0.rsupp");

    expect(field).toMatchObject({
      required: false,
      editable: true,
      status: "ready",
      source: "Modulo cliente",
    });
    expect(field?.value).toBe("Non indicato");
  });
});
