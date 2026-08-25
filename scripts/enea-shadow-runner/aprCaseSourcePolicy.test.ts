import { describe, expect, it } from "vitest";
import { createAprNotApplicableObservation, deriveAprCaseSourcePolicy, observeAprStructuredBlockers, resolveAprCaseSourcePolicy } from "./aprCaseSourcePolicy";

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

  it("richiede anche il gate prodotto quando common e product sono entrambi BLOCKED", () => {
    expect(deriveAprCaseSourcePolicy({ commonStatus: "BLOCKED", productStatus: "BLOCKED", executionPresent: false, serverVerificationPresent: false }))
      .toMatchObject({ product_gate: "required", deep_review: "required" });
  });

  it("rende applicabile il gate Infissi quando i soli blocker common appartengono alle Schermature", () => {
    expect(resolveAprCaseSourcePolicy({
      commonStatus: "BLOCKED",
      commonBlockerCodes: ["screenings_missing", "invoice_screening"],
      commonBlockerApplicability: [
        { code: "screenings_missing", productModules: ["screening"] },
        { code: "invoice_screening", productModules: ["screening"] },
      ],
      routedProductModule: "infissi",
      productStatus: "PASS",
      executionPresent: true,
      serverVerificationPresent: false,
    })).toMatchObject({
      effectiveCommonStatus: "PASS",
      ignoredCommonBlockerCodes: ["screenings_missing", "invoice_screening"],
      policy: { product_gate: "required", execution: "required" },
    });
  });

  it("mantiene fail-closed un blocker common trasversale anche con routing Infissi", () => {
    expect(resolveAprCaseSourcePolicy({
      commonStatus: "BLOCKED",
      commonBlockerCodes: ["beneficiary_identity_conflict"],
      commonBlockerApplicability: [{ code: "beneficiary_identity_conflict", productModules: ["screening", "infissi"] }],
      routedProductModule: "infissi",
      productStatus: "PASS",
      executionPresent: false,
      serverVerificationPresent: false,
    })).toMatchObject({ effectiveCommonStatus: "BLOCKED", ignoredCommonBlockerCodes: [], policy: { product_gate: "not_applicable_expected" } });
  });

  it("mantiene fail-closed se il blocker non possiede metadati di applicabilità", () => {
    expect(resolveAprCaseSourcePolicy({
      commonStatus: "BLOCKED",
      commonBlockerCodes: ["unknown_blocker"],
      routedProductModule: "infissi",
      productStatus: "PASS",
      executionPresent: false,
      serverVerificationPresent: false,
    }).effectiveCommonStatus).toBe("BLOCKED");
  });

  it("produce osservazioni NOT_APPLICABLE esplicite e blocker strutturati deduplicati", () => {
    const context = { customerKey: "fixture-a", runId: "run-a", observedAt: "2026-08-23T20:00:00.000Z" };
    expect(createAprNotApplicableObservation({ ...context, source: "deep_review" })).toMatchObject({ stage: "DEEP_REVIEW", status: "NOT_APPLICABLE" });
    expect(observeAprStructuredBlockers({ ...context, blockerCodes: ["b", "a", "b"] })).toMatchObject({ source: "report_blockers", status: "BLOCKED", blockerCodes: ["a", "b"] });
    expect(observeAprStructuredBlockers({ ...context, blockerCodes: null })).toMatchObject({ source: "report_blockers", status: "MISSING", blockerCodes: [] });
  });
});
