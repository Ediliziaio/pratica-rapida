import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaOfficialPortalWorkflowScript } from "./portalWorkflow";

function readyMapped(withCoOwner = false) {
  const baseSource = ENEA_LAB_MOCK_PRACTICES[0];
  const source = withCoOwner
    ? {
        ...baseSource,
        form: {
          ...baseSource.form,
          cointestazione: {
            presente: true,
            nome: "Mario",
            cognome: "Rossi",
            cf: "RSSMRA80A01H501U",
          },
        },
      }
    : baseSource;
  const analysis = ENEA_LAB_MOCK_ANALYSIS[baseSource.id];
  if (!analysis) throw new Error("Fixture senza analisi documentale.");

  const base = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });
  return {
    ...base,
    sections: base.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (!field.required) return field;
        let value = field.value;
        if (field.id === "beneficiario.cf") value = "RSSMRA80A01H501U";
        else if (field.id === "beneficiario.data_nascita") value = "01/01/1980";
        else if (field.id === "beneficiario.sesso") value = "M";
        else if (field.id === "beneficiario.cointestatario_cf") value = "VRDLGI85C12F205X";
        else if (field.id === "intervento.data_inizio") value = "01/01/2026";
        else if (field.id === "intervento.data_fine") value = "02/01/2026";
        else if (field.id === "impianto.numero_generatori") value = "1";
        else if (field.id === "impianto.rendimento") value = "95";
        else if (field.id === "impianto.potenza") value = "25 kW";
        else if (/\.dimensioni$/.test(field.id)) value = "1000 × 1000 mm";
        else if (/\.superficie(?:_finestrata)?$/.test(field.id)) value = "1,0 m²";
        else if (field.id === "schermature.spesa") value = "1000 €";
        else if (field.id === "schermature.risparmio_energia") value = "100 kWh/anno";
        else if (/^(?:Non indicato|Intervento umano richiesto)$/i.test(value.trim())) value = "Valore verificato";
        return {
          ...field,
          value,
          status: "ready" as const,
          source: "Inserimento operatore" as const,
          testOnly: false,
        };
      }),
    })),
  };
}

describe("workflow ENEA: cointestazione non ancora modellata", () => {
  it("arriva al solo gate del controllo energetico quando non c'è cointestatario", () => {
    expect(buildEneaOfficialPortalWorkflowScript(readyMapped())).toMatchObject({
      mode: "blocked",
      script: "",
      reason: expect.stringContaining("risparmio energetico"),
    });
  });

  it("resta fail-closed quando la pratica ha un cointestatario", () => {
    expect(buildEneaOfficialPortalWorkflowScript(readyMapped(true))).toMatchObject({
      mode: "blocked",
      script: "",
    });
  });
});
