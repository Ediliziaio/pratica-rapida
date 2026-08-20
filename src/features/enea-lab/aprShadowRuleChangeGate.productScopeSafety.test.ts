import { describe, expect, it } from "vitest";
import { validateAprShadowRuleChange } from "./aprShadowRuleChangeGate";

describe("APR shadow rule change gate - product scope safety", () => {
  it("non promuove una regola target usando evidenza blocker-specifica mescolata tra prodotti", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "technical-performance-missing",
      cases: [
        {
          practiceId: "infissi-false-block",
          productType: "infissi",
          expectedDisposition: "ready",
          targetBlockerVerdict: "false-block",
          baselineBlockerCodes: ["technical-performance-missing"],
          candidateBlockerCodes: [],
        },
        {
          practiceId: "impianto-correct-block",
          productType: "impianto_termico",
          expectedDisposition: "blocked",
          targetBlockerVerdict: "correct-block",
          baselineBlockerCodes: ["technical-performance-missing"],
          candidateBlockerCodes: ["technical-performance-missing"],
        },
      ],
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.promotable).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "",
      code: "mixed-target-product-scope",
    });
  });
});
