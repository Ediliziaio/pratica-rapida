import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import type { EneaLabDocumentAnalysis } from "./types";

const analysis: EneaLabDocumentAnalysis = {
  items: [{
    widthMm: 2900,
    heightMm: 1300,
    surfaceM2: 3.7,
    gTot: 0.13,
    description: "Schermatura solare mobile",
    sourcePath: "lab-schermature-001/fattura/fattura.pdf",
  }],
  invoiceTotal: 1000,
  creditTotal: 0,
  eligibleExpense: 1000,
  firstInvoiceDate: "2026-07-01",
  documents: [],
  blockers: [],
  warnings: [],
};

describe("mapSchermaturaPractice", () => {
  it("mappa i dati certi senza perdere i campi mancanti", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = result.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.cf")?.value).toBe("CF-DEMO-001-NON-VALIDO");
    expect(fields.find((field) => field.id === "immobile.comune")?.value).toBe("Comune Demo Nord");
    expect(fields.find((field) => field.id === "schermature.numero")?.status).toBe("missing");
    expect(fields.find((field) => field.id === "impianto.potenza")?.testOnly).toBe(true);
    expect(fields.find((field) => field.id === "impianto.potenza")?.status).toBe("missing");
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

  it("applica correzioni e conferme soltanto alla scheda locale", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: { "schermature.0.superficie_finestrata": "2,9 m²" },
      confirmedFieldIds: new Set(["schermature.0.installazione"]),
    });
    const fields = result.sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "schermature.0.superficie_finestrata")).toMatchObject({
      value: "2,9 m²",
      source: "Inserimento operatore",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "schermature.0.installazione")?.status).toBe("ready");
    expect(ENEA_LAB_MOCK_PRACTICES[0].form.prodotto).toEqual({
      tipo: "schermature",
      items: [
        { tipo: "tende_da_sole", direzione: "sud" },
        { tipo: "tende_da_sole", direzione: "ovest" },
      ],
    });
  });

  it("ricava il sesso soltanto da un codice fiscale italiano riconoscibile", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RSSMRA80A01H501U";
    let fields = mapSchermaturaPractice(source).sections.flatMap((currentSection) => currentSection.fields);
    expect(fields.find((field) => field.id === "beneficiario.sesso")).toMatchObject({
      value: "M",
      status: "ready",
      source: "Regola controllata",
    });

    source.form.richiedente.cf = "RSSMRA80A41H501U";
    fields = mapSchermaturaPractice(source).sections.flatMap((currentSection) => currentSection.fields);
    expect(fields.find((field) => field.id === "beneficiario.sesso")?.value).toBe("F");
  });
});
