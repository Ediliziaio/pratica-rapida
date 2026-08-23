import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PersistentAprCrmLocalDraftPackages } from "./crmLocalDraftPackages";
import { PersistentAprCrmLocalDraftHandoff } from "./crmLocalDraftHandoff";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "apr-local-handoff-"));
  const names = [
    ["crm-luciano-martinez", "Luciano Javier Martinez", "practice-luciano"],
    ["crm-elisa-moro", "Elisa Moro", "practice-elisa"],
  ] as const;
  const packages = names.map(([customerKey, displayName, practiceId]) => {
    const packageArtifactPath = path.join(root, "crm-local-draft-packages", "packages", `${customerKey}.json`);
    const artifact = `${JSON.stringify({ customerKey, practiceId, payload: { mode: "test" } }, null, 2)}\n`;
    mkdirSync(path.dirname(packageArtifactPath), { recursive: true });
    writeFileSync(packageArtifactPath, artifact, { flag: "wx" });
    return {
      customerKey, displayName, practiceId, status: "verified_local_package", sourceFingerprint: "a".repeat(64),
      mappingFingerprint: `mapping-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`,
      packageFingerprint: sha256(`package-${customerKey}`), packageArtifactPath, packageArtifactSha256: sha256(artifact),
      productCount: 2, eligibleExpense: 1000, requiredPortalFieldCount: 20, screeningItemCount: 2, supportedPages: ["beneficiary"], sourceIds: ["invoice"],
      executionNotArmed: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false,
    };
  });
  const snapshot = vi.fn(() => ({ status: "completed", revision: 2, packages }));
  const packageStore = { snapshot } as unknown as Pick<PersistentAprCrmLocalDraftPackages, "snapshot">;
  return { root, packages, packageStore };
}

describe("PersistentAprCrmLocalDraftHandoff", () => {
  it("staggia soltanto i due pacchetti verificati in una coda separata e non armata", () => {
    const { root, packageStore } = fixture();
    const store = new PersistentAprCrmLocalDraftHandoff(root, packageStore);
    const snapshot = store.synchronize(new Date("2026-08-17T15:00:00.000Z"));

    expect(snapshot).toMatchObject({
      status: "staged_fail_closed", queueScope: "crm_live_processing_runtime", historicalCheckpointImported: false,
      executorIdentity: "apr_persistent_runtime", externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false,
      previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false,
    });
    expect(snapshot.items.map((item) => item.displayName).sort()).toEqual(["Elisa Moro", "Luciano Javier Martinez"]);
    expect(snapshot.items.every((item) => item.state === "staged_fail_closed" && item.targetExecutor === "apr_enea_draft_executor"
      && item.externalDispatchAllowed === false && item.dispatchAttemptCount === 0 && item.lockOwner === null && item.leaseExpiresAt === null)).toBe(true);
    expect(store.checkpointPath).toContain("crm-local-draft-handoff");
    expect(store.checkpointPath).not.toContain("enea-draft-execution");
  });

  it("dopo riavvio conserva byte, revisione e handoff ID senza duplicare o reclamare", () => {
    const { root, packageStore } = fixture();
    const firstStore = new PersistentAprCrmLocalDraftHandoff(root, packageStore);
    const first = firstStore.synchronize(new Date("2026-08-17T15:00:00.000Z"));
    const before = readFileSync(firstStore.checkpointPath);
    const restarted = new PersistentAprCrmLocalDraftHandoff(root, packageStore);
    const second = restarted.synchronize(new Date("2026-08-17T15:05:00.000Z"));
    const after = readFileSync(restarted.checkpointPath);

    expect(second.revision).toBe(first.revision);
    expect(second.sourceSignature).toBe(first.sourceSignature);
    expect(second.audit).toEqual(first.audit);
    expect(second.items.map((item) => item.handoffId)).toEqual(first.items.map((item) => item.handoffId));
    expect(new Set(second.items.map((item) => item.handoffId)).size).toBe(2);
    expect(second.items.every((item) => item.dispatchAttemptCount === 0)).toBe(true);
    expect(sha256(after)).toBe(sha256(before));
  });

  it("blocca tutta la coda se l'hash di un artefatto non coincide", () => {
    const { root, packages, packageStore } = fixture();
    writeFileSync(packages[0].packageArtifactPath, "tampered\n");
    const snapshot = new PersistentAprCrmLocalDraftHandoff(root, packageStore).synchronize(new Date("2026-08-17T15:00:00.000Z"));

    expect(snapshot).toMatchObject({ status: "technical_block", items: [], externalActionAllowed: false, eneaActionAllowed: false });
    expect(snapshot.reason).toContain("package_artifact_invalid");
  });
});
