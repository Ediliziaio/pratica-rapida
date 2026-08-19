import { describe, expect, it } from "vitest";
import {
  APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY,
  APR_SHADOW_REVIEW_LEDGER_TTL_MS,
  applyAprShadowOperatorVerdict,
  loadAprShadowReviewLedger,
  reconcileAprShadowReviewLedger,
  saveAprShadowReviewLedger,
  type AprShadowMachineSnapshot,
  type AprShadowReviewLedgerState,
} from "./aprShadowReviewLedger";

function snapshot(practiceId: string): AprShadowMachineSnapshot {
  return {
    practiceId,
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["gtot-missing"],
    mappedFieldCount: 12,
    autoReadyFieldCount: 8,
    preparationMinutes: 4,
    aprFingerprint: "fingerprint-v1",
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("APR shadow review ledger rolling TTL", () => {
  it("non prolunga indefinitamente record vecchi quando il ledger viene salvato di recente", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const oldObservedAt = new Date(now.getTime() - APR_SHADOW_REVIEW_LEDGER_TTL_MS - 1);
    const recentObservedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const oldRecord = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("old-practice")],
      oldObservedAt,
    ).state.records[0]!;
    const recentRecord = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("recent-practice")],
      recentObservedAt,
    ).state.records[0]!;

    const storage = memoryStorage();
    saveAprShadowReviewLedger(storage, { records: [oldRecord, recentRecord] }, now);
    expect(storage.getItem(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY)).toContain("old-practice");

    const loaded = loadAprShadowReviewLedger(storage, now);
    expect(loaded.storageValid).toBe(true);
    expect(loaded.expired).toBe(true);
    expect(loaded.state.records.map((record) => record.practiceId)).toEqual(["recent-practice"]);
  });

  it("non conserva una review oltre la finestra TTL se la pratica ricompare invariata", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const oldObservedAt = new Date(now.getTime() - APR_SHADOW_REVIEW_LEDGER_TTL_MS - 60_000);
    const initial = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("practice-1")],
      oldObservedAt,
    ).state.records[0]!;
    const reviewed = applyAprShadowOperatorVerdict(
      initial,
      "correct-block",
      new Date(oldObservedAt.getTime() + 30_000),
    )!;

    const previous: AprShadowReviewLedgerState = { records: [reviewed] };
    const reconciled = reconcileAprShadowReviewLedger(previous, [snapshot("practice-1")], now);

    expect(reconciled.evidenceValid).toBe(true);
    expect(reconciled.state.records).toHaveLength(1);
    expect(reconciled.state.records[0]?.operatorVerdict).toBe("unreviewed");
    expect(reconciled.state.records[0]?.reviewedAt).toBeNull();
    expect(reconciled.state.records[0]?.observedAt).toBe(now.toISOString());
  });
});
