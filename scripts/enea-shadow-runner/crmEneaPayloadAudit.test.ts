import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCrmEneaDraftPackage, buildCrmEneaPayloadAudit } from "./crmEneaPayloadAudit";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

const analysis = { items: [] } as never;

describe("audit payload ENEA da dossier CRM locale", () => {
  it("costruisce una persiana con il modulo Schermature anche se l'etichetta CRM dichiara Infissi", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "persiana-etichettata-infissi", completionDate: "2026-06-10", financialVerified: true, reconciledTotal: 1200,
      products: [{ description: "Persiana in alluminio", widthMm: 1200, heightMm: 2450, surfaceM2: 2.94, sourceDocumentKey: "scheda-persiana", declaredType: "persiana", exposure: "sud", protectedWindowSurfaceM2: 2.94, protectedWindowSurfaceSource: "derived_product_surface", supplementaryThermalResistance: 0.17, gTot: 0.08, gTotSource: "authorized_fallback", material: "Metallo", movement: "Manuale", appliedRuleIds: ["user-2026-08-18-persiana-screening-contract-v1"] }],
      analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000099", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", prodotto_installato: "Infissi", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" }, prodotto: { schermature: [{ tipo_prodotto: "altro", direzione: "sud" }] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.source.form.prodotto.tipo).toBe("schermature");
      const screeningFields = result.mapped.sections.flatMap((section) => section.fields).filter((field) => field.id.startsWith("schermature."));
      expect(screeningFields.length).toBeGreaterThan(0);
      expect(screeningFields.every((field) => field.appliedRuleIds?.includes("user-2026-08-23-documented-product-module-over-label"))).toBe(true);
      expect(screeningFields.find((field) => field.id === "schermature.0.dimensioni")?.value).toBe("1200 × 2450 mm");
      expect(screeningFields.find((field) => field.id === "schermature.0.gtot")).toMatchObject({ value: "0,08", status: "ready" });
      expect(result.documentAnalysis?.items).toEqual([expect.objectContaining({ sourcePath: "scheda-persiana", widthMm: 1200, heightMm: 2450, surfaceM2: 2.94, gTot: 0.08 })]);
      expect(result.issues.some((issue) => /^(?:unverified|invalid)-gtot/.test(issue.code))).toBe(false);
    }
  });
  it("conserva la pagina fattura in un allegato composito fattura+bonifico e ne audita la regola", () => {
    const directory = mkdtempSync(join(tmpdir(), "apr-composite-invoice-"));
    const textPath = join(directory, "allegato.txt");
    writeFileSync(textPath, `FATTURA IMMEDIATA\nNumero 123 del 10/06/2026\nTENDA DA SOLE cm 300 x 200\nGTOT 0,33\nTotale imponibile 909,09 EUR\nTotale IVA 90,91 EUR\nTotale documento 1.000,00 EUR\n\f\nBONIFICO AGEVOLAZIONI FISCALI\nImporto 1.000,00 EUR\nCommissioni 1,00 EUR\nTotale addebito 1.001,00 EUR`);
    const result = buildCrmEneaDraftPackage({
      customerKey: "composito", completionDate: "2026-06-10", financialVerified: true, reconciledTotal: 1000,
      products: [{ description: "Tenda da sole", declaredType: "tende_da_sole", exposure: "sud", gTot: 0.33, gTotSource: "invoice_explicit", material: "Tessuto", movement: "Manuale", appliedRuleIds: ["authorized-22-schermature-materiale", "authorized-16-schermature-meccanismo"] }],
      analysis: { items: [{ customerKey: "composito", kind: "invoice", documentKey: "allegato-composito", textPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" } }] } as never,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000011", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" }, prodotto: { schermature: [{ tipo_prodotto: "tende_da_sole", direzione: "sud" }] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.documentAnalysis?.items).toHaveLength(1);
      const screeningFields = result.mapped.sections.flatMap((section) => section.fields).filter((field) => field.id.startsWith("schermature."));
      expect(screeningFields.length).toBeGreaterThan(0);
      expect(screeningFields.every((field) => field.appliedRuleIds?.includes("system-composite-invoice-bank-transfer-page-segmentation"))).toBe(true);
    }
  });

  it("non trasforma un allegato esclusivamente bancario in una fattura tecnica", () => {
    const directory = mkdtempSync(join(tmpdir(), "apr-bank-only-"));
    const textPath = join(directory, "bonifico.txt");
    writeFileSync(textPath, "BONIFICO PER AGEVOLAZIONI FISCALI\nImporto operazione 1.000,00 EUR\nCommissioni 1,00 EUR\nTotale addebito 1.001,00 EUR");
    const result = buildCrmEneaDraftPackage({
      customerKey: "solo-bonifico", completionDate: "2026-06-10", products: [], financialVerified: false, reconciledTotal: null,
      analysis: { items: [{ customerKey: "solo-bonifico", kind: "invoice", documentKey: "solo-bonifico", textPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" } }] } as never,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000012", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") expect(result.documentAnalysis).toBeUndefined();
  });

  it("propaga la prima data fattura come inizio lavori con provenienza auditata", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "luca-callegari",
      startDate: "2026-04-22",
      startDateSource: "fattura-324-26",
      completionDate: "2026-06-15",
      products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000008", cliente_nome: "Luca", cliente_cognome: "Callegari", cliente_cf: "CLLLCU82D29G916U", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Luca", cognome: "Callegari", cf: "CLLLCU82D29G916U" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "intervento.data_inizio")).toMatchObject({
        value: "22/04/2026",
        source: "Fattura",
        status: "ready",
        appliedRuleIds: ["user-2026-08-18-invoice-work-date-chronology"],
      });
    }
  });
  it("resta fail-closed quando il dossier non è mappabile", () => {
    expect(buildCrmEneaPayloadAudit({ customerKey: "x", dossierValue: {}, completionDate: null, products: [], financialVerified: false, reconciledTotal: null, analysis }))
      .toMatchObject({ status: "source_unmappable", externalActionAllowed: false, blockerCount: 1 });
  });

  it("espone i campi mancanti senza abilitare il portale", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const result = buildCrmEneaPayloadAudit({
      customerKey: "cliente", completionDate: "2026-08-01", products: [{ description: "Tenda", declaredType: "tende_da_sole", exposure: "sud", gTot: 0.33, gTotSource: "authorized_fallback", material: "Tessuto", movement: "Manuale", appliedRuleIds: ["user-2026-08-14-tenda-screening-gtot-033-fallback", "authorized-22-schermature-materiale", "authorized-16-schermature-meccanismo"] }], financialVerified: true, reconciledTotal: 1000, analysis,
      dossierValue: { row: { id, cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", cliente_email: "mario@example.test", cliente_telefono: "3331234567", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], form_compilato_at: "2026-08-01T10:00:00Z", created_at: "2026-08-01T09:00:00Z", updated_at: "2026-08-01T10:00:00Z", pipeline_stages: { stage_type: "pronte_da_fare" }, companies: { ragione_sociale: "Demo" }, dati_form: { richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" }, residenza: { provincia: "RM", cap: 1234 }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [{ tipo_prodotto: "tende_da_sole", direzione: "sud" }] } } } },
    });
    expect(result).toMatchObject({ status: "payload_incomplete", externalActionAllowed: false });
    expect(result.blockerCount).toBeGreaterThan(0);
    expect(result.blockers.some((blocker) => blocker.fieldId?.startsWith("immobile.") || blocker.fieldId?.startsWith("impianto."))).toBe(true);
  });

  it("sostituisce nel pacchetto locale il CF form invalido con quello documentale gia verificato", () => {
    const resolvedTaxCode = "LRSMLA52B50D122C";
    const result = buildCrmEneaDraftPackage({
      customerKey: "amelia-lerose", resolvedTaxCode, completionDate: "2026-08-01", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000002", cliente_nome: "Amelia", cliente_cognome: "Lerose", cliente_cf: "LRSMLA52B50D222C", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "pronte_da_fare" }, dati_form: { richiedente: { nome: "Amelia", cognome: "Lerose", cf: "LRSMLA52B50D222C" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") expect(result.source.form.richiedente.cf).toBe(resolvedTaxCode);
  });
  it("propaga nel pacchetto il fallback verificato di una unita immobiliare", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "daniela-d-esposito", resolvedBuildingUnitCount: 1, completionDate: "2026-08-01", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000004", cliente_nome: "Daniela", cliente_cognome: "D'Esposito", cliente_cf: "RSSMRA80A01H501U", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Daniela", cognome: "D'Esposito", cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 0 }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") expect(result.source.form.edificio.numero_appartamenti).toBe("1");
  });

  it("mantiene edificio a unita unica quando la tipologia esplicita e casa singola", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "gianluigi-chiolini", resolvedBuildingUnitCount: 1, resolvedBuildingQualification: "single_unit", completionDate: "2026-08-01", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000007", cliente_nome: "Gianluigi", cliente_cognome: "Chiolini", cliente_cf: "CHLGGL70A01F205X", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Gianluigi", cognome: "Chiolini", cf: "CHLGGL70A01F205X" }, edificio: { numero_appartamenti: 1, tipologia: "casa_singola_o_plurifamiliare" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.source.form.edificio.tipologia).toBe("casa_singola_o_plurifamiliare");
      expect(result.mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "immobile.tipologia")).toMatchObject({
        value: "Casa singola o plurifamiliare",
        appliedRuleIds: ["user-2026-08-14-single-unit-building-over-floor-count"],
      });
    }
  });

  it("usa edificio plurimo quando il form indica oltre tre piani anche con una unita nella pratica", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "federigo-cileo", resolvedBuildingUnitCount: 1, resolvedBuildingQualification: "multi_unit", completionDate: "2026-08-01", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "4e4a8fd7-7169-4517-abd4-a59d88303935", cliente_nome: "Federigo", cliente_cognome: "Cileo", cliente_cf: "CLIFRG70A01F205X", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Federigo", cognome: "Cileo", cf: "CLIFRG70A01F205X" }, edificio: { numero_appartamenti: 1, tipologia: "edificio_oltre_3_piani" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      const fields = result.mapped.sections.flatMap((section) => section.fields);
      expect(result.source.form.edificio.tipologia).toBe("edificio_oltre_3_piani");
      expect(fields.find((field) => field.id === "immobile.tipologia")).toMatchObject({
        value: "Edificio oltre 3 piani (4+)",
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount],
      });
      expect(fields.find((field) => field.id === "intervento.ambito")).toMatchObject({
        value: "Singola unità immobiliare (in un edificio costituito da più unità immobiliari)",
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount],
      });
    }
  });

  it("annota con provenienza fattura l'esclusione del cointestatario presente solo nel form", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "lea-dettori", resolvedTaxCode: "DTTLEA66C62F205Q", resolvedCoBeneficiaryPresent: false,
      completionDate: "2026-08-01", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000003", cliente_nome: "Lea", cliente_cognome: "Dettori", cliente_cf: "DTTLEA66C62F205Q", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "pronte_da_fare" }, dati_form: { richiedente: { nome: "Lea", cognome: "Dettori", cf: "DTTLEA66C62F205Q" }, cointestazione: { presente: true, nome: "Luigi", cognome: "Bellenchia", cf: "BLLLGU65E28F205E" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.source.form.cointestazione).toEqual({ presente: false, nome: "", cognome: "", cf: "" });
      expect(result.mapped.sections.flatMap((section) => section.fields).find((field) => field.id === "beneficiario.cointestazione")).toMatchObject({
        value: "No", source: "Fattura", appliedRuleIds: ["user-2026-08-16-invoice-identity-over-customer-form"],
      });
    }
  });

  it("sostituisce nome e cognome principali con l'identita verificata in fattura", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "gianluigi-chiolini", resolvedTaxCode: "CHLGLG66A31F205C",
      resolvedPrimaryBeneficiary: { name: "Gianluigi", surname: "Chiolin", taxCode: "CHLGLG66A31F205C" },
      resolvedPrimaryBeneficiarySourceIds: ["invoice-gianluigi"],
      completionDate: "2026-07-22", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000010", cliente_nome: "Gianluigi", cliente_cognome: "Chiolini", cliente_cf: "CHLGLG66A31F205C", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Gianluigi", cognome: "Chiolini", cf: "CHLGLG66A31F205C" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.source.form.richiedente).toMatchObject({ nome: "Gianluigi", cognome: "Chiolin", cf: "CHLGLG66A31F205C" });
      const fields = result.mapped.sections.flatMap((section) => section.fields);
      expect(fields.find((field) => field.id === "beneficiario.cognome")).toMatchObject({
        value: "Chiolin", source: "Fattura", appliedRuleIds: ["user-2026-08-16-invoice-identity-over-customer-form", "user-2026-08-16-fiscal-code-identity-cross-check"],
      });
    }
  });

  it("inserisce nel pacchetto il cointestatario della fattura anche se il form lo omette", () => {
    const result = buildCrmEneaDraftPackage({
      customerKey: "luca-callegari", resolvedTaxCode: "CLLLCU82D29G916U", resolvedCoBeneficiaryPresent: true,
      resolvedCoBeneficiary: { name: "Maria Giovanna Angela", surname: "Pinna", taxCode: "PNNMGV84B43G203G", sourceIds: ["invoice-luca"] },
      completionDate: "2026-06-15", products: [], financialVerified: false, reconciledTotal: null, analysis,
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000006", cliente_nome: "Luca", cliente_cognome: "Callegari", cliente_cf: "CLLLCU82D29G916U", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, dati_form: { richiedente: { nome: "Luca", cognome: "Callegari", cf: "CLLLCU82D29G916U" }, cointestazione: { presente: false, nome: "", cognome: "", cf: "" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      expect(result.source.form.cointestazione).toEqual({ presente: true, nome: "Maria Giovanna Angela", cognome: "Pinna", cf: "PNNMGV84B43G203G" });
      expect(result.portalGate.status).toBe("blocked");
      const beneficiary = result.mapped.sections.flatMap((section) => section.fields).filter((field) => field.id.startsWith("beneficiario.cointestatario"));
      expect(beneficiary).toHaveLength(3);
      expect(beneficiary.every((field) => field.source === "Fattura" && field.appliedRuleIds?.includes("user-2026-08-17-invoice-co-beneficiary-person-flow"))).toBe(true);
    }
  });

  it("propaga fallback Linea Sole Potito nei campi con valore, fonte e regola", () => {
    const ruleId = "user-2026-08-17-linea-sole-potito-paper-form-fallbacks";
    const result = buildCrmEneaDraftPackage({
      customerKey: "liliana-gloria", completionDate: "2026-06-30", financialVerified: true, reconciledTotal: 3663, analysis,
      products: [{ description: "Tenda da sole a bracci", declaredType: "tende_da_sole", exposure: "sud", exposureSource: "linea_sole_potito_fallback", protectedWindowSurfaceM2: 2.7, protectedWindowSurfaceSource: "linea_sole_potito_fallback", gTot: 0.11, gTotSource: "invoice_explicit", material: "Tessuto", movement: "Automatico", appliedRuleIds: [ruleId, "authorized-22-schermature-materiale", "authorized-16-schermature-meccanismo"] }],
      dossierValue: { row: { id: "00000000-0000-4000-8000-000000000005", cliente_nome: "Liliana", cliente_cognome: "Gloria", cliente_cf: "GLRLLN73B60A089P", prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" }, companies: { ragione_sociale: "Linea sole potito" }, dati_form: { richiedente: { nome: "Liliana", cognome: "Gloria", cf: "GLRLLN73B60A089P" }, prodotto: { schermature: [] } } } },
    });
    expect(result.status).toBe("built");
    if (result.status === "built") {
      const fields = result.mapped.sections.flatMap((section) => section.fields);
      expect(fields.find((field) => field.id === "schermature.0.esposizione")).toMatchObject({ value: "Sud", source: "Regola controllata", appliedRuleIds: [ruleId] });
      expect(fields.find((field) => field.id === "schermature.0.superficie_finestrata")).toMatchObject({ value: "2,7 m²", source: "Regola controllata", appliedRuleIds: [ruleId] });
    }
  });
});
