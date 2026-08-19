import { describe, expect, it } from "vitest";
import {
  APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY,
  APR_SHADOW_REVIEW_LEDGER_TTL_MS,
  applyAprShadowOperatorVerdict,
  aprShadowLedgerToMetricCases,
  loadAprShadowReviewLedger,
  reconcileAprShadowReviewLedger,
  saveAprShadowReviewLedger,
  type AprShadowMachineSnapshot,
  type AprShadowReviewLedgerState,
} from "./aprShadowReviewLedger";

function snapshot(overrides: Partial<AprShadowMachineSnapshot> = {}): AprShadowMachineSnapshot {
  return {
    practiceId: "practice-1",
    productType: "schermature",
    evaluated: true,
    blockerCodes: ["gtot-missing"],
    mappedFieldCount: 12,
    autoReadyFieldCount: 8,
    preparationMinutes: 4,
    aprFingerprint: "fingerprint-v1",
    ...overrides,
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

describe("APR shadow review ledger", () => {
  it("conserva il verdetto soltanto quando fingerprint e risultato APR sono invariati", () => {
    const first = reconcileAprShadowReviewLedger({ records: [] }, [snapshot()], new Date("2026-08-19T08:00:00Z"));
    expect(first.evidenceValid).toBe(true);

    const reviewed = applyAprShadowOperatorVerdict(
      first.state.records[0]!,
      "correct-block",
      new Date("2026-08-19T08:05:00Z"),
    );
    expect(reviewed?.operatorVerdict).toBe("correct-block");

    const previousState: AprShadowReviewLedgerState = { records: [reviewed!] };
    const reconciled = reconcileAprShadowReviewLedger(
      previousState,
      [snapshot({ preparationMinutes: 3 })],
      new Date("2026-08-20T08:00:00Z"),
    );

    expect(reconciled.evidenceValid).toBe(true);
    expect(reconciled.state.records[0]?.operatorVerdict).toBe("correct-block");
    expect(reconciled.state.records[0]?.reviewedAt).toBe("2026-08-19T08:05:00.000Z");
    expect(reconciled.state.records[0]?.preparationMinutes).toBe(3);
  });

  it("resetta una review vecchia quando cambia il fingerprint APR", () => {
    const first = reconcileAprShadowReviewLedger({ records: [] }, [snapshot()]);
    const reviewed = applyAprShadowOperatorVerdict(first.state.records[0]!, "false-block")!;

    const reconciled = reconcileAprShadowReviewLedger(
      { records: [reviewed] },
      [snapshot({ aprFingerprint: "fingerprint-v2" })],
    );

    expect(reconciled.state.records[0]?.operatorVerdict).toBe("unreviewed");
    expect(reconciled.state.records[0]?.reviewedAt).toBeNull();
  });

  it("resetta la review anche se il caller riusa per errore lo stesso fingerprint con output diverso", () => {
    const first = reconcileAprShadowReviewLedger({ records: [] }, [snapshot()]);
    const reviewed = applyAprShadowOperatorVerdict(first.state.records[0]!, "correct-block")!;

    const reconciled = reconcileAprShadowReviewLedger(
      { records: [reviewed] },
      [snapshot({ blockerCodes: ["document-missing"] })],
    );

    expect(reconciled.state.records[0]?.operatorVerdict).toBe("unreviewed");
  });

  it("rifiuta verdetti incompatibili con l'esito APR", () => {
    const blocked = reconcileAprShadowReviewLedger({ records: [] }, [snapshot()]).state.records[0]!;
    expect(applyAprShadowOperatorVerdict(blocked, "escaped-error")).toBeNull();

    const ready = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot({ blockerCodes: [] })],
    ).state.records[0]!;
    expect(applyAprShadowOperatorVerdict(ready, "false-block")).toBeNull();
    expect(applyAprShadowOperatorVerdict(ready, "correct-ready")?.operatorVerdict).toBe("correct-ready");
  });

  it("mantiene lo storico fuori dalla coda corrente senza duplicare la stessa pratica", () => {
    const old = reconcileAprShadowReviewLedger(
      { records: [] },
      [snapshot({ practiceId: "old-practice" })],
    ).state;

    const next = reconcileAprShadowReviewLedger(
      old,
      [snapshot({ practiceId: "new-practice" })],
    );

    expect(next.state.records.map((record) => record.practiceId).sort()).toEqual([
      "new-practice",
      "old-practice",
    ]);
  });

  it("si ferma fail-closed su snapshot duplicati e non altera il ledger precedente", () => {
    const previous = reconcileAprShadowReviewLedger({ records: [] }, [snapshot()]).state;
    const result = reconcileAprShadowReviewLedger(previous, [snapshot(), snapshot()]);

    expect(result.evidenceValid).toBe(false);
    expect(result.evidenceBlockers).toContainEqual({
      practiceId: "practice-1",
      code: "duplicate-practice-id",
    });
    expect(result.state).toEqual(previous);
  });

  it("persiste solo localmente, ricarica il ledger valido e scade dopo 120 giorni", () => {
    const storage = memoryStorage();
    const state = reconcileAprShadowReviewLedger({ records: [] }, [snapshot()]).state;
    const savedAt = new Date("2026-08-19T08:00:00Z");

    saveAprShadowReviewLedger(storage, state, savedAt);
    expect(storage.getItem(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY)).toContain("practice-1");

    const loaded = loadAprShadowReviewLedger(storage, new Date("2026-08-20T08:00:00Z"));
    expect(loaded.storageValid).toBe(true);
    expect(loaded.expired).toBe(false);
    expect(aprShadowLedgerToMetricCases(loaded.state)[0]?.practiceId).toBe("practice-1");

    const expired = loadAprShadowReviewLedger(
      storage,
      new Date(savedAt.getTime() + APR_SHADOW_REVIEW_LEDGER_TTL_MS + 1),
    );
    expect(expired.storageValid).toBe(true);
    expect(expired.expired).toBe(true);
    expect(expired.state.records).toEqual([]);
  });

  it("non usa un ledger corrotto per alimentare i KPI", () => {
    const storage = memoryStorage();
    storage.setItem(APR_SHADOW_REVIEW_LEDGER_STORAGE_KEY, JSON.stringify({
      savedAt: "2026-08-19T08:00:00.000Z",
      records: [{ practiceId: "practice-1" }],
    }));

    const loaded = loadAprShadowReviewLedger(storage, new Date("2026-08-19T09:00:00Z"));
    expect(loaded.storageValid).toBe(false);
    expect(loaded.state.records).toEqual([]);
  });
});
