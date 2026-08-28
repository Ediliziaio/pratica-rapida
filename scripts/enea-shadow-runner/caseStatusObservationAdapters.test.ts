import { describe, expect, it } from "vitest";
import type { AprCrmLocalPreflightItem } from "./crmLocalPreflight";
import type { AprInfissiBatchItem } from "./infissiBatchPreflight";
import type { DeepReviewItem } from "./deepCaseReview";
import type { AprEneaDraftExecutionItem } from "./eneaDraftExecution";
import { observeAprCommonPreflight, observeAprDeepReview, observeAprDraftExecution, observeAprInfissiBatchProductGate, observeAprMixedProductGate, observeAprScreeningProductGate } from "./caseStatusObservationAdapters";

const at = { runId: "run-fixed-40-v1", observedAt: "2026-08-23T20:00:00.000Z" };

describe("APR case status observation adapters", () => {
  it("emette PASS dal preflight comune senza cambiare la verità pubblica esistente", () => {
    const item = { customerKey: "fixture-a", state: "ready_local_plan", report: { outcome: "ready_local_plan", blockers: [] } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprCommonPreflight(item, at)).toMatchObject({ source: "preflight_common", stage: "COMMON_PREFLIGHT", status: "PASS", blockerCodes: [] });
  });

  it("emette BLOCKED dal gate prodotto soltanto con blocker persistiti", () => {
    const item = { customerKey: "fixture-b", state: "blocked_case", report: { outcome: "blocked_case", blockers: [{ code: "fixture_blocker" }] } } as unknown as AprInfissiBatchItem;
    expect(observeAprInfissiBatchProductGate(item, at)).toMatchObject({ source: "product_gate", stage: "PRODUCT_GATE", status: "BLOCKED", blockerCodes: ["fixture_blocker"] });
  });

  it("compone una fornitura documentata mista in un solo gate prodotto", () => {
    const screeningItem = { customerKey: "armando-ranzoni", state: "blocked_case", report: {
      outcome: "blocked_case", blockers: [{ code: "screening_blocker" }], products: [{ rowId: "screening-1" }],
      eneaPayloadAudit: { draftReady: false, blockers: [{ code: "screening_blocker" }], portalGate: { status: "blocked", screeningItemCount: 1, supportedPages: ["Schermature solari"] } },
    } } as unknown as AprCrmLocalPreflightItem;
    const infissiItem = { customerKey: "armando-ranzoni", productModule: "mixed", state: "blocked_case", report: {
      outcome: "blocked_case", blockers: [{ code: "infissi_blocker" }],
    } } as unknown as AprInfissiBatchItem;
    const result = observeAprMixedProductGate({
      screening: observeAprScreeningProductGate(screeningItem, at),
      infissi: observeAprInfissiBatchProductGate(infissiItem, at),
    }, at);
    expect(result).toMatchObject({ source: "product_gate", productModule: "mixed", status: "BLOCKED", blockerCodes: ["infissi_blocker", "screening_blocker"] });
  });

  it("resta fail-closed se al routing misto manca il gate Schermature", () => {
    const infissiItem = { customerKey: "mixed-missing-screening", productModule: "mixed", state: "ready_local_plan", report: {
      outcome: "ready_local_plan", blockers: [],
    } } as unknown as AprInfissiBatchItem;
    expect(observeAprMixedProductGate({ screening: null, infissi: observeAprInfissiBatchProductGate(infissiItem, at) }, at))
      .toMatchObject({ productModule: "mixed", status: "MISSING", blockerCodes: [] });
  });

  it("emette PASS dal portal gate Schermature realmente pronto", () => {
    const item = { customerKey: "screening-ready", state: "ready_local_plan", report: {
      outcome: "ready_local_plan", blockers: [], products: [{ rowId: "screening-1" }],
      eneaPayloadAudit: { draftReady: true, blockers: [], portalGate: { status: "ready", screeningItemCount: 1, supportedPages: ["Schermature solari"] } },
    } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprScreeningProductGate(item, at)).toMatchObject({ source: "product_gate", stage: "PRODUCT_GATE", status: "PASS", blockerCodes: [], productModule: "screening" });
  });

  it("marca come Schermature soltanto i blocker common esplicitamente legati a quella famiglia", () => {
    const item = { customerKey: "infissi-with-screening-noise", state: "blocked_case", report: {
      outcome: "blocked_case",
      blockers: [
        { code: "screenings_missing", field: "screenings", reason: "Nessuna schermatura riconciliata." },
        { code: "screening_measurement_ambiguous", field: "screenings.2.dimensions", reason: "Misura avvolgibile ambigua." },
        { code: "identity_conflict", field: "beneficiary", reason: "Identità non coerente." },
      ],
      eneaPayloadAudit: { blockers: [{ code: "crm-source-not-screening", fieldId: null, message: "Non è una schermatura." }] },
    } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprCommonPreflight(item, at).blockerApplicability).toEqual([
      { code: "screenings_missing", productModules: ["screening"] },
      { code: "screening_measurement_ambiguous", productModules: ["screening"] },
      { code: "identity_conflict", productModules: ["screening", "infissi"] },
      { code: "crm-source-not-screening", productModules: ["screening"] },
    ]);
  });

  it("applica lo stesso contratto ai blocker payload Schermature e conserva quelli comuni", () => {
    const item = { customerKey: "fixture-payload", state: "blocked_case", report: {
      outcome: "blocked_case", products: [], blockers: [],
      eneaPayloadAudit: { blockers: [
        { code: "missing-schermature.numero", fieldId: "schermature.numero", message: "Numero schermature mancante." },
        { code: "customer_form_missing", fieldId: "form", message: "Form cliente mancante." },
      ] },
    } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprCommonPreflight(item, at).blockerApplicability).toEqual([
      { code: "missing-schermature.numero", productModules: ["screening"] },
      { code: "customer_form_missing", productModules: ["screening", "infissi"] },
    ]);
  });

  it("non inventa il gate Schermature quando lo stage non è presente", () => {
    const item = { customerKey: "screening-not-reached", state: "ready_local_plan", report: {
      outcome: "ready_local_plan", blockers: [], products: [{ rowId: "screening-1" }],
    } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprScreeningProductGate(item, at)).toBeNull();
  });

  it("preserva un portal gate Schermature bloccato senza convertirlo in PASS", () => {
    const item = { customerKey: "screening-blocked", state: "blocked_case", report: {
      outcome: "blocked_case", blockers: [{ code: "draft_payload_mapping_incomplete" }], products: [{ rowId: "screening-1" }],
      eneaPayloadAudit: { draftReady: false, blockers: [{ code: "missing-screening-field" }], portalGate: { status: "blocked", screeningItemCount: 0, supportedPages: [] } },
    } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprScreeningProductGate(item, at)).toMatchObject({ source: "product_gate", status: "BLOCKED", blockerCodes: ["missing-screening-field"] });
  });

  it("preserva la classificazione tecnica della deep review", () => {
    const item = { customerKey: "fixture-c", state: "technical_repair", blockerCodes: ["parser_repair"] } as unknown as DeepReviewItem;
    expect(observeAprDeepReview(item, at)).toMatchObject({ source: "deep_review", stage: "DEEP_REVIEW", status: "BLOCKED", classification: "TECHNICAL" });
  });

  it("emette COMPLETED esclusivamente dal checkpoint execution salvato", () => {
    const item = { customerKey: "fixture-d", state: "saved", operatorGateBlockers: [], uncertainPageSave: null, reason: "Bozza salvata." } as unknown as AprEneaDraftExecutionItem;
    expect(observeAprDraftExecution(item, at)).toMatchObject({ source: "execution", stage: "EXECUTION", status: "COMPLETED", classification: "NONE" });
  });

  it("classifica come tecnico il mancato salvataggio server di una pagina annidata", () => {
    const item = { customerKey: "fixture-nested-save", state: "operator_intervention", operatorGateBlockers: [], uncertainPageSave: null, reason: "Errore circoscritto alla pratica: apr_enea_nested_page_not_persisted_after_outer_save:page:Generatore dell'impianto termico" } as unknown as AprEneaDraftExecutionItem;
    expect(observeAprDraftExecution(item, at)).toMatchObject({ source: "execution", stage: "EXECUTION", status: "BLOCKED", classification: "TECHNICAL", blockerCodes: [] });
  });

  it("non trasforma un intervento business esplicito in arresto tecnico", () => {
    const item = { customerKey: "fixture-operator", state: "operator_intervention", operatorGateBlockers: [{ code: "invoice_total_conflict" }], uncertainPageSave: null, reason: "L'operatore deve verificare il totale della fattura." } as unknown as AprEneaDraftExecutionItem;
    expect(observeAprDraftExecution(item, at)).toMatchObject({ source: "execution", stage: "EXECUTION", status: "BLOCKED", classification: "OPERATOR", blockerCodes: ["invoice_total_conflict"] });
  });

  it("rifiuta osservazioni senza runId", () => {
    const item = { customerKey: "fixture-a", state: "ready_local_plan", report: { outcome: "ready_local_plan", blockers: [] } } as unknown as AprCrmLocalPreflightItem;
    expect(() => observeAprCommonPreflight(item, { ...at, runId: "" })).toThrow(/run_id_empty/);
  });
});
