import { describe, expect, it } from "vitest";
import {
  APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY,
  loadAprShadowBlockerAttributionLedger,
  saveAprShadowBlockerAttributionLedger,
  type AprShadowBlockerAttributionLedgerState,
} from "./aprShadowBlockerAttributionLedger";
import type { AprShadowReviewLedgerState } from "./aprShadowReviewLedger";

function reviewState(fingerprint = "practice-1-v1"): AprShadowReviewLedgerState {
  return {
    records: [
      {
        practiceId: "practice-1",
        productType: "schermature",
        evaluated: true,
        blockerCodes: ["document-missing", "gtot-missing"],
        mappedFieldCount: 10,
        autoReadyFieldCount: 6,
        operatorVerdict: "correct-block",
        preparationMinutes: 5,
        aprFingerprint: fingerprint,
        observedAt: "2026-08-19T08:00:00.000Z",
        reviewedAt: "2026-08-19T09:00:00.000Z",
      },
    ],
  };
}

function attributionState(): AprShadowBlockerAttributionLedgerState {
  return {
    records: [
      {
        practiceId: "practice-1",
        blockerCode: "document-missing",
        verdict: "false-block",
        aprFingerprint: "practice-1-v1",
        attributedAt: "2026-08-19T09:05:00.000Z",
      },
    ],
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

describe("APR shadow blocker attribution ledger storage", () => {
  it("persiste solo attribuzioni legate al review ledger corrente", () => {
    const storage = memoryStorage();
    const saved = saveAprShadowBlockerAttributionLedger(
      storage,
      attributionState(),
      reviewState(),
      new Date("2026-08-19T10:00:00.000Z"),
    );
    expect(saved).toBe(true);

    const loaded = loadAprShadowBlockerAttributionLedger(
      storage,
      reviewState(),
      new Date("2026-08-19T10:05:00.000Z"),
    );
    expect(loaded.storageValid).toBe(true);
    expect(loaded.state.records).toHaveLength(1);
  });

  it("elimina in lettura una diagnosi stale se cambia il fingerprint", () => {
    const storage = memoryStorage();
    storage.setItem(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY, JSON.stringify({
      records: attributionState().records,
      savedAt: "2026-08-19T10:00:00.000Z",
    }));

    const loaded = loadAprShadowBlockerAttributionLedger(
      storage,
      reviewState("practice-1-v2"),
      new Date("2026-08-19T10:05:00.000Z"),
    );

    expect(loaded.storageValid).toBe(true);
    expect(loaded.state.records).toEqual([]);
  });

  it("non sovrascrive uno storage valido con uno stato duplicato", () => {
    const storage = memoryStorage();
    storage.setItem(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY, "sentinel");
    const duplicate = attributionState().records[0];

    const saved = saveAprShadowBlockerAttributionLedger(
      storage,
      { records: [duplicate, { ...duplicate }] },
      reviewState(),
      new Date("2026-08-19T10:00:00.000Z"),
    );

    expect(saved).toBe(false);
    expect(storage.values.get(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY)).toBe("sentinel");
  });

  it("rifiuta storage malformato senza inventare attribuzioni", () => {
    const storage = memoryStorage();
    storage.setItem(APR_SHADOW_BLOCKER_ATTRIBUTION_LEDGER_STORAGE_KEY, "{not-json");

    const loaded = loadAprShadowBlockerAttributionLedger(
      storage,
      reviewState(),
      new Date("2026-08-19T10:00:00.000Z"),
    );

    expect(loaded.storageValid).toBe(false);
    expect(loaded.state.records).toEqual([]);
  });
});
