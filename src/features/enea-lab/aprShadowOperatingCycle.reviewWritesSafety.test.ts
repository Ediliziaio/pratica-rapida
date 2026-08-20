import { describe, expect, it } from "vitest";
import { buildAprShadowOperatingCycleWithReviews } from "./aprShadowOperatingCycleWithReviews";
import type { AprShadowMachineSnapshot } from "./aprShadowReviewLedger";

function snapshot(
  practiceId: string,
  overrides: Partial<AprShadowMachineSnapshot> = {},
): AprShadowMachineSnapshot {
  return {
    practiceId,
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["gtot-missing"],
    mappedFieldCount: 12,
    autoReadyFieldCount: 8,
    preparationMinutes: 4,
    aprFingerprint: `${practiceId}-v1`,
    ...overrides,
  };
}

describe("APR shadow operating cycle review writes", () => {
  it("applica la review umana e l'attribuzione blocker nello stesso ciclo", () => {
    const result = buildAprShadowOperatingCycleWithReviews({
      previousState: { records: [] },
      currentSnapshots: [snapshot("practice-1")],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      reviewWrites: [{
        practiceId: "practice-1",
        aprFingerprint: "practice-1-v1",
        verdict: "false-block",
      }],
      blockerAttributionWrites: [{
        practiceId: "practice-1",
        blockerCode: "gtot-missing",
        verdict: "false-block",
      }],
      now: new Date("2026-08-20T01:00:00Z"),
    });

    expect(result.reviewWritesValid).toBe(true);
    expect(result.reviewWriteBlockers).toEqual([]);
    expect(result.cycle?.cycleValid).toBe(true);
    expect(result.cycle?.ledgerState.records).toContainEqual(expect.objectContaining({
      practiceId: "practice-1",
      aprFingerprint: "practice-1-v1",
      operatorVerdict: "false-block",
      reviewedAt: "2026-08-20T01:00:00.000Z",
    }));
    expect(result.cycle?.blockerAttributionState.records).toContainEqual(expect.objectContaining({
      practiceId: "practice-1",
      blockerCode: "gtot-missing",
      verdict: "false-block",
      aprFingerprint: "practice-1-v1",
    }));
  });

  it("rifiuta una review nata su un fingerprint APR ormai stale", () => {
    const result = buildAprShadowOperatingCycleWithReviews({
      previousState: { records: [] },
      currentSnapshots: [snapshot("practice-1", { aprFingerprint: "practice-1-v2" })],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      reviewWrites: [{
        practiceId: "practice-1",
        aprFingerprint: "practice-1-v1",
        verdict: "false-block",
      }],
      now: new Date("2026-08-20T01:00:00Z"),
    });

    expect(result.reviewWritesValid).toBe(false);
    expect(result.cycle).toBeNull();
    expect(result.reviewWriteBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "stale-review-fingerprint",
    });
  });

  it("rende atomico il batch e blocca review duplicate della stessa pratica", () => {
    const write = {
      practiceId: "practice-1",
      aprFingerprint: "practice-1-v1",
      verdict: "correct-block" as const,
    };
    const result = buildAprShadowOperatingCycleWithReviews({
      previousState: { records: [] },
      currentSnapshots: [snapshot("practice-1")],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      reviewWrites: [write, { ...write }],
      now: new Date("2026-08-20T01:00:00Z"),
    });

    expect(result.reviewWritesValid).toBe(false);
    expect(result.cycle).toBeNull();
    expect(result.reviewWriteBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "duplicate-review-input",
    });
  });
});
