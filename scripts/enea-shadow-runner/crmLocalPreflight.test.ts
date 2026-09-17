import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { CASE_SPECIFIC_FINANCIAL_RESOLUTIONS, EXPLICIT_ORIGINAL_COMPLETION_DATE_RULE_ID, INVOICE_CUSTOMER_BLOCK_CRM_CF_RULE_ID, PersistentAprCrmLocalPreflight, RESOLVED_NON_ECONOMIC_TOTAL_BLOCKER_RETIREMENT_RULE_ID, SPECIFIC_INCOMPLETE_SCREENING_BLOCKER_RULE_ID, UPSTREAM_PREFLIGHT_TERMINALIZATION_RULE_ID, acquisitionCanTerminalizeWithoutDocuments, applyPrintedDocumentTotalFallback, asScreeningDraftPackage, assessEnea2026SubmissionDeadline, buildCrmLocalPreflightReport, completionDateOperatorBlockers, invalidateCrmEneaPayloadAuditForScreeningBlockers, invoiceAddressedToDifferentCompanyThanBeneficiary, isPersianaDimensionPlausible, isResolvedNonEconomicTotalBlocker, mergeOriginalFormSourcesPreferPrimary, missingExplicitAdvanceInvoiceReferences, reconcileCommonReportWithAuthoritativeInfissiGate, resolveBundledProfessionalExpense, resolveCoBeneficiaryFromOriginalInvoices, resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock, resolveExplicitAdvanceInvoiceReferences, resolveExplicitOriginalCompletionDate, resolveFormScreeningMappings, resolveInvoiceWorkDates, resolveOriginalDocumentFiscalCode, resolvePrimaryBeneficiaryFromOfficialDocuments, resolvePrimaryBeneficiaryFromOriginalInvoices, resolveProductTechnicalAttributes, resolveWorksMunicipalityFromOriginalInvoices, screeningFallbackMaterialCategoryBlocker, screeningProductMeasurementEvidenceStatus } from "./crmLocalPreflight";
import type { CrmEneaPayloadAuditResult } from "./crmEneaPayloadAudit";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { nestedUncertainPageSaveProbeAllowed } from "./infissiUncertainSavePolicy";
import { OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID, PersistentAprOperatorResponseLedger } from "./operatorResponseLedger";
import type { LocalInvoiceSegment } from "./localInvoiceSegmentation";
import { disposeAprStoppedCase } from "./aprStopDisposition";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("preflight locale durevole fino a quindici dossier CRM", () => {
  it("classifica il form privo di edificio e impianto come domanda operatore esplicita", () => {
    const report = buildCrmLocalPreflightReport({
      row: {
        id: "practice-venturi",
        form_compilato_at: null,
        dati_form: {
          richiedente: { nome: "Stefania", cognome: "Venturi" },
          residenza: { comune: "Roma" },
          catastali: { foglio: "1", mappale: "2" },
        },
      },
    }, "stefania-venturi", { items: [] } as never, new Date("2026-09-14T10:00:00Z"));
    const blocker = report.blockers.find((item) => item.code === "customer_form_required_sections_missing");
    expect(blocker).toMatchObject({
      field: "customer_form.required_sections",
      operatorQuestion: expect.stringMatching(/dati dell'edificio e dell'impianto/i),
    });
    expect(disposeAprStoppedCase({
      customerKey: "stefania-venturi",
      state: "blocked_case",
      blockerCodes: [blocker!.code],
      blockerReasons: { [blocker!.code]: blocker!.reason },
      executionState: null,
      executionReason: null,
      persistedQuestionCount: 0,
      documentsAcquired: true,
    })).toMatchObject({ kind: "domanda_operatore", blockerCode: "customer_form_required_sections_missing" });
  });

  it("propaga il totale finale stampato a colonne prima di generare blocker economici", () => {
    const sourceId = "ordine-177:invoice:fixture";
    const segment = {
      sourceId,
      parentDocumentKey: "ordine-177",
      index: 0,
      text: "ORDINE DI VENDITA N. 177 DATA 15/07/2026\nTOTALE MERCE\nTOTALE IMPOSTA\nSPESE IMBALLO TOTALE ORDINE\n2.121,00\n466,62\n2.587,62",
      documentNumber: "177",
      documentDate: "2026-07-15",
      total: null,
      result: { path: sourceId, status: "parsed", documentType: "invoice", total: null, itemCount: 0, documentNumber: "177", documentDate: "2026-07-15" },
      items: [],
      extractionMode: "native_text",
      referencedInvoiceNumbers: [],
      replacedInvoiceNumbers: [],
      technicalSignature: "",
    } as LocalInvoiceSegment;
    const applied = applyPrintedDocumentTotalFallback([segment]);
    expect(applied.segments[0]).toMatchObject({ total: 2587.62, result: { total: 2587.62 } });
    expect(applied.recovered[0]).toMatchObject({ sourceId, reading: { amount: 2587.62, labelLine: 4, valueLine: 7, layout: "colonna" } });
  });

  it("non ricalcola un totale privo di etichetta", () => {
    const sourceId = "senza-totale:invoice:fixture";
    const segment = {
      sourceId,
      parentDocumentKey: "senza-totale",
      index: 0,
      text: "FATTURA 1 DEL 01/01/2026\nIMPONIBILE 1.000,00\nIVA 100,00\n1.100,00",
      documentNumber: "1",
      documentDate: "2026-01-01",
      total: null,
      result: { path: sourceId, status: "parsed", documentType: "invoice", total: null, itemCount: 0, documentNumber: "1", documentDate: "2026-01-01" },
      items: [],
      extractionMode: "native_text",
      referencedInvoiceNumbers: [],
      replacedInvoiceNumbers: [],
      technicalSignature: "",
    } as LocalInvoiceSegment;
    const applied = applyPrintedDocumentTotalFallback([segment]);
    expect(applied.segments[0].total).toBeNull();
    expect(applied.recovered).toEqual([]);
  });

  it("consuma realmente una risposta strutturata sulle misure in una nuova generazione", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-runtime-response-consumption-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ acquiredAt: "2026-09-11T08:01:00.000Z", row: { id: "practice-mondini", dati_form: { prodotto: { schermature: [] } } } }));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      responseId: "response:mondini:dimensions:runtime-test", customerKey: "sarah-mondini", displayName: "Sarah Mondini", practiceId: "practice-mondini",
      receivedAt: "2026-09-11T08:00:00.000Z", source: "giuliano_chat_decision", question: "Quali sono quantita e misure?", answer: "Una pergotenda 540 x 400 cm.",
      payload: { kind: "screening_products", products: [{ description: "Pergotenda", quantity: 1, widthMm: 5400, heightMm: 4000 }] }, status: "active", supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }]);
    const store = new PersistentAprCrmLocalPreflight(root, analysis);
    store.prepare([{ customerKey: "sarah-mondini", displayName: "Sarah Mondini", state: "acquired", requestId: "req-mondini", attemptCount: 1, practiceId: "practice-mondini", dossierPath, responseSha256: "a".repeat(64), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null }] as never, "b".repeat(64));
    const completed = store.runToCompletion(new Date("2026-09-11T08:02:00.000Z"));
    expect(completed.items[0].report?.products).toContainEqual(expect.objectContaining({ description: "Pergotenda", widthMm: 5400, heightMm: 4000 }));
    expect(ledger.load().applications).toContainEqual(expect.objectContaining({ responseId: "response:mondini:dimensions:runtime-test", outcome: "applied" }));
  });

  // Rossella Munafo, 11-14/09/2026: richiesta "dato in attesa" e misure
  // arrivate dopo, entrambe attive. Le misure venivano applicate e la
  // richiesta continuava a bloccare la pratica, per quattro giri.
  it("vince la risposta piu' recente: una richiesta di dato seguita dalle misure non blocca piu' la pratica (Munafo)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-runtime-response-latest-wins-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ acquiredAt: "2026-09-14T08:01:00.000Z", row: { id: "practice-munafo", dati_form: { prodotto: { schermature: [] } } } }));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      responseId: "response:munafo:pending:20260911", customerKey: "rossella-munafo", displayName: "Rossella Munafo", practiceId: "practice-munafo",
      receivedAt: "2026-09-11T09:37:00.000Z", source: "giuliano_chat_decision", question: "Indica le misure della bioclimatica riportate nel foglio manoscritto.", answer: "Le misure non sono nella fattura.",
      payload: { kind: "operator_required", operatorQuestion: "Indica le misure della bioclimatica riportate nel foglio manoscritto.", missingDocumentType: null }, status: "active", supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }, {
      responseId: "response:munafo:dimensions:20260912", customerKey: "rossella-munafo", displayName: "Rossella Munafo", practiceId: "practice-munafo",
      receivedAt: "2026-09-12T11:53:00.000Z", source: "giuliano_chat_decision", question: "Quali sono le misure?", answer: "Una bioclimatica 400 x 300 cm.",
      payload: { kind: "screening_products", products: [{ description: "Bioclimatica", quantity: 1, widthMm: 4000, heightMm: 3000 }] }, status: "active", supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }]);
    const store = new PersistentAprCrmLocalPreflight(root, analysis);
    store.prepare([{ customerKey: "rossella-munafo", displayName: "Rossella Munafo", state: "acquired", requestId: "req-munafo", attemptCount: 1, practiceId: "practice-munafo", dossierPath, responseSha256: "e".repeat(64), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null }] as never, "f".repeat(64));
    const completed = store.runToCompletion(new Date("2026-09-14T08:02:00.000Z"));
    // Le misure del 12/09 vengono applicate...
    expect(completed.items[0].report?.warnings).toContainEqual(expect.objectContaining({ code: "operator_response_screening_products_applied" }));
    // ...e la richiesta dell'11/09, superata, non blocca piu' la pratica.
    expect(completed.items[0].report?.blockers).not.toContainEqual(expect.objectContaining({ code: "operator_response_pending_external_data" }));
  });

  it("una richiesta di dato che e' davvero l'ultima risposta resta pendente", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-runtime-response-latest-pending-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ acquiredAt: "2026-09-14T08:01:00.000Z", row: { id: "practice-x", dati_form: {} } }));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      responseId: "response:x:pending:20260913", customerKey: "cliente-x", displayName: "Cliente X", practiceId: "practice-x",
      receivedAt: "2026-09-13T09:00:00.000Z", source: "giuliano_chat_decision", question: "Serve il certificato del produttore.", answer: "Lo chiedo al fornitore.",
      payload: { kind: "operator_required", operatorQuestion: "Serve il certificato del produttore.", missingDocumentType: "certificato" }, status: "active", supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }]);
    const store = new PersistentAprCrmLocalPreflight(root, analysis);
    store.prepare([{ customerKey: "cliente-x", displayName: "Cliente X", state: "acquired", requestId: "req-x", attemptCount: 1, practiceId: "practice-x", dossierPath, responseSha256: "1".repeat(64), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null }] as never, "2".repeat(64));
    const completed = store.runToCompletion(new Date("2026-09-14T08:02:00.000Z"));
    expect(completed.items[0].report?.blockers).toContainEqual(expect.objectContaining({ code: "operator_response_pending_external_data" }));
  });

  it("non considera applicata una risposta su nuovi documenti prima della riacquisizione", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-runtime-response-refresh-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ acquiredAt: "2026-09-11T08:00:00.000Z", row: { id: "practice-refresh", dati_form: {} } }));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      responseId: "response:documents:refresh:runtime-test", customerKey: "fixture-refresh", displayName: "Fixture Refresh", practiceId: "practice-refresh",
      receivedAt: "2026-09-11T09:00:00.000Z", source: "giuliano_chat_decision", question: "La fattura e stata caricata?", answer: "Si.",
      payload: { kind: "document_refresh", documentTypes: ["fattura"] }, status: "active", supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }]);
    const store = new PersistentAprCrmLocalPreflight(root, analysis);
    store.prepare([{ customerKey: "fixture-refresh", displayName: "Fixture Refresh", state: "acquired", requestId: "req-refresh", attemptCount: 1, practiceId: "practice-refresh", dossierPath, responseSha256: "c".repeat(64), sourceDocumentCount: 0, reason: "ok", startedAt: null, endedAt: null }] as never, "d".repeat(64));
    const completed = store.runToCompletion(new Date("2026-09-11T09:01:00.000Z"));
    expect(completed.items[0].report?.blockers).toContainEqual(expect.objectContaining({ code: "operator_response_source_refresh_pending" }));
    expect(ledger.load().applications).toContainEqual(expect.objectContaining({ responseId: "response:documents:refresh:runtime-test", outcome: "pending_source_refresh" }));
  });

  it("applica una disposizione di rimozione anche quando la nuova acquisizione non trova piu la pratica", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-runtime-response-disposition-")); directories.push(root);
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const ledger = new PersistentAprOperatorResponseLedger(root);
    ledger.importResponses([{
      responseId: "response:formisano:removed:runtime-test", customerKey: "antonino-formisabo", displayName: "Antonino Formisano", practiceId: "practice-formisano",
      receivedAt: "2026-09-11T09:00:00.000Z", source: "giuliano_chat_decision", question: "La pratica e ancora nel CRM?", answer: "No.",
      payload: { kind: "case_disposition", disposition: "removed_from_crm", reason: "Pratica rimossa dal perimetro corrente." }, status: "active", supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    }]);
    const store = new PersistentAprCrmLocalPreflight(root, analysis);
    const state = store.prepareFromTerminalAcquisition([{
      customerKey: "antonino-formisabo", displayName: "Antonino Formisano", expectedPracticeId: "practice-formisano", state: "blocked_not_found", requestId: "request-formisano", attemptCount: 1,
      practiceId: null, dossierPath: null, responseSha256: "e".repeat(64), sourceDocumentCount: 0, reason: "Non trovata", startedAt: null, endedAt: "2026-09-11T09:01:00.000Z",
    }] as never, "f".repeat(64), new Date("2026-09-11T09:02:00.000Z"));
    expect(state.items[0]).toMatchObject({ state: "deferred_operator", report: null, disposition: { commandId: "response:formisano:removed:runtime-test" } });
    expect(state.audit.at(-2)).toMatchObject({ type: "case_deferred", appliedRuleIds: expect.arrayContaining([OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID]) });
    expect(ledger.load().applications).toContainEqual(expect.objectContaining({ responseId: "response:formisano:removed:runtime-test", outcome: "disposition_applied" }));
  });

  it("propaga subito pratica CRM non trovata, esclusione fornitore e zero allegati come terminali con blocker e domanda operatore", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-upstream-terminal-")); directories.push(root);
    const dossierPath = path.join(root, "linea-sole.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { id: "00000000-0000-4000-8000-000000000091", cliente_nome: "Mario", cliente_cognome: "Manuale", fornitore: "Linea Sole Potito", fatture_urls: ["a", "b"] } }));
    const emptyDossierPath = path.join(root, "senza-allegati.json");
    writeFileSync(emptyDossierPath, JSON.stringify({ row: { id: "00000000-0000-4000-8000-000000000093", cliente_nome: "Nessun", cliente_cognome: "Allegato", fatture_urls: [], documenti_aggiuntivi_urls: [] } }));
    const terminalItems = [{
      customerKey: "cliente-non-trovato", displayName: "Cliente Non Trovato", expectedPracticeId: "00000000-0000-4000-8000-000000000090",
      state: "blocked_not_found" as const, requestId: "crm-readonly-cliente-non-trovato", attemptCount: 1, practiceId: null, dossierPath: null,
      responseSha256: "a".repeat(64), sourceDocumentCount: 0, reason: "Nessuna pratica ENEA corrispondente trovata con identita esatta.", startedAt: "2026-09-10T08:00:00.000Z", endedAt: "2026-09-10T08:00:03.000Z",
    }, {
      customerKey: "mario-manuale", displayName: "Mario Manuale", state: "acquired" as const, requestId: "crm-readonly-mario-manuale", attemptCount: 1,
      practiceId: "00000000-0000-4000-8000-000000000091", dossierPath, responseSha256: "b".repeat(64), sourceDocumentCount: 2,
      reason: "Esclusione automatica Linea Sole Potito.", startedAt: "2026-09-10T08:00:00.000Z", endedAt: "2026-09-10T08:00:04.000Z",
      automationExclusion: { kind: "supplier" as const, ruleId: "user-2026-08-18-future-test-exclusions" as const, canonicalKey: "linea-sole-potito", displayName: "Linea Sole Potito", reason: "Lavorazione manuale.", sourceField: "row.fornitore", sourceValue: "Linea Sole Potito", denominatorDisposition: "excluded_upstream" as const },
    }, {
      customerKey: "nessun-allegato", displayName: "Nessun Allegato", state: "acquired" as const, requestId: "crm-readonly-nessun-allegato", attemptCount: 1,
      practiceId: "00000000-0000-4000-8000-000000000093", dossierPath: emptyDossierPath, responseSha256: "f".repeat(64), sourceDocumentCount: 0,
      reason: "Dossier acquisito senza fonti originarie.", startedAt: "2026-09-10T08:00:00.000Z", endedAt: "2026-09-10T08:00:04.000Z", automationExclusion: null,
    }];
    expect(acquisitionCanTerminalizeWithoutDocuments(terminalItems)).toBe(true);
    const preflight = new PersistentAprCrmLocalPreflight(root, new PersistentAprCrmDocumentAnalysis(root));
    const state = preflight.prepareFromTerminalAcquisition(terminalItems, "c".repeat(64), new Date("2026-09-10T08:00:05.000Z"));
    expect(state.status).toBe("completed");
    expect(state.items).toHaveLength(3);
    expect(state.items[0]).toMatchObject({ state: "blocked_case", report: { outcome: "blocked_case", blockers: [expect.objectContaining({ code: "crm_practice_exact_match_not_found", operatorQuestion: expect.stringContaining("ID esatto") })] } });
    expect(state.items[1]).toMatchObject({ state: "blocked_case", report: { outcome: "blocked_case", blockers: [expect.objectContaining({ code: "permanent_supplier_automation_exclusion", reportingCategory: "excluded_upstream", operatorQuestion: expect.any(String) })] } });
    expect(state.items[2]).toMatchObject({ state: "blocked_case", report: { outcome: "blocked_case", blockers: expect.arrayContaining([expect.objectContaining({ code: "original_invoice_missing_or_unavailable", operatorQuestion: expect.any(String) })]) } });
    expect(state.audit.at(-1)?.appliedRuleIds).toContain(UPSTREAM_PREFLIGHT_TERMINALIZATION_RULE_ID);
  });

  it("non terminalizza a monte un dossier normale con allegati: deve attraversare download e analisi", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-upstream-terminal-negative-")); directories.push(root);
    const dossierPath = path.join(root, "normale.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { id: "00000000-0000-4000-8000-000000000092", fatture_urls: ["fattura.pdf"] } }));
    const normalItems = [{
      customerKey: "cliente-normale", displayName: "Cliente Normale", state: "acquired" as const, requestId: "crm-readonly-cliente-normale", attemptCount: 1,
      practiceId: "00000000-0000-4000-8000-000000000092", dossierPath, responseSha256: "d".repeat(64), sourceDocumentCount: 1,
      reason: "Dossier acquisito.", startedAt: "2026-09-10T08:00:00.000Z", endedAt: "2026-09-10T08:00:04.000Z", automationExclusion: null,
    }];
    expect(acquisitionCanTerminalizeWithoutDocuments(normalItems)).toBe(false);
    const preflight = new PersistentAprCrmLocalPreflight(root, new PersistentAprCrmDocumentAnalysis(root));
    expect(() => preflight.prepareFromTerminalAcquisition(normalItems, "e".repeat(64), new Date("2026-09-10T08:00:05.000Z"))).toThrow("crm_local_preflight_upstream_terminal_source_invalid");
    expect(preflight.snapshot().status).toBe("unprepared");
  });

  it("regressione Venturi: completa un form inline parziale con le sole sezioni esplicite del modulo cartaceo", () => {
    expect(mergeOriginalFormSourcesPreferPrimary({
      richiedente: { nome: "Stefania", cognome: "Venturi", cf: "VNTSTF70A41H501A" },
      edificio: { anno_costruzione: "" },
    }, {
      richiedente: { nome: "OCR ERRATO", cognome: "Venturi", cf: "" },
      edificio: { anno_costruzione: "1970", superficie_mq: "110" },
      impianto: { tipo: "autonomo" },
    })).toEqual({
      richiedente: { nome: "Stefania", cognome: "Venturi", cf: "VNTSTF70A41H501A" },
      edificio: { anno_costruzione: "1970", superficie_mq: "110" },
      impianto: { tipo: "autonomo" },
    });
  });

  it("resta fail-closed sui conflitti: il modulo cartaceo non sovrascrive valori inline presenti", () => {
    expect(mergeOriginalFormSourcesPreferPrimary({ edificio: { anno_costruzione: "1985" }, prodotto: { schermature: [{ tipo_prodotto: "persiana" }] } }, {
      edificio: { anno_costruzione: "1970", superficie_mq: "110" }, prodotto: { schermature: [{ tipo_prodotto: "tenda_da_sole" }] },
    })).toEqual({ edificio: { anno_costruzione: "1985", superficie_mq: "110" }, prodotto: { schermature: [{ tipo_prodotto: "persiana" }] } });
  });

  it("applica alla tenda fisica riconosciuta il fallback generale gTot 0,13", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-specific-screening-blocker-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `FATTURA 260 del 07/07/2026\nTENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM. CM L 265x220 SP (=MQ 5,83)\nTOTALE DOCUMENTO 980,00 €`);
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-tenda-senza-gtot" } }, "fixture-tenda-senza-gtot", { items: [{
      documentKey: "fattura-260", customerKey: "fixture-tenda-senza-gtot", kind: "invoice", state: "analyzed", textPath: invoicePath,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "260", documentDate: "2026-07-07", total: 980 },
      screeningItems: [{ widthMm: 2650, heightMm: 2200, surfaceM2: 5.83, gTot: null, description: "Tenda da sole cassonetto", sourcePath: "fattura-260" }],
    }] } as never, new Date("2026-09-05T14:00:00Z"));

    expect(report.products).toContainEqual(expect.objectContaining({
      widthMm: 2650,
      heightMm: 2200,
      surfaceM2: 5.83,
      gTot: 0.13,
      gTotSource: "authorized_fallback",
      appliedRuleIds: expect.arrayContaining(["user-2026-09-05-generic-awning-missing-gtot-013-v1"]),
    }));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "screening_gtot_missing_operator_required_1" }));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "screenings_missing" }));
  });

  it("mantiene screenings_missing quando nessuna fonte contiene un prodotto fisico", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-no-screening-row-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `FATTURA 260 del 07/07/2026\nACCONTO RIF. FATTURA N.207 DEL 09/06/2026\nTOTALE DOCUMENTO 980,00 €`);
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-nessun-prodotto" } }, "fixture-nessun-prodotto", { items: [{
      documentKey: "fattura-acconto", customerKey: "fixture-nessun-prodotto", kind: "invoice", state: "analyzed", textPath: invoicePath,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "260", documentDate: "2026-07-07", total: 980 }, screeningItems: [],
    }] } as never, new Date("2026-09-05T14:00:00Z"));

    expect(report.blockers).toContainEqual(expect.objectContaining({
      code: "screenings_missing",
      appliedRuleIds: expect.arrayContaining([SPECIFIC_INCOMPLETE_SCREENING_BLOCKER_RULE_ID]),
    }));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "screening_gtot_missing_operator_required_1" }));
  });

  it("regola generale (Giuliano, 2026-09-08): una risoluzione operatore per la misura mancante rimuove screenings_missing e produce il prodotto fisico", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-measurement-resolution-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `FATTURA 262 del 07/07/2026\nTenda da sole modello Astor, colore bianco, senza misura in fattura\nTOTALE DOCUMENTO 500,00 €`);
    const analysis = { items: [{
      documentKey: "fattura-262", customerKey: "fixture-operatore-misura", kind: "invoice", state: "analyzed", textPath: invoicePath,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "262", documentDate: "2026-07-07", total: 500 }, screeningItems: [],
    }] } as never;

    const before = buildCrmLocalPreflightReport({ row: { id: "fixture-operatore-misura" } }, "fixture-operatore-misura", analysis, new Date("2026-09-08T10:00:00Z"));
    expect(before.blockers).toContainEqual(expect.objectContaining({ code: "screenings_missing" }));
    expect(before.products).toHaveLength(0);

    const after = buildCrmLocalPreflightReport({ row: { id: "fixture-operatore-misura" } }, "fixture-operatore-misura", analysis, new Date("2026-09-08T10:05:00Z"), {
      questionId: "measure:fixture-operatore-misura:fattura-262", customerKey: "fixture-operatore-misura", sourceId: "fattura-262",
      description: "Tenda da sole", rawWidth: 250, rawHeight: 220, unit: "centimeters", note: "Misurata dal cliente su richiesta operatore.",
      operatorId: "operatore", commandId: "cmd-fixture-operatore-misura-1", answeredAt: "2026-09-08T10:04:00Z",
    });
    expect(after.blockers).not.toContainEqual(expect.objectContaining({ code: "screenings_missing" }));
    expect(after.products).toContainEqual(expect.objectContaining({ widthMm: 2500, heightMm: 2200, gTot: 0.13, gTotSource: "authorized_fallback" }));
    expect(after.warnings).toContainEqual(expect.objectContaining({ code: "operator_measurement_unit_applied" }));
  });

  it("ritira il falso blocker totale soltanto quando ogni totale nullo coincide con uno storno non economico verificato", () => {
    const message = "Il totale di almeno un documento fiscale non è stato riconosciuto.";
    const documents = [{ path: "storno-zero", total: null }, { path: "fattura-base", total: 5_000 }];
    expect(isResolvedNonEconomicTotalBlocker(message, documents, {
      usable: true,
      nonEconomicSourceIds: ["storno-zero"],
    })).toBe(true);
    expect(isResolvedNonEconomicTotalBlocker(message, documents, {
      usable: false,
      nonEconomicSourceIds: ["storno-zero"],
    })).toBe(false);
    expect(isResolvedNonEconomicTotalBlocker(message, [
      ...documents,
      { path: "fattura-incompleta", total: null },
    ], {
      usable: true,
      nonEconomicSourceIds: ["storno-zero"],
    })).toBe(false);
    expect(isResolvedNonEconomicTotalBlocker("Almeno un documento deve essere letto o controllato manualmente.", documents, {
      usable: true,
      nonEconomicSourceIds: ["storno-zero"],
    })).toBe(false);
  });

  it("non ripubblica il blocker generico dopo lo storno zero verificato e conserva audit e tripla riconciliazione", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-zero-reversal-retirement-")); directories.push(root);
    const zeroReversalPath = path.join(root, "storno-zero.txt");
    const baseInvoicePath = path.join(root, "fattura-base.txt");
    writeFileSync(zeroReversalPath, `FATTURA n. 99/2026 del 07/04/2026
A Detrarre fattura n. 434/2025 -5.000,00
Fattura a saldo 0,00
Imponibile 0,00
IVA 0,00`);
    writeFileSync(baseInvoicePath, `FATTURA n. 434/2025 del 29/12/2025
Fornitura e posa avvolgibile 119 x 154 cm g tot 0,06
Totale imponibile 4.518,63 €
Totale IVA 481,37 €
Totale documento 5.000,00 €`);
    const items = [
      { documentKey: "storno-zero", customerKey: "fixture-zero-reversal", kind: "invoice", state: "analyzed", textPath: zeroReversalPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "fattura-base", customerKey: "fixture-zero-reversal", kind: "invoice", state: "analyzed", textPath: baseInvoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ];
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-zero-reversal" } }, "fixture-zero-reversal", { items } as never, new Date("2026-09-02T20:00:00Z"));
    expect(report.financial).toMatchObject({
      invoiceTotal: 5_000,
      reconciledTotal: 5_000,
      tripleReconciliationVerified: true,
      evidence: expect.arrayContaining([expect.objectContaining({ sourceId: expect.stringContaining("storno-zero:invoice:"), kind: "non_economic", grossTotal: 0 })]),
    });
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "invoice_929a8665" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "resolved_non_economic_total_blocker_retired",
      appliedRuleIds: expect.arrayContaining([RESOLVED_NON_ECONOMIC_TOTAL_BLOCKER_RETIREMENT_RULE_ID]),
    }));
  });

  it("propaga il modulo Schermature dal pacchetto comune alla policy di ripresa annidata", () => {
    const draftPackage = asScreeningDraftPackage({
      customerKey: "fixture-screening-module",
      displayName: "Fixture schermature",
      practiceId: "practice-screening-module",
      packageFingerprint: "package-screening-module",
      workflowFingerprint: "workflow-screening-module",
      workflow: { supportedPages: ["Schermature solari"], screeningItemCount: 1, steps: [], screeningSteps: [] },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    });

    expectTypeOf(draftPackage).toMatchTypeOf<AprEneaDraftPackage>();
    expectTypeOf(draftPackage.module).toEqualTypeOf<"screening">();
    expect(draftPackage.module).toBe("screening");
    expect(nestedUncertainPageSaveProbeAllowed(draftPackage.module, "screening:2")).toBe(true);
  });

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

  it("esclude in modo generale i falsi blocker Schermature quando il gate Infissi e' autorevole", () => {
    const report = {
      outcome: "blocked_case",
      blockers: [
        { code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato dalle fatture originarie.", sourceIds: ["invoice-1"], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality] },
        { code: "invoice_332a5af9", field: "economic_sources", reason: "Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture.", sourceIds: ["invoice-1"], appliedRuleIds: ["core-economic-classification"] },
      ],
      warnings: [],
      draftPlan: { status: "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: "blocked" },
    } as unknown as ReturnType<typeof buildCrmLocalPreflightReport>;

    expect(reconcileCommonReportWithAuthoritativeInfissiGate(report)).toMatchObject({
      outcome: "ready_local_plan",
      blockers: [],
      warnings: [{ code: "screening_validation_not_applicable_to_infissi" }],
      draftPlan: { status: "ready_before_external_action" },
    });
  });

  it("non nasconde un blocker comune reale durante la riconciliazione Infissi", () => {
    const report = {
      outcome: "blocked_case",
      blockers: [
        { code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato dalle fatture originarie.", sourceIds: ["invoice-1"], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality] },
        { code: "tax_code_missing_or_invalid", field: "beneficiary.taxCode", reason: "Codice fiscale non verificato.", sourceIds: ["form-1"], appliedRuleIds: ["core-form-first"] },
      ],
      warnings: [],
      draftPlan: { status: "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: "blocked" },
    } as unknown as ReturnType<typeof buildCrmLocalPreflightReport>;

    expect(reconcileCommonReportWithAuthoritativeInfissiGate(report)).toMatchObject({
      outcome: "blocked_case",
      blockers: [{ code: "tax_code_missing_or_invalid" }],
      draftPlan: { status: "blocked" },
    });
  });

  describe("reconcileAuthoritativeInfissiApplicability", () => {
    function seedCommonCheckpoint(root: string, customerKey: string, report: unknown) {
      const directory = path.join(root, "crm-local-preflight");
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, "checkpoint.json"), JSON.stringify({
        version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: "f".repeat(64),
        currentCustomerKey: null, externalActionAllowed: false, reason: "test", nextAction: "test",
        validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
        items: [{
          customerKey, displayName: customerKey, practiceId: "practice-1", dossierPath: "dossier.json",
          state: "blocked_case", attemptCount: 1, startedAt: null, endedAt: null, disposition: null,
          reason: "test", report,
        }],
      }, null, 2));
    }
    const screeningNoiseReport = () => ({
      outcome: "blocked_case",
      blockers: [
        { code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato dalle fatture originarie.", sourceIds: ["invoice-1"], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality] },
        { code: "invoice_332a5af9", field: "economic_sources", reason: "Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture.", sourceIds: ["invoice-1"], appliedRuleIds: ["core-economic-classification"] },
      ],
      warnings: [],
      draftPlan: { status: "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: "blocked" },
    });

    it("regressione Olteanu: riconcilia una pratica Infissi anche quando il gate Infissi ha propri blocker tecnici aperti (coorte 2925)", () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "apr-infissi-authoritative-blocked-"));
      directories.push(root);
      seedCommonCheckpoint(root, "andreea-ioana-olteanu", screeningNoiseReport());
      const preflight = new PersistentAprCrmLocalPreflight(root, new PersistentAprCrmDocumentAnalysis(root));
      const result = preflight.reconcileAuthoritativeInfissiApplicability({
        status: "completed",
        items: [{ customerKey: "andreea-ioana-olteanu", state: "blocked_case", productModule: "infissi", report: { blockers: ["infissi_dimensions_and_cardinality_missing", "infissi_dimensions_and_cardinality_missing"] } }],
      });
      const item = result.items.find((candidate) => candidate.customerKey === "andreea-ioana-olteanu")!;
      expect(item.report?.blockers).toEqual([]);
      expect(item.state).toBe("ready_local_plan");
      expect(item.report?.warnings).toContainEqual(expect.objectContaining({ code: "screening_validation_not_applicable_to_infissi" }));
    });

    it("non riconcilia (e non nasconde blocker Schermature reali per) una pratica classificata come mixed", () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "apr-infissi-authoritative-mixed-"));
      directories.push(root);
      seedCommonCheckpoint(root, "cliente-misto", screeningNoiseReport());
      const preflight = new PersistentAprCrmLocalPreflight(root, new PersistentAprCrmDocumentAnalysis(root));
      const result = preflight.reconcileAuthoritativeInfissiApplicability({
        status: "completed",
        items: [{ customerKey: "cliente-misto", state: "blocked_case", productModule: "mixed", report: { blockers: [] } }],
      });
      const item = result.items.find((candidate) => candidate.customerKey === "cliente-misto")!;
      expect(item.report?.blockers).toEqual(screeningNoiseReport().blockers);
      expect(item.state).toBe("blocked_case");
    });

    it("continua a riconciliare senza regressioni una pratica Infissi gia' pronta e senza blocker (comportamento storico)", () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "apr-infissi-authoritative-ready-"));
      directories.push(root);
      seedCommonCheckpoint(root, "fixture-infissi-ready", screeningNoiseReport());
      const preflight = new PersistentAprCrmLocalPreflight(root, new PersistentAprCrmDocumentAnalysis(root));
      const result = preflight.reconcileAuthoritativeInfissiApplicability({
        status: "completed",
        items: [{ customerKey: "fixture-infissi-ready", state: "ready_local_plan", report: { blockers: [] } }],
      });
      const item = result.items.find((candidate) => candidate.customerKey === "fixture-infissi-ready")!;
      expect(item.report?.blockers).toEqual([]);
      expect(item.state).toBe("ready_local_plan");
    });
  });

  it("mantiene il materiale dell'avvolgibile isolato dalle righe Infissi della stessa fattura", () => {
    const result = resolveProductTechnicalAttributes("Tapparella in alluminio", "Infissi PVC esterno bianco", null);
    expect(result).toMatchObject({ material: "Metallo", gTot: 0.06, ruleId: "user-2026-08-31-rigid-screening-missing-gtot-006-v1" });
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
  it("regressione Buracchi, fattura auto-contenuta con Totale complessivo fornitura non fabbrica un documento mancante", () => {
    const balance = { sourceId: "saldo-1512", documentNumber: "1512", referencedInvoiceNumbers: ["320"], text: "Totale complessivo fornitura e posa in opera euro 9.010,00 - Fatt.acconto nr. 320 del 30/11/2025 - TOTALE DOCUMENTO 6.426,92" };
    expect(resolveExplicitAdvanceInvoiceReferences([balance])).toEqual({
      missing: [], uniqueBaseMatches: [], selfContainedReferences: [{
        sourceId: "saldo-1512", reference: "320", declaredSupplyTotal: 9010,
        evidence: "Totale complessivo fornitura e posa in opera euro 9.010,00",
      }],
    });
    expect(missingExplicitAdvanceInvoiceReferences([balance])).toEqual([]);
  });

  it("mantiene fail-closed un acconto citato quando esiste soltanto il Totale documento generico", () => {
    const balance = { sourceId: "saldo-1512", documentNumber: "1512", referencedInvoiceNumbers: ["320"], text: "Fornitura e posa in opera - Fatt.acconto nr. 320 del 30/11/2025 - TOTALE DOCUMENTO 6.426,92" };
    expect(missingExplicitAdvanceInvoiceReferences([balance])).toEqual([{ sourceId: "saldo-1512", reference: "320" }]);
    expect(missingExplicitAdvanceInvoiceReferences([balance, { sourceId: "acconto-320", documentNumber: "320", referencedInvoiceNumbers: [], text: "Fattura di acconto" }])).toEqual([]);
    expect(missingExplicitAdvanceInvoiceReferences([{ ...balance, referencedInvoiceNumbers: [], text: "Totale documento 9.010,00" }])).toEqual([]);
  });

  it("risolve il suffisso fattura soltanto tramite un numero base univoco e auditabile", () => {
    const saldo = { sourceId: "saldo-223", documentNumber: "223", referencedInvoiceNumbers: ["162/26"], text: "ACCONTO RICEVUTO RIF. NS. FATTURA N.162 DEL 14/05/2026" };
    expect(resolveExplicitAdvanceInvoiceReferences([saldo, { sourceId: "acconto-162", documentNumber: "162", referencedInvoiceNumbers: [], text: "Fattura di acconto" }])).toEqual({
      missing: [],
      uniqueBaseMatches: [{ sourceId: "saldo-223", reference: "162/26", matchedDocumentNumber: "162" }],
      selfContainedReferences: [],
    });
    expect(missingExplicitAdvanceInvoiceReferences([
      { ...saldo, referencedInvoiceNumbers: ["59"], text: "Fattura di acconto n. 59" },
      { sourceId: "acconto-59-a", documentNumber: "59/A", referencedInvoiceNumbers: [], text: "Fattura di acconto" },
    ])).toEqual([]);
  });

  it("mantiene fail-closed il suffisso fattura quando piu serie condividono il numero base", () => {
    const saldo = { sourceId: "saldo-92-a", documentNumber: "92/A", referencedInvoiceNumbers: ["59"], text: "Fattura di acconto n. 59" };
    expect(resolveExplicitAdvanceInvoiceReferences([
      saldo,
      { sourceId: "acconto-59-a", documentNumber: "59/A", referencedInvoiceNumbers: [], text: "Fattura di acconto" },
      { sourceId: "acconto-59-b", documentNumber: "59/B", referencedInvoiceNumbers: [], text: "Fattura di acconto" },
    ])).toEqual({ missing: [{ sourceId: "saldo-92-a", reference: "59" }], uniqueBaseMatches: [], selfContainedReferences: [] });
  });

  it("non usa la stessa fattura di saldo per soddisfare il proprio riferimento acconto", () => {
    const saldo = { sourceId: "saldo-161", documentNumber: "161", referencedInvoiceNumbers: ["161/26"], text: "ACCONTO RICEVUTO RIF. NS. FATTURA N.161 DEL 14/05/2026" };
    expect(resolveExplicitAdvanceInvoiceReferences([saldo, { ...saldo, sourceId: "copia-saldo-161" }])).toEqual({
      missing: [{ sourceId: "saldo-161", reference: "161/26" }, { sourceId: "copia-saldo-161", reference: "161/26" }],
      uniqueBaseMatches: [],
      selfContainedReferences: [],
    });
  });

  it("regressione Tocchetti end-to-end: ritira la copia OCR duplicata prima del gate sui riferimenti di acconto", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-tocchetti-reference-after-dedup-")); directories.push(root);
    const acconto = path.join(root, "acconto-162.txt"); const saldo = path.join(root, "saldo-223.txt"); const composite = path.join(root, "composite-162.txt");
    writeFileSync(acconto, "Fattura n. 162 del 14/05/2026\nTotale fattura 1.230,00");
    writeFileSync(saldo, "Fattura n. 223 del 30/06/2026\nACCONTO RICEVUTO RIF. NS. FATTURA N.162 DEL 14/05/2026\nTotale fattura 1.680,33");
    writeFileSync(composite, "Fattura n. 162 del 14/05/2026\nACCONTO RICEVUTO RIF. NS. FATTURA N.162 DEL 14/05/2026\nTotale fattura 1.680,33");
    const report = buildCrmLocalPreflightReport({ row: { id: "tocchetti-fixture", fatture_urls: ["acconto", "saldo", "composite"], dati_form: {} } }, "tocchetti-fixture", { items: [
      { documentKey: "acconto-162", customerKey: "tocchetti-fixture", kind: "invoice", state: "analyzed", textPath: acconto, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "saldo-223", customerKey: "tocchetti-fixture", kind: "invoice", state: "analyzed", textPath: saldo, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "composite-162", customerKey: "tocchetti-fixture", kind: "invoice", state: "analyzed", textPath: composite, extractionMode: "macos_vision_ocr", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ] } as never, new Date("2026-09-09T10:00:00Z"));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "original_invoice_missing_or_unavailable" }));
    expect(report.financial.discardedDuplicateSourceIds).toHaveLength(1);
    expect(report.financial.discardedDuplicateSourceIds.some((sourceId) => sourceId.startsWith("composite-162"))).toBe(true);
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
  it("seconda correzione di Giuliano: applica esattamente la finestra ENEA 2026 dal 30 giugno al 28 settembre quando la fine lavori e' dal 4 febbraio in poi", () => {
    const inside = assessEnea2026SubmissionDeadline("2026-06-24", new Date("2026-09-28T12:00:00Z"));
    expect(inside).toMatchObject({ specialWindowApplied: true, calculationStartDate: "2026-06-30", deadlineDate: "2026-09-28", elapsedDays: 90, withinDeadline: true });
    expect(completionDateOperatorBlockers("2026-06-24", "fine", true, new Date("2026-09-28T12:00:00Z"))).toEqual([]);

    const expired = completionDateOperatorBlockers("2026-06-24", "fine", true, new Date("2026-09-29T12:00:00Z"));
    expect(expired).toEqual([expect.objectContaining({ code: "completion_over_90_days_operator_required", sourceIds: ["fine"], appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.enea2026June30NinetyDayWindowCompletionDateOnly]) })]);
    expect(expired[0].reason).toContain("termine 28/09/2026");
  });
  it("seconda correzione di Giuliano: la finestra dipende soltanto dalla fine lavori, l'inizio lavori non conta (e non e' piu' un parametro della funzione)", () => {
    // Fine lavori prima della soglia: nessuna finestra, nessun blocco a poca distanza.
    expect(assessEnea2026SubmissionDeadline("2026-02-03", new Date("2026-03-01T12:00:00Z")).specialWindowApplied).toBe(false);
    expect(completionDateOperatorBlockers("2026-02-03", "fine", true, new Date("2026-03-01T12:00:00Z"))).toEqual([]);
    // Fine lavori dal 4 febbraio in poi attiva sempre la finestra, qualunque
    // sia la distanza dalla decorrenza fissa del 30/06/2026: nessuna seconda
    // condizione, e la data di inizio lavori (assente dalla firma) non entra
    // mai nel calcolo.
    expect(assessEnea2026SubmissionDeadline("2026-02-04", new Date("2026-08-23T12:00:00Z")).specialWindowApplied).toBe(true);
    expect(assessEnea2026SubmissionDeadline("2026-12-31", new Date("2026-08-23T12:00:00Z")).specialWindowApplied).toBe(true);
  });
  it("usa una dichiarazione originaria esplicita di fine installazione prima della data fattura", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-explicit-completion-")); directories.push(root);
    const declarationPath = path.join(root, "dichiarazione.txt");
    writeFileSync(declarationPath, "Foggia, 18 Luglio 2026.\nI lavori di installazione sono terminati in data 17.07.2026.");
    const analysis = { items: [{ documentKey: "dichiarazione-produttore", customerKey: "cliente", kind: "additional", state: "analyzed", textPath: declarationPath }] } as never;
    expect(resolveExplicitOriginalCompletionDate(analysis, "cliente")).toEqual({
      status: "verified", value: "2026-07-17", sourceIds: ["dichiarazione-produttore"], evidenceKinds: ["completion_declaration"],
    });
  });
  it("usa il collaudo finale datato come prova di completamento della posa", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-final-commissioning-")); directories.push(root);
    const declarationPath = path.join(root, "collaudo.txt");
    writeFileSync(declarationPath, "DICHIARAZIONE DI COLLAUDO FINALE DELLA POSA IN OPERA DEI SERRAMENTI INSTALLATI\nIn data 12-02-2026 si è verificata il collaudo della posa in opera degli infissi installati.");
    const analysis = { items: [{ documentKey: "verbale-collaudo", customerKey: "cliente", kind: "additional", state: "analyzed", textPath: declarationPath }] } as never;
    expect(resolveExplicitOriginalCompletionDate(analysis, "cliente")).toEqual({
      status: "verified", value: "2026-02-12", sourceIds: ["verbale-collaudo"], evidenceKinds: ["final_installation_commissioning"],
    });
  });
  it("regressione Cigognetti: usa la data etichettata del verbale di collaudo e consegna prima della fattura", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-dated-commissioning-report-")); directories.push(root);
    const declarationPath = path.join(root, "verbale-collaudo-consegna.txt");
    writeFileSync(declarationPath, "Verbale di collaudo e consegna\nIl committente accetta le opere descritte.\ndata09/07/2026 Firma del committente");
    const analysis = { items: [{ documentKey: "verbale-collaudo-consegna", customerKey: "cliente", kind: "additional", state: "analyzed", textPath: declarationPath }] } as never;
    expect(resolveExplicitOriginalCompletionDate(analysis, "cliente")).toEqual({
      status: "verified", value: "2026-07-09", sourceIds: ["verbale-collaudo-consegna"], evidenceKinds: ["dated_commissioning_report"],
    });
  });
  it("non confonde righe fiscali di collaudo o verbali di prova prodotto con un verbale di collaudo della pratica", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-non-commissioning-report-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    const certificatePath = path.join(root, "certificato.txt");
    writeFileSync(invoicePath, "FATTURA 7 del 24/03/2026\nFornitura, posa e collaudo serramenti\nData scadenza 24/03/2026");
    writeFileSync(certificatePath, "CERTIFICATO DI PRODOTTO\nDocumentazione: Verbale di prova n. 353/19\nData di rilascio: 06/01/2020");
    const analysis = { items: [
      { documentKey: "fattura", customerKey: "cliente", kind: "invoice", state: "analyzed", textPath: invoicePath },
      { documentKey: "certificato", customerKey: "cliente", kind: "additional", state: "analyzed", textPath: certificatePath },
    ] } as never;
    expect(resolveExplicitOriginalCompletionDate(analysis, "cliente")).toEqual({ status: "not_found", value: null, sourceIds: [], evidenceKinds: [] });
  });
  it("non trasforma date di fattura, pagamento o posa descrittiva in fine lavori e fallisce chiuso sui conflitti", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-explicit-completion-negative-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt"); const conflictPath = path.join(root, "conflitto.txt");
    writeFileSync(invoicePath, "FATTURA 315/FE del 16/12/2025\nSALDO LAVORI\nFornitura e posa in opera serramenti\nBonifico del 17/12/2025");
    const invoiceOnly = { items: [{ documentKey: "fattura", customerKey: "cliente", kind: "invoice", state: "analyzed", textPath: invoicePath }] } as never;
    expect(resolveExplicitOriginalCompletionDate(invoiceOnly, "cliente")).toEqual({ status: "not_found", value: null, sourceIds: [], evidenceKinds: [] });
    writeFileSync(conflictPath, "I lavori di installazione sono terminati in data 17.07.2026.\fI lavori sono ultimati in data 18.07.2026.");
    const conflict = { items: [{ documentKey: "dichiarazioni", customerKey: "cliente", kind: "additional", state: "analyzed", textPath: conflictPath }] } as never;
    expect(resolveExplicitOriginalCompletionDate(conflict, "cliente")).toEqual({
      status: "conflict", value: null, sourceIds: ["dichiarazioni"], evidenceKinds: ["completion_declaration"],
    });
    expect(EXPLICIT_ORIGINAL_COMPLETION_DATE_RULE_ID).toBe("system-explicit-original-completion-date-v1");
  });
  it("usa sempre il lordo delle fatture anche con Pratica ENEA compresa, senza fermare la pratica (regola 2026-09-06)", () => {
    const texts = [
      { sourceId: "fattura-104", text: "Totale Fattura € 375,00\nPratica Enea compresa" },
      { sourceId: "fattura-202", text: "Totale Fattura € 875,00\nPratica Enea compresa" },
    ];
    expect(resolveBundledProfessionalExpense(texts, 1250)).toMatchObject({
      status: "gross_used_marker_present",
      eligibleTechnicalExpense: 1250,
      excludedUnclassifiedExpense: 0,
      markers: [{ sourceId: "fattura-104" }, { sourceId: "fattura-202" }],
    });
  });

  it("conserva per continuita' di audit la risoluzione caso-specifica storica di Elisa, ma non richiede piu' operatore per altre pratiche con lordo diverso", () => {
    const resolution = CASE_SPECIFIC_FINANCIAL_RESOLUTIONS[0];
    const result = resolveBundledProfessionalExpense([{ sourceId: "fattura-202", text: "Pratica Enea compresa" }], 1250, resolution);
    expect(result).toMatchObject({ status: "resolved_case_specific", eligibleTechnicalExpense: 1250, excludedUnclassifiedExpense: 0 });
    expect(result.resolution?.reason).toContain("nessun importo deve essere escluso");
    expect(result.resolution?.appliedRuleIds).toEqual(expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation, USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume]));
    expect(resolveBundledProfessionalExpense([{ sourceId: "altra", text: "Pratica Enea compresa" }], 1400, resolution)).toMatchObject({
      status: "gross_used_marker_present", eligibleTechnicalExpense: 1400, excludedUnclassifiedExpense: 0,
    });
  });

  it("non esclude piu' una fattura professionale ENEA separata: il lordo resta la somma di tutte le fatture (regola 2026-09-06)", () => {
    expect(resolveBundledProfessionalExpense([
      { sourceId: "fattura-infissi-61", text: "Fornitura e posa infissi", grossTotal: 1899.70 },
      { sourceId: "fattura-enea-91", text: "OGGETTO\nPratica ENEA\nPratica ENEA Ecobonus\nassistenza alla raccolta documentale e invio pratica", grossTotal: 305 },
      { sourceId: "fattura-infissi-89", text: "Fornitura e posa infissi", grossTotal: 771.40 },
      { sourceId: "fattura-infissi-85", text: "Fornitura e posa infissi", grossTotal: 1139.82 },
    ], 4115.92)).toMatchObject({
      status: "gross_used_marker_present",
      eligibleTechnicalExpense: 4115.92,
      excludedUnclassifiedExpense: 0,
      markers: expect.arrayContaining([expect.objectContaining({ sourceId: "fattura-enea-91" })]),
    });
  });

  it("regressione di collegamento: una pratica con «Pratica ENEA compresa» e nessuna esclusione documentata NON produce piu' il blocker bundled_professional_expense_unitemized end-to-end", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-gross-sum-connection-")); directories.push(root);
    const invoicePath = path.join(root, "fattura-guido.txt");
    writeFileSync(invoicePath, `Fattura n. 1 del 01/03/2026\nFornitura e posa infissi in PVC\nPratica Enea compresa\nTotale imponibile € 5.000,00\nImporto Iva € 1.100,00\nTotale Fattura € 6.100,00`);
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-gross-sum-connection" } }, "fixture-gross-sum-connection", { items: [{
      documentKey: "fattura-guido", customerKey: "fixture-gross-sum-connection", kind: "invoice", state: "analyzed", textPath: invoicePath,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 6100 },
      screeningItems: [],
    }] } as never, new Date("2026-06-01T10:00:00Z"));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "bundled_professional_expense_unitemized" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "bundled_professional_expense_gross_used",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.grossInvoiceSumSupersedesServiceSeparation]),
    }));
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

  it("decisione di Giuliano: sospende il gate di riconciliazione bonifici anche quando il capitale bonificato supera le fatture o non e' leggibile", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-bank-transfer-gate-suspended-")); directories.push(root);
    const invoicePath = path.join(root, "fattura-90.txt");
    const overTransferPath = path.join(root, "bonifico-eccedente.txt");
    writeFileSync(invoicePath, `Fattura n. 90 del 10/05/2026\nTenda da sole\nTotale Fattura € 500,00`);
    writeFileSync(overTransferPath, `BONIFICO AGEVOLAZIONE FISCALE\nImporto: 900,00 €\nCausale/N.fattura: Saldo fattura 90 2026\nTipo detrazione: Risparmio energetico\nL. 296/06 e succ. mod. e proroghe Risp.Energ.`);
    const items = [
      { documentKey: "invoice-90", customerKey: "fixture-bank-transfer-suspended", kind: "invoice", state: "analyzed", textPath: invoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "transfer-90", customerKey: "fixture-bank-transfer-suspended", kind: "invoice", state: "analyzed", textPath: overTransferPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ];
    const overReport = buildCrmLocalPreflightReport({ row: { id: "fixture-bank-transfer-suspended" } }, "fixture-bank-transfer-suspended", { items } as never, new Date("2026-08-01T10:00:00Z"));
    expect(overReport.financial.invoiceTotal).toBe(500);
    expect(overReport.blockers).not.toContainEqual(expect.objectContaining({ code: "bank_transfer_principal_exceeds_invoices" }));
    expect(overReport.blockers).not.toContainEqual(expect.objectContaining({ code: "bank_transfer_invoice_cross_check_failed" }));

    const unreadableTransferPath = path.join(root, "bonifico-illeggibile.txt");
    writeFileSync(unreadableTransferPath, `BONIFICO AGEVOLAZIONE FISCALE\nImporto illeggibile\nCausale/N.fattura: riferimento non chiaro\nTipo detrazione: Risparmio energetico\nL. 296/06 e succ. mod. e proroghe Risp.Energ.`);
    const unverifiedReport = buildCrmLocalPreflightReport({ row: { id: "fixture-bank-transfer-suspended" } }, "fixture-bank-transfer-suspended", {
      items: [items[0], { ...items[1], documentKey: "transfer-illeggibile", textPath: unreadableTransferPath }],
    } as never, new Date("2026-08-01T10:00:00Z"));
    expect(unverifiedReport.blockers).not.toContainEqual(expect.objectContaining({ code: "bank_transfer_invoice_cross_check_failed" }));
  });

  it("regressione Manso: una ricevuta di bonifico con commissioni bancarie non conta piu' come una terza fattura indipendente", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-manso-bank-transfer-not-invoice-")); directories.push(root);
    const advancePath = path.join(root, "fattura-201.txt");
    const balancePath = path.join(root, "fattura-264.txt");
    const receiptPath = path.join(root, "ricevuta-bonifico-264.txt");
    writeFileSync(advancePath, `Fattura n. 201 del 05/06/2026\nFattura di acconto per fornitura e posa da effettuare di n. 1 tenda da sole\nN. 1 Tenda da sole L.400xh.250\nPratica Enea compresa\nG TOT 0,10\nTotale imponibile € 654,55\nImporto Iva € 65,45\nTotale Fattura € 720,00`);
    writeFileSync(balancePath, `Fattura n. 264 del 08/07/2026\nFattura a saldo per fornitura e posa di n. 1 tenda da sole\nN. 1 Tenda da sole L.400xh.250\n-acconto ricevuto rif. ns. fatt. n. 201 del 5.6.26\nPratica Enea compresa\nG TOT 0,10\nTotale imponibile € 1.200,00\nImporto Iva € 120,00\nTotale Fattura € 1320,00`);
    writeFileSync(receiptPath, `SERVIZIO PAGAMENTI/ORDINANTE\nABBIAMO RICEVUTO L'ORDINE DI BONIFICO INDICATO, AL QUALE ABBIAMO\nDATO ESECUZIONE IN CONFORMITA' ALLE VOSTRE ISTRUZIONI.\nEUR *1.320,00*\nCON APPLICAZIONE DI COMMISSIONI: SU VS C/C IMPORTO EUR *0,40*\nMOTIVO DEL PAGAMENTO:\nN.FAT:264 DEL 08/07/26\nSALDO fattura num. 264 del 08-07-2026 per fornitura tenda da sole\nTOTALE: EUR 1.320,40`);
    const items = [
      { documentKey: "invoice-201", customerKey: "fixture-manso-bank-transfer", kind: "invoice", state: "analyzed", textPath: advancePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "invoice-264", customerKey: "fixture-manso-bank-transfer", kind: "invoice", state: "analyzed", textPath: balancePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "receipt-264", customerKey: "fixture-manso-bank-transfer", kind: "invoice", state: "analyzed", textPath: receiptPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ];
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-manso-bank-transfer" } }, "fixture-manso-bank-transfer", { items } as never, new Date("2026-08-01T10:00:00Z"));
    expect(report.financial.invoiceTotal).toBe(2040);
    expect(report.financial.evidence).toHaveLength(2);
    expect(report.financial.evidence.map((item) => item.sourceId)).not.toEqual(expect.arrayContaining([expect.stringContaining("receipt-264")]));
  });

  it("regressione Ronconi (2026-09-08): non azzera le fonti economiche quando la conferma di bonifico e' accodata alla stessa fattura reale nello stesso allegato", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-ronconi-invoice-with-appended-transfer-")); directories.push(root);
    const advancePath = path.join(root, "fattura-545.txt");
    const balancePath = path.join(root, "fattura-712.txt");
    writeFileSync(advancePath, `Fattura n. 545/26 del 05/06/2026\nAcconto 50% per fornitura e posa da effettuare di n. 1 tenda da sole\nTotale imponibile € 545,45\nImporto Iva € 54,55\nTotale documento 600,00 EUR\nCONFERMA ORDINE DI BONIFICO SEPA PER DETRAZIONE FISCALE\nImporto disposto: EUR 600,00\nA favore di: FORNITORE SRL\nData esecuzione: 05/06/2026`);
    writeFileSync(balancePath, `Fattura Accompagnatoria n. 712/26 del 06/07/2026\nSaldo per fornitura e posa di n. 1 tenda da sole L.400xh.250\nG TOT 0,10\nTotale imponibile € 900,00\nImporto Iva € 90,00\nTotale documento 975,01 EUR\nCONFERMA ORDINE DI BONIFICO SEPA PER DETRAZIONE FISCALE\nImporto disposto: EUR 975,01\nA favore di: FORNITORE SRL\nData esecuzione: 06/07/2026`);
    const items = [
      { documentKey: "invoice-545", customerKey: "fixture-ronconi-appended-transfer", kind: "invoice", state: "analyzed", textPath: advancePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "invoice-712", customerKey: "fixture-ronconi-appended-transfer", kind: "invoice", state: "analyzed", textPath: balancePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ];
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-ronconi-appended-transfer" } }, "fixture-ronconi-appended-transfer", { items } as never, new Date("2026-08-01T10:00:00Z"));
    expect(report.financial.invoiceTotal).toBe(1575.01);
    expect(report.financial.evidence).toHaveLength(2);
    const grossTripleBlocker = report.blockers.find((item) => item.code === "gross_triple_reconciliation_failed");
    expect(grossTripleBlocker?.exactCause ?? "").not.toMatch(/fonti-assenti|nessuna-fattura-economica-valida/);
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "invoice_segment_kept_despite_bank_transfer_evidence",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.bankTransferSegmentExclusionRequiresIncompleteTriple]),
    }));
  });

  it("regressione Ronconi (2026-09-08), controprova negativa: una conferma di bonifico senza una terna fiscale propria completa resta esclusa anche quando cita numero e data di una fattura reale", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-ronconi-negative-incomplete-triple-")); directories.push(root);
    const invoicePath = path.join(root, "fattura-545.txt");
    const receiptFragmentPath = path.join(root, "conferma-senza-totale.txt");
    writeFileSync(invoicePath, `Fattura n. 545/26 del 05/06/2026\nAcconto 50% per fornitura e posa da effettuare di n. 1 tenda da sole\nTotale imponibile € 545,45\nImporto Iva € 54,55\nTotale documento 600,00 EUR`);
    writeFileSync(receiptFragmentPath, `CONFERMA ORDINE DI BONIFICO SEPA PER DETRAZIONE FISCALE\nA favore di: FORNITORE SRL\nRiferimento fattura 545/26 del 05/06/2026\nData esecuzione: 05/06/2026`);
    const items = [
      { documentKey: "invoice-545", customerKey: "fixture-ronconi-incomplete-triple", kind: "invoice", state: "analyzed", textPath: invoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "receipt-fragment", customerKey: "fixture-ronconi-incomplete-triple", kind: "invoice", state: "analyzed", textPath: receiptFragmentPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
    ];
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-ronconi-incomplete-triple" } }, "fixture-ronconi-incomplete-triple", { items } as never, new Date("2026-08-01T10:00:00Z"));
    expect(report.financial.invoiceTotal).toBe(600);
    expect(report.financial.evidence).toHaveLength(1);
    expect(report.financial.evidence.map((item) => item.sourceId)).not.toEqual(expect.arrayContaining([expect.stringContaining("receipt-fragment")]));
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

  it("senza riferimento Ordine Cliente resta la prima fattura dell'intero dossier (comportamento storico invariato)", () => {
    expect(resolveInvoiceWorkDates([
      { sourceId: "fattura-vecchio-ordine", documentDate: "2025-12-11", text: "Acconto su Ordine Cliente 86 del 11/12/2025" },
      { sourceId: "fattura-nuovo-ordine-saldo", documentDate: "2026-04-14", text: "Fattura senza alcun riferimento ordine" },
    ])).toMatchObject({ startDate: "2025-12-11", startDateSource: "fattura-vecchio-ordine" });
  });

  it("regressione Calvacchi: un acconto di un ordine precedente gia' saldato non retrodata l'inizio lavori dell'ordine corrente (user-2026-09-06-invoice-work-date-chronology-order-scoped-v1)", () => {
    const result = resolveInvoiceWorkDates([
      { sourceId: "fattura-187", documentDate: "2025-12-11", text: "Acconto su Ordine Cliente 86 del 11/12/2025" },
      { sourceId: "fattura-195", documentDate: "2025-12-23", text: "Acconto su Ordine Cliente 8 6 del 11/12/2025" },
      { sourceId: "fattura-16", documentDate: "2026-02-05", text: "Rif. Ordine Cliente 8 6 del 11/12/2025: saldo finestre in legno" },
      { sourceId: "fattura-30", documentDate: "2026-03-12", text: "Acconto su Ordine Cliente 13 del 11/03/2026" },
      { sourceId: "fattura-41", documentDate: "2026-04-14", text: "Rif. Ordine Cliente 13 del 11/03/2026: Rif. Preventivo 32 del 10/03/2026, saldo smontaggio e montaggio" },
    ]);
    expect(result).toEqual({
      startDate: "2026-03-12",
      startDateSource: "fattura-30",
      completionDate: "2026-04-14",
      completionDateSource: "fattura-41",
    });
  });

  it("regressione di collegamento end-to-end: la finestra ENEA 2026 si applica davvero nel preflight sulla fine lavori scoped al riferimento ordine (regressione Calvacchi, coorte 2921)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-calvacchi-deadline-connection-")); directories.push(root);
    const oldOrderInvoice = path.join(root, "fattura-187.txt");
    const newOrderAdvance = path.join(root, "fattura-30.txt");
    const newOrderBalance = path.join(root, "fattura-41.txt");
    writeFileSync(oldOrderInvoice, `Fattura n. 187 del 11/12/2025\nAcconto su Ordine Cliente 86 del 11/12/2025\nFinestre in legno\nTotale Fattura € 4.400,00`);
    writeFileSync(newOrderAdvance, `Fattura n. 30 del 12/03/2026\nAcconto su Ordine Cliente 13 del 11/03/2026\nTrasporto smontaggio e montaggio\nTotale Fattura € 500,00`);
    writeFileSync(newOrderBalance, `Fattura n. 41 del 14/04/2026\nRif. Ordine Cliente 13 del 11/03/2026: Rif. Preventivo 32 del 10/03/2026\nSaldo trasporto smontaggio del vecchio e montaggio del nuovo\nTotale Fattura € 500,00`);
    const items = [
      { documentKey: "fattura-187", customerKey: "fixture-calvacchi-deadline", kind: "invoice", state: "analyzed", textPath: oldOrderInvoice, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "187", documentDate: "2025-12-11", total: 4400 }, screeningItems: [] },
      { documentKey: "fattura-30", customerKey: "fixture-calvacchi-deadline", kind: "invoice", state: "analyzed", textPath: newOrderAdvance, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "30", documentDate: "2026-03-12", total: 500 }, screeningItems: [] },
      { documentKey: "fattura-41", customerKey: "fixture-calvacchi-deadline", kind: "invoice", state: "analyzed", textPath: newOrderBalance, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "41", documentDate: "2026-04-14", total: 500 }, screeningItems: [] },
    ];
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-calvacchi-deadline" } }, "fixture-calvacchi-deadline", { items } as never, new Date("2026-09-06T10:00:00Z"));
    expect(report.startDate).toBe("2026-03-12");
    expect(report.completionDate).toBe("2026-04-14");
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "completion_over_90_days_operator_required" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "enea_2026_june_30_ninety_day_window_applied",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.enea2026June30NinetyDayWindowCompletionDateOnly]),
    }));
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
  it("instrada Linea Sole Potito a esclusione prima di applicare i fallback cartacei storici", () => {
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
    expect(report).toMatchObject({
      outcome: "blocked_case",
      formAvailable: false,
      blockers: [{ code: "permanent_supplier_automation_exclusion", field: "supplier" }],
      products: [],
      financial: { invoiceTotal: null, evidence: [] },
    });
  });
  it("accetta i soli valori espliciti del modulo cartaceo PraticaRapida anche per un altro rivenditore", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-generic-paper-form-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt"); const formPath = path.join(root, "modulo.txt");
    writeFileSync(invoicePath, `Fattura n. 10 del 30/06/2026\nCliente Mario Rossi CF RSSMRA80A01H501U\nTotale documento 1.000,00 €`);
    writeFileSync(formPath, `Compilazione a cura del richiedente la detrazione
PERSONA FISICA
MARIO ROSSI RSSMRA80A01H501U
Nome Cognome Codice Fiscale
ROMA RM 01 01 1980
Luogo di nascita Prov. Data di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO
PraticaRapida
Pag. 2/5`);
    const report = buildCrmLocalPreflightReport({ row: { id: "generic-paper-1", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", companies: { ragione_sociale: "Altro Rivenditore" }, dati_form: {} } }, "mario-rossi", { items: [
      { documentKey: "invoice", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "paper-form", customerKey: "mario-rossi", kind: "additional", state: "analyzed", textPath: formPath, extractionMode: "native_text", invoiceResult: null, screeningItems: [] },
    ] } as never, new Date("2026-08-17T10:00:00Z"));
    expect(report.formAvailable).toBe(true);
    expect(report.resolvedTaxCode).toBe("RSSMRA80A01H501U");
    expect(report.blockers.map((item) => item.code)).not.toContain("customer_form_missing");
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "original_pratica_rapida_paper_form_explicit_values_accepted" }));
    expect(report.warnings).not.toContainEqual(expect.objectContaining({ code: "linea_sole_potito_paper_form_accepted" }));
  });
  it("rifiuta fail-closed un modulo cartaceo PraticaRapida con identità diversa", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-generic-paper-form-mismatch-")); directories.push(root);
    const formPath = path.join(root, "modulo.txt");
    writeFileSync(formPath, `Compilazione a cura del richiedente la detrazione
PERSONA FISICA
LUIGI BIANCHI BNCLGU80A01H501X
Nome Cognome Codice Fiscale
ROMA RM 01 01 1980
Luogo di nascita Prov. Data di nascita
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO
PraticaRapida
Pag. 2/5`);
    const report = buildCrmLocalPreflightReport({ row: { id: "generic-paper-2", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", companies: { ragione_sociale: "Altro Rivenditore" }, dati_form: {} } }, "mario-rossi", { items: [
      { documentKey: "paper-form", customerKey: "mario-rossi", kind: "additional", state: "analyzed", textPath: formPath, extractionMode: "native_text", invoiceResult: null, screeningItems: [] },
    ] } as never, new Date("2026-08-17T10:00:00Z"));
    expect(report.formAvailable).toBe(false);
    expect(report.blockers.map((item) => item.code)).toContain("customer_form_missing");
  });
  it("riconcilia il modulo cartaceo OCR con l'unico CF valido della fattura e l'identità CRM", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-generic-paper-form-ocr-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt"); const formPath = path.join(root, "modulo.txt");
    writeFileSync(invoicePath, "Fattura n. 11 del 30/06/2026\nCliente ENRICO AMOS MARIA BERNERI C.F.: BRNNCM64B11F205G\nTotale documento 1.000,00 €");
    writeFileSync(formPath, `Compilazione a cura del richiedente la detrazione
PraticaRapida Pag. 2/5
PERSONA FISICA
Nome ENRiCO AMOS YADIA
Cognome BERNERi
Codice Fiscale BRNNCM64B11F2054
Luogo di nascita
MiLANo
Prov.
Mi
Data di nascia 11 02 1964
DATI GENERALI EDIFICIO/ABITAZIONE OGGETTO D’INTERVENTO`);
    const report = buildCrmLocalPreflightReport({ row: { id: "generic-paper-ocr-1", cliente_nome: "Enrico Amos Maria", cliente_cognome: "Berneri", cliente_cf: "", companies: { ragione_sociale: "Altro Rivenditore" }, dati_form: {} } }, "enrico-berneri", { items: [
      { documentKey: "invoice", customerKey: "enrico-berneri", kind: "invoice", state: "analyzed", textPath: invoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] },
      { documentKey: "paper-form", customerKey: "enrico-berneri", kind: "additional", state: "analyzed", textPath: formPath, extractionMode: "native_text", invoiceResult: null, screeningItems: [] },
    ] } as never, new Date("2026-08-17T10:00:00Z"));
    expect(report.formAvailable).toBe(true);
    expect(report.resolvedTaxCode).toBe("BRNNCM64B11F205G");
    expect(report.blockers.map((item) => item.code)).not.toContain("tax_code_missing_or_invalid");
  });
  it("conferma il CF CRM valido soltanto dentro il blocco CLIENTE della fattura originaria", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-invoice-customer-cf-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `FATTURA 113 del 15/04/2026
FORNITORE
CLIENTE
LINEA SOLE POTITO SRL
FRANCESCA MONTI
P.IVA: IT03397500962
C.F.: MNTFNC71P59L319D
Totale documento 1.000,00 EUR`);
    const analysis = { items: [{ documentKey: "invoice", customerKey: "francesca-monti", kind: "invoice", state: "analyzed", textPath: invoicePath, invoiceResult: { documentType: "invoice" }, screeningItems: [] }] } as never;
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "francesca-monti", name: "Francesca", surname: "Monti", taxCode: "MNTFNC71P59L319D", analysis })).toEqual({
      status: "verified_invoice_customer_block", value: "MNTFNC71P59L319D", sourceIds: ["invoice"], usedCfDestinatarioAnchor: false,
    });
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Francesca", cliente_cognome: "Monti", cliente_cf: "MNTFNC71P59L319D", dati_form: {} } }, "francesca-monti", analysis, new Date("2026-08-17T10:00:00Z"));
    expect(report.resolvedTaxCode).toBe("MNTFNC71P59L319D");
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "tax_code_missing_or_invalid" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "crm_fiscal_code_confirmed_by_invoice_customer_block",
      appliedRuleIds: expect.arrayContaining([INVOICE_CUSTOMER_BLOCK_CRM_CF_RULE_ID]),
    }));
  });
  it("regressione Eustomi/Coreggioli: conferma il CF CRM anche senza etichetta CLIENTE, quando compare come 'CF <cf> DESTINATARIO' seguito dal nome sulla riga successiva (formato S.A. Montaggi)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-invoice-cf-destinatario-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `S.A. Montaggi SRLS
Via Trieste 53 a/b - 60124 - Ancona (AN)
P.iva 02912300429 - C.F. 02912300429
FATTURA nr. 168/2026 del 16/06/2026
CF STMSRN68R68A271A DESTINATARIO
Eustomi Sabrina
Via Cupramontana 12
60128 Ancona (AN)
Totale documento 4.160,00 €`);
    const analysis = { items: [{ documentKey: "invoice-eustomi", customerKey: "sabrina-eustomi", kind: "invoice", state: "analyzed", textPath: invoicePath, invoiceResult: { documentType: "invoice" }, screeningItems: [] }] } as never;
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "sabrina-eustomi", name: "Sabrina", surname: "Eustomi", taxCode: "STMSRN68R68A271A", analysis })).toEqual({
      status: "verified_invoice_customer_block", value: "STMSRN68R68A271A", sourceIds: ["invoice-eustomi"], usedCfDestinatarioAnchor: true,
    });
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Sabrina", cliente_cognome: "Eustomi", cliente_cf: "STMSRN68R68A271A", dati_form: {} } }, "sabrina-eustomi", analysis, new Date("2026-09-08T10:00:00Z"));
    expect(report.resolvedTaxCode).toBe("STMSRN68R68A271A");
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "tax_code_missing_or_invalid" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "crm_fiscal_code_confirmed_by_invoice_customer_block",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.cfDestinatarioAnchorWithoutClienteLabel]),
    }));
  });
  it("non conferma un CF 'CF <cf> DESTINATARIO' se il nome sulla riga successiva non corrisponde (resta fail-closed)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-invoice-cf-destinatario-negative-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `S.A. Montaggi SRLS
FATTURA nr. 168/2026 del 16/06/2026
CF STMSRN68R68A271A DESTINATARIO
Altra Persona
Totale documento 4.160,00 €`);
    const analysis = { items: [{ documentKey: "invoice-diverso", customerKey: "sabrina-eustomi", kind: "invoice", state: "analyzed", textPath: invoicePath }] } as never;
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "sabrina-eustomi", name: "Sabrina", surname: "Eustomi", taxCode: "STMSRN68R68A271A", analysis })).toEqual({
      status: "not_found", value: null, sourceIds: [], usedCfDestinatarioAnchor: false,
    });
  });
  it("non conferma il CF CRM se compare soltanto nel bonifico o se nome e prefissi fiscali divergono", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-invoice-customer-cf-negative-")); directories.push(root);
    const invoicePath = path.join(root, "composito.txt");
    writeFileSync(invoicePath, `FATTURA 113 del 15/04/2026
FORNITORE
CLIENTE
LINEA SOLE POTITO SRL
ALTRA PERSONA
C.F.: RSSMRA80A01H501U
\fBONIFICO PER AGEVOLAZIONI
Richiedente FRANCESCA MONTI
Codice fiscale MNTFNC71P59L319D`);
    const analysis = { items: [{ documentKey: "composite", customerKey: "francesca-monti", kind: "invoice", state: "analyzed", textPath: invoicePath }] } as never;
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "francesca-monti", name: "Francesca", surname: "Monti", taxCode: "MNTFNC71P59L319D", analysis })).toEqual({
      status: "not_found", value: null, sourceIds: [], usedCfDestinatarioAnchor: false,
    });
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "francesca-monti", name: "Mario", surname: "Rossi", taxCode: "MNTFNC71P59L319D", analysis })).toEqual({
      status: "not_found", value: null, sourceIds: [], usedCfDestinatarioAnchor: false,
    });
  });
  it("regressione Berti: scopre il CF valido nel blocco CLIENTE quando il CF CRM ha un checksum invalido (stessa precedenza documentale gia' attiva per Comune)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-invoice-customer-cf-discover-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `FATTURA nr. FATTURA195/2026 del 13/06/2026
FORNITORE
CLIENTE
LINEA SOLE POTITO SRL
Elena Marcella Berti
C.F.: BRTLMR63C57F205P
Totale documento 660,00 €`);
    const analysis = { items: [{ documentKey: "invoice", customerKey: "elena-berti", kind: "invoice", state: "analyzed", textPath: invoicePath }] } as never;
    // BRTLMR36C57F205P e' il valore CRM realmente osservato (cifre invertite,
    // checksum non valido); BRTLMR63C57F205P e' il CF valido che compare
    // identico in entrambe le fatture originarie del cliente.
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "elena-berti", name: "Elena Marcella", surname: "Berti", taxCode: "BRTLMR36C57F205P", analysis })).toEqual({
      status: "verified_invoice_customer_block", value: "BRTLMR63C57F205P", sourceIds: ["invoice"], usedCfDestinatarioAnchor: false,
    });
  });
  it("resta fail-closed se il CF CRM e' invalido e nessun CF valido e coerente compare nel blocco CLIENTE", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-invoice-customer-cf-discover-negative-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, `FATTURA nr. 10/2026 del 12/05/2026
CLIENTE
Elena Marcella Berti
Totale documento 660,00 €`);
    const analysis = { items: [{ documentKey: "invoice", customerKey: "elena-berti", kind: "invoice", state: "analyzed", textPath: invoicePath }] } as never;
    expect(resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({ customerKey: "elena-berti", name: "Elena Marcella", surname: "Berti", taxCode: "BRTLMR36C57F205P", analysis })).toEqual({
      status: "not_found", value: null, sourceIds: [], usedCfDestinatarioAnchor: false,
    });
  });
  it("non analizza il PDF composito Linea Sole Potito dopo l'esclusione a monte", () => {
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
    expect(report).toMatchObject({
      outcome: "blocked_case",
      blockers: [{ code: "permanent_supplier_automation_exclusion" }],
      products: [],
      financial: { invoiceTotal: null, evidence: [] },
    });
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
  it("mantiene Lucia Lagrasta nel gate di mapping quando la seconda pagina etichetta esplicitamente il totale finale", () => {
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
Totale fattura € 3.140,00
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
    expect(report.products).toContainEqual(expect.objectContaining({ widthMm: 2850, heightMm: 2800, surfaceM2: 7.98, gTot: 0.06, sourceDocumentKey: "source-order-1504dp" }));
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

  it("regressione pipeline gestionale: cointestazione.presente=true senza nome/cognome/cf non produce un falso blocco (Cotta, Sanvito, Grimaldi, Buoncompagni)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-co-beneficiary-empty-presente-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "FORNITURA TRASPORTO E INSTALLAZIONE DI SCHERMATURA SOLARE A BRACCI ESTENSIBILI CON STRUTTURA IN ALLUMINIO\nTOTALE DOCUMENTO 4.500,00");
    expect(resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "massimo-cotta",
      coOwnership: { presente: true },
      mainDocumentFiscalCode: { status: "not_found", value: null, sourceIds: [], candidates: [] },
      analysis: { items: [{ documentKey: "invoice-cotta", customerKey: "massimo-cotta", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    })).toEqual({ status: "not_declared", present: false, identity: null, sourceIds: [] });
  });

  it("resta fail-closed (unresolved) quando cointestazione.presente=true ha un nome dichiarato ma nessun riscontro nelle fatture", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-co-beneficiary-declared-unresolved-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE MARIO ROSSI C.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 4.500,00");
    expect(resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "mario-rossi",
      coOwnership: { presente: true, nome: "Luigi", cognome: "Bianchi", cf: "BNCLGU80A01H501X" },
      mainDocumentFiscalCode: { status: "not_found", value: null, sourceIds: [], candidates: [] },
      analysis: { items: [{ documentKey: "invoice-mario", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    })).toEqual({ status: "unresolved", present: true, identity: null, sourceIds: ["invoice-mario"] });
  });

  // Gemma Minore, 13/09/2026: il CF era stampato in chiaro sulla fattura
  // Cisam come "Cod. Fisc. MNRGMM95H42G273W", un'etichetta che lo schema non
  // conosceva. APR concludeva che il beneficiario non fosse verificabile su
  // documento e finiva nel ramo che chiedeva all'operatore il cointestatario,
  // a ogni giro, nonostante la risposta fosse gia' registrata e attiva.
  it("riconosce il codice fiscale anche quando l'etichetta e' 'Cod. Fisc.' (Gemma Minore)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-cod-fisc-label-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, [
      "Cisam Infissi Srl",
      "C.F./P.Iva 04332691205",
      "Gemma Minore",
      "Via G. Marconi, 12A",
      "Cod. Fisc. MNRGMM95H42G273W",
      "Tot. documento € 1.190,00",
    ].join("\n"));
    const analysis = { items: [{ documentKey: "invoice-minore", customerKey: "gemma-minore", kind: "invoice", state: "analyzed", textPath: invoice }] } as never;
    const resolved = resolveOriginalDocumentFiscalCode({
      customerKey: "gemma-minore",
      requester: { nome: "Gemma", cognome: "Minore", data_nascita: "1995-06-02" },
      analysis,
    });
    expect(resolved).toMatchObject({ status: "verified", value: "MNRGMM95H42G273W", sourceIds: ["invoice-minore"] });

    // Con il beneficiario verificato, il cointestatario dichiarato solo nel
    // form viene escluso dalla fattura invece di fermare la pratica.
    expect(resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "gemma-minore",
      coOwnership: { presente: true, nome: "Luigi", cognome: "Bianchi", cf: "BNCLGU80A01H501X" },
      mainDocumentFiscalCode: resolved,
      analysis,
    })).toEqual({ status: "excluded_by_invoice", present: false, identity: null, sourceIds: ["invoice-minore"] });
  });

  it("l'etichetta condivisa con la partita IVA non produce un falso codice fiscale", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-cf-vs-piva-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "Cisam Infissi Srl\nC.F./P.Iva 04332691205\nGemma Minore\nTot. documento € 1.190,00");
    expect(resolveOriginalDocumentFiscalCode({
      customerKey: "gemma-minore",
      requester: { nome: "Gemma", cognome: "Minore", data_nascita: "1995-06-02" },
      analysis: { items: [{ documentKey: "invoice-minore", customerKey: "gemma-minore", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    })).toMatchObject({ status: "not_found", value: null });
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

  it("riconosce il cointestatario dall'etichetta esplicita 'Secondo beneficiario'", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-co-beneficiary-secondo-beneficiario-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE MARIO ROSSI C.F. RSSMRA80A01H501U\nSECONDO BENEFICIARIO LUIGI BIANCHI C.F. BNCLGU80A01H501A");
    const result = resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "mario-rossi",
      coOwnership: { presente: false },
      mainDocumentFiscalCode: { status: "verified", value: "RSSMRA80A01H501U", sourceIds: ["invoice-mario"], candidates: ["RSSMRA80A01H501U"] },
      analysis: { items: [{ documentKey: "invoice-mario", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    });
    expect(result).toEqual({
      status: "confirmed_by_invoice",
      present: true,
      identity: { name: "Luigi", surname: "Bianchi", taxCode: "BNCLGU80A01H501A" },
      sourceIds: ["invoice-mario"],
    });
  });

  it("regressione: NON deduce un cointestatario dalla sola vicinanza di 'fornitura...con [nome] C.F. [cf]' senza etichetta esplicita di cointestazione", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-crm-preflight-co-beneficiary-no-free-text-inference-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    // Testo costruito per riprodurre esattamente il pattern che la vecchia
    // regex fornitura.{0,240}\bcon\b avrebbe accettato: nessuna etichetta di
    // cointestazione, solo "con" seguito per coincidenza da un nome con CF
    // valido (qui un secondo cliente reale, non un vero cointestatario).
    writeFileSync(invoice, "CLIENTE ANDREA VERDI C.F. VRDNDR80A01H501Z\nFORNITURA COMPLETA DI SERRAMENTI CON MARIO ROSSI C.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 4.500,00");
    const result = resolveCoBeneficiaryFromOriginalInvoices({
      customerKey: "andrea-verdi",
      coOwnership: { presente: false },
      mainDocumentFiscalCode: { status: "verified", value: "VRDNDR80A01H501Z", sourceIds: ["invoice-andrea"], candidates: ["VRDNDR80A01H501Z"] },
      analysis: { items: [{ documentKey: "invoice-andrea", customerKey: "andrea-verdi", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    });
    expect(result).toEqual({ status: "not_declared", present: false, identity: null, sourceIds: [] });
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

  it("fa prevalere FORMISANO documentale su Formisabo CRM senza assorbire l'indirizzo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-official-identity-formisano-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt"); const identityCard = path.join(root, "carta-identita.txt");
    writeFileSync(invoice, "CLIENTE\nANTONINO FORMISANO VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nC.F. FRMNNN66P27L259X\nTOTALE DOCUMENTO 1.000,00");
    writeFileSync(identityCard, "CARTA DI IDENTITA / IDENTITY CARD\nCODICE FISCALE FRMNNN66P27L259X\nFORMISANO<<ANTONINO<<<<<");
    const result = resolvePrimaryBeneficiaryFromOfficialDocuments({ customerKey: "antonino-formisabo", taxCode: "FRMNNN66P27L259X", analysis: { items: [
      { documentKey: "invoice", customerKey: "antonino-formisabo", kind: "invoice", state: "analyzed", textPath: invoice },
      { documentKey: "identity-card", customerKey: "antonino-formisabo", kind: "additional", state: "analyzed", textPath: identityCard },
    ] } as never });
    expect(result).toMatchObject({ status: "verified_document", identity: { name: "Antonino", surname: "Formisano", taxCode: "FRMNNN66P27L259X", birthDate: null, sex: "M" }, sourceIds: ["identity-card"], authority: "official_identity_document" });
  });

  it("resta fail-closed se due documenti ufficiali coerenti col CF discordano sul cognome", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-official-identity-conflict-")); directories.push(root);
    const one = path.join(root, "uno.txt"); const two = path.join(root, "due.txt");
    writeFileSync(one, "CARTA DI IDENTITA / IDENTITY CARD\nCODICE FISCALE FRMNNN66P27L259X\nFORMISANO<<ANTONINO<<<<<");
    writeFileSync(two, "CARTA DI IDENTITA / IDENTITY CARD\nCODICE FISCALE FRMNNN66P27L259X\nFORMISANI<<ANTONINO<<<<<");
    expect(resolvePrimaryBeneficiaryFromOfficialDocuments({ customerKey: "fixture", taxCode: "FRMNNN66P27L259X", analysis: { items: [
      { documentKey: "one", customerKey: "fixture", kind: "additional", state: "analyzed", textPath: one },
      { documentKey: "two", customerKey: "fixture", kind: "additional", state: "analyzed", textPath: two },
    ] } as never })).toMatchObject({ status: "conflict", identity: null, sourceIds: ["one", "two"] });
  });

  it("usa il valore etichettato del documento ufficiale e non un'iniziale MRZ o una fattura discordante", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-official-identity-hierarchy-")); directories.push(root);
    const card = path.join(root, "tessera.txt"); const invoice = path.join(root, "fattura.txt");
    writeFileSync(card, "TESSERA SANITARIA\nCodice Fiscale FSCGGR80B08L845D\nCognome\nFUSCO\nNome\nGREGORIO\nData di nascita\n08/02/1980\nFUSCO<<GREGORIO<S<<<<");
    writeFileSync(invoice, "CLIENTE\nGREGORIO S FUSCO\nC.F. FSCGGR80B08L845D\nTOTALE DOCUMENTO 1.000,00");
    expect(resolvePrimaryBeneficiaryFromOfficialDocuments({ customerKey: "gregorio-fusco", taxCode: "FSCGGR80B08L845D", analysis: { items: [
      { documentKey: "card", customerKey: "gregorio-fusco", kind: "additional", state: "analyzed", textPath: card },
      { documentKey: "invoice", customerKey: "gregorio-fusco", kind: "invoice", state: "analyzed", textPath: invoice },
    ] } as never })).toMatchObject({ status: "verified_document", identity: { name: "Gregorio", surname: "Fusco", taxCode: "FSCGGR80B08L845D", birthDate: null, sex: "M" }, sourceIds: ["card"], authority: "official_identity_document" });
  });

  it("fa prevalere giorno, mese e sesso del CF documentale usando solo il secolo concordante del form", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-official-demographics-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nRICCARDO CODA\nC.F. CDORCR50A30A859R\nTOTALE DOCUMENTO 1.000,00");
    expect(resolvePrimaryBeneficiaryFromOfficialDocuments({
      customerKey: "riccardo-coda", taxCode: "CDORCR50A30A859R", requesterBirthDate: "1950-09-30",
      analysis: { items: [{ documentKey: "invoice", customerKey: "riccardo-coda", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    })).toMatchObject({
      status: "verified_document",
      identity: { name: "Riccardo", surname: "Coda", taxCode: "CDORCR50A30A859R", birthDate: "1950-01-30", sex: "M" },
      sourceIds: ["invoice"], authority: "fiscal_document", birthDateSource: "form_century_with_fiscal_code",
    });
  });

  // Regola del titolare, 16/09/2026 (Giancarlo Della Vedova): il CF scritto nel
  // modulo coincide con quello stampato in fattura, quindi e' provato da un
  // documento ufficiale; se la data digitata contraddice solo l'anno, vale il
  // CF. Sostituisce il vecchio comportamento fail-closed sul secolo.
  it("la data di nascita viene dal CF verificato quando il form sbaglia l'anno (Della Vedova)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-birth-date-from-cf-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE Giancarlo Della Vedova C.F.: DLLGCR63P16F205G Via Montale 1 20017 - Rho (MI) - IT\nTOTALE DOCUMENTO 1.000,00");
    const result = resolvePrimaryBeneficiaryFromOfficialDocuments({
      customerKey: "giancarlo-della-vedova", taxCode: "DLLGCR63P16F205G", requesterBirthDate: "1976-09-16",
      requesterIdentity: { name: "Giancarlo", surname: "Della Vedova" }, now: new Date("2026-09-16T12:00:00Z"),
      analysis: { items: [{ documentKey: "invoice", customerKey: "giancarlo-della-vedova", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    });
    expect(result).toMatchObject({
      status: "verified_document",
      identity: { name: "Giancarlo", surname: "Della Vedova", taxCode: "DLLGCR63P16F205G", birthDate: "1963-09-16", sex: "M" },
      sourceIds: ["invoice"], authority: "fiscal_document", birthDateSource: "fiscal_code_over_form",
    });
  });

  it("giorno o mese del form discordi dal CF restano fail-closed", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-birth-date-cf-day-mismatch-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nRICCARDO CODA\nC.F. CDORCR50A30A859R\nTOTALE DOCUMENTO 1.000,00");
    // CF: 30 gennaio (A30); il form dice 30 settembre 1949: mese diverso, non solo l'anno.
    expect(resolvePrimaryBeneficiaryFromOfficialDocuments({
      customerKey: "riccardo-coda", taxCode: "CDORCR50A30A859R", requesterBirthDate: "1949-09-30", now: new Date("2026-09-16T12:00:00Z"),
      analysis: { items: [{ documentKey: "invoice", customerKey: "riccardo-coda", kind: "invoice", state: "analyzed", textPath: invoice }] } as never,
    })).toMatchObject({ status: "conflict", conflictKind: "birth_date", identity: null, sourceIds: ["invoice"], authority: null });
  });

  it("un cognome composto stampato in fattura viene tagliato come nel form (Della Vedova)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-composite-surname-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE Giancarlo Della Vedova C.F.: DLLGCR63P16F205G Via Montale 1 20017 - Rho (MI) - IT\nTOTALE DOCUMENTO 1.000,00");
    const analysis = { items: [{ documentKey: "invoice", customerKey: "giancarlo-della-vedova", kind: "invoice", state: "analyzed", textPath: invoice }] } as never;
    expect(resolvePrimaryBeneficiaryFromOfficialDocuments({
      customerKey: "giancarlo-della-vedova", taxCode: "DLLGCR63P16F205G", requesterIdentity: { name: "Giancarlo", surname: "Della Vedova" }, analysis,
    }).identity).toMatchObject({ name: "Giancarlo", surname: "Della Vedova" });
  });

  it("senza suggerimento del form resta il taglio piu corto coerente col CF", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-composite-surname-no-hint-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE Giancarlo Della Vedova C.F.: DLLGCR63P16F205G Via Montale 1 20017 - Rho (MI) - IT\nTOTALE DOCUMENTO 1.000,00");
    const analysis = { items: [{ documentKey: "invoice", customerKey: "giancarlo-della-vedova", kind: "invoice", state: "analyzed", textPath: invoice }] } as never;
    expect(resolvePrimaryBeneficiaryFromOfficialDocuments({ customerKey: "giancarlo-della-vedova", taxCode: "DLLGCR63P16F205G", analysis }).identity)
      .toMatchObject({ name: "Giancarlo", surname: "Della" });
  });

  it("il preflight consegna la data del CF e non blocca la pratica quando il form sbaglia l'anno", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-birth-date-cf-report-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, "FATTURA 12 del 01/07/2026\nCLIENTE Giancarlo Della Vedova C.F.: DLLGCR63P16F205G Via Montale 1 20017 - Rho (MI) - IT\nTOTALE DOCUMENTO 1.000,00 €");
    const report = buildCrmLocalPreflightReport({ row: {
      id: "fixture-della-vedova", cliente_nome: "Giancarlo", cliente_cognome: "Della Vedova", cliente_cf: "DLLGCR63P16F205G",
      dati_form: { richiedente: { nome: "Giancarlo", cognome: "Della Vedova", cf: "DLLGCR63P16F205G", data_nascita: "1976-09-16" } },
    } }, "fixture-della-vedova", { items: [{
      documentKey: "fattura-12", customerKey: "fixture-della-vedova", kind: "invoice", state: "analyzed", textPath: invoicePath,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "12", documentDate: "2026-07-01", total: 1000 }, screeningItems: [],
    }] } as never, new Date("2026-09-16T12:00:00Z"));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "primary_beneficiary_invoice_identity_conflict" }));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "primary_beneficiary_birth_date_conflict" }));
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "birth_date_taken_from_verified_fiscal_code" }));
    expect(report.primaryBeneficiaryResolution).toMatchObject({ status: "verified_document", identity: { surname: "Della Vedova", birthDate: "1963-09-16" } });
  });

  it("estrae il Comune lavori dal blocco CLIENTE di una fattura originaria", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-extraction-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nANTONINO FORMISANO VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nC.F. FRMNNN66P27L259X\nTOTALE DOCUMENTO 1.000,00");
    expect(resolveWorksMunicipalityFromOriginalInvoices({ customerKey: "antonino-formisano", requireDeliveryDestinationMarker: false, analysis: { items: [
      { documentKey: "invoice", customerKey: "antonino-formisano", kind: "invoice", state: "analyzed", textPath: invoice },
    ] } as never })).toEqual({ status: "verified_document", value: { comune: "Reggiolo", provincia: "RE" }, sourceIds: ["invoice"] });
  });

  it("resta invariato (not_found) quando nessuna fattura riporta un Comune di destinazione lavori esplicito", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-not-found-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nMario Rossi\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    expect(resolveWorksMunicipalityFromOriginalInvoices({ customerKey: "mario-rossi", requireDeliveryDestinationMarker: false, analysis: { items: [
      { documentKey: "invoice", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoice },
    ] } as never })).toEqual({ status: "not_found", value: null, sourceIds: [] });
  });

  it("regressione Tiraboschi: non scambia il comune del fornitore destinatario della lettera per il comune lavori quando il marcatore societario e' 2 righe sopra il CAP+Comune", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-tiraboschi-")); directories.push(root);
    const declaration = path.join(root, "dichiarazione.txt");
    writeFileSync(declaration, `Spett.le
Zanzasol snc
Via del Risorgimento 36
24060 Villongo (bg)
P.lva 04499370163
Oggetto: Dichiarazione per applicazione aliquota IVA agevolata al 10%.
Il sottoscritto Sig. Tiraboschi Natale, nato ad Adrara S. Martino (BG) il 01/02/1962, residente in
Adrara S. Martino (BG) in Via Muracche n. 2, codice fiscale TRB NTL 62B01 A057F, con la presente
dichiara che l'intervento riguarda l'immobile sito in Comune di Adrara S. Martino (BG) Via Muracche n. 2.`);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, `Destinatario
TIRABOSCHI NATALE
Sede via Muracche 2 24060 ADRARA SAN MARTINO (BG) C.F:TRBNTL62B01A057F
Sede di Spedizione
Legale
via Muracche 2
24060 ADRARA SAN MARTINO (BG)
TOTALE DOCUMENTO 1.000,00`);
    expect(resolveWorksMunicipalityFromOriginalInvoices({ customerKey: "natale-tiraboschi", requireDeliveryDestinationMarker: false, analysis: { items: [
      { documentKey: "declaration", customerKey: "natale-tiraboschi", kind: "invoice", state: "analyzed", textPath: declaration },
      { documentKey: "invoice", customerKey: "natale-tiraboschi", kind: "invoice", state: "analyzed", textPath: invoice },
    ] } as never })).toEqual({ status: "verified_document", value: { comune: "Adrara San Martino", provincia: "BG" }, sourceIds: ["invoice"] });
  });

  it("continua a scartare il comune del fornitore quando il marcatore societario e' nell'immediato dintorno del CAP+Comune (nessuna regressione)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-supplier-adjacent-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, `Spett.le
Fornitore Esempio Srl
Via Fornitore 1, 20100 Milano (MI)
P.IVA 12345678901
CLIENTE
Mario Rossi VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)
C.F. RSSMRA80A01H501U
TOTALE DOCUMENTO 1.000,00`);
    expect(resolveWorksMunicipalityFromOriginalInvoices({ customerKey: "mario-rossi", requireDeliveryDestinationMarker: false, analysis: { items: [
      { documentKey: "invoice", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: invoice },
    ] } as never })).toEqual({ status: "verified_document", value: { comune: "Reggiolo", provincia: "RE" }, sourceIds: ["invoice"] });
  });

  it("resta fail-closed se due fatture della stessa pratica riportano Comuni di destinazione lavori discordanti", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-conflict-")); directories.push(root);
    const one = path.join(root, "uno.txt"); const two = path.join(root, "due.txt");
    writeFileSync(one, "CLIENTE\nMario Rossi VIA A 1, 42046 REGGIOLO (RE)\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    writeFileSync(two, "CLIENTE\nMario Rossi VIA B 2, 00100 ROMA (RM)\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    expect(resolveWorksMunicipalityFromOriginalInvoices({ customerKey: "mario-rossi", requireDeliveryDestinationMarker: false, analysis: { items: [
      { documentKey: "one", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: one },
      { documentKey: "two", customerKey: "mario-rossi", kind: "invoice", state: "analyzed", textPath: two },
    ] } as never })).toMatchObject({ status: "conflict", value: null, sourceIds: ["one", "two"] });
  });

  it("regressione di collegamento: il Comune lavori documentale prevale sul dato CRM discordante end-to-end", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-connection-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nMario Rossi VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nLuogo di Destinazione\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    const row = { id: "fixture-works-municipality-connection", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" },
      residenza: { comune: "Milano", provincia: "MI", stesso_indirizzo_lavori: false },
      appartamento_lavori: { comune: "Milano", provincia: "MI" },
    } };
    const report = buildCrmLocalPreflightReport({ row }, "mario-rossi-works-municipality", { items: [{
      documentKey: "invoice", customerKey: "mario-rossi-works-municipality", kind: "invoice", state: "analyzed", textPath: invoice,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
      screeningItems: [],
    }] } as never, new Date("2026-06-01T10:00:00Z"));
    expect(report.worksMunicipalityResolution).toEqual({ status: "verified_document", value: { comune: "Reggiolo", provincia: "RE" }, sourceIds: ["invoice"] });
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "works_municipality_overridden_by_invoice",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.officialWorksMunicipalityOverManualCrm]),
    }));
    expect(report.blockers).not.toContainEqual(expect.objectContaining({ code: "works_municipality_invoice_conflict" }));
  });

  it("non produce l'override quando il Comune lavori CRM coincide gia con quello documentale", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-noop-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nMario Rossi VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nLuogo di Destinazione\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    const row = { id: "fixture-works-municipality-noop", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" },
      residenza: { comune: "Altrove", provincia: "XX", stesso_indirizzo_lavori: false },
      appartamento_lavori: { comune: "Reggiolo", provincia: "RE" },
    } };
    const report = buildCrmLocalPreflightReport({ row }, "mario-rossi-works-municipality-noop", { items: [{
      documentKey: "invoice", customerKey: "mario-rossi-works-municipality-noop", kind: "invoice", state: "analyzed", textPath: invoice,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
      screeningItems: [],
    }] } as never, new Date("2026-06-01T10:00:00Z"));
    expect(report.warnings).not.toContainEqual(expect.objectContaining({ code: "works_municipality_overridden_by_invoice" }));
  });

  it("regressione: confronta con la residenza (non con appartamento_lavori assente) quando stesso_indirizzo_lavori e' vero", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-same-address-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nMario Rossi VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    const row = { id: "fixture-works-municipality-same-address", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" },
      residenza: { comune: "Reggiolo", provincia: "Reggio Emilia", stesso_indirizzo_lavori: true },
    } };
    const report = buildCrmLocalPreflightReport({ row }, "mario-rossi-works-municipality-same-address", { items: [{
      documentKey: "invoice", customerKey: "mario-rossi-works-municipality-same-address", kind: "invoice", state: "analyzed", textPath: invoice,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
      screeningItems: [],
    }] } as never, new Date("2026-06-01T10:00:00Z"));
    expect(report.warnings).not.toContainEqual(expect.objectContaining({ code: "works_municipality_overridden_by_invoice" }));
  });

  it("regressione: non segnala una falsa discordanza quando la provincia CRM e' per esteso e la fattura usa la sigla", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-province-format-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    writeFileSync(invoice, "CLIENTE\nMario Rossi VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    const row = { id: "fixture-works-municipality-province-format", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" },
      appartamento_lavori: { comune: "Reggiolo", provincia: "Reggio Emilia" },
    } };
    const report = buildCrmLocalPreflightReport({ row }, "mario-rossi-works-municipality-province-format", { items: [{
      documentKey: "invoice", customerKey: "mario-rossi-works-municipality-province-format", kind: "invoice", state: "analyzed", textPath: invoice,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
      screeningItems: [],
    }] } as never, new Date("2026-06-01T10:00:00Z"));
    expect(report.warnings).not.toContainEqual(expect.objectContaining({ code: "works_municipality_overridden_by_invoice" }));
  });

  it("regressione: NON sostituisce il Comune lavori con l'indirizzo di fatturazione quando residenza e lavori sono dichiarati diversi e la fattura non prova un cantiere distinto", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-works-municipality-billing-address-")); directories.push(root);
    const invoice = path.join(root, "fattura.txt");
    // Nessuna etichetta di destinazione/cantiere: il blocco CLIENTE, quando
    // residenza != lavori, prova soltanto l'indirizzo di fatturazione/residenza,
    // non il cantiere dichiarato in appartamento_lavori.
    writeFileSync(invoice, "CLIENTE\nMario Rossi VIA CAPPELLETTA 27, 42046 REGGIOLO (RE)\nC.F. RSSMRA80A01H501U\nTOTALE DOCUMENTO 1.000,00");
    const row = { id: "fixture-works-municipality-billing-address", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U" },
      residenza: { comune: "Reggiolo", provincia: "RE", stesso_indirizzo_lavori: false },
      appartamento_lavori: { comune: "Quartu Sant'Elena", provincia: "CA" },
    } };
    const report = buildCrmLocalPreflightReport({ row }, "mario-rossi-billing-address", { items: [{
      documentKey: "invoice", customerKey: "mario-rossi-billing-address", kind: "invoice", state: "analyzed", textPath: invoice,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
      screeningItems: [],
    }] } as never, new Date("2026-06-01T10:00:00Z"));
    expect(report.worksMunicipalityResolution).toEqual({ status: "not_found", value: null, sourceIds: [] });
    expect(report.warnings).not.toContainEqual(expect.objectContaining({ code: "works_municipality_overridden_by_invoice" }));
  });

  it("instrada RM Legno direttamente a blocked_case senza analizzare prodotti o fatture", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Massimiliano", cliente_cognome: "Montemorra", companies: { ragione_sociale: "rm legno" }, dati_form: {} } }, "massimiliano-montemorra", { items: [] } as never, new Date("2026-09-03T12:00:00Z"));
    expect(report).toMatchObject({ outcome: "blocked_case", blockers: [{ code: "permanent_supplier_automation_exclusion", field: "supplier", operatorQuestion: expect.stringContaining("Erre Emme / RM Legno") }], products: [], financial: { evidence: [] }, eneaPayloadAudit: { draftReady: false, externalActionAllowed: false } });
  });

  it("instrada Linea Sole Potito direttamente a esclusione prevista prima di analizzare allegati", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Cliente", cliente_cognome: "Linea", companies: { ragione_sociale: "Linea Sole Potito" }, dati_form: {} } }, "cliente-linea", { items: [] } as never, new Date("2026-09-09T12:00:00Z"));
    expect(report).toMatchObject({ outcome: "blocked_case", blockers: [{ code: "permanent_supplier_automation_exclusion", field: "supplier", exactCause: expect.stringContaining("Linea Sole Potito") }], products: [], financial: { evidence: [] } });
  });

  it("instrada Ideal Sistem a esclusione prevista con reportingCategory excluded_upstream prima di analizzare allegati", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Cliente", cliente_cognome: "Ideal", companies: { ragione_sociale: "Ideal Sistem" }, dati_form: {} } }, "cliente-ideal", { items: [] } as never, new Date("2026-09-10T12:00:00Z"));
    expect(report).toMatchObject({
      outcome: "blocked_case",
      blockers: [{
        code: "permanent_supplier_automation_exclusion",
        field: "supplier",
        reportingCategory: "excluded_upstream",
        appliedRuleIds: expect.arrayContaining(["user-2026-09-10-ideal-sistem-manual-exclusion-v1"]),
        exactCause: expect.stringContaining("Ideal Sistem"),
      }],
      products: [],
      financial: { evidence: [] },
    });
  });

  it("instrada una pratica interna esclusa direttamente a blocked_case anche se già presente nella coda", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Prova", cliente_cognome: "Rivenditore 1", dati_form: {} } }, "prova-rivenditore-1-30-04", { items: [] } as never, new Date("2026-09-04T00:00:00Z"));
    expect(report).toMatchObject({
      outcome: "blocked_case",
      blockers: [{ code: "permanent_customer_automation_exclusion", field: "practice", operatorQuestion: expect.stringContaining("pratica interna esclusa") }],
      products: [],
      financial: { evidence: [] },
      eneaPayloadAudit: { draftReady: false, externalActionAllowed: false, portalGate: { reason: "permanent-customer-automation-exclusion" } },
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

  it("fa prevalere la tipologia esplicita oltre tre piani sul numero appartamenti della pratica", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      id: "4e4a8fd7-7169-4517-abd4-a59d88303935", cliente_nome: "Federigo", cliente_cognome: "Cileo", cliente_cf: "CLIFRG70A01F205X",
      prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" },
      dati_form: { richiedente: { nome: "Federigo", cognome: "Cileo", data_nascita: "1970-01-01", cf: "CLIFRG70A01F205X" }, edificio: { numero_appartamenti: 1, tipologia: "edificio_oltre_3_piani" }, prodotto: { schermature: [] } },
    } }, "federigo-cileo", { items: [] } as never, new Date("2026-08-18T15:00:00Z"));
    expect(report).toMatchObject({ buildingUnitCount: 1, buildingQualification: "multi_unit" });
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "explicit_building_type_over_apartment_count",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount],
    }));
  });

  it("non riclassifica una casa singola esplicita come edificio plurimo", () => {
    const report = buildCrmLocalPreflightReport({ row: {
      id: "00000000-0000-4000-8000-000000000018", cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U",
      prodotto_installato: "Schermature solari", fatture_urls: [], documenti_aggiuntivi_urls: [], pipeline_stages: { stage_type: "archiviate" },
      dati_form: { richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1, tipologia: "casa_singola_o_plurifamiliare" }, prodotto: { schermature: [] } },
    } }, "mario-rossi", { items: [] } as never, new Date("2026-08-27T15:00:00Z"));
    expect(report).toMatchObject({ buildingUnitCount: 1, buildingQualification: "single_unit" });
    expect(report.warnings.map((warning) => warning.code)).not.toContain("explicit_building_type_over_apartment_count");
  });

  it("classifica la fattura assente come intervento operatore riprendibile", () => {
    const report = buildCrmLocalPreflightReport({ row: { cliente_cf: "RSSMRA80A01H501U", fatture_urls: ["practice/fattura/mancante.png"], dati_form: {
      richiedente: { nome: "Sarah", cognome: "Murru", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" }, edificio: { numero_appartamenti: 1 }, prodotto: { schermature: [] },
    } } }, "sarah-murru", { items: [] } as never, new Date("2026-08-16T15:00:00Z"));
    expect(report.blockers).toContainEqual(expect.objectContaining({
      code: "original_invoice_missing_or_unavailable",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue, "system-apr-operator-intervention-routing"]),
      exactCause: expect.stringContaining("fattura"),
      missingDocumentType: "fattura o pagina fiscale necessaria",
      operatorQuestion: expect.stringMatching(/\?$/),
      onboardingGap: expect.stringContaining("fattura"),
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

  it("regola generale di Giuliano (De Filippo): la fattura vince anche con piu' righe form, quando una dicitura generica non riconosciuta ha un'unica famiglia form da ereditare", () => {
    const uniform = resolveFormScreeningMappings(
      [{ tipo_prodotto: "tende_da_sole", direzione: "est" }, { tipo_prodotto: "tende_da_sole", direzione: "est" }, { tipo_prodotto: "tende_da_sole", direzione: "est" }],
      ["Schermatura solare MOBILE", "Schermatura solare MOBILE"],
    );
    expect(uniform.status).toBe("mapped");
    expect(uniform.conflictingProductIndexes).toEqual([]);
    expect(uniform.mappings.every((mapping) => mapping.declared?.tipo_prodotto === "tende_da_sole" && mapping.source === "group_inheritance_uniform_family")).toBe(true);
  });

  it("regola generale di Giuliano: la dicitura generica non riconosciuta resta un vero conflitto quando il form dichiara piu' famiglie diverse", () => {
    const genuineConflict = resolveFormScreeningMappings(
      [{ tipo_prodotto: "tende_da_sole", direzione: "est" }, { tipo_prodotto: "zanzariera", direzione: "sud" }],
      ["Schermatura solare MOBILE", "Schermatura solare MOBILE", "Schermatura solare MOBILE"],
    );
    expect(genuineConflict.status).toBe("cardinality_mismatch");
    expect(genuineConflict.conflictingProductIndexes).toEqual([0, 1, 2]);
  });

  it("non propaga motore e materiale di una riga LM alle zanzariere o alle righe manuali", () => {
    const motorized = resolveProductTechnicalAttributes("Tenda da sole motorizzata", "Tenda da sole motorizzata", 0.33)!;
    const manual = resolveProductTechnicalAttributes("Tenda da sole a caduta", "Tenda da sole a caduta", 0.08)!;
    const mosquito = resolveProductTechnicalAttributes("Altra schermatura solare - zanzariera", "Altra schermatura solare - zanzariera", 0.34)!;
    expect(motorized).toMatchObject({ movement: "Automatico", material: "Tessuto" });
    expect(manual).toMatchObject({ movement: "Manuale", material: "Tessuto" });
    expect(mosquito).toMatchObject({ movement: "Manuale", material: "Misto" });
  });

  it("lascia draftReady invariato quando il fallback della zanzariera e Misto", () => {
    const blocker = screeningFallbackMaterialCategoryBlocker({
      index: 0,
      description: "Schermatura solare mobile",
      declaredType: "altro",
      material: "Misto",
      materialSource: "authorized_fallback",
      sourceId: "invoice-positive",
    });
    expect(blocker).toBeNull();
    expect(invalidateCrmEneaPayloadAuditForScreeningBlockers(readyScreeningAudit(), blocker ? [blocker] : [])).toMatchObject({ draftReady: true, status: "payload_complete" });
  });

  it("passa la famiglia zanzariera riconciliata al resolver prima di scegliere il fallback", () => {
    const mapping = resolveFormScreeningMappings(
      [{ tipo_prodotto: "zanzariera" }],
      ["Altra schermatura solare"],
    );
    const declaredType = String(mapping.mappings[0].declared?.tipo_prodotto ?? "");
    const resolved = resolveProductTechnicalAttributes("Altra schermatura solare - zanzariera", "Altra schermatura solare", null);
    expect(resolved).toMatchObject({ material: "Misto", materialSource: "authorized_fallback" });
    expect(screeningFallbackMaterialCategoryBlocker({
      index: 0,
      description: "Altra schermatura solare",
      declaredType,
      material: resolved!.material,
      materialSource: resolved!.materialSource,
      sourceId: "invoice-generic-screening",
    })).toBeNull();
  });

  it("blocca sempre una zanzariera generica se il materiale fallback non e Misto", () => {
    const blocker = screeningFallbackMaterialCategoryBlocker({
      index: 1,
      description: "Schermatura solare mobile",
      declaredType: "altra schermatura solare",
      material: "Tessuto",
      materialSource: "authorized_fallback",
      sourceId: "invoice-negative-analogue",
    });
    expect(blocker).toMatchObject({
      code: "screening_fallback_material_category_conflict_2",
      field: "screenings.2.material",
      sourceIds: ["invoice-negative-analogue"],
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.screeningFallbackMaterialCategoryGuard, USER_AUTHORIZED_RULE_IDS.zanzarieraScreening]),
    });
    expect(invalidateCrmEneaPayloadAuditForScreeningBlockers(readyScreeningAudit(), [blocker!])).toMatchObject({
      status: "payload_incomplete",
      draftReady: false,
      portalGate: { status: "blocked", workflowFingerprint: null, supportedPages: [] },
      blockers: [expect.objectContaining({ code: "screening_fallback_material_category_conflict_2", fieldId: "screenings.2.material" })],
    });
  });

  it("risolve gli attributi persiana con precedenza esplicita e fallback autorizzati", () => {
    expect(resolveProductTechnicalAttributes("Persiana in alluminio motorizzata", "Persiana in alluminio motorizzata", 0.12)).toMatchObject({
      material: "Metallo", materialSource: "invoice_explicit", movement: "Automatico", movementSource: "invoice_explicit",
      gTot: 0.12, supplementaryThermalResistance: 0.17, source: "invoice_explicit", ruleId: "user-2026-08-31-documented-gtot-precedence-v1",
    });
    expect(resolveProductTechnicalAttributes("Persiana", "Persiana", null)).toMatchObject({
      material: "Metallo", materialSource: "authorized_fallback", movement: "Manuale", movementSource: "authorized_fallback",
      gTot: 0.06, supplementaryThermalResistance: 0.17, source: "authorized_fallback", ruleId: "user-2026-08-31-rigid-screening-missing-gtot-006-v1",
    });
    expect(resolveProductTechnicalAttributes("Persiana in PVC", "Persiana in PVC", null)).toMatchObject({ material: "" });
  });

  it("risolve l'avvolgibile con lo stesso contratto persiana e un ID audit distinto", () => {
    expect(resolveProductTechnicalAttributes("Avvolgibile in alluminio motorizzato", "Avvolgibile in alluminio motorizzato", 0.12)).toMatchObject({
      material: "Metallo", materialSource: "invoice_explicit", movement: "Automatico", movementSource: "invoice_explicit",
      gTot: 0.12, supplementaryThermalResistance: 0.17, source: "invoice_explicit", ruleId: "user-2026-08-31-documented-gtot-precedence-v1",
    });
    expect(resolveProductTechnicalAttributes("Tapparella", "Tapparella", null)).toMatchObject({
      material: "Metallo", materialSource: "authorized_fallback", movement: "Manuale", movementSource: "authorized_fallback",
      gTot: 0.06, supplementaryThermalResistance: 0.17, source: "authorized_fallback", ruleId: "user-2026-08-31-rigid-screening-missing-gtot-006-v1",
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
    expect(report.products.every((product) => product.declaredType === "avvolgibile" && product.gTot === 0.06 && product.material === "Metallo" && product.movement === "Manuale" && product.supplementaryThermalResistance === 0.17)).toBe(true);
    expect(report.products.every((product) => product.protectedWindowSurfaceM2 === product.surfaceM2)).toBe(true);
    expect(report.products.map((product) => product.heightMm)).toEqual(Array(6).fill(2290));
    expect(report.products.every((product) => product.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.avvolgibileScreening))).toBe(true);
  });

  it("applica i limiti ampi di plausibilita refuso alle dimensioni persiana", () => {
    expect(isPersianaDimensionPlausible(500, 450)).toBe(true);
    expect(isPersianaDimensionPlausible(4000, 3200)).toBe(true);
    expect(isPersianaDimensionPlausible(499, 2450)).toBe(false);
    expect(isPersianaDimensionPlausible(4001, 2450)).toBe(false);
    expect(isPersianaDimensionPlausible(900, 449)).toBe(false);
    expect(isPersianaDimensionPlausible(900, 3201)).toBe(false);
  });

  it("considera plausibile la misura originaria contestata 2835x1850 mm", () => {
    expect(isPersianaDimensionPlausible(2835, 1850)).toBe(true);
  });

  it("riesegue la misura originaria contestata nel preflight senza il falso blocker dimensionale", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-avvolgibile-wide-measure-")); directories.push(root);
    const textPath = path.join(root, "fattura.txt");
    writeFileSync(textPath, `Fattura n. A-2835 del 20/08/2026
