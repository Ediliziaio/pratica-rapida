import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { ENEA_PLANT_TERMINAL } from "./plantRules";

describe("mapper ENEA · terminale split riconciliabile", () => {
  it("deve lasciare lo split fail-closed ma permetterne la verifica operatore", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.impianto.terminali = "split";
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!analysis) throw new Error("Fixture senza analisi documentale.");

    const baseField = mapSchermaturaPractice(source, analysis)
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "impianto.terminali");

    expect(baseField).toMatchObject({
      value: "Intervento umano richiesto",
      status: "missing",
      editable: true,
      source: "Regola controllata",
    });

    const verifiedField = mapSchermaturaPractice(source, analysis, {
      overrides: { "impianto.terminali": ENEA_PLANT_TERMINAL.fanCoils },
    })
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "impianto.terminali");

    expect(verifiedField).toMatchObject({
      value: ENEA_PLANT_TERMINAL.fanCoils,
      status: "ready",
      source: "Inserimento operatore",
    });
  });
});
