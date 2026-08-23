import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentExecutionPlanStore } from "./executionPlan";
import { AutonomousExecutionLoop } from "./autonomousExecutionLoop";

describe("ciclo autonomo locale", () => {
  it("lavora l'intero piano anche quando il primo caso genera un blocco", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-loop-"));
    try {
      const store = new PersistentExecutionPlanStore(directory);
      store.create(["Caso bloccato", "Caso successivo"], "plan"); store.arm("arm");
      const loop = new AutonomousExecutionLoop(store, "executor", (item) => item.displayName === "Caso bloccato"
        ? { state: "blocked", note: "Dato tecnico mancante." }
        : { state: "completed", note: "Bozza TEST salvata; anteprima e submit esclusi." });
      await loop.tick(new Date("2026-08-14T17:00:00.000Z"));
      const terminal = await loop.tick(new Date("2026-08-14T17:00:01.000Z"));
      expect(terminal).toMatchObject({ status: "completed", bridgeRequired: false, executorId: "executor" });
      expect(terminal!.items.map((item) => item.state)).toEqual(["blocked", "completed"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("traduce un errore del gestore in blocco auditabile e continua", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-loop-"));
    try {
      const store = new PersistentExecutionPlanStore(directory);
      store.create(["Errore", "Recupero"], "plan"); store.arm("arm");
      const loop = new AutonomousExecutionLoop(store, "executor", (item) => {
        if (item.displayName === "Errore") throw new Error("adapter non disponibile");
        return { state: "completed", note: "Completata localmente." };
      });
      await loop.tick(); const terminal = await loop.tick();
      expect(terminal!.items[0]).toMatchObject({ state: "blocked", note: expect.stringContaining("adapter non disponibile") });
      expect(terminal!.items[1]).toMatchObject({ state: "completed" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("ferma globalmente la coda se browser o sessione non sono pronti, senza reclamare clienti", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-loop-"));
    try {
      const store = new PersistentExecutionPlanStore(directory);
      store.create(["Primo", "Secondo"], "plan"); store.arm("arm");
      const loop = new AutonomousExecutionLoop(store, "executor", () => ({ state: "completed", note: "non eseguito" }), 5_000,
        () => ({ allowed: false, reason: "sessione ENEA assente" }));
      const blocked = await loop.tick();
      expect(blocked).toMatchObject({ status: "blocked_global", reason: expect.stringContaining("sessione ENEA assente") });
      expect(blocked!.items.map((item) => item.state)).toEqual(["queued", "queued"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("riarma il piano quando il gate globale torna verificato", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enea-loop-"));
    try {
      const store = new PersistentExecutionPlanStore(directory);
      store.create(["Caso"], "plan"); store.arm("arm");
      let allowed = false;
      const loop = new AutonomousExecutionLoop(store, "executor", () => ({ state: "completed", note: "Bozza salvata." }), 5_000,
        () => ({ allowed, reason: allowed ? "ok" : "login richiesto" }));
      await loop.tick();
      expect(store.load()).toMatchObject({ status: "blocked_global" });
      allowed = true;
      const rearmed = await loop.tick();
      expect(rearmed).toMatchObject({ status: "armed" });
      const completed = await loop.tick();
      expect(completed).toMatchObject({ status: "completed" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