Cliente Mario Rossi CF RSSMRA80A01H501U
AVVOLGIBILE IN ALLUMINIO MISURE IN MM 2835 x 1850
Totale documento 1.200,00 €`);
    const report = buildCrmLocalPreflightReport({ row: { cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" },
      edificio: { numero_appartamenti: 1 }, prodotto: {},
    } } }, "regression-wide-avvolgibile", { items: [{ documentKey: "wide-measure-invoice", customerKey: "regression-wide-avvolgibile", kind: "invoice", state: "analyzed", textPath, extractionMode: "native_text", invoiceResult: { documentType: "invoice" }, screeningItems: [] }] } as never, new Date("2026-08-25T10:00:00Z"));
    expect(report.products).toEqual([expect.objectContaining({ widthMm: 2835, heightMm: 1850, declaredType: "avvolgibile" })]);
    expect(report.blockers.some((blocker) => blocker.code.startsWith("avvolgibile_measurement_ambiguous"))).toBe(false);
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

  it("difetto strutturale (2026-09-08): applyValidationRevision non si fida mai di un verdetto 'pronta' gia' salvato, lo ricostruisce sempre dal dossier reale", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-full-reconstruction-never-trust-cache-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    // Il dossier reale sul disco descrive una pratica genuinamente bloccata
    // (nessun form cliente), ma il checkpoint viene seminato con un verdetto
    // "pronta" gia' salvato, come se venisse da un calcolo vecchio o da un
    // altro giro mai piu' riverificato.
    writeFileSync(dossierPath, JSON.stringify({ row: { id: "fixture-never-trust-cache", cliente_cf: "RSSMRA80A01H501U", dati_form: {} } }));
    const checkpointDir = path.join(root, "crm-local-preflight"); mkdirSync(checkpointDir, { recursive: true });
    writeFileSync(path.join(checkpointDir, "checkpoint.json"), JSON.stringify({
      version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: "f".repeat(64),
      currentCustomerKey: null, externalActionAllowed: false, reason: "test", nextAction: "test",
      validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
      items: [{
        customerKey: "fixture-never-trust-cache", displayName: "Fixture Never Trust Cache", practiceId: "practice-stale", dossierPath,
        state: "ready_local_plan", attemptCount: 1, startedAt: null, endedAt: null, disposition: null,
        reason: "Verdetto vecchio salvato: pronta.", report: { outcome: "ready_local_plan", blockers: [], warnings: [], draftPlan: { status: "ready", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: "ready" } },
      }],
    }, null, 2));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const preflight = new PersistentAprCrmLocalPreflight(root, analysis);
    expect(preflight.snapshot().items[0]).toMatchObject({ state: "ready_local_plan" });
    preflight.applyValidationRevision("test-full-reconstruction-never-trust-cache-v1", new Date("2026-09-08T09:00:00Z"));
    const rebuilt = preflight.snapshot().items[0];
    expect(rebuilt.state).toBe("blocked_case");
    expect(rebuilt.report?.blockers).toContainEqual(expect.objectContaining({ code: "customer_form_missing" }));
  });

  it("difetto strutturale (2026-09-08): applyValidationRevision ricostruisce anche una pratica bloccata da un verdetto vecchio quando il dossier reale e' gia' completo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-full-reconstruction-fixes-stale-blocked-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { id: "fixture-stale-blocked", cliente_cf: "RSSMRA80A01H501U", dati_form: {
      richiedente: { nome: "Mario", cognome: "Rossi", data_nascita: "1980-01-01", cf: "RSSMRA80A01H501U" },
      edificio: { numero_appartamenti: 1 }, prodotto: {},
    } } }));
    const checkpointDir = path.join(root, "crm-local-preflight"); mkdirSync(checkpointDir, { recursive: true });
    writeFileSync(path.join(checkpointDir, "checkpoint.json"), JSON.stringify({
      version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: "f".repeat(64),
      currentCustomerKey: null, externalActionAllowed: false, reason: "test", nextAction: "test",
      validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
      items: [{
        customerKey: "fixture-stale-blocked", displayName: "Fixture Stale Blocked", practiceId: "practice-stale-blocked", dossierPath,
        state: "blocked_case", attemptCount: 1, startedAt: null, endedAt: null, disposition: null,
        reason: "Verdetto vecchio salvato: bloccata.", report: { outcome: "blocked_case", blockers: [{ code: "customer_form_missing", field: "customer_form", reason: "vecchio", sourceIds: [], appliedRuleIds: [] }], warnings: [], draftPlan: { status: "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: "blocked" } },
      }],
    }, null, 2));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const preflight = new PersistentAprCrmLocalPreflight(root, analysis);
    preflight.applyValidationRevision("test-full-reconstruction-fixes-stale-blocked-v1", new Date("2026-09-08T09:00:00Z"));
    const rebuilt = preflight.snapshot().items[0];
    expect(rebuilt.report?.blockers.some((blocker) => blocker.code === "customer_form_missing")).toBe(false);
  });

  it("regola generale definitiva di Giuliano (2026-09-08, regressione Calvacchi): riconosce una fattura del produttore al rivenditore/installatore, non al cliente beneficiario", () => {
    const producerToReseller = `DICHIARAZIONE DI CERTIFICAZIONE ENERGETICA DI PRODOTTO\nSpett.le\nIkona Srl\nVia Campobello 1/C\n00071 Pomezia (RM)\nFattura n. 1000 del 01/01/2026\nTotale documento 5.000,00`;
    expect(invoiceAddressedToDifferentCompanyThanBeneficiary(producerToReseller, "Guido", "Calvacchi")).toBe(true);
    const resellerToCustomer = `Fattura\nn. 187 del 11/12/2025\nDestinatario\nCalvacchi Guido\nvia Francesco del Vico 10\n00142 Roma (RM)\nTotale documento 4.400,00`;
    expect(invoiceAddressedToDifferentCompanyThanBeneficiary(resellerToCustomer, "Guido", "Calvacchi")).toBe(false);
  });

  it("regressione Biagioni/Riviera: non esclude la fattura del cliente quando 'SPETT.LE' e' seguito prima dalla ragione sociale del fornitore stesso e solo alla riga successiva dal nome del cliente (formato Finestra Italia)", () => {
    const finestraItaliaOwnCustomer = `SPETT.LE\nFINESTRA ITALIA S.R.L. A SOCIO UNICO\nNICLA BIAGIONI\nVia Del Querceto 99\nFattura n. 809 del 29/07/2026\nTotale documento 280,28`;
    expect(invoiceAddressedToDifferentCompanyThanBeneficiary(finestraItaliaOwnCustomer, "Nicla", "Biagioni")).toBe(false);
  });

  it("continua a riconoscere una fattura verso il rivenditore quando il nome del beneficiario non compare affatto entro le righe controllate (nessuna regressione Calvacchi)", () => {
    const producerToReseller = `DICHIARAZIONE DI CERTIFICAZIONE ENERGETICA DI PRODOTTO\nSpett.le\nIkona Srl\nVia Campobello 1/C\n00071 Pomezia (RM)\nFattura n. 1000 del 01/01/2026\nTotale documento 5.000,00`;
    expect(invoiceAddressedToDifferentCompanyThanBeneficiary(producerToReseller, "Guido", "Calvacchi")).toBe(true);
  });

  it("non esclude un destinatario societario quando manca comunque una prova (nessun Destinatario/Spett.le riconoscibile, o nome beneficiario non fornito): resta fail-closed economico", () => {
    const noRecipientLabel = `FATTURA\nn. 1 del 01/01/2026\nIkona Srl\nTotale documento 1.000,00`;
    expect(invoiceAddressedToDifferentCompanyThanBeneficiary(noRecipientLabel, "Guido", "Calvacchi")).toBe(false);
    const resellerToCustomer = `Fattura\nn. 187 del 11/12/2025\nDestinatario\nCalvacchi Guido\nTotale documento 4.400,00`;
    expect(invoiceAddressedToDifferentCompanyThanBeneficiary(resellerToCustomer, "", "")).toBe(false);
  });

  it("regola generale definitiva di Giuliano (2026-09-08, regressione Calvacchi): esclude dal totale economico una fattura verso il rivenditore/installatore, la somma resta solo sulle fatture verso il cliente", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-reseller-invoice-exclusion-")); directories.push(root);
    const customerInvoicePath = path.join(root, "fattura-cliente.txt");
    writeFileSync(customerInvoicePath, `Fattura n. 1 del 01/01/2026\nDestinatario\nMario Rossi\nvia Roma 1\nTenda da sole modello Astor\nTotale documento 1.000,00`);
    const producerInvoicePath = path.join(root, "fattura-produttore.txt");
    writeFileSync(producerInvoicePath, `Fattura n. 2000 del 01/01/2026\nDestinatario\nProInstall Srl\nvia Milano 2\nFinestra 2 ante L 1030 X H 2320\nTotale documento 9.000,00`);
    const analysis = { items: [
      { documentKey: "fattura-cliente", customerKey: "fixture-reseller-exclusion", kind: "invoice", state: "analyzed", textPath: customerInvoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-01-01", total: 1000 }, screeningItems: [{ widthMm: 2500, heightMm: 2200, surfaceM2: 5.5, gTot: 0.13, description: "Tenda da sole modello Astor", sourcePath: "fattura-cliente" }] },
      { documentKey: "fattura-produttore", customerKey: "fixture-reseller-exclusion", kind: "invoice", state: "analyzed", textPath: producerInvoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "2000", documentDate: "2026-01-01", total: 9000 }, screeningItems: [] },
    ] } as never;
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-reseller-exclusion", cliente_nome: "Mario", cliente_cognome: "Rossi" } }, "fixture-reseller-exclusion", analysis, new Date("2026-09-08T10:00:00Z"));
    expect(report.financial.invoiceTotal).toBe(1000);
    expect(report.financial.evidence).toContainEqual(expect.objectContaining({ sourceId: expect.stringContaining("fattura-produttore"), kind: "non_economic" }));
    expect(report.financial.evidence).toContainEqual(expect.objectContaining({ sourceId: expect.stringContaining("fattura-cliente"), kind: "invoice" }));
  });

  it("regola generale definitiva di Giuliano (2026-09-08): infissi e persiane da fornitori diversi, entrambe le fatture verso il cliente, sommano i totali economici nel totale complessivo della pratica", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-infissi-chiusura-oscurante-diversi-fornitori-")); directories.push(root);
    const infissiInvoicePath = path.join(root, "fattura-infissi.txt");
    writeFileSync(infissiInvoicePath, `Fattura n. 1 del 01/01/2026\nDestinatario\nMario Rossi\nFORNITURA E POSA IN OPERA DI N. 3 SERRAMENTI IN PVC\nTotale documento 6.000,00`);
    const persianeInvoicePath = path.join(root, "fattura-persiane.txt");
    writeFileSync(persianeInvoicePath, `Fattura n. 900 del 02/01/2026\nDestinatario\nMario Rossi\nFORNITURA E POSA DI N. 3 PERSIANE IN ALLUMINIO\nTotale documento 2.500,00`);
    const analysis = { items: [
      { documentKey: "fattura-infissi", customerKey: "fixture-infissi-chiusura-diversi-fornitori", kind: "invoice", state: "analyzed", textPath: infissiInvoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-01-01", total: 6000 }, screeningItems: [] },
      { documentKey: "fattura-persiane", customerKey: "fixture-infissi-chiusura-diversi-fornitori", kind: "invoice", state: "analyzed", textPath: persianeInvoicePath, extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "900", documentDate: "2026-01-02", total: 2500 }, screeningItems: [{ widthMm: 1200, heightMm: 1500, surfaceM2: 1.8, gTot: null, description: "Persiana in alluminio", sourcePath: "fattura-persiane" }] },
    ] } as never;
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-infissi-chiusura-diversi-fornitori", cliente_nome: "Mario", cliente_cognome: "Rossi" } }, "fixture-infissi-chiusura-diversi-fornitori", analysis, new Date("2026-09-08T10:00:00Z"));
    // Nessuna fattura viene esclusa come non economica (entrambe sono verso il cliente): il totale e' la somma di entrambe, indipendentemente dal fornitore diverso.
    expect(report.financial.invoiceTotal).toBe(8500);
    expect(report.financial.evidence.every((item) => item.kind !== "non_economic")).toBe(true);
  });

  it("regola generale (Giuliano, 2026-09-08): applyOperatorMeasurementResolution riaccoda davvero una pratica bloccata da screenings_missing, persiste attraverso un riavvio ed e' idempotente", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-operator-measurement-resolution-requeue-")); directories.push(root);
    const dossierPath = path.join(root, "dossier.json");
    writeFileSync(dossierPath, JSON.stringify({ row: { id: "fixture-requeue-misura", cliente_cf: "RSSMRA80A01H501U", dati_form: {} } }));
    const checkpointDir = path.join(root, "crm-local-preflight"); mkdirSync(checkpointDir, { recursive: true });
    writeFileSync(path.join(checkpointDir, "checkpoint.json"), JSON.stringify({
      version: "apr-crm-local-preflight-v1", revision: 1, status: "completed", sourceFingerprint: "f".repeat(64),
      currentCustomerKey: null, externalActionAllowed: false, reason: "test", nextAction: "test",
      validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [],
      items: [{
        customerKey: "fixture-requeue-misura", displayName: "Fixture Requeue Misura", practiceId: "practice-requeue-misura", dossierPath,
        state: "blocked_case", attemptCount: 1, startedAt: null, endedAt: null, disposition: null,
        reason: "screenings_missing: nessuna misura nei documenti originari.",
        report: { outcome: "blocked_case", blockers: [{ code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato dalle fatture originarie.", sourceIds: ["fattura-1"], appliedRuleIds: [] }], warnings: [], products: [], draftPlan: { status: "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: "blocked" } },
      }],
    }, null, 2));
    const analysis = new PersistentAprCrmDocumentAnalysis(root, async () => { throw new Error("not used"); }); analysis.initialize();
    const preflight = new PersistentAprCrmLocalPreflight(root, analysis);
    expect(preflight.snapshot().items[0].state).toBe("blocked_case");

    // Un caso NON bloccato non puo' ricevere una risoluzione operatore.
    expect(() => preflight.applyOperatorMeasurementResolution({
      questionId: "measure:fixture-inesistente:fattura-1", customerKey: "fixture-inesistente", sourceId: "fattura-1", description: "Tenda da sole",
      rawWidth: 250, rawHeight: 220, unit: "centimeters", note: "", operatorId: "operatore", commandId: "cmd-requeue-1", answeredAt: "2026-09-08T10:00:00Z",
    }, new Date("2026-09-08T10:00:00Z"))).toThrow("crm_local_preflight_operator_resolution_case_not_blocked");

    const resolutionInput = {
      questionId: "measure:fixture-requeue-misura:fattura-1", customerKey: "fixture-requeue-misura", sourceId: "fattura-1", description: "Tenda da sole",
      rawWidth: 250, rawHeight: 220, unit: "centimeters" as const, note: "Misurata su richiesta operatore.", operatorId: "operatore", commandId: "cmd-requeue-2", answeredAt: "2026-09-08T10:01:00Z",
    };
    preflight.applyOperatorMeasurementResolution(resolutionInput, new Date("2026-09-08T10:01:00Z"));
    const afterResolution = preflight.snapshot();
    expect(afterResolution.items[0]).toMatchObject({ state: "queued", report: null });
    expect(afterResolution.operatorMeasurementResolutions).toContainEqual(expect.objectContaining({ questionId: resolutionInput.questionId, rawWidth: 250, rawHeight: 220 }));
    expect(afterResolution.audit.at(-1)).toMatchObject({ type: "operator_resolution_requeued", customerKey: "fixture-requeue-misura" });

    // Persiste attraverso un riavvio (nuova istanza, stesso checkpoint su disco).
    const restarted = new PersistentAprCrmLocalPreflight(root, analysis);
    expect(restarted.snapshot().items[0].state).toBe("queued");
    expect(restarted.snapshot().operatorMeasurementResolutions).toHaveLength(1);

    // Idempotente: lo stesso commandId non applica una seconda volta la risoluzione ne' duplica l'audit.
    const revisionBeforeRetry = restarted.snapshot().revision;
    restarted.applyOperatorMeasurementResolution(resolutionInput, new Date("2026-09-08T10:02:00Z"));
    expect(restarted.snapshot().revision).toBe(revisionBeforeRetry);
    expect(restarted.snapshot().operatorMeasurementResolutions).toHaveLength(1);
  });

  it("usa la data fine lavori esplicita del form rivenditore prima della cronologia fatture", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-reseller-completion-date-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    writeFileSync(invoicePath, "FATTURA 1 del 01/03/2026\nTenda da sole 1 da 300 x 200 cm Gtot 0,13\nTOTALE DOCUMENTO 1.000,00");
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-form-date", data_fine_lavori: "2026-07-15" } }, "fixture-form-date", { items: [{
      documentKey: "fattura", customerKey: "fixture-form-date", kind: "invoice", state: "analyzed", textPath: invoicePath,
      extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
      screeningItems: [{ widthMm: 3000, heightMm: 2000, surfaceM2: 6, gTot: 0.13, description: "Tenda da sole", sourcePath: "fattura" }],
    }] } as never, new Date("2026-09-11T08:00:00Z"));
    expect(report.completionDate).toBe("2026-07-15");
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "reseller_form_completion_date_over_invoice_applied",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.resellerFormCompletionDateOverInvoice]),
    }));
  });

  it("mantiene fail-closed il conflitto tra data form rivenditore e collaudo originario", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-reseller-completion-conflict-")); directories.push(root);
    const invoicePath = path.join(root, "fattura.txt");
    const commissioningPath = path.join(root, "verbale-collaudo.txt");
    writeFileSync(invoicePath, "FATTURA 1 del 01/03/2026\nTenda da sole 1 da 300 x 200 cm Gtot 0,13\nTOTALE DOCUMENTO 1.000,00");
    writeFileSync(commissioningPath, "Verbale di collaudo e consegna\ndata09/07/2026 Firma del committente");
    const report = buildCrmLocalPreflightReport({ row: { id: "fixture-form-date-conflict", data_fine_lavori: "2026-07-15" } }, "fixture-form-date-conflict", { items: [
      {
        documentKey: "fattura", customerKey: "fixture-form-date-conflict", kind: "invoice", state: "analyzed", textPath: invoicePath,
        extractionMode: "native_text", invoiceResult: { documentType: "invoice", documentNumber: "1", documentDate: "2026-03-01", total: 1000 },
        screeningItems: [{ widthMm: 3000, heightMm: 2000, surfaceM2: 6, gTot: 0.13, description: "Tenda da sole", sourcePath: "fattura" }],
      },
      { documentKey: "verbale-collaudo", customerKey: "fixture-form-date-conflict", kind: "additional", state: "analyzed", textPath: commissioningPath, screeningItems: [], invoiceResult: { documentType: "other" } },
    ] } as never, new Date("2026-09-11T08:00:00Z"));
    expect(report.completionDate).toBe("2026-07-15");
    expect(report.blockers).toContainEqual(expect.objectContaining({
      code: "completion_date_source_conflict",
      appliedRuleIds: expect.arrayContaining([USER_AUTHORIZED_RULE_IDS.datedCommissioningReportCompletionPrecedence]),
    }));
  });
});
