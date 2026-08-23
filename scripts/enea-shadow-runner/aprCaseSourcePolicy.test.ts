import { describe, expect, it } from "vitest";
import { createAprNotApplicableObservation, deriveAprCaseSourcePolicy, observeAprStructuredBlockers } from "./aprCaseSourcePolicy";

describe("APR required and not-applicable source policy", () => {
  it("richiede il gate prodotto dopo common PASS e lascia execution non applicabile finché assente", () => {
    expect(deriveAprCaseSourcePolicy({ commonStatus: "PASS", productStatus: "PASS", executionPresent: false, serverVerificationPresent: false })).toEqual({
      preflight_common: "required", product_gate: "required", deep_review: "not_applicable_expected", execution: "not_applicable_expected", server_verification: "not_applicable_expected",
    });
  });

  it("richiede deep review dopo un blocker prodotto", () => {
    expect(deriveAprCaseSourcePolicy({ commonStatus: "PASS", productStatus: "BLOCKED", executionPresent: false, serverVerificationPresent: false }).deep_review).toBe("required");
  });

  it("non raggiunge il gate prodotto dopo un blocker comune ma richiede deep review", () => {
    expect(deriveAprCaseSourcePolicy({ commonStatus: "BLOCKED", executionPresent: false, serverVerificationPresent: false })).toMatchObject({ product_gate: "not_applicable_expected", deep_review: "required" });
  });

  it("produce osservazioni NOT_APPLICABLE esplicite e blocker strutturati deduplicati", () => {
    const context = { customerKey: "fixture-a", runId: "run-a", observedAt: "2026-08-23T20:00:00.000Z" };
    expect(createAprNotApplicableObservation({ ...context, source: "deep_review" })).toMatchObject({ stage: "DEEP_REVIEW", status: "NOT_APPLICABLE" });
    expect(observeAprStructuredBlockers({ ...context, blockerCodes: ["b", "a", "b"] })).toMatchObject({ source: "report_blockers", status: "BLOCKED", blockerCodes: ["a", "b"] });
  });
});
