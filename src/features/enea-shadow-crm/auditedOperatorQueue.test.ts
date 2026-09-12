import { describe, expect, it } from "vitest";
import { AUDITED_OPERATOR_QUEUE_STORAGE_KEY, DEFAULT_AUDITED_OPERATOR_QUEUE, checkpointOperationalPractice, loadAuditedOperatorQueue, recordExceptionalManualSubmit, resumeOperationalQueue, saveAuditedOperatorQueue } from "./auditedOperatorQueue";

describe("coda audit multi-pratica locale", () => {
  it("persiste e ricarica tutti i sei ticket senza contatti o canali attivi", () => {
    const storage = new Map<string, string>();
    const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), key: () => null, get length() { return storage.size; } } as Storage;
    expect(saveAuditedOperatorQueue(adapter, DEFAULT_AUDITED_OPERATOR_QUEUE)).toBe(true);
    const loaded = loadAuditedOperatorQueue(adapter);
    expect(loaded).toHaveLength(6);
    expect(loaded.every((item) => ["requested_operator", "economically_verified", "submitted_manual_exception"].includes(item.status) && item.communicationsBlocked)).toBe(true);
    expect(loaded.find((item) => item.displayName === "Patrizia Vaccani")).toMatchObject({ status: "submitted_manual_exception" });
    expect(loaded.find((item) => item.displayName === "Matteo Maranesi")).toMatchObject({ status: "requested_operator" });
    const serialized = storage.get(AUDITED_OPERATOR_QUEUE_STORAGE_KEY) ?? "";
    expect(serialized).not.toMatch(/@|telefono|codice fiscale|https?:\/\//i);
    expect(loaded.map((item) => item.displayName)).toEqual([
      "Sara Agostinelli", "Samuele Colombo", "Patrizia Vaccani", "Vito Fusillo", "Zeno Righetti", "Matteo Maranesi",
    ]);
  });

  it("separa l'invio manuale dal successo dell'automazione submit", () => {
    const pending = recordExceptionalManualSubmit(DEFAULT_AUDITED_OPERATOR_QUEUE, "audit-patrizia-vaccani");
    expect(pending.find((item) => item.id === "audit-patrizia-vaccani")).toMatchObject({
      status: "submitted_manual_exception",
      reason: expect.stringContaining("Non è un successo dell'automazione submit"),
    });
  });

  it("degrada sulle fixture ufficiali se lo storage è corrotto", () => {
    localStorage.setItem(AUDITED_OPERATOR_QUEUE_STORAGE_KEY, "{corrotto");
    expect(loadAuditedOperatorQueue(localStorage)).toHaveLength(6);
  });

  it("riprende ogni pratica dallo stesso checkpoint conservando fonti, regole, blocco e audit", () => {
    const checkpointed = checkpointOperationalPractice(DEFAULT_AUDITED_OPERATOR_QUEUE, "audit-samuele-colombo", {
      step: "screenings", completed: true, status: "economically_verified",
      source: { sourceId: "samuele:form:screenings", kind: "form", verification: "verified", note: "Tre righe tecniche acquisite." },
      ruleId: "screenings.mechanism.unspecified.manual",
      block: null,
      nextAction: "Riprendere dal mapping ENEA senza rileggere le fonti.",
      note: "Movimentazione assente risolta dalla policy Manuale.",
      at: "2026-08-14T10:00:00.000Z",
    });
    const resumed = resumeOperationalQueue(checkpointed, "2026-08-14T10:05:00.000Z");
    const samuele = resumed.find((practice) => practice.id === "audit-samuele-colombo")!;
    expect(samuele).toMatchObject({ currentStep: "screenings", activeBlock: null, status: "economically_verified" });
    expect(samuele.completedSteps).toContain("screenings");
    expect(samuele.sources).toContainEqual(expect.objectContaining({ sourceId: "samuele:form:screenings" }));
    expect(samuele.appliedRules).toContain("screenings.mechanism.unspecified.manual");
    expect(samuele.audit.at(-1)).toMatchObject({ type: "queue_resumed", step: "screenings" });
  });

  it("migra automaticamente lo storage precedente senza perdere i documenti", () => {
    const storage = new Map<string, string>();
    const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), key: () => null, get length() { return storage.size; } } as Storage;
    const legacy = DEFAULT_AUDITED_OPERATOR_QUEUE.map(({ queueVersion: _q, revision: _r, currentStep: _s, completedSteps: _c, sources: _so, appliedRules: _ar, activeBlock: _ab, nextAction: _na, updatedAt: _u, audit: _a, ...practice }) => practice);
    storage.set(AUDITED_OPERATOR_QUEUE_STORAGE_KEY, JSON.stringify(legacy));
    const migrated = loadAuditedOperatorQueue(adapter);
    expect(migrated.every((practice) => practice.queueVersion === "enea-operational-queue-v1" && practice.audit[0].type === "checkpoint_migrated")).toBe(true);
    expect(migrated[0].documents).toHaveLength(5);
  });
});
