import { describe, expect, it } from "vitest";
import type { AprShadowMetricCase } from "./aprShadowMetrics";
import { buildAprShadowDailyReviewPlan } from "./aprShadowDailyReviewPlan";

function blockedCase(
  practiceId: string,
  productType: AprShadowMetricCase["productType"],
  blockerCodes: string[],
  operatorVerdict: AprShadowMetricCase["operatorVerdict"] = "unreviewed",
): AprShadowMetricCase {
  return {
    practiceId,
    productType,
    evaluated: true,
    blockerCodes,
    mappedFieldCount: 10,
    autoReadyFieldCount: 5,
    operatorVerdict,
    preparationMinutes: 8,
  };
}

function readyCase(
  practiceId: string,
  productType: AprShadowMetricCase["productType"],
  operatorVerdict: AprShadowMetricCase["operatorVerdict"] = "unreviewed",
): AprShadowMetricCase {
  return {
    practiceId,
    productType,
    evaluated: true,
    blockerCodes: [],
    mappedFieldCount: 10,
    autoReadyFieldCount: 10,
    operatorVerdict,
    preparationMinutes: 4,
  };
}

describe("APR shadow daily review plan", () => {
  it("porta in cima i blocker ad alta leva e privilegia i casi a causa singola", () => {
    const result = buildAprShadowDailyReviewPlan([
      blockedCase("multi", "schermature", ["document-missing", "gtot-missing"]),
      blockedCase("doc-1", "infissi", ["document-missing"]),
      blockedCase("doc-2", "impianto_termico", ["document-missing"]),
      blockedCase("rare", "schermature", ["rare-blocker"]),
    ], {
      blockedLimit: 2,
      readyAuditLimit: 0,
    });

    expect(result.planValid).toBe(true);
    expect(result.blocked.selected.map((item) => item.practiceId)).toEqual(["doc-1", "doc-2"]);
    expect(result.blocked.deferred).toBe(2);
  });

  it("usa gli audit ready per colmare prima il prodotto meno revisionato", () => {
    const result = buildAprShadowDailyReviewPlan([
      readyCase("screening-reviewed", "schermature", "correct-ready"),
      readyCase("screening-waiting", "schermature"),
      readyCase("infissi-waiting-1", "infissi"),
      readyCase("infissi-waiting-2", "infissi"),
      readyCase("plant-waiting", "impianto_termico"),
    ], {
      blockedLimit: 0,
      readyAuditLimit: 2,
    });

    expect(result.planValid).toBe(true);
    expect(result.readyAudit.selected.map((item) => item.productType)).toEqual([
      "infissi",
      "impianto_termico",
    ]);
    expect(result.readyAudit.selected.map((item) => item.practiceId)).toEqual([
      "infissi-waiting-1",
      "plant-waiting",
    ]);
    expect(result.readyAudit.deferred).toBe(2);
  });

  it("non produce una coda operativa quando l'evidenza shadow e strutturalmente invalida", () => {
    const duplicate = readyCase("same", "schermature");
    const result = buildAprShadowDailyReviewPlan([
      duplicate,
      { ...duplicate, productType: "infissi" },
    ], {
      blockedLimit: 10,
      readyAuditLimit: 10,
    });

    expect(result.planValid).toBe(false);
    expect(result.metrics.evidenceValid).toBe(false);
    expect(result.blocked.selected).toEqual([]);
    expect(result.readyAudit.selected).toEqual([]);
  });

  it("rifiuta limiti giornalieri negativi o frazionari invece di reinterpretarli", () => {
    const result = buildAprShadowDailyReviewPlan([
      readyCase("ready", "schermature"),
    ], {
      blockedLimit: -1,
      readyAuditLimit: 1.5,
    });

    expect(result.planValid).toBe(false);
    expect(result.planBlockers).toEqual([
      { field: "blockedLimit", code: "invalid-daily-review-limit" },
      { field: "readyAuditLimit", code: "invalid-daily-review-limit" },
    ]);
    expect(result.readyAudit.selected).toEqual([]);
  });
});
