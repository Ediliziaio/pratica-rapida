import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import {
  ENEA_LAB_MOCK_ANALYSIS,
  ENEA_LAB_MOCK_PRACTICES,
} from "./mockPractices";
import { buildEneaPlantPortalScript } from "./portalPlant";

describe("sicurezza domini nel builder Impianto ENEA", () => {
  it("non compila il terminale Altro osservato se il dominio applicativo non lo supporta", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const terminal = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "impianto.terminali");

    expect(terminal).toBeDefined();
    if (!terminal) return;

    terminal.value = "g. altro";
    terminal.status = "ready";
    terminal.source = "Inserimento operatore";

    const preparation = buildEneaPlantPortalScript(mapped);

    expect(preparation.readyFieldIds).not.toContain("impianto.terminali");
    expect(preparation.skippedFieldIds).toContain("impianto.terminali");
    expect(preparation.runtime.fields.some(({ portalId }) => portalId === "id-erogazione")).toBe(false);
  });
});
