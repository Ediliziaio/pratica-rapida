import { describe, expect, it } from "vitest";
import type { AprShadowMetricCase } from "./aprShadowMetrics";
import { buildAprShadowReviewBacklog } from "./aprShadowReviewBacklog";

function row(
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
    autoReadyFieldCount: blockerCodes.length > 0 ? 6 : 10,
    operatorVerdict,
    preparationMinutes: 5,
  };
}

describe("APR shadow review backlog", () => {
  it("separa i blocchi da revisionare dagli audit ready e rende visibili i blocker ricorrenti", () => {
    const result = buildAprShadowReviewBacklog([
      row("screen-1", "schermature", ["document-missing", "gtot-missing"]),
      row("screen-2", "schermature", ["document-missing"]),
      row("infissi-1", "infissi", ["portal-contract-unobserved"], "correct-block"),
      row("ready-1", "schermature", []),
      row("ready-2", "schermature", [], "correct-ready"),
    ]);

    expect(result.evidenceValid).toBe(true);
    expect(result.blockedReviewQueue.map((item) => item.practiceId)).toEqual([
      "screen-1",
      "screen-2",
    ]);
    expect(result.readyAuditQueue.map((item) => item.practiceId)).toEqual(["ready-1"]);
    expect(result.counts).toEqual({
      blockedAwaitingReview: 2,
      readyAwaitingAudit: 1,
      totalAwaitingReview: 3,
    });
    expect(result.blockerPareto).toEqual([
      { code: "document-missing", affectedCases: 2, affectedCaseRate: 2 / 3 },
      { code: "gtot-missing", affectedCases: 1, affectedCaseRate: 1 / 3 },
      { code: "portal-contract-unobserved", affectedCases: 1, affectedCaseRate: 1 / 3 },
    ]);
  });

  it("non pesa due volte lo stesso blocker se compare duplicato nella stessa pratica", () => {
    const result = buildAprShadowReviewBacklog([
      row("screen-1", "schermature", ["document-missing", "document-missing"]),
      row("screen-2", "schermature", ["document-missing"]),
    ]);

    expect(result.blockerPareto).toEqual([
      { code: "document-missing", affectedCases: 2, affectedCaseRate: 1 },
    ]);
  });

  it("spegne la coda operativa se le evidenze KPI sono strutturalmente invalide", () => {
    const result = buildAprShadowReviewBacklog([
      row("same-practice", "schermature", ["document-missing"]),
      row("same-practice", "infissi", ["portal-contract-unobserved"]),
    ]);

    expect(result.evidenceValid).toBe(false);
    expect(result.blockedReviewQueue).toEqual([]);
    expect(result.readyAuditQueue).toEqual([]);
    expect(result.blockerPareto).toEqual([]);
    expect(result.counts).toEqual({
      blockedAwaitingReview: 0,
      readyAwaitingAudit: 0,
      totalAwaitingReview: 0,
    });
  });
});
