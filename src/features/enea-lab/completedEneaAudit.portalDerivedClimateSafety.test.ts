import { describe, expect, it } from "vitest";
import { compareMappedToCompletedEnea } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("audit storico dei dati climatici derivati dal Comune ENEA", () => {
  it("conserva l'evidenza del PDF senza attribuire al mapper campi derivati dal portale", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const screeningCount = Number(
      mapped.sections
        .flatMap((section) => section.fields)
        .find((field) => field.id === "schermature.numero")?.value ?? 0,
    );

    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: "TEST",
      screeningCount,
      fields: {
        "immobile.codice_comune": "H264",
        "immobile.zona_climatica": "E",
        "immobile.gradi_giorno": "2631",
        "immobile.fascia_solare": "1",
      },
    });

    expect(audit.compared).toBe(1);
    expect(audit.matches).toBe(1);
    expect(audit.mismatches).toBe(0);
    expect(audit.differences).toEqual([]);
  });
});
