import { describe, expect, it } from "vitest";
import { validateAprShadowRuleChange } from "./aprShadowRuleChangeGate";

type ReplayCase = Parameters<typeof validateAprShadowRuleChange>[0]["cases"][number];

function unsafeReplayCase(overrides: Record<string, unknown>): ReplayCase {
  return {
    practiceId: "practice-1",
    productType: "schermature",
    expectedDisposition: "ready",
    targetBlockerVerdict: "false-block",
    baselineBlockerCodes: ["gtot-missing"],
    candidateBlockerCodes: [],
    ...overrides,
  } as unknown as ReplayCase;
}

describe("APR shadow rule change gate runtime discriminants", () => {
  it("rifiuta product type runtime sconosciuti invece di promuovere il replay", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [unsafeReplayCase({ productType: "unknown-product" })],
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.promotable).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "invalid-product-type",
    });
  });

  it("rifiuta expected disposition runtime non canoniche", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [unsafeReplayCase({ expectedDisposition: "ready " })],
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.promotable).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "invalid-expected-disposition",
    });
  });

  it("rifiuta verdict blocker-specifici runtime sconosciuti", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [unsafeReplayCase({ targetBlockerVerdict: "false-block " })],
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.promotable).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "invalid-target-blocker-verdict",
    });
  });
});
