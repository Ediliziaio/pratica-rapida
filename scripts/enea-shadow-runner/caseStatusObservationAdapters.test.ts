import { describe, expect, it } from "vitest";
import type { AprCrmLocalPreflightItem } from "./crmLocalPreflight";
import type { AprInfissiBatchItem } from "./infissiBatchPreflight";
import type { DeepReviewItem } from "./deepCaseReview";
import type { AprEneaDraftExecutionItem } from "./eneaDraftExecution";
import { observeAprCommonPreflight, observeAprDeepReview, observeAprDraftExecution, observeAprInfissiBatchProductGate, observeAprScreeningProductGate } from "./caseStatusObservationAdapters";

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
        { code: "identity_conflict", field: "beneficiary", reason: "Identità non coerente." },
      ],
      eneaPayloadAudit: { blockers: [{ code: "crm-source-not-screening", fieldId: null, message: "Non è una schermatura." }] },
    } } as unknown as AprCrmLocalPreflightItem;
    expect(observeAprCommonPreflight(item, at).blockerApplicability).toEqual([
      { code: "screenings_missing", productModules: ["screening"] },
      { code: "identity_conflict", productModules: ["screening", "infissi"] },
      { code: "crm-source-not-screening", productModules: ["screening"] },
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

  it("rifiuta osservazioni senza runId", () => {
    const item = { customerKey: "fixture-a", state: "ready_local_plan", report: { outcome: "ready_local_plan", blockers: [] } } as unknown as AprCrmLocalPreflightItem;
    expect(() => observeAprCommonPreflight(item, { ...at, runId: "" })).toThrow(/run_id_empty/);
  });
});
