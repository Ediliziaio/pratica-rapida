import { describe, expect, it } from "vitest";
import {
  buildAprShadowOperatingCycle,
} from "./aprShadowOperatingCycle";
import {
  reconcileAprShadowReviewLedger,
  type AprShadowMachineSnapshot,
} from "./aprShadowReviewLedger";

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

describe("APR shadow operating cycle", () => {
  it("mantiene lo storico nei KPI longitudinali ma non nella coda giornaliera corrente", () => {
    const previous = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("old-practice")],
      new Date("2026-08-18T08:00:00Z"),
    ).state;

    const result = buildAprShadowOperatingCycle({
      previousState: previous,
      currentSnapshots: [snapshot("new-practice")],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      now: new Date("2026-08-19T08:00:00Z"),
    });

    expect(result.cycleValid).toBe(true);
    expect(result.ledgerState.records.map((record) => record.practiceId).sort()).toEqual([
      "new-practice",
      "old-practice",
    ]);
    expect(result.longitudinalMetrics?.overall.counts.inScope).toBe(2);
    expect(result.currentMetrics?.overall.counts.inScope).toBe(1);
    expect(result.dailyReviewPlan?.blocked.selected.map((item) => item.practiceId)).toEqual([
      "new-practice",
    ]);
    expect(result.dailyReviewPlan?.blocked.selected.map((item) => item.practiceId)).not.toContain(
      "old-practice",
    );
  });

  it("usa soltanto le pratiche correnti anche per gli audit ready", () => {
    const previous = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("old-ready", { blockerCodes: [] })],
      new Date("2026-08-18T08:00:00Z"),
    ).state;

    const result = buildAprShadowOperatingCycle({
      previousState: previous,
      currentSnapshots: [snapshot("current-ready", { blockerCodes: [] })],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      now: new Date("2026-08-19T08:00:00Z"),
    });

    expect(result.cycleValid).toBe(true);
    expect(result.dailyReviewPlan?.readyAudit.selected.map((item) => item.practiceId)).toEqual([
      "current-ready",
    ]);
  });

  it("si ferma fail-closed se la riconciliazione delle evidenze correnti e invalida", () => {
    const duplicate = snapshot("duplicate");
    const result = buildAprShadowOperatingCycle({
      previousState: { records: [] },
      currentSnapshots: [duplicate, { ...duplicate }],
      reviewPlanOptions: { blockedLimit: 10, readyAuditLimit: 10 },
      now: new Date("2026-08-19T08:00:00Z"),
    });

    expect(result.cycleValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "duplicate",
      code: "duplicate-practice-id",
    });
    expect(result.currentMetrics).toBeNull();
    expect(result.longitudinalMetrics).toBeNull();
    expect(result.dailyReviewPlan).toBeNull();
    expect(result.ledgerState.records).toEqual([]);
  });
});
