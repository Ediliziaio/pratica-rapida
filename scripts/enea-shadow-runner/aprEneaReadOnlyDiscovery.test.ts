import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PersistentAprEneaReadOnlyDiscovery } from "./aprEneaReadOnlyDiscovery";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-readonly-discovery-"));
  const orchestratorState = { cohortKey: "cohort-test", sourceSignature: "orchestrator-source", bridgeManifestPath: "/fixture/manifest.json", gates: [{ gateId: "operational_enea_readonly_discovery", state: "waiting_safety_gate" }] };
  const orchestrator = { snapshot: vi.fn(() => structuredClone(orchestratorState)), recordReadOnlyDiscoveryCompleted: vi.fn(() => undefined) };
  let admissionSource = "admission-source";
  const admission = { snapshot: vi.fn(() => ({ version: "apr-enea-readiness-admission-v1", revision: 7, status: "completed_local_admission", phase: "completed", sourceSignature: admissionSource,
    adapterEvidenceFingerprint: "a".repeat(64), readinessEvidenceFingerprint: "b".repeat(64), progress: { completedPhases: 7, totalPhases: 7 } })) };
  return { root, orchestrator, admission, changeAdmission: () => { admissionSource = "changed-source"; } };
}

describe("PersistentAprEneaReadOnlyDiscovery", () => {
  it("costruisce il piano locale, riprende dopo crash e accoda una sola volta l'attach reale", () => {
    const { root, orchestrator, admission } = fixture(); const start = new Date("2026-08-17T13:00:00.000Z");
    const controller = new PersistentAprEneaReadOnlyDiscovery(root, orchestrator as never, admission as never, 1_000);
    expect(controller.tick(start)).toMatchObject({ status: "working_local", phase: "admission_verified", attemptCount: 1, browserAllowed: false, createTabsAllowed: false, navigationAllowed: false });
    expect(controller.tick(new Date(start.getTime() + 1))).toMatchObject({ phase: "identity_plan_verified" });
    const restarted = new PersistentAprEneaReadOnlyDiscovery(root, orchestrator as never, admission as never, 1_000);
    expect(restarted.tick(new Date(start.getTime() + 1_002))).toMatchObject({ phase: "identity_plan_verified", recoveryCount: 1, attemptCount: 1 });
    expect(restarted.tick(new Date(start.getTime() + 1_003))).toMatchObject({ phase: "surface_plan_verified" });
    expect(restarted.tick(new Date(start.getTime() + 1_004))).toMatchObject({ phase: "keepalive_plan_verified" });
    const completed = restarted.tick(new Date(start.getTime() + 1_005));
    expect(completed).toMatchObject({ status: "completed_local_discovery", phase: "completed", nextGateId: "real_enea_readonly_attach", externalActionAllowed: false, eneaActionAllowed: false });
    expect(orchestrator.recordReadOnlyDiscoveryCompleted).toHaveBeenCalledOnce();
    const plan = JSON.parse(readFileSync(restarted.planPath, "utf8")) as { surfaces: Array<{ method: string; bodyAllowed: boolean; mutationAllowed: boolean; purpose: string }>; safety: Record<string, boolean>; identity: { createWindow: boolean; createTabs: boolean } };
    expect(plan.surfaces).toHaveLength(5); expect(plan.surfaces.every((item) => ["GET", "HEAD"].includes(item.method) && !item.bodyAllowed && !item.mutationAllowed)).toBe(true);
    expect(plan.surfaces.filter((item) => item.purpose === "keepalive")).toHaveLength(1); expect(Object.values(plan.safety).every((value) => value === false)).toBe(true);
    expect(plan.identity).toMatchObject({ createWindow: false, createTabs: false });
    const before = readFileSync(restarted.checkpointPath); const planBefore = readFileSync(restarted.planPath); const replay = restarted.tick(new Date(start.getTime() + 20_000));
    expect(replay.revision).toBe(completed.revision); expect(sha256(readFileSync(restarted.checkpointPath))).toBe(sha256(before)); expect(sha256(readFileSync(restarted.planPath))).toBe(sha256(planBefore));
  });

  it("blocca se l'evidenza admission cambia durante il piano", () => {
    const { root, orchestrator, admission, changeAdmission } = fixture(); const controller = new PersistentAprEneaReadOnlyDiscovery(root, orchestrator as never, admission as never, 1_000); const start = new Date("2026-08-17T13:00:00.000Z");
    controller.tick(start); changeAdmission(); const blocked = controller.tick(new Date(start.getTime() + 1));
    expect(blocked).toMatchObject({ status: "technical_block", reason: "readonly_discovery_source_changed", browserAllowed: false, eneaActionAllowed: false });
  });
});
