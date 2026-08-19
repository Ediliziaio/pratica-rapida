import { describe, expect, it } from "vitest";
import {
  APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY,
  APR_SHADOW_REVIEW_LEDGER_TTL_MS,
  loadAprShadowReviewLedger,
  reconcileAprShadowReviewLedger,
  saveAprShadowReviewLedger,
  type AprShadowMachineSnapshot,
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
    aprFingerprint: `${practiceId}-v1`,
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

describe("APR shadow review ledger - TTL per record", () => {
  it("non rinnova la TTL di un record storico soltanto perche il ledger viene risalvato", () => {
    const storage = memoryStorage();
    const observedAt = new Date("2026-04-01T08:00:00Z");
    const oldState = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("old-practice")],
      observedAt,
    ).state;
    const afterRecordTtl = new Date(observedAt.getTime() + APR_SHADOW_REVIEW_LEDGER_TTL_MS + 1);

    saveAprShadowReviewLedger(storage, oldState, afterRecordTtl);

    const raw = storage.getItem(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY);
    expect(raw).not.toContain("old-practice");
    const loaded = loadAprShadowReviewLedger(storage, afterRecordTtl);
    expect(loaded.storageValid).toBe(true);
    expect(loaded.state.records).toEqual([]);
  });

  it("rimuove lo storico scaduto ma conserva le pratiche correnti durante la riconciliazione", () => {
    const observedAt = new Date("2026-04-01T08:00:00Z");
    const oldState = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot("old-practice")],
      observedAt,
    ).state;
    const now = new Date(observedAt.getTime() + APR_SHADOW_REVIEW_LEDGER_TTL_MS + 1);

    const result = reconcileAprShadowReviewLedger(
      oldState,
      [snapshot("current-practice")],
      now,
    );

    expect(result.evidenceValid).toBe(true);
    expect(result.state.records.map((record) => record.practiceId)).toEqual(["current-practice"]);
  });
});
