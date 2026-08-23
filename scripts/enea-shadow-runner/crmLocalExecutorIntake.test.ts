import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PersistentAprCrmLocalDraftHandoff } from "./crmLocalDraftHandoff";
import { PersistentAprCrmLocalExecutorIntake } from "./crmLocalExecutorIntake";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "apr-executor-intake-"));
  const names = [
    ["crm-luciano", "Luciano Javier Martinez", "practice-luciano"],
    ["crm-elisa", "Elisa Moro", "practice-elisa"],
  ] as const;
  const items = names.map(([customerKey, displayName, practiceId]) => {
    const packageArtifactPath = path.join(root, "packages", `${customerKey}.json`);
    mkdirSync(path.dirname(packageArtifactPath), { recursive: true });
    const artifact = `${JSON.stringify({ customerKey, practiceId, payload: { mode: "draft_test" } })}\n`;
    writeFileSync(packageArtifactPath, artifact);
    const packageFingerprint = sha256(`package-${customerKey}`);
    return {
      handoffId: `apr-local-handoff:${practiceId}:${packageFingerprint}`, customerKey, displayName, practiceId,
      state: "staged_fail_closed", targetExecutor: "apr_enea_draft_executor", packageArtifactPath, packageArtifactSha256: sha256(artifact), packageFingerprint,
      sourceFingerprint: "a".repeat(64), mappingFingerprint: `mapping-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`,
      lockOwner: null, leaseExpiresAt: null, dispatchAttemptCount: 0, externalDispatchAllowed: false,
      reason: "fixture", nextAction: "fixture",
    };
  });
  const handoff = { snapshot: vi.fn(() => ({ status: "staged_fail_closed", revision: 1, items, externalActionAllowed: false, eneaActionAllowed: false })) } as unknown as Pick<PersistentAprCrmLocalDraftHandoff, "snapshot">;
  return { root, items, handoff };
}

describe("PersistentAprCrmLocalExecutorIntake", () => {
  it("lavora una pratica alla volta e riprende dal checkpoint dopo crash e lease scaduta", () => {
    const { root, handoff } = fixture();
    const start = new Date("2026-08-17T16:00:00.000Z");
    const store = new PersistentAprCrmLocalExecutorIntake(root, handoff, 1_000);

    const claimed = store.tick(start);
    expect(claimed).toMatchObject({ status: "working", currentHandoffId: claimed.items[0].handoffId });
    expect(claimed.items.filter((item) => item.state === "claimed")).toHaveLength(1);
    expect(claimed.items[0]).toMatchObject({ checkpointPhase: "claimed", lockOwner: "apr_enea_draft_executor", claimAttemptCount: 1 });

    const checkpointed = store.tick(new Date(start.getTime() + 100));
    expect(checkpointed.items[0]).toMatchObject({ state: "claimed", checkpointPhase: "artifact_verified", claimAttemptCount: 1 });
    const verifiedAt = checkpointed.items[0].artifactVerifiedAt;

    const restarted = new PersistentAprCrmLocalExecutorIntake(root, handoff, 1_000);
    const recovered = restarted.tick(new Date(start.getTime() + 1_200));
    expect(recovered.items[0]).toMatchObject({ state: "queued", checkpointPhase: "artifact_verified", lockOwner: null, recoveryCount: 1 });
    const reclaimed = restarted.tick(new Date(start.getTime() + 1_201));
    expect(reclaimed.items[0]).toMatchObject({ state: "claimed", checkpointPhase: "artifact_verified", claimAttemptCount: 2, recoveryCount: 1, artifactVerifiedAt: verifiedAt });
    const firstReleased = restarted.tick(new Date(start.getTime() + 1_202));
    expect(firstReleased.items[0]).toMatchObject({ state: "released_local", checkpointPhase: "released_local", lockOwner: null, leaseExpiresAt: null });

    const secondClaimed = restarted.tick(new Date(start.getTime() + 1_203));
    expect(secondClaimed.items.filter((item) => item.state === "claimed")).toHaveLength(1);
    expect(secondClaimed.items[1]).toMatchObject({ state: "claimed", claimAttemptCount: 1 });
    restarted.tick(new Date(start.getTime() + 1_204));
    const completed = restarted.tick(new Date(start.getTime() + 1_205));
    expect(completed).toMatchObject({ status: "completed_local", currentHandoffId: null });
    expect(completed.items.every((item) => item.state === "released_local" && item.lockOwner === null && item.leaseExpiresAt === null)).toBe(true);
    expect(completed.items.map((item) => item.recoveryCount)).toEqual([1, 0]);
    expect(completed).toMatchObject({ externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });

    const before = readFileSync(restarted.checkpointPath);
    const repeated = restarted.tick(new Date(start.getTime() + 10_000));
    const after = readFileSync(restarted.checkpointPath);
    expect(repeated.revision).toBe(completed.revision);
    expect(sha256(after)).toBe(sha256(before));
  });

  it("blocca l'intake prima del checkpoint se l'artefatto viene alterato", () => {
    const { root, items, handoff } = fixture();
    const store = new PersistentAprCrmLocalExecutorIntake(root, handoff, 1_000);
    store.tick(new Date("2026-08-17T16:00:00.000Z"));
    writeFileSync(items[0].packageArtifactPath, "tampered\n");
    const blocked = store.tick(new Date("2026-08-17T16:00:00.100Z"));

    expect(blocked).toMatchObject({ status: "technical_block", currentHandoffId: null, externalActionAllowed: false, eneaActionAllowed: false });
    expect(blocked.items.filter((item) => item.state === "claimed")).toHaveLength(0);
    expect(blocked.reason).toContain("artifact_integrity_failed");
  });
});
