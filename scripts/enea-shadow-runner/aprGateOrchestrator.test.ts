import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PersistentAprCrmLocalCohortExecutionPlan } from "./crmLocalCohortExecutionPlan";
import { PersistentAprGateOrchestrator } from "./aprGateOrchestrator";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "apr-gate-orchestrator-")); const packages = path.join(root, "packages"); mkdirSync(packages, { recursive: true });
  const items = [
    ["luciano", "Luciano Javier Martinez", 9],
    ["elisa", "Elisa Moro", 10],
  ].map(([key, displayName, pageCount], itemIndex) => {
    const packageArtifactPath = path.join(packages, `${key}.json`); const contents = `${JSON.stringify({ customerKey: key, itemIndex })}\n`; writeFileSync(packageArtifactPath, contents);
    return {
      planItemId: `plan:${key}`, handoffId: `handoff:${key}`, customerKey: `crm-${key}`, displayName: String(displayName), practiceId: `practice-${key}`,
      packageArtifactPath, packageArtifactSha256: sha256(contents), packageFingerprint: `package-${key}`, mappingFingerprint: `mapping-${key}`, workflowFingerprint: `workflow-${key}`, executionFingerprint: `execution-${key}`,
      state: "simulated_saved_local", checkpointPhase: "simulated_saved_local", currentPageId: null,
      pages: Array.from({ length: Number(pageCount) }, (_, index) => ({ order: index + 1, pageId: index < 5 ? `page:base-${index + 1}` : `screening:${index - 4}`, stepId: `step-${index + 1}`, pageName: `Pagina ${index + 1}`, kind: index < 5 ? "base_page" : "screening_item", fieldCount: 1, markerIds: [`marker-${index + 1}`], state: "save_checkpointed", fillCheckpointCount: 1, saveAttemptCount: 1, filledAt: "2026-08-17T10:00:01.000Z", savedAt: "2026-08-17T10:00:02.000Z" })),
      lockOwner: null, leaseToken: null, leaseExpiresAt: null, claimAttemptCount: 1, recoveryCount: 0, createIntentCount: 1, simulatedCreateCount: 1, draftSaveIntentCount: 1, simulatedDraftSaveCount: 1,
      startedAt: `2026-08-17T10:0${itemIndex}:00.000Z`, lastProgressAt: `2026-08-17T10:0${itemIndex}:30.000Z`, completedAt: `2026-08-17T10:0${itemIndex}:59.000Z`, reason: "complete", nextAction: "next",
    };
  });
  const plan = { snapshot: vi.fn(() => ({
    version: "apr-crm-local-cohort-execution-plan-v1", revision: 49, status: "completed_local_simulation", cohortKey: "cohort-test", currentPlanItemId: null, items,
    progress: { total: 2, queued: 0, active: 0, completed: 2, pagesTotal: 19, pagesSaved: 19, recoveries: 0 },
  })) } as unknown as Pick<PersistentAprCrmLocalCohortExecutionPlan, "snapshot">;
  return { root, items, plan };
}

