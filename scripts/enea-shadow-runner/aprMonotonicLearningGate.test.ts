import { describe, expect, it } from "vitest";
import { evaluateAprMonotonicLearningGate } from "./aprMonotonicLearningGate";

const snapshot = (cases: Array<{ customerKey: string; state: "READY" | "OPERATOR_REQUIRED" | "INCONSISTENT"; payloadFingerprint?: string }>) => ({ corpusFingerprint: "corpus-immutable", cases });

describe("APR monotonic learning gate", () => {
  it("accetta apprendimento generale soltanto se migliora almeno un caso senza regressioni", () => {
    const result = evaluateAprMonotonicLearningGate({
      baseline: snapshot([{ customerKey: "fixture-a", state: "READY", payloadFingerprint: "payload-a" }, { customerKey: "fixture-b", state: "OPERATOR_REQUIRED" }]),
      candidate: snapshot([{ customerKey: "fixture-a", state: "READY", payloadFingerprint: "payload-a" }, { customerKey: "fixture-b", state: "READY" }]),
      mode: "learning",
    });
    expect(result).toMatchObject({ status: "PASS", baselineReady: 1, candidateReady: 2, improvedKeys: ["fixture-b"], regressions: [] });
  });

  it("rifiuta una correzione che non migliora il corpus", () => {
    const unchanged = snapshot([{ customerKey: "fixture-a", state: "READY" }, { customerKey: "fixture-b", state: "OPERATOR_REQUIRED" }]);
    expect(evaluateAprMonotonicLearningGate({ baseline: unchanged, candidate: unchanged, mode: "learning" })).toMatchObject({ status: "FAIL", improvementRequiredButMissing: true });
  });

  it("rifiuta perdita di casi, regressione READY e modifica silenziosa del payload", () => {
    const result = evaluateAprMonotonicLearningGate({
      baseline: snapshot([{ customerKey: "a", state: "READY", payloadFingerprint: "one" }, { customerKey: "b", state: "READY" }, { customerKey: "c", state: "OPERATOR_REQUIRED" }]),
      candidate: snapshot([{ customerKey: "a", state: "READY", payloadFingerprint: "two" }, { customerKey: "b", state: "OPERATOR_REQUIRED" }]),
      mode: "maintenance",
    });
    expect(result.status).toBe("FAIL");
    expect(result.regressions.map((item) => item.kind)).toEqual(["verified_payload_changed", "ready_regressed", "case_missing"]);
  });

  it("rifiuta confronti tra corpus differenti", () => {
    expect(() => evaluateAprMonotonicLearningGate({ baseline: snapshot([]), candidate: { corpusFingerprint: "other", cases: [] }, mode: "maintenance" })).toThrow(/corpus_mismatch/);
  });
});

