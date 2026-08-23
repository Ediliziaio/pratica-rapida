import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PersistentAprCrmLocalCohortExecutionPlan } from "./crmLocalCohortExecutionPlan";
import { PersistentAprEneaReadinessAdmission } from "./aprEneaReadinessAdmission";
import { PersistentAprGateOrchestrator } from "./aprGateOrchestrator";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "apr-readiness-admission-")); const packages = path.join(root, "packages"); mkdirSync(packages, { recursive: true });
  const packageArtifactPath = path.join(packages, "case.json"); const contents = `${JSON.stringify({ customerKey: "case-1" })}\n`; writeFileSync(packageArtifactPath, contents);
  const item = {
    planItemId: "plan:case-1", handoffId: "handoff:case-1", customerKey: "crm-case-1", displayName: "Caso Locale", practiceId: "practice-case-1",
    packageArtifactPath, packageArtifactSha256: sha256(contents), packageFingerprint: "package-case-1", mappingFingerprint: "mapping-case-1", workflowFingerprint: "workflow-case-1", executionFingerprint: "execution-case-1",
    state: "simulated_saved_local", checkpointPhase: "simulated_saved_local", currentPageId: null,
    pages: [{ order: 1, pageId: "page:beneficiary", stepId: "step-1", pageName: "Beneficiario", kind: "base_page", fieldCount: 1, markerIds: ["marker-1"], state: "save_checkpointed", fillCheckpointCount: 1, saveAttemptCount: 1, filledAt: "2026-08-17T10:00:01.000Z", savedAt: "2026-08-17T10:00:02.000Z" }],
    lockOwner: null, leaseToken: null, leaseExpiresAt: null, claimAttemptCount: 1, recoveryCount: 0, createIntentCount: 1, simulatedCreateCount: 1, draftSaveIntentCount: 1, simulatedDraftSaveCount: 1,
    startedAt: "2026-08-17T10:00:00.000Z", lastProgressAt: "2026-08-17T10:00:30.000Z", completedAt: "2026-08-17T10:00:59.000Z", reason: "complete", nextAction: "next",
  };
  const plan = { snapshot: vi.fn(() => ({ version: "apr-crm-local-cohort-execution-plan-v1", revision: 10, status: "completed_local_simulation", cohortKey: "cohort-admission-test", currentPlanItemId: null, items: [item], progress: { total: 1, queued: 0, active: 0, completed: 1, pagesTotal: 1, pagesSaved: 1, recoveries: 0 } })) } as unknown as Pick<PersistentAprCrmLocalCohortExecutionPlan, "snapshot">;
  const orchestrator = new PersistentAprGateOrchestrator(root, plan, 1_000); const start = new Date("2026-08-17T12:00:00.000Z");
  orchestrator.tick(start); orchestrator.tick(new Date(start.getTime() + 1));
  expect(orchestrator.snapshot(start).status).toBe("waiting_external_safety_gate");
  return { root, orchestrator, start };
}

describe("PersistentAprEneaReadinessAdmission", () => {
  it("consuma il manifest, riprende dopo crash, prova keepalive/scadenza/recupero e accoda il gate successivo", () => {
    const { root, orchestrator, start } = fixture(); const admission = new PersistentAprEneaReadinessAdmission(root, orchestrator, 1_000);
    expect(admission.tick(new Date(start.getTime() + 10))).toMatchObject({ status: "working_local", phase: "manifest_verified", attemptCount: 1, externalActionAllowed: false, browserAllowed: false, eneaActionAllowed: false });
    expect(admission.tick(new Date(start.getTime() + 20))).toMatchObject({ phase: "adapter_verified", adapterEvidenceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });

    const restarted = new PersistentAprEneaReadinessAdmission(root, orchestrator, 1_000);
    const recovered = restarted.tick(new Date(start.getTime() + 1_021));
    expect(recovered).toMatchObject({ phase: "adapter_verified", recoveryCount: 1, attemptCount: 1 });
    expect(recovered.audit.at(-1)).toMatchObject({ type: "lease_recovered" });

    const times = [1022, 1023, 1024, 1025, 1026].map((offset) => new Date(start.getTime() + offset));
    expect(restarted.tick(times[0])).toMatchObject({ phase: "readiness_acquired" });
    expect(restarted.tick(times[1])).toMatchObject({ phase: "keepalive_verified" });
    expect(restarted.tick(times[2])).toMatchObject({ phase: "expiry_verified" });
    expect(restarted.tick(times[3])).toMatchObject({ phase: "recovery_verified", readinessEvidenceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const completed = restarted.tick(times[4]);
    expect(completed).toMatchObject({ status: "completed_local_admission", phase: "completed", nextGateId: "operational_enea_readonly_discovery", lockOwner: null, leaseExpiresAt: null });
    const snapshot = restarted.snapshot(times[4]);
    expect(snapshot.adapter).toMatchObject({ status: "fixture_verified", evidenceCount: 5, keepaliveCount: 1, queueMayRun: false });
    expect(snapshot.readiness).toMatchObject({ status: "simulation_ready", ownerId: "admission-owner-b", safeKeepaliveCount: 1, queueMayRun: false });
    expect(snapshot.readiness.lastEvent).toMatchObject({ type: "readiness_simulation_recovered" });
    const gates = orchestrator.snapshot(times[4]);
    expect(gates.gates.map((gate) => [gate.gateId, gate.state])).toEqual([
      ["local_cohort_create_fill_save_plan", "completed"], ["local_enea_browser_bridge_contract", "completed"], ["external_enea_readiness_admission", "completed"], ["operational_enea_readonly_discovery", "waiting_safety_gate"],
    ]);
    expect(gates).toMatchObject({ status: "waiting_external_safety_gate", externalActionAllowed: false, browserAllowed: false, eneaActionAllowed: false });
    const before = readFileSync(restarted.checkpointPath); const orchestratorBefore = readFileSync(orchestrator.checkpointPath);
    expect(restarted.tick(new Date(start.getTime() + 20_000)).revision).toBe(completed.revision);
    expect(sha256(readFileSync(restarted.checkpointPath))).toBe(sha256(before)); expect(sha256(readFileSync(orchestrator.checkpointPath))).toBe(sha256(orchestratorBefore));
  });

  it("blocca globalmente un manifest alterato senza eseguire la fixture", () => {
    const { root, orchestrator, start } = fixture(); writeFileSync(orchestrator.bridgeManifestPath, "{}\n");
    const admission = new PersistentAprEneaReadinessAdmission(root, orchestrator, 1_000); const blocked = admission.tick(new Date(start.getTime() + 10));
    expect(blocked).toMatchObject({ status: "technical_block", reason: "readiness_admission_manifest_hash_mismatch", externalActionAllowed: false, browserAllowed: false });
    expect(admission.adapter.snapshot(start)).toMatchObject({ status: "disconnected", evidenceCount: 0 });
  });
});
