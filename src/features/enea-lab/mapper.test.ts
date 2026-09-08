import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import type { EneaLabDocumentAnalysis } from "./types";
import { USER_AUTHORIZED_RULE_IDS } from "../enea-shadow-crm/operationalRegistry";

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
  it("canonicizza Comune di residenza e lavori soltanto tramite l'identita ISTAT univoca", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.comune = "MONTECOMPATRI (RM)";
    source.form.residenza.provincia = "ROMA";
    source.form.residenza.stesso_indirizzo_lavori = true;
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);
    for (const fieldId of ["beneficiario.comune_residenza", "immobile.comune"]) {
      expect(fields.find((field) => field.id === fieldId)).toMatchObject({
        value: "Monte Compatri",
        status: "ready",
        source: "Regola controllata",
        appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.officialMunicipalityCanonicalIdentity]),
      });
      expect(fields.find((field) => field.id === fieldId)?.note).toContain("058060");
      expect(fields.find((field) => field.id === fieldId)?.note).toContain("F477");
    }
  });

  it("mappa il nome storico Godiasco al Comune corrente soltanto tramite la fonte ufficiale", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.cf = "RNZRND49B18E072J";
    source.form.richiedente.data_nascita = "1949-02-18";
    source.form.richiedente.comune_nascita = "Godiasco";
    source.form.richiedente.provincia_nascita = "Pavia";
    const field = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "beneficiario.comune_nascita");

    expect(field).toMatchObject({
      value: "Godiasco Salice Terme",
      status: "ready",
      source: "Regola controllata",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.officialMunicipalityNameChange]),
    });
    expect(field?.note).toContain("018073");
    expect(field?.note).toContain("dait.interno.gov.it");
  });

  it("non applica la variazione ufficiale se nome e provincia non concordano", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.comune_nascita = "Godiasco";
    source.form.richiedente.provincia_nascita = "MI";
    const field = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "beneficiario.comune_nascita");

    expect(field?.value).toBe("Godiasco");
    expect(field?.appliedRuleIds ?? []).not.toContain(USER_AUTHORIZED_RULE_IDS.officialMunicipalityNameChange);
  });

  it("mappa i dati certi senza perdere i campi mancanti", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = result.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.cf")?.value).toBe("Intervento umano richiesto");
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

  it("corregge il solo refuso Viake in Viale su residenza e lavori", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.indirizzo = "Viake Sarca";
    source.form.residenza.stesso_indirizzo_lavori = true;
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    for (const fieldId of ["beneficiario.indirizzo_residenza", "immobile.indirizzo"]) {
      expect(fields.find((field) => field.id === fieldId)).toMatchObject({
        value: "Viale Sarca",
        source: "Regola controllata",
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.obviousStreetTypeTypoCorrection],
      });
    }
  });

  it("non modifica parole o tipi stradali che non sono il token Viake", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.residenza.indirizzo = "Via Kelvin";
    source.form.residenza.stesso_indirizzo_lavori = true;
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.indirizzo_residenza")).toMatchObject({
      value: "Via Kelvin",
      source: "Modulo cliente",
    });
    expect(fields.find((field) => field.id === "immobile.indirizzo")?.value).toBe("Via Kelvin");
  });

  it("crea le righe modificabili anche quando la fattura non viene letta", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = result.sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "schermature.0.dimensioni")).toMatchObject({
      status: "missing",
      editable: true,
    });
    expect(fields.find((field) => field.id === "schermature.1.gtot")).toMatchObject({
      value: "Intervento umano richiesto",
      source: "Regola controllata",
      status: "missing",
    });
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

    source.form.richiedente.cf = "RSSMRA80A41H501Y";
    fields = mapSchermaturaPractice(source).sections.flatMap((currentSection) => currentSection.fields);
    expect(fields.find((field) => field.id === "beneficiario.sesso")?.value).toBe("F");
  });

  it("prepara tutti i campi osservati nella pagina anagrafica del beneficiario", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.provincia_nascita = "RM";
    source.form.residenza.provincia = "Roma";
    const fields = mapSchermaturaPractice(source)
      .sections.flatMap((currentSection) => currentSection.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Italia",
      status: "ready",
      source: "Regola controllata",
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_residenza")?.status).toBe("ready");
    expect(fields.find((field) => field.id === "beneficiario.comune_residenza")?.value).toBe("Comune Demo Nord");
    expect(fields.find((field) => field.id === "beneficiario.indirizzo_residenza")?.value).toBe("Via Laboratorio");
    expect(fields.find((field) => field.id === "beneficiario.civico_residenza")?.value).toBe("24");
    expect(fields.find((field) => field.id === "beneficiario.cap_residenza")?.value).toBe("00001");
  });

  it("riconosce l'etichetta CRM Monza Brianza come provincia italiana esplicita", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.provincia_nascita = "Monza Brianza ";
    source.form.residenza.provincia = "Monza Brianza ";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({ value: "Italia", status: "ready" });
    expect(fields.find((field) => field.id === "beneficiario.nazione_residenza")).toMatchObject({ value: "Italia", status: "ready" });
  });

  it("regressione Capitanelli: usa il comune di nascita/residenza come ripiego quando la sigla provincia CRM non e' standard (es. 'ROM' invece di 'RM')", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.comune_nascita = "ROMA";
    source.form.richiedente.provincia_nascita = "ROM";
    source.form.residenza.comune = "ROMA";
    source.form.residenza.provincia = "ROM";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({ value: "Italia", status: "ready" });
    expect(fields.find((field) => field.id === "beneficiario.nazione_residenza")).toMatchObject({ value: "Italia", status: "ready" });
  });

  it("non deduce una nazione italiana dal solo comune quando ne' la provincia ne' il comune sono riconoscibili", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.comune_nascita = "Springfield";
    source.form.richiedente.provincia_nascita = "XX";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")?.status).not.toBe("ready");
  });

  it("risolve da fonte istituzionale Z600 come Argentina anche se il form riporta una provincia italiana", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Luciano Javier";
    source.form.richiedente.cognome = "Martinez";
    source.form.richiedente.cf = "MRTLNJ77L14Z600M";
    source.form.richiedente.data_nascita = "1977-07-14";
    source.form.richiedente.comune_nascita = "estero";
    source.form.richiedente.provincia_nascita = "Padova";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Argentina",
      status: "ready",
      source: "Regola controllata",
      appliedRuleIds: expect.arrayContaining(["user-2026-08-16-fiscal-code-identity-cross-check"]),
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")?.note)
      .toContain("anpr-stati-esteri-maeci-z600");
    expect(fields.find((field) => field.id === "beneficiario.comune_nascita")?.value).toBe("estero");
  });

  it("risolve da fonte istituzionale Z127 come Polonia per il caso Tychy", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Katarzyna Anna";
    source.form.richiedente.cognome = "Skalmierska";
    source.form.richiedente.cf = "SKLKRZ81D47Z127F";
    source.form.richiedente.data_nascita = "1981-04-07";
    source.form.richiedente.comune_nascita = "Tychy";
    source.form.richiedente.provincia_nascita = "EE";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Polonia",
      status: "ready",
      source: "Regola controllata",
      appliedRuleIds: expect.arrayContaining(["user-2026-08-16-fiscal-code-identity-cross-check"]),
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")?.note)
      .toContain("anpr-stati-esteri-maeci-z127");
    expect(fields.find((field) => field.id === "beneficiario.comune_nascita")?.value).toBe("Tychy");
  });

  it("risolve Z129 come Romania e non interpreta RO come provincia italiana", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Andreea Ioana";
    source.form.richiedente.cognome = "Olteanu";
    source.form.richiedente.cf = "LTNNRN87R57Z129Z";
    source.form.richiedente.data_nascita = "1987-10-17";
    source.form.richiedente.comune_nascita = "Romania";
    source.form.richiedente.provincia_nascita = "Ro";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Romania",
      status: "ready",
      source: "Regola controllata",
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")?.note)
      .toContain("anpr-stati-esteri-maeci-z129");
    expect(fields.find((field) => field.id === "beneficiario.comune_nascita")).toMatchObject({
      value: "Romania",
      status: "ready",
    });
  });

  it("risolve Z312 come RD del Congo e conserva Lubumbashi come luogo estero libero", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Kitenge";
    source.form.richiedente.cognome = "Ebambi";
    source.form.richiedente.cf = "BMBKNG66R44Z312Y";
    source.form.richiedente.data_nascita = "1966-10-04";
    source.form.richiedente.comune_nascita = "Lubumbashi COD";
    source.form.richiedente.provincia_nascita = "EE";
    const fields = mapSchermaturaPractice(source).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: expect.stringContaining("Congo"),
      status: "ready",
      source: "Regola controllata",
    });
    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")?.note)
      .toContain("anpr-stati-esteri-maeci-z312");
    expect(fields.find((field) => field.id === "beneficiario.comune_nascita")).toMatchObject({
      value: "Lubumbashi COD",
      status: "ready",
    });
  });

  it("separa il paese dal luogo estero quando il form li esporta nello stesso campo", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.nome = "Sebastian Costel";
    source.form.richiedente.cognome = "Volf";
    source.form.richiedente.cf = "VLFSS77S26Z129C";
    source.form.richiedente.data_nascita = "1977-11-26";
    source.form.richiedente.comune_nascita = "Bacau, Romania";
    source.form.richiedente.provincia_nascita = "esterno";
    const fields = mapSchermaturaPractice(source, undefined, {
      documentFiscalCode: "VLFSST77S26Z129C",
      documentFiscalCodeCoherentWithIdentity: true,
    }).sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === "beneficiario.nazione_nascita")).toMatchObject({
      value: "Romania",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "beneficiario.comune_nascita")).toMatchObject({
      value: "Bacau",
      source: "Modulo cliente",
      appliedRuleIds: expect.arrayContaining(["user-2026-08-16-fiscal-code-identity-cross-check"]),
    });
    expect(fields.find((field) => field.id === "beneficiario.comune_nascita")?.note).toContain("Bacau, Romania");
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

  it("usa il CF documentale solo se valido e dichiarato coerente con l'anagrafica", () => {
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      documentFiscalCode: "RSSMRA80A01H501U",
      documentFiscalCodeCoherentWithIdentity: true,
    });
    const field = result.sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "beneficiario.cf");
    expect(field).toMatchObject({
      value: "RSSMRA80A01H501U",
      source: "Fattura",
      status: "ready",
    });

    const unresolved = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], analysis, {
      documentFiscalCode: "RSSMRA80A01H501U",
      documentFiscalCodeCoherentWithIdentity: false,
    }).sections.flatMap((section) => section.fields)
      .find((candidate) => candidate.id === "beneficiario.cf");
    expect(unresolved).toMatchObject({ value: "Intervento umano richiesto", status: "missing" });
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
    expect(result.sections.flatMap((currentSection) => currentSection.fields)
      .find((field) => field.id === "schermature.risparmio_energia")).toMatchObject({
      value: "95,76 kWh/anno",
      source: "Regola controllata",
      status: "ready",
      note: expect.stringContaining("screening-energy-savings-v1"),
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
      value: "3,78 m²",
      source: "Calcolo ENEA",
      status: "ready",
    });
    expect(fields.find((field) => field.id === "schermature.1.superficie")?.value).toBe("1,5 m²");
    expect(fields.find((field) => field.id === "schermature.superficie_totale")?.value).toBe("5,28 m²");
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

  it("mappa la persiana con superficie finestrata uguale al singolo prodotto", () => {
    const persianaAnalysis: EneaLabDocumentAnalysis = {
      ...analysis,
      items: Array.from({ length: 2 }, (_, index) => ({
        widthMm: 1200 + index * 100,
        heightMm: 2450,
        surfaceM2: index === 0 ? 2.94 : 3.185,
        gTot: null,
        description: "Persiana in alluminio",
        sourcePath: "persiane.pdf",
      })),
    };
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], persianaAnalysis, {
      resolvedScreeningGTot: Array(2).fill({ value: 0.06, source: "authorized_fallback", ruleId: "user-2026-08-31-rigid-screening-missing-gtot-006-v1" }),
      resolvedScreeningMaterial: Array(2).fill({ value: "Metallo", ruleId: "user-2026-08-18-persiana-screening-contract-v1" }),
      resolvedScreeningRegulation: Array(2).fill({ value: "Manuale", ruleId: "user-2026-08-18-persiana-screening-contract-v1" }),
      resolvedProtectedWindowSurface: [
        { value: 2.94, source: "derived_product_surface", ruleId: "user-2026-08-18-persiana-screening-contract-v1" },
        { value: 3.185, source: "derived_product_surface", ruleId: "user-2026-08-18-persiana-screening-contract-v1" },
      ],
    });
    const fields = result.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.id === "schermature.0.tipo")?.value).toBe("Persiana");
    expect(fields.find((field) => field.id === "schermature.0.gtot")?.value).toBe("0,06");
    expect(fields.find((field) => field.id === "schermature.0.rsupp")).toMatchObject({ value: "0,17", status: "ready", source: "Regola controllata", appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.persianaScreening] });
    expect(fields.find((field) => field.id === "schermature.0.materiale")?.value).toBe("Metallo");
    expect(fields.find((field) => field.id === "schermature.0.superficie_finestrata")).toMatchObject({ value: "2,9 m²", status: "ready", testOnly: false });
    expect(fields.find((field) => field.id === "schermature.1.superficie_finestrata")).toMatchObject({ value: "3,2 m²", status: "ready", testOnly: false });
  });

  it("mappa l'avvolgibile come Persiane avvolgibili con tutti gli attributi persiana", () => {
    const avvolgibileAnalysis: EneaLabDocumentAnalysis = {
      ...analysis,
      items: [{ widthMm: 1200, heightMm: 2450, surfaceM2: 2.94, gTot: null, description: "Avvolgibile in alluminio", sourcePath: "avvolgibili.pdf" }],
    };
    const result = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], avvolgibileAnalysis, {
      resolvedScreeningGTot: [{ value: 0.06, source: "authorized_fallback", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening }],
      resolvedScreeningMaterial: [{ value: "Metallo", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening }],
      resolvedScreeningRegulation: [{ value: "Manuale", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening }],
      resolvedProtectedWindowSurface: [{ value: 2.94, source: "derived_product_surface", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening }],
    });
    const fields = result.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.id === "schermature.0.tipo")?.value).toBe("Persiane avvolgibili");
    expect(fields.find((field) => field.id === "schermature.0.gtot")?.value).toBe("0,06");
    expect(fields.find((field) => field.id === "schermature.0.materiale")?.value).toBe("Metallo");
    expect(fields.find((field) => field.id === "schermature.0.regolazione")?.value).toBe("Manuale");
    expect(fields.find((field) => field.id === "schermature.0.rsupp")).toMatchObject({ value: "0,17", status: "ready", appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.avvolgibileScreening] });
    expect(fields.find((field) => field.id === "schermature.0.superficie_finestrata")).toMatchObject({ value: "2,9 m²", status: "ready" });
  });
});
