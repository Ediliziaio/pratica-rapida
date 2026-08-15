import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";

describe("mapper beneficiario · omocodia", () => {
  it("ricava il sesso anche da un codice fiscale personale valido con cifra omocodica nel giorno", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    // RSSMRA80A01H501U con lo 0 del giorno sostituito da L e carattere di controllo ricalcolato.
    source.form.richiedente.cf = "RSSMRA80AL1H501F";

    const sex = mapSchermaturaPractice(source)
      .sections.flatMap((section) => section.fields)
      .find((field) => field.id === "beneficiario.sesso");

    expect(sex).toMatchObject({
      value: "M",
      status: "ready",
      source: "Regola controllata",
    });
  });
});
