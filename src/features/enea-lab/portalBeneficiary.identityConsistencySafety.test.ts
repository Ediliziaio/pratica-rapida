import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaBeneficiaryPortalScript } from "./portalBeneficiary";

function withIdentity(
  birthDate: string,
  sex: "M" | "F" = "M",
) {
  const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
  source.form.richiedente.cf = "RSSMRA80A01H501U";
  const base = mapSchermaturaPractice(source);
  const values: Record<string, string> = {
    "beneficiario.cf": "RSSMRA80A01H501U",
    "beneficiario.data_nascita": birthDate,
    "beneficiario.sesso": sex,
  };

  return {
    ...base,
    sections: base.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => field.id in values
        ? {
            ...field,
            value: values[field.id],
            status: "ready" as const,
            source: "Inserimento operatore" as const,
            testOnly: false,
          }
        : field),
    })),
  };
}

describe("coerenza identita nel builder beneficiario ENEA", () => {
  it("non prepara CF, data e sesso singolarmente validi ma tra loro incoerenti", () => {
    const coherent = buildEneaBeneficiaryPortalScript(withIdentity("01/01/1980", "M"));
    expect(coherent.readyFieldIds).toEqual(expect.arrayContaining([
      "beneficiario.cf",
      "beneficiario.data_nascita",
      "beneficiario.sesso",
    ]));

    const inconsistent = buildEneaBeneficiaryPortalScript(withIdentity("02/01/1980", "M"));
    expect(inconsistent.skippedFieldIds).toEqual(expect.arrayContaining([
      "beneficiario.cf",
      "beneficiario.data_nascita",
      "beneficiario.sesso",
    ]));
    expect(inconsistent.readyFieldIds).not.toContain("beneficiario.cf");
    expect(inconsistent.readyFieldIds).not.toContain("beneficiario.data_nascita");
    expect(inconsistent.readyFieldIds).not.toContain("beneficiario.sesso");
    expect(inconsistent.script).not.toContain("RSSMRA80A01H501U");
  });
});