describe("PersistentAprGateOrchestrator", () => {
  it("accoda il gate successivo, riprende dopo crash e lascia registrato il gate esterno senza dipendere dalla chat", () => {
    const { root, plan } = fixture(); const start = new Date("2026-08-17T12:00:00.000Z");
    const orchestrator = new PersistentAprGateOrchestrator(root, plan, 1_000);
    const claimed = orchestrator.tick(start);
    expect(claimed).toMatchObject({ status: "working_local", activeGateId: "local_enea_browser_bridge_contract", externalActionAllowed: false, browserAllowed: false, eneaActionAllowed: false });
    expect(claimed.gates.map((gate) => [gate.gateId, gate.state])).toEqual([
      ["local_cohort_create_fill_save_plan", "completed"], ["local_enea_browser_bridge_contract", "active"], ["external_enea_readiness_admission", "waiting_safety_gate"],
    ]);

    const restarted = new PersistentAprGateOrchestrator(root, plan, 1_000);
    const recovered = restarted.tick(new Date(start.getTime() + 1_100));
    expect(recovered).toMatchObject({ status: "working_local", activeGateId: null });
    expect(recovered.gates[1]).toMatchObject({ state: "queued", attemptCount: 1, recoveryCount: 1, lockOwner: null });
    const reclaimed = restarted.tick(new Date(start.getTime() + 1_101));
    expect(reclaimed.gates[1]).toMatchObject({ state: "active", attemptCount: 1, recoveryCount: 1 });
    const completed = restarted.tick(new Date(start.getTime() + 1_102));
    expect(completed).toMatchObject({ status: "waiting_external_safety_gate", activeGateId: null, bridgeManifestPath: restarted.bridgeManifestPath,
      externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });
    expect(completed.gates[1]).toMatchObject({ state: "completed", attemptCount: 1, recoveryCount: 1 });
    expect(completed.gates[2]).toMatchObject({ state: "waiting_safety_gate", attemptCount: 0 });
    const manifest = JSON.parse(readFileSync(restarted.bridgeManifestPath, "utf8")) as { items: Array<{ orderedPageIds: string[] }>; safety: Record<string, boolean> };
    expect(manifest.items.map((item) => item.orderedPageIds.length)).toEqual([9, 10]);
    expect(Object.values(manifest.safety).every((value) => value === false)).toBe(true);
    const before = readFileSync(restarted.checkpointPath); const manifestBefore = readFileSync(restarted.bridgeManifestPath);
    const repeated = restarted.tick(new Date(start.getTime() + 20_000));
    expect(repeated.revision).toBe(completed.revision); expect(sha256(readFileSync(restarted.checkpointPath))).toBe(sha256(before)); expect(sha256(readFileSync(restarted.bridgeManifestPath))).toBe(sha256(manifestBefore));
  });

  it("blocca il gate prima del manifest se un pacchetto non coincide piu con l'hash verificato", () => {
    const { root, items, plan } = fixture(); const orchestrator = new PersistentAprGateOrchestrator(root, plan, 1_000);
    orchestrator.tick(new Date("2026-08-17T12:00:00.000Z")); writeFileSync(items[0].packageArtifactPath, "tampered\n");
    const blocked = orchestrator.tick(new Date("2026-08-17T12:00:00.100Z"));
    expect(blocked).toMatchObject({ status: "technical_block", activeGateId: null, reason: "bridge_package_integrity_failed:plan:luciano", externalActionAllowed: false, browserAllowed: false });
  });

  it("registra una sola volta il completamento admission e accoda il discovery read-only", () => {
    const { root, plan } = fixture(); const orchestrator = new PersistentAprGateOrchestrator(root, plan, 1_000); const start = new Date("2026-08-17T12:00:00.000Z");
    orchestrator.tick(start); orchestrator.tick(new Date(start.getTime() + 1));
    const completed = orchestrator.recordReadinessAdmissionCompleted("a".repeat(64), new Date(start.getTime() + 2));
    const replay = orchestrator.recordReadinessAdmissionCompleted("a".repeat(64), new Date(start.getTime() + 3));
    expect(completed.gates.at(-1)).toMatchObject({ gateId: "operational_enea_readonly_discovery", state: "waiting_safety_gate", attemptCount: 0 });
    expect(completed.gates[2]).toMatchObject({ gateId: "external_enea_readiness_admission", state: "completed", attemptCount: 1, evidenceFingerprint: "a".repeat(64) });
    expect(replay.revision).toBe(completed.revision);
  });

  it("registra il discovery una sola volta e accoda l'attach reale read-only", () => {
    const { root, plan } = fixture(); const orchestrator = new PersistentAprGateOrchestrator(root, plan, 1_000); const start = new Date("2026-08-17T12:00:00.000Z");
    orchestrator.tick(start); orchestrator.tick(new Date(start.getTime() + 1)); orchestrator.recordReadinessAdmissionCompleted("a".repeat(64), new Date(start.getTime() + 2));
    const completed = orchestrator.recordReadOnlyDiscoveryCompleted("b".repeat(64), new Date(start.getTime() + 3));
    const replay = orchestrator.recordReadOnlyDiscoveryCompleted("b".repeat(64), new Date(start.getTime() + 4));
    expect(completed.gates[3]).toMatchObject({ gateId: "operational_enea_readonly_discovery", state: "completed", attemptCount: 1, evidenceFingerprint: "b".repeat(64) });
    expect(completed.gates[4]).toMatchObject({ gateId: "real_enea_readonly_attach", state: "waiting_safety_gate", attemptCount: 0 });
    expect(replay.revision).toBe(completed.revision);
  });

  it("dopo l'attach accoda e completa una sola volta il gate server read-only", () => {
    const { root, plan } = fixture(); const orchestrator = new PersistentAprGateOrchestrator(root, plan, 1_000); const start = new Date("2026-08-17T12:00:00.000Z");
    orchestrator.tick(start); orchestrator.tick(new Date(start.getTime() + 1));
    orchestrator.recordReadinessAdmissionCompleted("a".repeat(64), new Date(start.getTime() + 2));
    orchestrator.recordReadOnlyDiscoveryCompleted("b".repeat(64), new Date(start.getTime() + 3));
    const attached = orchestrator.recordReadOnlyAttachCompleted("c".repeat(64), new Date(start.getTime() + 4));
    expect(attached.gates[4]).toMatchObject({ gateId: "real_enea_readonly_attach", state: "completed", evidenceFingerprint: "c".repeat(64) });
    expect(attached.gates[5]).toMatchObject({ gateId: "real_enea_server_readonly_probe", state: "waiting_safety_gate", attemptCount: 0 });
    const completed = orchestrator.recordServerReadOnlyProbeCompleted("d".repeat(64), new Date(start.getTime() + 5));
    const replay = orchestrator.recordServerReadOnlyProbeCompleted("d".repeat(64), new Date(start.getTime() + 6));
    expect(completed.gates[5]).toMatchObject({ state: "completed", attemptCount: 1, evidenceFingerprint: "d".repeat(64) });
    expect(completed).toMatchObject({ status: "waiting_external_safety_gate", externalActionAllowed: false, browserAllowed: false, eneaActionAllowed: false });
    expect(replay.revision).toBe(completed.revision);
  });
});
