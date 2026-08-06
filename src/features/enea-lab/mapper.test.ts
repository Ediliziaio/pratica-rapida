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
  lastInvoiceDate: "2026-07-01",
  documents: [],
  blockers: [],
  warnings: [],
};

describe("mapSchermaturaPractice", () => {
  it("mappa i dati certi senza perdere i campi mancanti", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = result.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.cf")?.value).toBe("CF-DEMO-001-NON-VALIDO");
    expect(fields.find((field) => field.id === "beneficiario.cf")?.status).toBe("missing");
    expect(fields.find((field) => field.id === "immobile.comune")?.value).toBe("Comune Demo Nord");
    expect(fields.find((field) => field.id === "schermature.numero")?.status).toBe("review");
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

  it("crea le righe modificabili anche quando la fattura non viene letta", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = result.sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "schermature.0.dimensioni")).toMatchObject({
      status: "missing",
      editable: true,
    });
    expect(fields.find((field) => field.id === "schermature.1.gtot")?.status).toBe("missing");
    expect(fields.find((field) => field.id === "schermature.numero")).toMatchObject({
      value: "2",
      source: "Modulo cliente",
      status: "review",
    });
  });

  it("permette di confermare il numero proposto dal modulo quando manca l'analisi", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], undefined, {
      confirmedFieldIds: new Set(["schermature.numero"]),
    });
    const field = result.sections.flatMap((currentSection) => currentSection.fields)
      .find((candidate) => candidate.id === "schermature.numero");

    expect(field?.status).toBe("ready");
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

  it("prepara tutti i campi osservati nella pagina anagrafica del beneficiario", () => {
    const fields = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0])
      .sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Italia",
      status: "review",
      source: "Regola controllata",
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_residenza")?.status).toBe("review");
    expect(fields.find((field) => field.id === "beneficiario.comune_residenza")?.value).toBe("Comune Demo Nord");
    expect(fields.find((field) => field.id === "beneficiario.indirizzo_residenza")?.value).toBe("Via Laboratorio");
    expect(fields.find((field) => field.id === "beneficiario.civico_residenza")?.value).toBe("24");
    expect(fields.find((field) => field.id === "beneficiario.cap_residenza")?.value).toBe("00001");
  });

  it("applica le regole operative della sezione Intervento", () => {
    const fields = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis)
      .sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "intervento.ambito")).toMatchObject({
      value: "Edificio costituito da una singola unità immobiliare",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "intervento.unita_oggetto")?.value).toBe("1");
    expect(fields.find((field) => field.id === "intervento.accorpamenti")?.value).toBe("No");
    expect(fields.find((field) => field.id === "intervento.data_inizio")).toMatchObject({
      value: "01/07/2026",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "intervento.tipo")?.value).toBe("Comma 345B - Schermature solari");
    expect(fields.find((field) => field.id === "intervento.impianto_centralizzato")?.value).toBe("No");
    expect(fields.find((field) => field.id === "intervento.zona_urbanistica")).toMatchObject({
      value: "Non indicato",
      required: false,
      editable: false,
    });
  });

  it("applica le regole operative dell'impianto termico esistente", () => {
    const fields = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis)
      .sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "impianto.tipo")?.value).toBe("a. impianto autonomo");
    expect(fields.find((field) => field.id === "impianto.terminali")?.value).toBe("d. radiatori");
    expect(fields.find((field) => field.id === "impianto.distribuzione")?.value).toMatch(/^c\./);
    expect(fields.find((field) => field.id === "impianto.regolazione")?.value)
      .toBe("c. regolazione ad ambiente o a zona");
    expect(fields.find((field) => field.id === "impianto.combustibile")?.value).toBe("a. gas metano");
    expect(fields.find((field) => field.id === "impianto.condizionamento")?.value).toBe("Sì");
    expect(fields.find((field) => field.id === "impianto.manutenzione")).toMatchObject({
      value: "Non indicato",
      required: false,
    });
  });

  it("usa l'ultima fattura quando manca la data fine lavori del rivenditore", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.dataFineLavori = null;
    const documentAnalysis = { ...analysis, lastInvoiceDate: "2026-07-24" };
    const field = mapSchermaturaPractice(source, documentAnalysis)
      .sections.flatMap((currentSection) => currentSection.fields)
      .find((candidate) => candidate.id === "intervento.data_fine");

    expect(field).toMatchObject({
      value: "24/07/2026",
      source: "Fattura",
      status: "ready",
    });
  });

  it("non considera verificata una correzione con formato impossibile", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: { "schermature.0.gtot": "0,72" },
    });
    const field = result.sections.flatMap((currentSection) => currentSection.fields)
      .find((candidate) => candidate.id === "schermature.0.gtot");

    expect(field).toMatchObject({
      value: "0,72",
      source: "Inserimento operatore",
      status: "missing",
    });
    expect(field?.note).toContain("non superiore a 0,35");
  });

  it("accetta una correzione strutturata al posto del dato CRM malformato", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: { "beneficiario.cf": "rssmra80a01h501u" },
    });
    const field = result.sections.flatMap((currentSection) => currentSection.fields)
      .find((candidate) => candidate.id === "beneficiario.cf");

    expect(field).toMatchObject({
      value: "RSSMRA80A01H501U",
      source: "Inserimento operatore",
      status: "ready",
    });
  });

  it("ricalcola il totale quando l'operatore corregge una superficie", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: {
        "schermature.0.superficie": "4,2 m²",
        "schermature.1.superficie": "1,5 m²",
      },
    });
    const total = result.sections.flatMap((currentSection) => currentSection.fields)
      .find((field) => field.id === "schermature.superficie_totale");

    expect(total).toMatchObject({
      value: "5,7 m²",
      source: "Calcolo ENEA",
      status: "ready",
    });
  });

  it("ricalcola superficie e totale quando l'operatore corregge le dimensioni", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: {
        "schermature.0.dimensioni": "2100 × 1800 mm",
        "schermature.1.dimensioni": "1500 × 1000 mm",
      },
    });
    const fields = result.sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "schermature.0.superficie")).toMatchObject({
      value: "3,7 m²",
      source: "Calcolo ENEA",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "schermature.1.superficie")?.value).toBe("1,5 m²");
    expect(fields.find((field) => field.id === "schermature.superficie_totale")?.value).toBe("5,2 m²");
  });

  it("usa il numero verificato per aggiungere o rimuovere le righe schermatura", () => {
    const three = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: { "schermature.numero": "3" },
    });
    const threeFields = three.sections.flatMap((currentSection) => currentSection.fields);
    expect(threeFields.find((field) => field.id === "schermature.2.dimensioni")).toBeDefined();
    expect(threeFields.find((field) => field.id === "schermature.numero")).toMatchObject({
      value: "3",
      source: "Inserimento operatore",
      status: "ready",
    });

    const one = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      overrides: { "schermature.numero": "1" },
    });
    expect(one.sections.flatMap((currentSection) => currentSection.fields)
      .find((field) => field.id === "schermature.1.dimensioni")).toBeUndefined();
  });
});
