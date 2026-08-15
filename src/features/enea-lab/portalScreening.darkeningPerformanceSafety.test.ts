import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaScreeningPortalScript } from "./portalScreening";
import type { EneaLabDocumentAnalysis } from "./types";

describe("builder schermatura ENEA · prestazioni oscuranti", () => {
  it("non trascina un gTot stale in una tapparella e conserva la Rsupp verificata", () => {
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
    const baseMapped = mapSchermaturaPractice(source, analysis, { includeTestConventions: false });
    const mapped = {
      ...baseMapped,
      sections: baseMapped.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => {
          if (field.id === "schermature.0.rsupp") {
            return { ...field, value: "0,08", status: "ready" as const, source: "Inserimento operatore" as const };
          }
          if (field.id === "schermature.0.modalita_calcolo") {
            return { ...field, value: "Calcolato secondo UNI EN 13125", status: "ready" as const, source: "Inserimento operatore" as const };
          }
          if (field.id === "schermature.0.gtot") {
            return { ...field, value: "0,13", status: "ready" as const, source: "Inserimento operatore" as const };
          }
          return field;
        }),
      })),
    };

    const prepared = buildEneaScreeningPortalScript(mapped, 0);
    expect(prepared.readyFieldIds).toContain("schermature.0.rsupp");
    expect(prepared.readyFieldIds).not.toContain("schermature.0.gtot");
    expect(prepared.runtime.fields.some((field) => field.portalId === "id-rsup" && field.value === "0,08")).toBe(true);
    expect(prepared.runtime.fields.some((field) => field.portalId === "id-gtot")).toBe(false);
  });
});