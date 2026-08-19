import { describe, expect, it } from "vitest";
import {
  APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY,
  applyAprShadowOperatorVerdict,
  loadAprShadowReviewLedger,
  reconcileAprShadowReviewLedger,
  type AprShadowMachineSnapshot,
} from "./aprShadowReviewLedger";

function snapshot(): AprShadowMachineSnapshot {
  return {
    practiceId: "practice-temporal",
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["gtot-missing"],
    mappedFieldCount: 12,
    autoReadyFieldCount: 8,
    preparationMinutes: 4,
    aprFingerprint: "fingerprint-temporal-v1",
  };
}

function memoryStorage(payload: unknown) {
  const values = new Map<string, string>([[
    APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY,
    JSON.stringify(payload),
  ]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  };
}

describe("APR shadow review ledger - integrita temporale", () => {
  it("rifiuta un ledger salvato nel futuro invece di estenderne implicitamente la TTL", () => {
    const state = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot()],
      new Date("2026-08-19T08:00:00Z"),
    ).state;
    const storage = memoryStorage({
      savedAt: "2026-08-20T08:00:00.000Z",
      records: state.records,
    });

    const loaded = loadAprShadowReviewLedger(storage, new Date("2026-08-19T08:00:00Z"));
    expect(loaded.storageValid).toBe(false);
    expect(loaded.state.records).toEqual([]);
  });

  it("rifiuta review temporalmente impossibili o incoerenti con il verdetto", () => {
    const base = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot()],
      new Date("2026-08-19T08:00:00Z"),
    ).state.records[0]!;

    const impossibleReview = memoryStorage({
      savedAt: "2026-08-19T09:00:00.000Z",
      records: [{
        ...base,
        operatorVerdict: "correct-block",
        reviewedAt: "2026-08-19T07:59:00.000Z",
      }],
    });
    expect(loadAprShadowReviewLedger(impossibleReview, new Date("2026-08-19T10:00:00Z")).storageValid).toBe(false);

    const orphanReviewTimestamp = memoryStorage({
      savedAt: "2026-08-19T09:00:00.000Z",
      records: [{
        ...base,
        operatorVerdict: "unreviewed",
        reviewedAt: "2026-08-19T08:05:00.000Z",
      }],
    });
    expect(loadAprShadowReviewLedger(orphanReviewTimestamp, new Date("2026-08-19T10:00:00Z")).storageValid).toBe(false);
  });

  it("non crea una review con timestamp precedente all'osservazione APR", () => {
    const record = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot()],
      new Date("2026-08-19T08:00:00Z"),
    ).state.records[0]!;

    expect(applyAprShadowOperatorVerdict(
      record,
      "correct-block",
      new Date("2026-08-19T07:59:00Z"),
    )).toBeNull();
  });
});
