import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { ExecutionPlanBusyError, PersistentExecutionPlanStore } from "./executionPlan";

describe("piano di esecuzione locale indipendente dalla chat", () => {
  it("deduplica i nomi, non richiede bridge e sopravvive a una nuova istanza", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-plan-"));
    try {
      const first = new PersistentExecutionPlanStore(directory);
      const plan = first.create(["Romeo Ropa", "Alice Molinaris", "Romeo Ropa"], "queue-15", new Date("2026-08-14T17:00:00.000Z"));
      expect(plan).toMatchObject({ status: "draft", bridgeRequired: false, stopAt: "saved_draft" });
      expect(plan.items.map((item) => item.state)).toEqual(["queued", "queued", "duplicate_input"]);
      first.arm("arm-1", new Date("2026-08-14T17:00:01.000Z"));
      const afterBridgeLoss = new PersistentExecutionPlanStore(directory).load();
      expect(afterBridgeLoss).toMatchObject({ status: "armed", executorHeartbeatAt: null, bridgeRequired: false });
      const live = new PersistentExecutionPlanStore(directory).heartbeat("launch-agent-1", new Date("2026-08-14T17:00:02.000Z"));
      expect(live).toMatchObject({ status: "running", executorId: "launch-agent-1" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rifiuta di sovrascrivere una coda già armata", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-plan-"));
    try {
      const store = new PersistentExecutionPlanStore(directory);
      store.create(["A"], "first"); store.arm("arm");
      expect(() => store.create(["B"], "second")).toThrow(/non terminale/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rende le transizioni idempotenti e impedisce proprietari concorrenti", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-plan-"));
    try {
      const store = new PersistentExecutionPlanStore(directory); store.create(["A"], "create", new Date("2026-08-14T10:00:00Z"));
      const armed = store.arm("same-arm", new Date("2026-08-14T10:00:01Z"));
      const replay = store.arm("same-arm", new Date("2026-08-14T10:00:02Z"));
      expect(replay.revision).toBe(armed.revision);
      store.heartbeat("executor-a", new Date("2026-08-14T10:00:03Z"));
      expect(() => store.heartbeat("executor-b", new Date("2026-08-14T10:00:04Z"))).toThrow(ExecutionPlanBusyError);
      expect(store.heartbeat("executor-b", new Date("2026-08-14T10:00:19Z"))).toMatchObject({ executorId: "executor-b" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rifiuta un lock fresco e recupera un lock scaduto", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-plan-"));
    try {
      const store = new PersistentExecutionPlanStore(directory); store.create(["A"], "create");
      writeFileSync(store.lockFile, "owner");
      expect(() => store.arm("arm", new Date())).toThrow(ExecutionPlanBusyError);
      expect(store.arm("arm", new Date(Date.now() + 11_000))).toMatchObject({ status: "armed" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("registra il blocco e passa alla pratica successiva senza passare dalla chat", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-plan-"));
    try {
      const store = new PersistentExecutionPlanStore(directory);
      store.create(["Prima", "Seconda"], "plan"); store.arm("arm"); store.heartbeat("executor");
      const firstClaim = store.claimNext("executor");
      const first = firstClaim.items.find((item) => item.state === "claimed")!;
      const afterBlock = store.settleClaim("executor", first.id, "blocked", "Allegato mancante: registrato senza fermare la coda.");
      expect(afterBlock).toMatchObject({ status: "running" });
      expect(afterBlock.items.map((item) => item.state)).toEqual(["blocked", "queued"]);
      const secondClaim = store.claimNext("executor");
      expect(secondClaim.items.map((item) => item.state)).toEqual(["blocked", "claimed"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
