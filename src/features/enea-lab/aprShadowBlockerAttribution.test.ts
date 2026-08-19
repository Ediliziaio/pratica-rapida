import { describe, expect, it } from "vitest";
import type { AprShadowMetricCase } from "./aprShadowMetrics";
import { buildAprShadowBlockerAttribution } from "./aprShadowBlockerAttribution";

function row(
  practiceId: string,
  blockerCodes: string[],
  operatorVerdict: AprShadowMetricCase["operatorVerdict"],
): AprShadowMetricCase {
  return {
    practiceId,
    productType: "schermature",
    evaluated: true,
    blockerCodes,
    mappedFieldCount: 10,
    autoReadyFieldCount: blockerCodes.length > 0 ? 6 : 10,
    operatorVerdict,
    preparationMinutes: 5,
  };
}

describe("APR shadow blocker attribution", () => {
  it("attribuisce i verdetti ai singoli blocker anche nelle pratiche multi-causa", () => {
    const result = buildAprShadowBlockerAttribution(
      [
        row("mixed-1", ["document-missing", "gtot-missing"], "correct-block"),
        row("doc-2", ["document-missing"], "correct-block"),
        row("gtot-2", ["gtot-missing"], "false-block"),
      ],
      [
        { practiceId: "mixed-1", blockerCode: "document-missing", verdict: "false-block" },
        { practiceId: "mixed-1", blockerCode: "gtot-missing", verdict: "correct-block" },
      ],
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.attributionQueue).toEqual([]);
    expect(result.blockerQuality).toEqual([
      {
        code: "document-missing",
        affectedCases: 2,
        reviewedCases: 2,
        correctBlockCases: 1,
        falseBlockCases: 1,
        falseBlockRate: 0.5,
      },
      {
        code: "gtot-missing",
        affectedCases: 2,
        reviewedCases: 2,
        correctBlockCases: 1,
        falseBlockCases: 1,
        falseBlockRate: 0.5,
      },
    ]);
    expect(result.correctionCandidates.map((item) => item.code)).toEqual([
      "document-missing",
      "gtot-missing",
    ]);
  });

  it("mantiene in coda le cause non attribuite e non inventa un tasso per-codice", () => {
    const result = buildAprShadowBlockerAttribution(
      [row("mixed-1", ["document-missing", "gtot-missing"], "correct-block")],
      [{ practiceId: "mixed-1", blockerCode: "document-missing", verdict: "false-block" }],
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.attributionQueue).toEqual([
      {
        practiceId: "mixed-1",
        productType: "schermature",
        blockerCodes: ["document-missing", "gtot-missing"],
        missingBlockerCodes: ["gtot-missing"],
      },
    ]);
    expect(result.blockerQuality).toEqual([
      {
        code: "document-missing",
        affectedCases: 1,
        reviewedCases: 1,
        correctBlockCases: 0,
        falseBlockCases: 1,
        falseBlockRate: 1,
      },
      {
        code: "gtot-missing",
        affectedCases: 1,
        reviewedCases: 0,
        correctBlockCases: 0,
        falseBlockCases: 0,
        falseBlockRate: null,
      },
    ]);
  });

  it("si ferma fail-closed su attribuzioni incompatibili con il verdetto della pratica", () => {
    const result = buildAprShadowBlockerAttribution(
      [row("mixed-1", ["document-missing", "gtot-missing"], "false-block")],
      [{ practiceId: "mixed-1", blockerCode: "document-missing", verdict: "correct-block" }],
    );

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "mixed-1",
      code: "attribution-inconsistent-with-practice-verdict",
    });
    expect(result.blockerQuality).toEqual([]);
    expect(result.correctionCandidates).toEqual([]);
  });

  it("non accetta attribuzioni duplicate o riferite a blocker assenti", () => {
    const result = buildAprShadowBlockerAttribution(
      [row("mixed-1", ["document-missing", "gtot-missing"], "correct-block")],
      [
        { practiceId: "mixed-1", blockerCode: "document-missing", verdict: "false-block" },
        { practiceId: "mixed-1", blockerCode: "document-missing", verdict: "false-block" },
        { practiceId: "mixed-1", blockerCode: "unknown-blocker", verdict: "correct-block" },
      ],
    );

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "mixed-1",
      code: "duplicate-blocker-attribution",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "mixed-1",
      code: "attribution-code-not-present",
    });
  });
});
