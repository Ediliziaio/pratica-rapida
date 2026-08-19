import { describe, expect, it } from "vitest";
import { validateAprShadowRuleChange } from "./aprShadowRuleChangeGate";

function replayCase(overrides: Partial<Parameters<typeof validateAprShadowRuleChange>[0]["cases"][number]> = {}) {
  return {
    practiceId: "practice-1",
    productType: "schermature" as const,
    expectedDisposition: "blocked" as const,
    targetBlockerVerdict: "false-block" as const,
    baselineBlockerCodes: ["document-missing", "gtot-missing"],
    candidateBlockerCodes: ["document-missing"],
    ...overrides,
  };
}

describe("APR shadow rule change gate", () => {
  it("promuove solo una correzione mirata che elimina i false-block senza perdere blocker corretti", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({ practiceId: "mixed-correct" }),
        replayCase({
          practiceId: "false-only",
          expectedDisposition: "ready",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: [],
        }),
        replayCase({
          practiceId: "correct-target",
          targetBlockerVerdict: "correct-block",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: ["gtot-missing"],
        }),
        replayCase({
          practiceId: "unrelated-ready",
          expectedDisposition: "ready",
          targetBlockerVerdict: null,
          baselineBlockerCodes: [],
          candidateBlockerCodes: [],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(true);
    expect(result.promotable).toBe(true);
    expect(result.guardrailBlockers).toEqual([]);
    expect(result.counts).toMatchObject({
      cases: 4,
      targetFalseBlockCases: 2,
      targetFalseBlockCasesResolved: 2,
      targetCorrectBlockCases: 1,
      targetCorrectBlockCasesPreserved: 1,
    });
  });

  it("permette una fix blocker-specifica anche se un altro false-block mantiene la pratica bloccata", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({
          expectedDisposition: "ready",
          targetBlockerVerdict: "false-block",
          baselineBlockerCodes: ["gtot-missing", "other-false-block"],
          candidateBlockerCodes: ["other-false-block"],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(true);
    expect(result.promotable).toBe(true);
    expect(result.guardrailBlockers).toEqual([]);
  });

  it("blocca una fix che lascia irrisolto un false-block del blocker target", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({
          expectedDisposition: "ready",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: ["gtot-missing"],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(true);
    expect(result.promotable).toBe(false);
    expect(result.guardrailBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "target-false-block-not-resolved",
    });
  });

  it("blocca una fix che rimuove un blocker target giudicato corretto", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({
          targetBlockerVerdict: "correct-block",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: [],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(true);
    expect(result.promotable).toBe(false);
    expect(result.guardrailBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "target-correct-block-regression",
    });
  });

  it("blocca regressioni su pratiche prima corrette e drift di blocker non correlati", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({
          practiceId: "target-case",
          expectedDisposition: "ready",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: [],
        }),
        replayCase({
          practiceId: "ready-regression",
          expectedDisposition: "ready",
          targetBlockerVerdict: null,
          baselineBlockerCodes: [],
          candidateBlockerCodes: ["new-unrelated-blocker"],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(true);
    expect(result.promotable).toBe(false);
    expect(result.guardrailBlockers).toContainEqual({
      practiceId: "ready-regression",
      code: "previously-correct-disposition-regression",
    });
    expect(result.guardrailBlockers).toContainEqual({
      practiceId: "ready-regression",
      code: "unrelated-blocker-drift",
    });
  });

  it("non usa una fix di false-block per introdurre il blocker target su casi senza evidenza baseline", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({
          practiceId: "target-case",
          expectedDisposition: "ready",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: [],
        }),
        replayCase({
          practiceId: "new-target",
          expectedDisposition: "blocked",
          targetBlockerVerdict: null,
          baselineBlockerCodes: ["document-missing"],
          candidateBlockerCodes: ["document-missing", "gtot-missing"],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(true);
    expect(result.promotable).toBe(false);
    expect(result.guardrailBlockers).toContainEqual({
      practiceId: "new-target",
      code: "target-introduced-without-baseline-evidence",
    });
  });

  it("si ferma fail-closed su corpus non diagnosticabile", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: "gtot-missing",
      cases: [
        replayCase({ practiceId: "duplicate" }),
        replayCase({ practiceId: "duplicate" }),
        replayCase({
          practiceId: "missing-attribution",
          targetBlockerVerdict: null,
          baselineBlockerCodes: ["gtot-missing"],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.promotable).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "duplicate",
      code: "duplicate-practice-id",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "missing-attribution",
      code: "target-attribution-missing",
    });
  });

  it("rifiuta identificatori non canonici che potrebbero aggirare deduplica e attribuzioni", () => {
    const result = validateAprShadowRuleChange({
      targetBlockerCode: " gtot-missing ",
      cases: [
        replayCase({
          practiceId: "practice-1",
          baselineBlockerCodes: ["gtot-missing"],
          candidateBlockerCodes: [],
        }),
        replayCase({
          practiceId: " practice-1 ",
          baselineBlockerCodes: ["gtot-missing", " gtot-missing "],
          candidateBlockerCodes: [],
        }),
      ],
    });

    expect(result.evidenceValid).toBe(false);
    expect(result.promotable).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "",
      code: "invalid-target-blocker-code",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: " practice-1 ",
      code: "invalid-practice-id",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: " practice-1 ",
      code: "invalid-blocker-code",
    });
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: " practice-1 ",
      code: "duplicate-blocker-code",
    });
  });
});