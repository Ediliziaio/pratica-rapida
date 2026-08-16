import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";

describe("inferenza nazione beneficiario ENEA", () => {
  it("non propone Italia quando il modulo usa EE per nascita o residenza estera", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.provincia_nascita = "EE";
    source.form.richiedente.comune_nascita = "Parigi";
    source.form.residenza.provincia = "EE";
    source.form.residenza.comune = "Parigi";
    source.form.residenza.cap = "75001";

    const fields = mapSchermaturaPractice(source)
      .sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Intervento umano richiesto",
      status: "missing",
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_residenza")).toMatchObject({
      value: "Intervento umano richiesto",
      status: "missing",
    });
  });
});
