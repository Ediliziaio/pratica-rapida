import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentAprShadowControl } from "./shadowControl";

describe("comando locale APR SHADOW", () => {
  it("parte soltanto dopo il via esplicito e conserva il gate dopo riavvio", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-shadow-control-"));
    try {
      const store = new PersistentAprShadowControl(directory);
      expect(store.initialize(new Date("2026-08-18T08:00:00Z"))).toMatchObject({ status: "stopped", intakeAllowed: false, submitAllowed: false });
      const armed = store.arm("dashboard:start:1", new Date("2026-08-18T08:01:00Z"));
      expect(armed).toMatchObject({ status: "armed", intakeAllowed: true, revision: 1, externalMutationAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
      const restarted = new PersistentAprShadowControl(directory).snapshot(new Date("2026-08-18T08:02:00Z"));
      expect(restarted).toMatchObject({ status: "armed", intakeAllowed: true, revision: 1 });
      expect(new PersistentAprShadowControl(directory).arm("dashboard:start:1").revision).toBe(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("sospende solo le nuove prese in carico e mantiene le protezioni", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-shadow-pause-"));
    try {
      const store = new PersistentAprShadowControl(directory);
      store.arm("start");
      const paused = store.pause("pause", new Date("2026-08-18T09:00:00Z"));
      expect(paused).toMatchObject({ status: "paused", intakeAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
      expect(paused.audit.at(-1)).toMatchObject({ type: "shadow_paused", appliedRuleIds: expect.any(Array) });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
