import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import type { EneaLabDocumentAnalysis } from "./types";

describe("mapper ENEA · Rsupp verificabile", () => {
  it("rende Rsupp modificabile anche per una schermatura solare senza dedurla automaticamente", () => {
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

  it("rende Rsupp modificabile per una chiusura oscurante senza dedurla automaticamente", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const baseAnalysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!baseAnalysis) throw new Error("Fixture senza analisi documentale.");
    const analysis: EneaLabDocumentAnalysis = {
      ...baseAnalysis,
      items: baseAnalysis.items.map((item) => ({
        ...item,
        description: "Tapparella motorizzata in alluminio",
        gTot: null,
      })),
    };

    const baseField = mapSchermaturaPractice(source, analysis)
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "schermature.0.rsupp");
    expect(baseField).toMatchObject({
      required: true,
      editable: true,
      status: "missing",
    });

    const verifiedField = mapSchermaturaPractice(source, analysis, {
      overrides: { "schermature.0.rsupp": "0,08" },
    })
      .sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "schermature.0.rsupp");

    expect(verifiedField).toMatchObject({
      value: "0,08",
      required: true,
      editable: true,
      status: "ready",
      source: "Inserimento operatore",
    });
  });
});
