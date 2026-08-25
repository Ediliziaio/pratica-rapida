import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { CASE_SPECIFIC_FINANCIAL_RESOLUTIONS, PersistentAprCrmLocalPreflight, assessEnea2026SubmissionDeadline, buildCrmLocalPreflightReport, completionDateOperatorBlockers, invalidateCrmEneaPayloadAuditForScreeningBlockers, isPersianaDimensionPlausible, missingExplicitAdvanceInvoiceReferences, resolveBundledProfessionalExpense, resolveCoBeneficiaryFromOriginalInvoices, resolveFormScreeningMappings, resolveInvoiceWorkDates, resolveOriginalDocumentFiscalCode, resolvePrimaryBeneficiaryFromOriginalInvoices, resolveProductTechnicalAttributes, screeningProductMeasurementEvidenceStatus } from "./crmLocalPreflight";
import type { CrmEneaPayloadAuditResult } from "./crmEneaPayloadAudit";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("preflight locale durevole fino a quindici dossier CRM", () => {
  const readyScreeningAudit = (): CrmEneaPayloadAuditResult => ({
    status: "payload_complete",
    mappingFingerprint: "mapping-screening-ready",
    fieldSummary: { ready: 12, review: 0, missing: 0 },
    requiredPortalFieldCount: 12,
    blockerCount: 0,
    blockers: [],
    excludedUnverifiedFields: [],
    draftReady: true,
    officialSubmissionAllowed: false,
    portalGate: {
      status: "ready",
      reason: null,
      workflowFingerprint: "workflow-screening-ready",
      supportedPages: ["Schermature solari"],
      screeningItemCount: 1,
      saveAllowedOnlyBySeparateCapability: true,
      previewAllowed: false,
      submitAllowed: false,
    },
    externalActionAllowed: false,
    reason: "Payload pronto.",
  });

  it("invalida l'audit Schermature quando il preflight blocca una misura della componente", () => {
    expect(invalidateCrmEneaPayloadAuditForScreeningBlockers(readyScreeningAudit(), [{
      code: "avvolgibile_measurement_ambiguous_2",
      field: "screenings.2.dimensions",
      reason: "Misura avvolgibile ambigua.",
      sourceIds: ["invoice-1"],
      appliedRuleIds: ["system-apr-operator-intervention-routing"],
    }])).toMatchObject({
      status: "payload_incomplete",
      blockerCount: 1,
      draftReady: false,
      blockers: [{ code: "avvolgibile_measurement_ambiguous_2", fieldId: "screenings.2.dimensions" }],
      portalGate: { status: "blocked", workflowFingerprint: null, supportedPages: [] },
    });
  });

  it("non invalida l'audit Schermature per un blocker estraneo alla componente", () => {
    const audit = readyScreeningAudit();
    expect(invalidateCrmEneaPayloadAuditForScreeningBlockers(audit, [{
      code: "beneficiary_identity_conflict",
      field: "beneficiary.taxCode",
      reason: "Identita non coerente.",
      sourceIds: ["invoice-1"],
      appliedRuleIds: ["system-apr-operator-intervention-routing"],
    }])).toBe(audit);
  });

  it("mantiene il materiale dell'avvolgibile isolato dalle righe Infissi della stessa fattura", () => {
    const result = resolveProductTechnicalAttributes("Tapparella in alluminio", "Infissi PVC esterno bianco", null);
    expect(result).toMatchObject({ material: "Metallo", gTot: 0.08, ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening });
  });

  it("non deduplica prodotti fisici identici provenienti da una scheda tecnica", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/crmLocalPreflight.ts"), "utf8");
    expect(source).toContain("existingTechnicalSignatureCounts");
    expect(source).not.toContain("technicalSignatures.has(signature)");
  });

  it("distingue misure prodotto mancanti dalle sole misure della finestra protetta", () => {
    expect(screeningProductMeasurementEvidenceStatus(["Fattura 233/2026 del 01/07/2026: tenda cassonata a scomparsa tessuto Tempotest"], ["Dimensioni prodotto\nDimensioni finestra protetta\n140/240 cm"])).toBe("missing");
    expect(screeningProductMeasurementEvidenceStatus(["Fattura: tenda da sole dimensioni 300 x 250 cm"])).toBe("present");
    expect(screeningProductMeasurementEvidenceStatus(["Fattura: posa e trasporto"])).toBe("not_applicable");
  });
  it("richiede la fattura di acconto citata e sottratta quando non e presente fra le fonti fiscali", () => {
    const balance = { sourceId: "saldo-1512", documentNumber: "1512", referencedInvoiceNumbers: ["320"], text: "Totale complessivo fornitura e posa 9.010,00 - Fatt.acconto nr. 320 del 30/11/2025" };
    expect(missingExplicitAdvanceInvoiceReferences([balance])).toEqual([{ sourceId: "saldo-1512", reference: "320" }]);
    expect(missingExplicitAdvanceInvoiceReferences([balance, { sourceId: "acconto-320", documentNumber: "320", referencedInvoiceNumbers: [], text: "Fattura di acconto" }])).toEqual([]);
    expect(missingExplicitAdvanceInvoiceReferences([{ ...balance, referencedInvoiceNumbers: [], text: "Totale documento 9.010,00" }])).toEqual([]);
  });

  it("manda all'operatore fine lavori oltre 90 giorni e anno portale incompatibile senza inventare date", () => {
    const blockers = completionDateOperatorBlockers("2025-12-16", "fattura-2025", false, new Date("2026-08-23T12:00:00Z"));
    expect(blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "completion_date_portal_year_mismatch", sourceIds: ["fattura-2025"], appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.completionPortalYearOperatorGate, USER_AUTHORIZED_RULE_IDS.missingCompletionDate]) }),
      expect.objectContaining({ code: "completion_over_90_days_operator_required", sourceIds: ["fattura-2025"], appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.completionOver90OperatorGate]) }),
    ]));
    expect(blockers.map((item) => item.reason).join(" ")).toContain("2025-12-16");
    expect(completionDateOperatorBlockers("2026-08-01", "form", true, new Date("2026-08-23T12:00:00Z"))).toEqual([]);
  });
  it("applica esattamente la finestra ENEA 2026 dal 25 giugno al 23 settembre", () => {
    const inside = assessEnea2026SubmissionDeadline("2026-02-04", "2026-06-24", new Date("2026-09-23T12:00:00Z"));
    expect(inside).toMatchObject({ specialWindowApplied: true, calculationStartDate: "2026-06-25", deadlineDate: "2026-09-23", elapsedDays: 90, withinDeadline: true });
    expect(completionDateOperatorBlockers("2026-06-24", "fine", true, new Date("2026-09-23T12:00:00Z"), "2026-02-04", "inizio")).toEqual([]);

    const expired = completionDateOperatorBlockers("2026-06-24", "fine", true, new Date("2026-09-24T12:00:00Z"), "2026-02-04", "inizio");
    expect(expired).toEqual([expect.objectContaining({ code: "completion_over_90_days_operator_required", sourceIds: ["fine", "inizio"], appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.enea2026June25NinetyDayWindow]) })]);
    expect(expired[0].reason).toContain("termine 23/09/2026");
  });
  it("non estende la finestra a inizio lavori antecedente al 4 febbraio o fine lavori dal 25 giugno", () => {
    expect(assessEnea2026SubmissionDeadline("2026-02-03", "2026-02-05", new Date("2026-08-23T12:00:00Z")).specialWindowApplied).toBe(false);
    expect(completionDateOperatorBlockers("2026-02-05", "fine", true, new Date("2026-08-23T12:00:00Z"), "2026-02-03", "inizio")).toEqual([expect.objectContaining({ code: "completion_over_90_days_operator_required" })]);
    expect(assessEnea2026SubmissionDeadline("2026-02-04", "2026-06-25", new Date("2026-08-23T12:00:00Z")).specialWindowApplied).toBe(false);
  });
  it("non trasforma un lordo con Pratica ENEA compresa in spesa tecnica senza ripartizione", () => {
    const texts = [
      { sourceId: "fattura-104", text: "Totale Fattura € 375,00\nPratica Enea compresa" },
      { sourceId: "fattura-202", text: "Totale Fattura € 875,00\nPratica Enea compresa" },
    ];
    expect(resolveBundledProfessionalExpense(texts, 1250)).toMatchObject({
      status: "operator_required",
      eligibleTechnicalExpense: null,
      markers: [{ sourceId: "fattura-104" }, { sourceId: "fattura-202" }],
    });
  });

  it("applica €1.250 a Elisa senza esclusioni come risoluzione caso-specifica auditata", () => {
    const resolution = CASE_SPECIFIC_FINANCIAL_RESOLUTIONS[0];
    const result = resolveBundledProfessionalExpense([{ sourceId: "fattura-202", text: "Pratica Enea compresa" }], 1250, resolution);
    expect(result).toMatchObject({ status: "resolved_case_specific", eligibleTechnicalExpense: 1250, excludedUnclassifiedExpense: 0 });
    expect(result.resolution?.reason).toContain("nessun importo deve essere escluso");
    expect(result.resolution?.appliedRuleIds).toEqual(expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation, USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume]));
    expect(resolveBundledProfessionalExpense([{ sourceId: "altra", text: "Pratica Enea compresa" }], 1400, resolution)).toMatchObject({ status: "operator_required" });
  });

  it("esclude una fattura professionale ENEA separata quando importo e natura sono documentati", () => {
    expect(resolveBundledProfessionalExpense([
      { sourceId: "fattura-infissi-61", text: "Fornitura e posa infissi", grossTotal: 1899.70 },
      { sourceId: "fattura-enea-91", text: "OGGETTO\nPratica ENEA\nPratica ENEA Ecobonus\nassistenza alla raccolta documentale e invio pratica", grossTotal: 305 },
      { sourceId: "fattura-infissi-89", text: "Fornitura e posa infissi", grossTotal: 771.40 },
      { sourceId: "fattura-infissi-85", text: "Fornitura e posa infissi", grossTotal: 1139.82 },
    ], 4115.92)).toMatchObject({
      status: "resolved_documented_separation",
      eligibleTechnicalExpense: 3810.92,
      excludedUnclassifiedExpense: 305,
      documentedProfessionalInvoices: [{ sourceId: "fattura-enea-91", amount: 305 }],
    });
  });

  it("riconcilia Elisa a €1.250 e audita senza blocco la sola dicitura fiscale diversa", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-elisa-financial-regression-")); directories.push(root);
    const invoiceAdvance = path.join(root, "fattura-104.txt");
    const invoiceBalance = path.join(root, "fattura-202.txt");
    const transferAdvance = path.join(root, "bonifico-104.txt");
    const transferBalance = path.join(root, "bonifico-202.txt");
    writeFileSync(invoiceAdvance, `Vans Tappezzeria SRLS\nfattura 104/2026 del 02/04/2026\nMoro Elisa MROLSE87T64L407J\nFattura di acconto per fornitura e posa da effettuare di n. 2 tende verticali e n.1 tenda da sole\nN. 1 Tenda verticale L.88,8xh.164\nN. 1 Tenda verticale L.87xh.248\nN. 1 Tenda da sole L.80xh.160\nPratica Enea compresa\nG TOT 0,10\nTotale imponibile € 307,38\nImporto Iva € 67,62\nTotale Fattura € 375,00`);
    writeFileSync(invoiceBalance, `Vans Tappezzeria SRLS\nfattura 202/2026 del 19/06/2026\nMoro Elisa MROLSE87T64L407J\nFattura a saldo per fornitura e posa di n. 2 tende verticali e n.1 tenda da sole\nN. 1 Tenda verticale L.88,8xh.164\nN. 1 Tenda verticale L.87xh.248\nN. 1 Tenda da sole L.80xh.160\n-acconto ricevuto rif. ns. fatt. n. 104 del 2.4.26\nPratica Enea compresa\nG TOT 0,10\nTotale imponibile € 717,21\nImporto Iva € 157,79\nTotale Fattura € 875,00`);
    writeFileSync(transferAdvance, `BONIFICO AGEVOLAZIONE FISCALE\nImporto: 375,00 €\nCausale/N.fattura: Acconto su fattura 104 2026\nTipo detrazione: Ristrutturazione edilizia\nArt. 16-bis, D.P.R. n. 917/1986 Ristr. Edil.`);
    writeFileSync(transferBalance, `BONIFICO AGEVOLAZIONE FISCALE\nImporto: 875,00 €\nCausale/N.fattura: SALDO FATTURA 202 2026\nTipo detrazione: Risparmio energetico\nL. 296/06 e succ. mod. e proroghe Risp.Energ.`);
    const items = [
      ["invoice-104", invoiceAdvance], ["invoice-202", invoiceBalance], ["transfer-104", transferAdvance], ["transfer-202", transferBalance],
    ].map(([documentKey, textPath]) => ({ documentKey, customerKey: "elisa-moro", kind: "invoice", state: "analyzed", textPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] }));
    const row = { id: "d7aedc6e-d886-44b7-8925-25202ca90877", cliente_cf: "MROLSE87T64L407J", dati_form: {
      richiedente: { nome: "Elisa", cognome: "Moro", data_nascita: "1987-12-24", cf: "MROLSE87T64L407J" },
      edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [
        { tipo_prodotto: "altro", direzione: "est" }, { tipo_prodotto: "altro", direzione: "sud-ovest" }, { tipo_prodotto: "tende_da_sole", direzione: "est" },
      ] },
    } };
    const report = buildCrmLocalPreflightReport({ row }, "elisa-moro", { items } as never, new Date("2026-08-18T18:20:00+02:00"));
    expect(report.financial).toMatchObject({ invoiceTotal: 1250, eligibleExpense: 1250, reconciledTotal: 1250, bankTransferReconciliation: { status: "reconciled", principalTotal: 1250, referenceStatus: "verified" } });
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "bundled_professional_expense_case_specific_resolution" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "bank_transfer_tax_relief_label_audited_nonblocking",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.bankTransferTaxReliefLabelNonBlocking]),
    }));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "bank_transfer_tax_relief_type_conflicts_with_ecobonus" }));

    const partialTransferReport = buildCrmLocalPreflightReport({ row }, "elisa-moro", {
      items: items.filter((item) => item.documentKey !== "transfer-104"),
    } as never, new Date("2026-08-18T18:20:00+02:00"));
    expect(partialTransferReport.financial).toMatchObject({
      invoiceTotal: 1250,
      bankTransferReconciliation: { status: "principal_below_invoices", principalTotal: 875, referenceStatus: "incomplete" },
    });
    expect(partialTransferReport.blockers).not.toContainEqual(expect.objectContaining({ code: "bank_transfer_invoice_cross_check_failed" }));
    expect(partialTransferReport.warnings).toContainEqual(expect.objectContaining({
      code: "bank_transfer_below_invoice_total_audited_nonblocking",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers]),
    }));
  });

  it("usa tutte le fatture fiscali uniche per prima data di inizio e ultima data di fine", () => {
    expect(resolveInvoiceWorkDates([
      { sourceId: "fattura-saldo", documentDate: "2026-06-15" },
      { sourceId: "fattura-acconto", documentDate: "2026-04-22" },
      { sourceId: "fattura-consegna", documentDate: "2026-06-15" },
      { sourceId: "senza-data", documentDate: null },
    ])).toEqual({
      startDate: "2026-04-22",
      startDateSource: "fattura-acconto",
      completionDate: "2026-06-15",
      completionDateSource: "fattura-saldo",
    });
  });

  it("separa la struttura in alluminio dal telo Tessuto e riconosce il motore nella regressione Tommaso Cecchi", () => {
    const resolved = resolveProductTechnicalAttributes(
      "Tenda a caduta verticale 3400 x 1500",
      "PROTEZIONE TELO E STRUTTURA IN ALLUMINIO COLORE MARRONE RAL 8017, TESSUTO TEMPOTEST 7, MANT TIPO C H 25 CM, COMANDO MOTORIZZATO CON RADIOCOMANDO",
      0.02,
    );
    expect(resolved).toMatchObject({
      material: "Tessuto",
      materialSource: "invoice_explicit",
      movement: "Automatico",
      movementSource: "invoice_explicit",
      gTot: 0.02,
      source: "invoice_explicit",
    });
    expect(resolved?.attributeRuleIds).toEqual(expect.arrayContaining([
      USER_AUTHORIZED_RULE_IDS.screeningSurfaceMaterialOverSupportStructure,
      USER_AUTHORIZED_RULE_IDS.explicitMotorizedScreeningMovement,
    ]));
    expect(resolved?.attributeRuleIds).not.toContain(USER_AUTHORIZED_RULE_IDS.explicitCompositeScreeningMaterial);
    expect(resolved?.materialAudit).toMatchObject({ supportMaterialIgnored: true, screeningMaterialFamilies: ["textile_polymer"] });
  });
  it("usa Misto soltanto quando i materiali diversi appartengono alla schermatura stessa", () => {
    const resolved = resolveProductTechnicalAttributes(
      "Schermatura solare composita",
      "SCHERMATURA CON LAMELLE IN ALLUMINIO E TELO IN TESSUTO",
      0.12,
    );
    expect(resolved).toMatchObject({ material: "Misto", materialSource: "invoice_explicit" });
    expect(resolved?.attributeRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.explicitCompositeScreeningMaterial);
    expect(resolved?.attributeRuleIds).not.toContain(USER_AUTHORIZED_RULE_IDS.screeningSurfaceMaterialOverSupportStructure);
  });
  it("prepara una coorte di quindici dossier con ID e checkpoint distinti", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-fifteen-")); directories.push(root);
    const acquired = Array.from({ length: 15 }, (_, index) => {
      const dossierPath = path.join(root, `dossier-${index + 1}.json`);
      writeFileSync(dossierPath, JSON.stringify({ row: { id: `practice-${index + 1}` } }));
      return { customerKey: `case-${index + 1}`, displayName: `Caso ${index + 1}`, state: "acquired", practiceId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, dossierPath };
    });
    const preflight = new PersistentAprCrmLocalPreflight(root, new PersistentAprCrmDocumentAnalysis(root));
    const prepared = preflight.prepare(acquired as never, "a".repeat(64), new Date("2026-08-17T17:35:00Z"));
    expect(prepared).toMatchObject({ status: "queued", sourceFingerprint: "a".repeat(64) });
    expect(prepared.items).toHaveLength(15);
    expect(new Set(prepared.items.map((item) => item.practiceId)).size).toBe(15);
    const completed = preflight.runToCompletion(new Date("2026-08-17T17:36:00Z"));
    expect(completed.status).toBe("completed");
    expect(completed.items).toHaveLength(15);
    expect(completed.items.every((item) => item.state === "blocked_case")).toBe(true);
  });
  it("accetta il modulo cartaceo Linea Sole Potito e applica fallback solo alle righe senza dati espliciti", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-linea-sole-paper-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt"); const formPath = path.join(root, "modulo.txt"); const transferPath = path.join(root, "bonifici.txt");
    writeFileSync(invoicePath, `Fattura n. 252 del 30/06/2026
1 Tenda da Sole S/81E Pantografo a bracci Saldo
L3400x1800
2 550,00 22 1.100,00
9 GHOT TENDA 0,11
Imponibile 3.002,46
IVA 660,54
Totale documento 3.663,00 €`);
    writeFileSync(formPath, `Compilazione a cura del richiedente la detrazione
PERSONA FISICA
MARIO ROSSI RSSMRA80A01H501U
Nome ____ Cognome ____ Codice Fiscale ____
ROMA RM 01 01 1980
Luogo di nascita ____ Prov. ____ Data di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO
VIA ROMA 1
Indirizzo ____
ROMA RM 00100
Comune ____ Prov. ____ Cap ____
INSTALLAZIONE DI SCHERMATURE SOLARI
Pag. 5/5`);
    writeFileSync(transferPath, `Presa in carico - Bonifico per Agevolazioni Fiscali
fattura n.208/2026 del 23/06/2026
Importo
Commissioni
1.831,50 Euro
0,00 Euro
Totale operazione
1.831,50 Euro
\f
Presa in carico - Bonifico per Agevolazioni Fiscali
Pag. ft 252/2026 del 20/07/2026 saldo
Importo
Commissioni
1.831,50 Euro
0,00 Euro
Totale operazione
1.831,50 Euro`);
    const report = buildCrmLocalPreflightReport({ row: { id: "linea-practice-1", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", prodotto_installato: "Schermature Solari", companies: { ragione_sociale: "Linea sole potito" }, dati_form: {} } }, "mario-rossi", { items: [
      { documentKey: "invoice-linea", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "paper-form-linea", customerKey: "mario-rossi", kind: "additional", state: "analyzed", textPath: formPath, extractionMode: "native_text", invoiceResult: null, screeningItems: [] },
      { documentKey: "bank-composite-linea", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: transferPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ] } as never, new Date("2026-08-17T10:00:00Z"));
    expect(report.formAvailable).toBe(true);
    expect(report.blockers.map((item) => item.code)).not.toContain("customer_form_missing");
    expect(report.products).toHaveLength(2);
    expect(report.products.every((product) => product.exposure === "sud" && product.exposureSource === "linea_sole_potito_fallback")).toBe(true);
    expect(report.products.every((product) => (product.protectedWindowSurfaceM2 ?? 0) >= 2 && (product.protectedWindowSurfaceM2 ?? 0) <= 2.9)).toBe(true);
    expect(report.products.every((product) => product.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm))).toBe(true);
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "linea_sole_potito_paper_form_accepted" }));
    expect(report.financial).toMatchObject({ invoiceTotal: 3663, bankTransferReconciliation: { status: "reconciled", principalTotal: 3663, difference: 0 } });
  });
  it("non scarta le fatture quando lo stesso PDF composito contiene anche il bonifico", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-composite-invoice-transfer-")); directories.push(root);
    const documentPath = path.join(root, "fattura-e-bonifico.txt"); const formPath = path.join(root, "modulo.txt");
    writeFileSync(documentPath, `LINEA SOLE POTITO SRL
FATTURA nr. 229/2026 del 01/07/2026
CLIENTE ALICE MOLINARIS C.F. MLNLCA95A58F205J
S/20222 scomparsa totale L 3600x2750 tessuto tempotest 426
SALDO per fornitura tenda da sole modello S/20222
GHOT 0,12
Totale imponibile 1.150,00 EUR
Totale IVA 115,00 EUR
Totale documento 1.265,00 EUR
\fEseguito - Bonifico per Agevolazioni Fiscali
Importo 1.265,00 EUR
C.F./P.IVA del beneficiario 03397500962
C.F./P.IVA del fruitore della detrazione MLNLCA95A58F205J
Saldo tenda da sole - ALICE MOLINARIS`);
    writeFileSync(formPath, `Compilazione a cura del richiedente la detrazione
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D'INTERVENTO
DATI IDENTIFICATIVI IMPIANTO TERMICO ESISTENTE
PraticaRapida
Pag. 2/5`);
    const report = buildCrmLocalPreflightReport({ row: { id: "alice-practice", cliente_nome: "Alice", cliente_cognome: "Molinaris", cliente_cf: "MLNLCA95A58F205J", companies: { ragione_sociale: "Linea Sole Potito" }, dati_form: {} } }, "alice-molinaris", { items: [
      { documentKey: "composite", customerKey: "alice-molinaris", kind: "invoice", state: "analyzed", textPath: documentPath, textSha256: "same-content", extractionMode: "macos_vision_ocr", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "composite-copy", customerKey: "alice-molinaris", kind: "invoice", state: "analyzed", textPath: documentPath, textSha256: "same-content", extractionMode: "macos_vision_ocr", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "paper-form", customerKey: "alice-molinaris", kind: "additional", state: "analyzed", textPath: formPath, extractionMode: "macos_vision_ocr", invoiceResult: null, screeningItems: [] },
    ] } as never, new Date("2026-08-23T12:00:00Z"));
    expect(report.formAvailable).toBe(true);
    expect(report.products).toEqual([expect.objectContaining({ widthMm: 3600, heightMm: 2750, gTot: 0.12 })]);
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "original_invoice_missing_or_unavailable" }));
    expect(report.financial.invoiceTotal).toBe(1265);
  });
  it("somma acconto e saldo economici ma conserva una sola riga tecnica", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-acconto-saldo-")); directories.push(root);
    const textPath = path.join(root, "fatture.txt");
    writeFileSync(textPath, `Fattura n. 175/26 del 29/05/2026
Cliente Mario Rossi CF RSSMRA80A01H501U
N.1 Tenda a movimento verticale L.380xh.210 G TOT 0,13
Totale imponibile 454,92\nImporto Iva 100,08\nTotale Fattura 555,00\nNetto a pagare 555,00
\fFattura n. 237/26 del 09/07/2026
Cliente Mario Rossi CF RSSMRA80A01H501U
N.1 Tenda a movimento verticale L.380xh.210 G TOT 0,13
acconto ricevuto rif. ns. fattura n. 175 del 29.5.26
Totale imponibile 1.061,48\nImporto Iva 233,53\nTotale Fattura 1.295,01\nNetto a pagare 1.295,01`);
    const report = buildCrmLocalPreflightReport({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" },
      edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [{ tipo_prodotto: "tende_da_sole", direzione: "sud" }] },
    } } }, "mario-rossi", { items: [{ documentKey: "invoice-multipage", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath, extractionMode: "macos_vision_ocr", invoiceResult: { documentType: "invoice" }, screeningItems: [] }] } as never, new Date("2026-08-16T10:00:00Z"));
    expect(report.products).toHaveLength(1);
    expect(report).toMatchObject({ completionDate: "2026-07-09", financial: { invoiceTotal: 1850.01, eligibleExpense: 1850.01, reconciledTotal: 1850.01, tripleReconciliationVerified: true } });
    expect(report.financial.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum);
  });
  it("rende lavorabile Lucia Lagrasta usando il lordo IVA incluso della seconda pagina", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-lagrasta-")); directories.push(root);
    const textPath = path.join(root, "fattura-161.txt");
    writeFileSync(textPath, `FATTURA nr. 161/2026 del 12/06/2026
CF LGRLCU90T52B149V DESTINATARIO Lagrasta Lucia
Tenda da sole GTOT TESSUTO 0,13 MISURA 450 X 200
Zanzariera MISURA 110,3 X 149,7
Zanzariera MISURA 106,5 X 149,2
Zanzariera MISURA 103 X 239,3
RIEPILOGO IVA IMPORTO LORDO IMPOSTE
22% 2.040,00 € 367,87
10% 1.100,00 € 100,00
Imponibile € 2.672,13
Totale IVA € 467,87
€ 3.140,00
Fattura nr. 161/2026 del 12/06/2026 - 2 / 2`);
    const report = buildCrmLocalPreflightReport({ row: { cliente_cf: "LGRLCU90T52B149V", dati_form: {
      richiedente: { nome: "Lucia", cognome: "Lagrasta", data_nascita: "1990-12-12", cf: "LGRLCU90T52B149V", abitazione_principale: true },
      edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [{ tipo_prodotto: "tende_da_sole", direzione: "ovest" }] },
    } } }, "lucia-lagrasta", { items: [{ documentKey: "invoice-lagrasta", customerKey: "lucia-lagrasta", kind: "invoice", state: "analyzed", textPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] }] } as never, new Date("2026-08-16T10:00:00Z"));
    expect(report.products).toHaveLength(4);
    expect(report).toMatchObject({ outcome: "blocked_case", financial: { invoiceTotal: 3140, eligibleExpense: 3140, reconciledTotal: 3140, tripleReconciliationVerified: true } });
    expect(report.blockers).toContainEqual(expect.objectContaining({ code: "draft_payload_mapping_incomplete" }));
  });
  it("esclude dal preflight un'immagine non fiscale anche se un checkpoint precedente conserva un risultato parser", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-logo-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt"); const logoPath = path.join(root, "logo.txt");
    writeFileSync(invoicePath, `Fattura n. 1 del 01/08/2026
Cliente Mario Rossi CF RSSMRA80A01H501U
N.1 Tenda a movimento verticale L.300xh.200 G TOT 0,13
Importo prodotti o servizi 750,00 €
Totale imponibile 750,00 €
Totale IVA 165,00 €
Totale documento 915,00 €`);
    writeFileSync(logoPath, "PraticaRapida");
    const report = buildCrmLocalPreflightReport({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" },
      edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [{ tipo_prodotto: "tende_da_sole", direzione: "sud" }] },
    } } }, "mario-rossi", { items: [
      { documentKey: "invoice-real", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoicePath, extractionMode: "native_text", nonFiscalImageExcluded: false, invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "logo-stale-result", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: logoPath, extractionMode: "macos_vision_ocr", nonFiscalImageExcluded: true, invoiceResult: { documentType: "unknown" }, screeningItems: [] },
    ] } as never, new Date("2026-08-17T10:00:00Z"));
    expect(report.financial).toMatchObject({ invoiceTotal: 915, reconciledTotal: 915, tripleReconciliationVerified: true });
    expect(report.sourceIds).toContain("invoice-real");
    expect(report.sourceIds).not.toContain("logo-stale-result");
  });
  it("applica una risposta millimetri solo alla pratica e ricostruisce il prodotto 1:1", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" },
      edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [{ tipo_prodotto: "Pergotenda", direzione: "Sud" }] },
    } } }, "enrica-moretti", { items: [] } as never, new Date("2026-08-16T10:02:00Z"), {
      questionId: "unit:enrica-moretti:source-order", customerKey: "enrica-moretti", sourceId: "source-order-1504dp", description: "Pergotenda S120", rawWidth: 2850, rawHeight: 2800, unit: "millimeters", note: "Misure in millimetri", operatorId: "operatore", commandId: "answer:enrica:mm:1", answeredAt: "2026-08-16T10:01:00Z",
    });
    expect(report.products).toContainEqual(expect.objectContaining({ widthMm: 2850, heightMm: 2800, surfaceM2: 7.98, gTot: 0.08, sourceDocumentKey: "source-order-1504dp" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "operator_measurement_unit_applied", appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume] }));
  });
  it("esclude il cointestatario presente solo nel form quando le fatture identificano un solo beneficiario", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-co-beneficiary-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nLEA DETTORI\nC.F.: DTTLEA66C62F205Q\nPRODOTTI E SERVIZI");
    const analysis = { items: [{ documentKey: "invoice-lea", customerKey: "lea-dettori", kind: "invoice", state: "analyzed", textPath: invoice }] } as never;
    const mainDocumentFiscalCode = { status: "verified" as const, value: "DTTLEA66C62F205Q", sourceIds: ["invoice-lea"], candidates: ["DTTLEA66C62F205Q"] };

    expect(resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "lea-dettori",
      coOwnership: { presente: true, nome: "Luigi", cognome: "Bellenchia", cf: "BLLLGU65E28F205E" },
      mainDocumentFiscalCode,
      analysis,
    })).toEqual({ status: "excluded_by_invoice", present: false, identity: null, sourceIds: ["invoice-lea"] });

    writeFileSync(invoice, "CLIENTE\nLEA DETTORI DTTLEA66C62F205Q\nCOINTESTATARIO LUIGI BELLENCHIA BLLLGU65E28F205E");
    expect(resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "lea-dettori",
      coOwnership: { presente: true, nome: "Luigi", cognome: "Bellenchia", cf: "BLLLGU65E28F205E" },
      mainDocumentFiscalCode,
      analysis,
    })).toEqual({ status: "confirmed_by_invoice", present: true, identity: { name: "Luigi", surname: "Bellenchia", taxCode: "BLLLGU65E28F205E" }, sourceIds: ["invoice-lea"] });
  });

  it("non duplica il beneficiario principale quando il form lo ripete come cointestatario", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-self-co-beneficiary-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "INTESTATARIO OLTEANU ANDREEA IOANA C.F. LTNNRN87R57Z129Z\nTOTALE DOCUMENTO 4.905,00");
    expect(resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "andreea-ioana-olteanu",
      coOwnership: { presente: true, nome: "Andreea Ioana", cognome: "Olteanu", cf: "LTNNRN87R57Z129Z" },
      mainDocumentFiscalCode: { status: "not_found", value: null, sourceIds: [], candidates: [] },
      primaryFiscalCodes: ["LTNNRN87R57Z129Z"],
      analysis: { items: [{ documentKey: "invoice-andreea", customerKey: "andreea-ioana-olteanu", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    })).toEqual({ status: "excluded_by_invoice", present: false, identity: null, sourceIds: ["invoice-andreea"] });
  });

  it("include il cointestatario esplicito della fattura anche quando manca nel form", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-invoice-co-beneficiary-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE CALLEGARI LUCA C.F. CLLLCU82D29G916U\nFORNITURA IN DETRAZIONE AL 50% CON PINNA MARIA GIOVANNA ANGELA C.F. PNNMGV84B43G203G");
    const result = resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "luca-callegari",
      coOwnership: { presente: false },
      mainDocumentFiscalCode: { status: "verified", value: "CLLLCU82D29G916U", sourceIds: ["invoice-luca"], candidates: ["CLLLCU82D29G916U"] },
      analysis: { items: [{ documentKey: "invoice-luca", customerKey: "luca-callegari", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    });
    expect(result).toEqual({
      status: "confirmed_by_invoice",
      present: true,
      identity: { name: "Maria Giovanna Angela", surname: "Pinna", taxCode: "PNNMGV84B43G203G" },
      sourceIds: ["invoice-luca"],
    });
  });

  it("fa prevalere il cognome del beneficiario principale ripetuto in fattura sul form a parita di CF", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-primary-beneficiary-")); directories.push(root);
    const invoiceOne = path.join(root, "fattura-1.txt"); const invoiceTwo = path.join(root, "fattura-2.txt");
    const body = "CLIENTE\nGianluigi Chiolin\nC.F.: CHLGLG66A31F205C\nPRODOTTI E SERVIZI";
    writeFileSync(invoiceOne, body); writeFileSync(invoiceTwo, body);
    const result = resolvePrimaryBeneficiaryFromOriginalInvoices({
      customerKey: "gianluigi-chiolini",
      taxCode: "CHLGLG66A31F205C",
      analysis: { items: [
        { documentKey: "invoice-gianluigi-1", customerKey: "gianluigi-chiolini", kind: "invoice", state: "analyzed", textPath: invoiceOne },
        { documentKey: "invoice-gianluigi-2", customerKey: "gianluigi-chiolini", kind: "invoice", state: "analyzed", textPath: invoiceTwo },
      ] } as never,
    });
    expect(result).toEqual({
      status: "verified_invoice",
      identity: { name: "Gianluigi", surname: "Chiolin", taxCode: "CHLGLG66A31F205C" },
      sourceIds: ["invoice-gianluigi-1", "invoice-gianluigi-2"],
    });
  });

  it("riconosce il cointestatario Callegari anche quando l'OCR spezza descrizione, nome e CF su righe contigue", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-invoice-co-beneficiary-multiline-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE CALLEGARI LUCA C.F. CLLLCU82D29G916U\nFORNITURA IN DETRAZIONE AL 50% CON\nPINNA MARIA GIOVANNA ANGELA\nC.F. PNNMGV84B43G203G\nTOTALE DOCUMENTO 4.500,00");
    const result = resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "luca-callegari",
      coOwnership: { presente: false },
      mainDocumentFiscalCode: { status: "verified", value: "CLLLCU82D29G916U", sourceIds: ["invoice-luca-multiline"], candidates: ["CLLLCU82D29G916U"] },
      analysis: { items: [{ documentKey: "invoice-luca-multiline", customerKey: "luca-callegari", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    });
    expect(result).toEqual({
      status: "confirmed_by_invoice",
      present: true,
      identity: { name: "Maria Giovanna Angela", surname: "Pinna", taxCode: "PNNMGV84B43G203G" },
      sourceIds: ["invoice-luca-multiline"],
    });
  });

  it("pianifica il 36% quando il form indica seconda abitazione senza mantenere il vecchio gate", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      cliente_cf: "RSSMRA80A01H501U",
      dati_form: {
        richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U", abitazione_principale: false },
        edificio: { numero_appartamenti: 1 },
        prodotto: { schermature: [] },
      },
    } }, "mario-rossi", { items: [] } as never, new Date("2026-08-16T15:00:00Z"));

    expect(report).toMatchObject({ outcome: "blocked_case", deductionRate: 36 });
    expect(report.blockers.map((item) => item.code)).not.toContain("secondary_home_36_percent_portal_flow_unverified");
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "secondary_home_36_percent_allocation_planned",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.secondaryHome36PercentAllocation]),
    }));
    expect(report.draftPlan).toMatchObject({ status: "blocked", externalActionAllowed: false });
  });
  it("risolve Z600 come Argentina da fonte istituzionale senza bloccare Luciano Martinez", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      cliente_cf: "MRTLNJ77L14Z600M",
      dati_form: {
        richiedente: {
          nome: "Luciano Javier",
          cognome: "Martinez",
          data_nascita: "1977-07-14",
          cf: "MRTLNJ77L14Z600M",
          comune_nascita: "estero",
          provincia_nascita: "Padova",
        },
        edificio: { numero_appartamenti: 4 },
        prodotto: { schermature: [] },
      },
    } }, "luciano-javier-martinez", { items: [] } as never, new Date("2026-08-17T15:00:00Z"));

    expect(report.blockers).not.toContainEqual(expect.objectContaining({
      code: "birth_country_conflict_foreign_place_italian_province",
    }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "birth_country_resolved_from_reliable_belfiore_registry",
      appliedRuleIds: expect.arrayContaining([
        USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck,
      ]),
    }));
  });
  it("corregge un solo carattere OCR confondibile del CF con anagrafica concordante", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      cliente_cf: "RPORMO41512C075E",
      dati_form: {
        richiedente: { nome: "Romeo", cognome: "Ropa", data_nascita: "1941-11-12", cf: "RPORMO41512C075E" },
        edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] },
      },
    } }, "romeo-ropa", { items: [] } as never, new Date("2026-08-23T10:00:00Z"));
    expect(report.resolvedTaxCode).toBe("RPORMO41S12C075E");
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "tax_code_missing_or_invalid" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "fiscal_code_single_ocr_confusable_repaired" }));
  });
  it("risolve Z129 come Romania senza bloccare Andreea Olteanu per la sigla RO", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      cliente_cf: "LTNNRN87R57Z129Z",
      dati_form: {
        richiedente: {
          nome: "Andreea Ioana",
          cognome: "Olteanu",
          data_nascita: "1987-10-17",
          cf: "LTNNRN87R57Z129Z",
          comune_nascita: "Romania",
          provincia_nascita: "Ro",
        },
        edificio: { numero_appartamenti: 1 },
        prodotto: { schermature: [] },
      },
    } }, "andreea-ioana-olteanu", { items: [] } as never, new Date("2026-08-23T10:00:00Z"));

    expect(report.blockers).not.toContainEqual(expect.objectContaining({
      code: "birth_country_conflict_foreign_place_italian_province",
    }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "birth_country_resolved_from_reliable_belfiore_registry",
    }));
  });
  it("risolve Z312 come Repubblica Democratica del Congo senza bloccare Kitenge Ebambi", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      cliente_cf: "BMBKNG66R44Z312Y",
      dati_form: {
        richiedente: {
          nome: "Kitenge",
          cognome: "Ebambi",
          data_nascita: "1966-10-04",
          cf: "BMBKNG66R44Z312Y",
          comune_nascita: "Lubumbashi COD",
          provincia_nascita: "EE",
        },
        edificio: { numero_appartamenti: 1 },
        prodotto: { schermature: [] },
      },
    } }, "kitenge-ebambi", { items: [] } as never, new Date("2026-08-23T10:00:00Z"));

    expect(report.blockers).not.toContainEqual(expect.objectContaining({
      code: "birth_country_conflict_foreign_place_italian_province",
    }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "birth_country_resolved_from_reliable_belfiore_registry",
    }));
  });
  it("mantiene il blocco per un codice estero valido ma non presente nel registro verificato", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      cliente_cf: "MRTLNJ77L14Z999V",
      dati_form: {
        richiedente: {
          nome: "Luciano Javier",
          cognome: "Martinez",
          data_nascita: "1977-07-14",
          cf: "MRTLNJ77L14Z999V",
          comune_nascita: "estero",
          provincia_nascita: "Padova",
        },
        edificio: { numero_appartamenti: 4 },
        prodotto: { schermature: [] },
      },
    } }, "foreign-unmapped", { items: [] } as never, new Date("2026-08-17T15:00:00Z"));

    expect(report.blockers).toContainEqual(expect.objectContaining({
      code: "birth_country_conflict_foreign_place_italian_province",
      field: "beneficiary.birthCountry",
    }));
    expect(report.warnings).not.toContainEqual(expect.objectContaining({
      code: "birth_country_resolved_from_reliable_belfiore_registry",
    }));
  });
  it("normalizza a una unita il numero appartamenti assente o zero e conserva il valore nel pacchetto", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      id: "00000000-0000-4000-8000-000000000009", cliente_nome: "Daniela", cliente_cognome: "D'Esposito", cliente_cf: "RSSMRA80A01H501U",
      prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" },
      dati_form: { richiedente: { nome: "Daniela", cognome: "D'Esposito", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 0 }, prodotto: { schermature: [] } },
    } }, "daniela-d-esposito", { items: [] } as never, new Date("2026-08-16T15:00:00Z"));
    expect(report).toMatchObject({ buildingUnitCount: 1, buildingQualification: "single_unit" });
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "building_units_defaulted_to_one", appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.defaultSingleUnitWhenUnspecified]) }));
    expect(report.blockers.map((item) => item.code)).not.toContain("building_units_missing");
  });

  it("preserva per Federigo l'unita unica anche quando la fascia descrive oltre tre piani", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      id: "4e4a8fd7-7169-4517-abd4-a59d88303935", cliente_nome: "Federigo", cliente_cognome: "Cileo", cliente_cf: "CLIFRG70A01F205X",
      prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" },
      dati_form: { richiedente: { nome: "Federigo", cognome: "Cileo", data_nascita: "1970-01-01", cf: "CLIFRG70A01F205X" }, edificio: { numero_appartamenti: 1, tipologia: "edificio_oltre_3_piani" }, prodotto: { schermature: [] } },
    } }, "federigo-cileo", { items: [] } as never, new Date("2026-08-18T15:00:00Z"));
    expect(report).toMatchObject({ buildingUnitCount: 1, buildingQualification: "single_unit" });
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "single_unit_over_floor_band",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification],
    }));
  });

  it("classifica la fattura assente come intervento operatore riprendibile", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_cf: "RSSMRA80A01H501U", fatture_urls: ["practice/fattura/mancante.png"], dati_form: {
      richiedente: { nome: "Sarah", cognome: "Murru", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] },
    } } }, "sarah-murru", { items: [] } as never, new Date("2026-08-16T15:00:00Z"));
    expect(report.blockers).toContainEqual(expect.objectContaining({
      code: "original_invoice_missing_or_unavailable",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue, "system-apr-operator-intervention-routing"]),
    }));
    expect(report.draftPlan.nextAction).toContain("Pronte da fare");
  });
  it("recupera il CF valido dalle fatture originarie solo se unico e coerente col form", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-cf-")); directories.push(root);
    const first = path.join(root, "fattura-1.txt"); const second = path.join(root, "fattura-2.txt");
    writeFileSync(first, "Cliente Amelia Lerose\nC.fisc: LRSMLA52B50D122C\nFattura originaria");
    writeFileSync(second, "Cliente Amelia Lerose\nCodice fiscale LRSMLA52B50D122C\nSeconda fattura originaria");
    const item = (documentKey: string, textPath: string) => ({ documentKey, customerKey: "amelia-lerose", kind: "invoice", state: "analyzed", textPath });
    const requester = { nome: "Amelia", cognome: "Lerose", data_nascita: "1952-02-10" };
    const verified = resolveOriginalDocumentFiscalCode({ customerKey: "amelia-lerose", requester, analysis: { items: [item("invoice-1", first), item("invoice-2", second)] } as never });
    expect(verified).toEqual({ status: "verified", value: "LRSMLA52B50D122C", sourceIds: ["invoice-1", "invoice-2"], candidates: ["LRSMLA52B50D122C"] });

    writeFileSync(second, "Cliente Amelia Lerose\nCodice fiscale LRSMLA52B50D222H\nSeconda fattura originaria");
    expect(resolveOriginalDocumentFiscalCode({ customerKey: "amelia-lerose", requester, analysis: { items: [item("invoice-1", first), item("invoice-2", second)] } as never }))
      .toMatchObject({ status: "conflict", value: null, candidates: ["LRSMLA52B50D122C", "LRSMLA52B50D222H"] });
    expect(resolveOriginalDocumentFiscalCode({ customerKey: "amelia-lerose", requester: { ...requester, data_nascita: "1952-02-11" }, analysis: { items: [item("invoice-1", first)] } as never }))
      .toMatchObject({ status: "not_found", value: null });

    writeFileSync(first, "CLIENTE\nLEA DETTORI\nC.F.: DTTLEA66C62F205Q");
    expect(resolveOriginalDocumentFiscalCode({
      customerKey: "lea-dettori",
      requester: { nome: "Lea", cognome: "Dettori", data_nascita: "1966-03-22" },
      analysis: { items: [{ documentKey: "invoice-lea", customerKey: "lea-dettori", kind: "invoice", state: "analyzed", textPath: first }] } as never,
    })).toEqual({ status: "verified", value: "DTTLEA66C62F205Q", sourceIds: ["invoice-lea"], candidates: ["DTTLEA66C62F205Q"] });
  });

  it("prepara i dossier acquisiti anche quando un caso del lotto è bloccato a monte", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-partial-")); directories.push(root);
    const dossierDir = path.join(root, "dossiers"); mkdirSync(dossierDir);
    const acquired = Array.from({ length: 4 }, (_, index) => {
      const customerKey = `cliente-${index + 1}`;
      const dossierPath = path.join(dossierDir, `${customerKey}.json`);
      writeFileSync(dossierPath, JSON.stringify({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: {} } }));
      return { customerKey, displayName: `Cliente ${index + 1}`, state: "acquired" as const, requestId: customerKey, attemptCount: 1, practiceId: crypto.randomUUID(), dossierPath, responseSha256: createHash("sha256").update(customerKey).digest("hex"), sourceDocumentCount: 1, reason: "ok", startedAt: null, endedAt: null };
    });
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); });
    analysis.initialize();
    const store = new PersistentAprCrmLocalPreflight(root, analysis);
    const prepared = store.prepare(acquired, "b".repeat(64), new Date("2026-08-15T09:00:00Z"));

    expect(prepared).toMatchObject({ status: "queued", items: acquired.map(({ customerKey }) => ({ customerKey, state: "queued" })) });
    expect(prepared.reason).toContain("4 dossier acquisiti");
    expect(new PersistentAprCrmLocalPreflight(root, analysis).snapshot().progress.total).toBe(4);
  });

  it("elabora dieci dossier attraverso riavvii simulati senza perdere o duplicare la coda", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-ten-restart-")); directories.push(root);
    const dossierDir = path.join(root, "dossiers"); mkdirSync(dossierDir);
    const acquired = Array.from({ length: 10 }, (_, index) => {
      const customerKey = `lunedi-${index + 1}`;
      const dossierPath = path.join(dossierDir, `${customerKey}.json`);
      writeFileSync(dossierPath, JSON.stringify({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: index === 3 ? {} : { richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] } } } }));
      return { customerKey, displayName: `Lunedì ${index + 1}`, state: "acquired" as const, requestId: customerKey, attemptCount: 1, practiceId: crypto.randomUUID(), dossierPath, responseSha256: createHash("sha256").update(customerKey).digest("hex"), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null };
    });
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    new PersistentAprCrmLocalPreflight(root, analysis).prepare(acquired, "e".repeat(64), new Date("2026-08-16T08:00:00Z"));
    for (let index = 0; index < 12; index += 1) {
      const restarted = new PersistentAprCrmLocalPreflight(root, analysis);
      if (restarted.snapshot().status === "completed") break;
      restarted.tick(new Date(1_787_044_800_000 + index * 1_000));
    }
    const snapshot = new PersistentAprCrmLocalPreflight(root, analysis).snapshot();
    expect(snapshot).toMatchObject({ status: "completed", progress: { total: 10, queued: 0, ready: 0, blocked: 10 }, externalActionAllowed: false });
    expect(snapshot.items.map((item) => item.customerKey)).toEqual(acquired.map((item) => item.customerKey));
    expect(snapshot.items.map((item) => item.attemptCount)).toEqual(Array(10).fill(1));
    expect(snapshot.items[3].report?.blockers.map((item) => item.code)).toContain("customer_form_missing");
    expect(snapshot.audit.every((event) => event.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart))).toBe(true);
  });

  it("ricalcola da una revisione locale delle fonti senza ripetere il caso o mutare sistemi esterni", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-source-revision-")); directories.push(root);
    const dossierDir = path.join(root, "dossiers"); mkdirSync(dossierDir);
    const dossierPath = path.join(dossierDir, "cliente-1.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: { richiedente: { cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] } } } }));
    const acquired = [{ customerKey: "cliente-1", displayName: "Cliente 1", state: "acquired" as const, requestId: "cliente-1", attemptCount: 1, practiceId: crypto.randomUUID(), dossierPath, responseSha256: createHash("sha256").update("cliente-1").digest("hex"), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null }];
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const store = new PersistentAprCrmLocalPreflight(root, analysis); store.prepare(acquired, "c".repeat(64)); store.tick();
    const before = store.snapshot(); expect(before.status).toBe("completed");
    const revised = store.applySourceRevision(acquired, "d".repeat(64), "invoice-parser-test-revision-v1");
    expect(revised).toMatchObject({ status: "completed", sourceFingerprint: "d".repeat(64), sourceRevisionsApplied: ["invoice-parser-test-revision-v1"], externalActionAllowed: false });
    expect(revised.items[0].attemptCount).toBe(before.items[0].attemptCount);
    expect(revised.audit.at(-1)?.type).toBe("source_revision_applied");
    expect(store.applySourceRevision(acquired, "d".repeat(64), "invoice-parser-test-revision-v1").revision).toBe(revised.revision);
  });

  it("accoda dopo correzione identita soltanto il nuovo dossier e preserva i casi terminali", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-identity-extend-")); directories.push(root);
    const dossierDir = path.join(root, "dossiers"); mkdirSync(dossierDir);
    const acquiredItem = (customerKey: string, displayName: string) => {
      const dossierPath = path.join(dossierDir, `${customerKey}.json`);
      writeFileSync(dossierPath, JSON.stringify({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: { richiedente: { cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] } } } }));
      return { customerKey, displayName, state: "acquired" as const, requestId: customerKey, attemptCount: 1, practiceId: crypto.randomUUID(), dossierPath, responseSha256: createHash("sha256").update(customerKey).digest("hex"), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null };
    };
    const existing = acquiredItem("cliente-esistente", "Cliente Esistente");
    const added = acquiredItem("cliente-corretto", "Cliente Corretto");
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const store = new PersistentAprCrmLocalPreflight(root, analysis); store.prepare([existing], "1".repeat(64)); store.tick();
    const before = store.snapshot(); expect(before).toMatchObject({ status: "completed", progress: { total: 1, blocked: 1 } });
    const revised = store.applySourceRevision([existing, added], "2".repeat(64), "source-set-identity-correction-v1");
    expect(revised).toMatchObject({ status: "queued", items: [{ customerKey: "cliente-esistente", attemptCount: 1 }, { customerKey: "cliente-corretto", state: "queued", attemptCount: 0 }] });
    store.tick();
    expect(store.snapshot()).toMatchObject({ status: "completed", progress: { total: 2, queued: 0, blocked: 2 } });
    expect(store.snapshot().items.map((item) => item.attemptCount)).toEqual([1, 1]);
  });

  it("espande una riga form di gruppo e lascia prevalere il tipo esplicito della fattura", () => {
    const pergola = resolveFormScreeningMappings([{ tipo_prodotto: "pergotenda", direzione: "sud_est" }], ["Schermatura solare mobile", "Schermatura solare mobile", "Schermatura solare mobile", "Schermatura solare mobile"]);
    expect(pergola).toMatchObject({ status: "mapped", mappings: [
      { declared: { tipo_prodotto: "pergotenda", direzione: "sud_est" }, source: "group_inheritance" },
      { declared: { tipo_prodotto: "pergotenda", direzione: "sud_est" }, source: "group_inheritance" },
      { declared: { tipo_prodotto: "pergotenda", direzione: "sud_est" }, source: "group_inheritance" },
      { declared: { tipo_prodotto: "pergotenda", direzione: "sud_est" }, source: "group_inheritance" },
    ] });
    const cristal = resolveFormScreeningMappings([{ tipo_prodotto: "tende_da_sole", direzione: "sud" }], Array(5).fill("Tenda Cristal"));
    expect(cristal.status).toBe("mapped"); expect(cristal.mappings).toHaveLength(5); expect(cristal.mappings.every((mapping) => mapping.source === "group_inheritance")).toBe(true);
    expect(resolveFormScreeningMappings([{ tipo_prodotto: "pergotenda", direzione: "sud_est" }], ["Pergola", "Zanzariera verticale"])).toMatchObject({
      status: "mapped",
      conflictingProductIndexes: [1],
      mappings: [
        { declared: { tipo_prodotto: "pergotenda", direzione: "sud_est" }, source: "group_inheritance" },
        { declared: { tipo_prodotto: "pergotenda", direzione: "sud_est" }, source: "group_invoice_type_override" },
      ],
    });
    expect(resolveFormScreeningMappings([{ tipo_prodotto: "tenda" }, { tipo_prodotto: "tenda" }], Array(4).fill("Tenda"))).toMatchObject({ status: "cardinality_mismatch" });
    const narrative = resolveFormScreeningMappings([
      { tipo_prodotto: "pergotenda", direzione: "sud_ovest" },
      { tipo_prodotto: "tende_da_sole", direzione: "sud_ovest" },
    ], ["Pergotenda", ...Array(9).fill("Tenda Cristal")]);
    expect(narrative.status).toBe("mapped");
    expect(narrative.mappings[0]).toMatchObject({ declared: { tipo_prodotto: "pergotenda" }, source: "group_inheritance" });
    expect(narrative.mappings.slice(1).every((mapping) => mapping.declared?.tipo_prodotto === "tende_da_sole" && mapping.source === "group_inheritance")).toBe(true);
    const mixedLm = resolveFormScreeningMappings([
      { tipo_prodotto: "tende_da_sole", direzione: "sud" },
      { tipo_prodotto: "altro", direzione: "sud" },
    ], [...Array(5).fill("Tenda da sole motorizzata"), ...Array(7).fill("Altra schermatura solare - zanzariera")]);
    expect(mixedLm.status).toBe("mapped");
    expect(mixedLm.mappings.slice(0, 5).every((mapping) => mapping.declared?.tipo_prodotto === "tende_da_sole")).toBe(true);
    expect(mixedLm.mappings.slice(5).every((mapping) => mapping.declared?.tipo_prodotto === "altro")).toBe(true);
  });

  it("non propaga motore e materiale di una riga LM alle zanzariere o alle righe manuali", () => {
    const motorized = resolveProductTechnicalAttributes("Tenda da sole motorizzata", "Tenda da sole motorizzata", 0.33)!;
    const manual = resolveProductTechnicalAttributes("Tenda da sole a caduta", "Tenda da sole a caduta", 0.08)!;
    const mosquito = resolveProductTechnicalAttributes("Altra schermatura solare - zanzariera", "Altra schermatura solare - zanzariera", 0.34)!;
    expect(motorized).toMatchObject({ movement: "Automatico", material: "Tessuto" });
    expect(manual).toMatchObject({ movement: "Manuale", material: "Tessuto" });
    expect(mosquito).toMatchObject({ movement: "Manuale", material: "Misto" });
  });

  it("risolve gli attributi persiana con precedenza esplicita e fallback autorizzati", () => {
    expect(resolveProductTechnicalAttributes("Persiana in alluminio motorizzata", "Persiana in alluminio motorizzata", 0.12)).toMatchObject({
      material: "Metallo", materialSource: "invoice_explicit", movement: "Automatico", movementSource: "invoice_explicit",
      gTot: 0.12, supplementaryThermalResistance: 0.17, source: "invoice_explicit", ruleId: USER_AUTHORIZED_RULE_IDS.persianaScreening,
    });
    expect(resolveProductTechnicalAttributes("Persiana", "Persiana", null)).toMatchObject({
      material: "Metallo", materialSource: "authorized_fallback", movement: "Manuale", movementSource: "authorized_fallback",
      gTot: 0.08, supplementaryThermalResistance: 0.17, source: "authorized_fallback", ruleId: USER_AUTHORIZED_RULE_IDS.persianaScreening,
    });
    expect(resolveProductTechnicalAttributes("Persiana in PVC", "Persiana in PVC", null)).toMatchObject({ material: "" });
  });

  it("risolve l'avvolgibile con lo stesso contratto persiana e un ID audit distinto", () => {
    expect(resolveProductTechnicalAttributes("Avvolgibile in alluminio motorizzato", "Avvolgibile in alluminio motorizzato", 0.12)).toMatchObject({
      material: "Metallo", materialSource: "invoice_explicit", movement: "Automatico", movementSource: "invoice_explicit",
      gTot: 0.12, supplementaryThermalResistance: 0.17, source: "invoice_explicit", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening,
    });
    expect(resolveProductTechnicalAttributes("Tapparella", "Tapparella", null)).toMatchObject({
      material: "Metallo", materialSource: "authorized_fallback", movement: "Manuale", movementSource: "authorized_fallback",
      gTot: 0.08, supplementaryThermalResistance: 0.17, source: "authorized_fallback", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening,
    });
    expect(resolveProductTechnicalAttributes("Avvolgibile in PVC", "Avvolgibile in PVC", null)).toMatchObject({ material: "" });
  });

  it("porta sei avvolgibili ODHAUS nel piano locale senza il vecchio blocco modulo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-avvolgibili-odhaus-")); directories.push(root);
    const textPath = path.join(root, "fattura.txt");
    writeFileSync(textPath, `ODHAUS S.R.L.\nFattura n. 97/001 del 14/05/2026\nCliente Mario Rossi CF RSSMRA80A01H501U\nAVVOLGIBILE IN ALLUMINIO COIBENTATO - 810X229 + AVVOLGIMENTO\nAVVOLGIBILE IN ALLUMINIO COIBENTATO - 1350X229 + AVVOLGIMENTO\nAVVOLGIBILE IN ALLUMINIO COIBENTATO - 1100X2290 + AVVOLGIMENTO\nAVVOLGIBILE IN ALLUMINIO COIBENTATO - 1100X2290 + AVVOLGIMENTO\nAVVOLGIBILE IN ALLUMINIO COIBENTATO - 1110X2290 + AVVOLGIMENTO\nAVVOLGIBILE IN ALLUMINIO COIBENTATO - 600X2290 + AVVOLGIMENTO\nImponibile 2.440,00\nIVA 536,80\nTotale documento 2.976,80 €`);
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" },
      edificio: { numero_appartamenti: 1 }, prodotto: {},
    } } }, "mario-rossi", { items: [{ documentKey: "odhaus-invoice", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] }] } as never, new Date("2026-08-18T10:00:00Z"));
    expect(report.products).toHaveLength(6);
    expect(report.blockers.some((blocker) => blocker.code.startsWith("avvolgibile_module_not_enabled"))).toBe(false);
    expect(report.products.every((product) => product.declaredType === "avvolgibile" && product.gTot === 0.08 && product.material === "Metallo" && product.movement === "Manuale" && product.supplementaryThermalResistance === 0.17)).toBe(true);
    expect(report.products.every((product) => product.protectedWindowSurfaceM2 === product.surfaceM2)).toBe(true);
    expect(report.products.map((product) => product.heightMm)).toEqual(Array(6).fill(2290));
    expect(report.products.every((product) => product.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.avvolgibileScreening))).toBe(true);
  });

  it("accetta soltanto le dimensioni persiana negli intervalli autorizzati", () => {
    expect(isPersianaDimensionPlausible(600, 1200)).toBe(true);
    expect(isPersianaDimensionPlausible(1800, 3000)).toBe(true);
    expect(isPersianaDimensionPlausible(599, 2450)).toBe(false);
    expect(isPersianaDimensionPlausible(900, 1199)).toBe(false);
  });

  it("riprende un caso reclamato, registra blocchi per-pratica e non perde la coda", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-")); directories.push(root); const dossierDir = path.join(root, "dossiers"); mkdirSync(dossierDir);
    const acquired = Array.from({ length: 5 }, (_, index) => { const customerKey = index === 4 ? "beatrice-ciotta" : `cliente-${index + 1}`; const dossierPath = path.join(dossierDir, `${customerKey}.json`); writeFileSync(dossierPath, JSON.stringify({ row: { cliente_cf: "RSSMRA80A01H501U", dati_form: index === 1 ? {} : { richiedente: { cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [{ direzione: "sud" }] } } } })); return { customerKey, displayName: index === 4 ? "Beatrice Ciotta" : `Cliente ${index + 1}`, state: "acquired" as const, requestId: customerKey, attemptCount: 1, practiceId: crypto.randomUUID(), dossierPath, responseSha256: createHash("sha256").update(customerKey).digest("hex"), sourceDocumentCount: 1, reason: "ok", startedAt: null, endedAt: null }; });
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const store = new PersistentAprCrmLocalPreflight(root, analysis); store.prepare(acquired, "a".repeat(64));
    store.tick(new Date("2026-08-15T10:00:00Z"));
    const restarted = new PersistentAprCrmLocalPreflight(root, analysis); for (let index = 0; index < 6 && restarted.snapshot().status !== "completed"; index += 1) restarted.tick(new Date(`2026-08-15T10:00:0${index + 1}Z`));
    const snapshot = restarted.snapshot(); expect(snapshot).toMatchObject({ status: "completed", progress: { total: 5, queued: 0, ready: 0, blocked: 5 }, externalActionAllowed: false }); expect(snapshot.items.map((item) => item.attemptCount)).toEqual([1, 1, 1, 1, 1]); expect(snapshot.items[1].report?.blockers.map((item) => item.code)).toContain("customer_form_missing"); expect(snapshot.items.every((item) => item.report?.draftPlan.submitAllowed === false)).toBe(true);
    const revision = snapshot.revision; restarted.tick(); expect(restarted.snapshot().revision).toBe(revision);
    restarted.applyValidationRevision("financial-evidence-test-v1", new Date("2026-08-15T10:01:00Z"));
    const revised = new PersistentAprCrmLocalPreflight(root, analysis).snapshot();
    expect(revised.validationRevisionsApplied).toEqual(["financial-evidence-test-v1"]);
    expect(revised.items.map((item) => item.attemptCount)).toEqual([1, 1, 1, 1, 1]);
    const validationAuditRuleIds = revised.audit.at(-1)?.appliedRuleIds ?? [];
    const reportRuleIds = revised.items.flatMap((item) => [
      ...(item.report?.financial.appliedRuleIds ?? []),
      ...(item.report?.products.flatMap((product) => product.appliedRuleIds) ?? []),
      ...(item.report?.blockers.flatMap((blocker) => blocker.appliedRuleIds) ?? []),
      ...(item.report?.warnings.flatMap((warning) => warning.appliedRuleIds) ?? []),
    ]);
    expect(reportRuleIds.every((ruleId) => validationAuditRuleIds.includes(ruleId))).toBe(true);
    restarted.applyValidationRevision("financial-evidence-test-v1", new Date("2026-08-15T10:02:00Z"));
    expect(restarted.snapshot().revision).toBe(revised.revision);
    const ciottaReport = revised.items.find((item) => item.customerKey === "beatrice-ciotta")?.report;
    restarted.deferCiottaForPilot("user-test-ciotta-deferred-v1", "Accantonata per il pilot.", new Date("2026-08-15T10:03:00Z"));
    const deferred = restarted.snapshot();
    expect(deferred.progress).toMatchObject({ total: 5, ready: 0, blocked: 4, deferred: 1 });
    expect(deferred.items.find((item) => item.customerKey === "beatrice-ciotta")).toMatchObject({ state: "deferred_operator", attemptCount: 1, report: ciottaReport, disposition: { commandId: "user-test-ciotta-deferred-v1" } });
    const deferredRevision = deferred.revision; restarted.deferCiottaForPilot("user-test-ciotta-deferred-v1", "Accantonata per il pilot."); expect(restarted.snapshot().revision).toBe(deferredRevision);
  });
});
