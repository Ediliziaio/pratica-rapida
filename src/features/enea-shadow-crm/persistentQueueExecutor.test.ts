import { describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE, saveAuditedOperatorQueue } from "./auditedOperatorQueue";
import {
  QUEUE_EXECUTOR_COMMANDS_KEY,
  QUEUE_EXECUTOR_EVENTS_KEY,
  QUEUE_EXECUTOR_RUNTIME_KEY,
  enqueueQueueExecutorCommand,
  loadQueueExecutorEvents,
  loadQueueExecutorRuntime,
  tickPersistentQueueExecutor,
} from "./persistentQueueExecutor";

function storageAdapter() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: () => null, get length() { return values.size; } } as Storage;
}

describe("enea-queue-executor-v1", () => {
  it("consuma il comando cabina una sola volta e conserva il checkpoint della pratica", () => {
    const storage = storageAdapter();
    const queue = DEFAULT_AUDITED_OPERATOR_QUEUE.map((practice) => practice.id === "audit-samuele-colombo"
      ? { ...practice, status: "economically_verified" as const, activeBlock: null, currentStep: "screenings" as const }
      : practice);
    saveAuditedOperatorQueue(storage, queue);
    enqueueQueueExecutorCommand(storage, { id: "cmd-1", type: "start", requestedAt: "2026-08-14T10:00:00.000Z", requestedBy: "cabina", scope: "local_only" });
    const first = tickPersistentQueueExecutor(storage, "laboratorio-a", new Date("2026-08-14T10:00:01.000Z"));
    const second = tickPersistentQueueExecutor(storage, "laboratorio-a", new Date("2026-08-14T10:00:02.000Z"));
    expect(first).toMatchObject({ status: "running", currentPracticeId: "audit-samuele-colombo", processedCommandIds: ["cmd-1"] });
    expect(second.processedCommandIds).toEqual(["cmd-1"]);
    expect(loadQueueExecutorEvents(storage).filter((event) => event.type === "command_accepted")).toHaveLength(1);
  });

  it("recupera automaticamente una lease scaduta senza perdere lo stato", () => {
    const storage = storageAdapter();
    saveAuditedOperatorQueue(storage, DEFAULT_AUDITED_OPERATOR_QUEUE.map((practice) => practice.id === "audit-samuele-colombo" ? { ...practice, status: "economically_verified" as const, activeBlock: null } : practice));
    enqueueQueueExecutorCommand(storage, { id: "cmd-resume", type: "resume", requestedAt: "2026-08-14T10:00:00.000Z", requestedBy: "cabina", scope: "local_only" });
    const owned = tickPersistentQueueExecutor(storage, "turno-1", new Date("2026-08-14T10:00:00.000Z"));
    const stillOwned = tickPersistentQueueExecutor(storage, "turno-2", new Date("2026-08-14T10:00:05.000Z"));
    const recovered = tickPersistentQueueExecutor(storage, "turno-2", new Date("2026-08-14T10:00:16.000Z"));
    expect(stillOwned.ownerId).toBe("turno-1");
    expect(recovered).toMatchObject({ ownerId: "turno-2", status: "running", currentPracticeId: owned.currentPracticeId });
    expect(loadQueueExecutorEvents(storage).some((event) => event.type === "lease_recovered")).toBe(true);
  });

  it("degrada in modo sicuro con storage corrotto", () => {
    const storage = storageAdapter();
    storage.setItem(QUEUE_EXECUTOR_RUNTIME_KEY, "{");
    storage.setItem(QUEUE_EXECUTOR_COMMANDS_KEY, "{");
    storage.setItem(QUEUE_EXECUTOR_EVENTS_KEY, "{");
    expect(loadQueueExecutorRuntime(storage)).toMatchObject({ status: "idle", revision: 0 });
    expect(tickPersistentQueueExecutor(storage, "laboratorio", new Date("2026-08-14T10:00:00.000Z"))).toMatchObject({ status: "idle", ownerId: "laboratorio" });
  });
});
