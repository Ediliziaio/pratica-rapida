import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";

describe("mapSchermaturaPractice", () => {
  it("mappa i dati certi senza perdere i campi mancanti", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = result.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.cf")?.value).toBe("CF-DEMO-001-NON-VALIDO");
    expect(fields.find((field) => field.id === "immobile.comune")?.value).toBe("Comune Demo Nord");
    expect(fields.find((field) => field.id === "schermature.gtot")?.status).toBe("missing");
    expect(result.summary.ready).toBeGreaterThan(20);
    expect(result.summary.missing).toBeGreaterThan(0);
  });

  it("usa l'indirizzo lavori quando è diverso dalla residenza", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[1]);
    const fields = result.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "immobile.comune")?.value).toBe("Comune Demo Sud");
    expect(fields.find((field) => field.id === "immobile.foglio")?.status).toBe("missing");
    expect(result.summary.missing).toBeGreaterThan(mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]).summary.missing);
  });
});
