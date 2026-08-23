import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PersistentExecutionPlanStore } from "./executionPlan";
import { PersistentAprPilotSample } from "./pilotSample";
import { PersistentAprLocalNotifications, type AprLocalNotificationSink } from "./localNotifications";

class RecordingSink implements AprLocalNotificationSink {
  calls: Array<{ title: string; message: string }> = [];
  constructor(readonly failure = false) {}
  async notify(title: string, message: string) {
    this.calls.push({ title, message });
    if (this.failure) throw new Error("centro notifiche non disponibile");
  }
}

describe("notifiche APR indipendenti da Codex", () => {
  it("notifica una sola volta blocco e completamento anche dopo riavvio", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-notifications-"));
    try {
      const planStore = new PersistentExecutionPlanStore(directory);
      planStore.create(["Caso bloccato", "Caso verde"], "pilot-5", new Date("2026-08-15T10:00:00Z"));
      planStore.arm("arm", new Date("2026-08-15T10:00:01Z"));
      planStore.heartbeat("executor", new Date("2026-08-15T10:00:02Z"));
      let claimed = planStore.claimNext("executor", new Date("2026-08-15T10:00:03Z"));
      planStore.settleClaim("executor", claimed.items.find((item) => item.state === "claimed")!.id, "blocked", "Manca il dato tecnico.", new Date("2026-08-15T10:00:04Z"));
      const sink = new RecordingSink();
      const first = new PersistentAprLocalNotifications(directory, sink);
      await first.observe(planStore.load(), null, new Date("2026-08-15T10:00:05Z"));
      const restarted = new PersistentAprLocalNotifications(directory, sink);
      await restarted.observe(planStore.load(), null, new Date("2026-08-15T10:00:06Z"));
      expect(sink.calls).toHaveLength(1);
      expect(sink.calls[0].title).toContain("Caso bloccato");

      planStore.heartbeat("executor", new Date("2026-08-15T10:00:07Z"));
      claimed = planStore.claimNext("executor", new Date("2026-08-15T10:00:08Z"));
      planStore.settleClaim("executor", claimed.items.find((item) => item.state === "claimed")!.id, "completed", "Piano locale pronto.", new Date("2026-08-15T10:00:09Z"));
      await restarted.observe(planStore.load(), null, new Date("2026-08-15T10:00:10Z"));
      await new PersistentAprLocalNotifications(directory, sink).observe(planStore.load(), null, new Date("2026-08-15T10:00:11Z"));
      expect(sink.calls).toHaveLength(2);
      expect(sink.calls[1].title).toContain("coda completata");
      expect(restarted.snapshot()).toMatchObject({ eventCount: 2, codexRequiredForDelivery: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("conserva una notifica durevole se macOS non la visualizza", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-notifications-"));
    try {
      const pilot = new PersistentAprPilotSample(directory); pilot.initialize(new Date("2026-08-15T11:00:00Z"));
      const notifier = new PersistentAprLocalNotifications(directory, new RecordingSink(true));
      await notifier.observe(null, pilot.snapshot(new Date("2026-08-15T11:00:01Z")), new Date("2026-08-15T11:00:02Z"));
      expect(notifier.snapshot().lastEvent).toMatchObject({ delivery: "durable_inbox_only", severity: "attention" });
      expect(notifier.snapshot().lastEvent?.title).toContain("aprire il CRM");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
