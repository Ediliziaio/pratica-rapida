import { describe, expect, it } from "vitest";
import type { AprCrmLocalPreflightItem } from "./crmLocalPreflight";
import type { AprInfissiBatchItem } from "./infissiBatchPreflight";
import type { DeepReviewItem } from "./deepCaseReview";
import type { AprEneaDraftExecutionItem } from "./eneaDraftExecution";
import { observeAprCommonPreflight, observeAprDeepReview, observeAprDraftExecution, observeAprInfissiBatchProductGate } from "./caseStatusObservationAdapters";

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
