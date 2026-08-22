import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapInfissiCommonPractice } from "./infissiCommonMapping";

function infissiSource() {
  const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
  source.id = "lab-infissi-common-001";
  source.prodottoInstallato = "Infissi e serramenti";
  source.form.prodotto = {
    tipo: "infissi",
    vecchi_materiale: "legno",
    vecchi_vetro: "doppio",
    nuovi_materiale: "pvc",
    nuovi_vetro: "triplo",
    zanzariere_tapparelle: false,
  };
  return source;
}

describe("APR infissi common mapping", () => {
  it("riusa solo beneficiario, immobile, intervento, impianto e documenti", () => {
    const mapped = mapInfissiCommonPractice(infissiSource());

    expect(mapped.sections.map((section) => section.id)).toEqual([
      "beneficiario",
      "immobile",
      "intervento",
      "impianto",
      "documenti",
    ]);
    expect(mapped.sections.flatMap((section) => section.fields)
      .some((field) => field.id.startsWith("schermature."))).toBe(false);
    expect(mapped.sections.flatMap((section) => section.fields)
      .find((field) => field.id === "intervento.tipo")?.value).toMatch(/infiss/i);
  });

  it("rimuove il riferimento gTot dal controllo documenti infissi", () => {
    const mapped = mapInfissiCommonPractice(infissiSource());
    const technical = mapped.sections.flatMap((section) => section.fields)
      .find((field) => field.id === "documenti.tecnici");

    expect(technical?.label).toContain("infissi");
    expect(technical?.note).toContain("Nessun dato gTot");
  });

  it("rifiuta un prodotto non infissi", () => {
    expect(() => mapInfissiCommonPractice(ENEA_LAB_MOCK_PRACTICES[0]))
      .toThrow(/prodotto infissi/);
  });
});
