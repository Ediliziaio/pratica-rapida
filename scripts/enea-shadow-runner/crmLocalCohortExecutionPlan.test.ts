import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PersistentAprCrmLocalExecutorIntake } from "./crmLocalExecutorIntake";
import { PersistentAprCrmLocalCohortExecutionPlan } from "./crmLocalCohortExecutionPlan";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function step(id: string, pageName: string, fieldNumber: number) {
  return {
    id, pageName, markerIds: [`marker-${id}`],
    fields: Array.from({ length: fieldNumber }, (_, index) => ({ portalId: `${id}-field-${index + 1}`, control: "input", value: `${index + 1}` })),
  };
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "apr-cohort-plan-"));
  const packageDirectory = path.join(root, "packages"); mkdirSync(packageDirectory, { recursive: true });
  const names = [
    ["crm-luciano", "Luciano Javier Martinez", "practice-luciano", 2],
    ["crm-elisa", "Elisa Moro", "practice-elisa", 3],
  ] as const;
  const items = names.map(([customerKey, displayName, practiceId, screenings]) => {
    const steps = [
      step("generator", "Generatore dell'impianto termico", 1), step("beneficiary", "Anagrafica Beneficiario", 1),
      step("building", "Immobile", 1), step("intervention", "Intervento", 1), step("plant", "Impianto termico esistente", 1),
      step("screening-summary", "Schermature solari", 1), step("calculation", "Calcolo costi e detrazioni", 1),
    ];
    const screeningSteps = Array.from({ length: screenings }, (_, index) => step(`screening-${index + 1}`, "Aggiungi schermatura solare", 1));
    const preparedFieldIds = [...steps, ...screeningSteps].flatMap((item) => item.fields.map((field) => field.portalId));
    const packageFingerprint = sha256(`package-${customerKey}`);
    const artifact = {
      customerKey, displayName, practiceId, mappingFingerprint: `mapping-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, packageFingerprint,
      payload: { mode: "draft_test", portalFields: preparedFieldIds.slice(0, 7).map((id) => ({ id })) },
      workflow: { preparedFieldIds, screeningItemCount: screenings, steps, screeningSteps },
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
    };
    const packageArtifactPath = path.join(packageDirectory, `${customerKey}.json`); const contents = `${JSON.stringify(artifact, null, 2)}\n`; writeFileSync(packageArtifactPath, contents);
    return {
      handoffId: `handoff:${practiceId}`, customerKey, displayName, practiceId, packageArtifactPath, packageArtifactSha256: sha256(contents), packageFingerprint,
      state: "released_local", checkpointPhase: "released_local", lockOwner: null, leaseToken: null, leaseExpiresAt: null, claimAttemptCount: 1, recoveryCount: 0,
      claimedAt: "2026-08-17T10:00:00.000Z", artifactVerifiedAt: "2026-08-17T10:00:01.000Z", releasedAt: "2026-08-17T10:00:02.000Z", lastProgressAt: "2026-08-17T10:00:02.000Z",
      reason: "released", nextAction: "local plan",
    };
  });
  const intake = { snapshot: vi.fn(() => ({ status: "completed_local", revision: 7, items,
    externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false,
    previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false })) } as unknown as Pick<PersistentAprCrmLocalExecutorIntake, "snapshot">;
  return { root, items, intake };
}

describe("PersistentAprCrmLocalCohortExecutionPlan", () => {
  it("mappa pacchetto, ordine pagine e checkpoint; riprende un crash senza duplicare create/fill/save", () => {
    const { root, intake } = fixture();
    const historicalPath = path.join(root, "enea-draft-execution", "checkpoint.json"); mkdirSync(path.dirname(historicalPath), { recursive: true }); writeFileSync(historicalPath, "historical-do-not-read\n");
    const historicalBefore = sha256(readFileSync(historicalPath));
    const start = new Date("2026-08-17T12:00:00.000Z");
    const store = new PersistentAprCrmLocalCohortExecutionPlan(root, intake, 1_000, "cohort-test");

    const claimed = store.tick(start);
    expect(claimed).toMatchObject({ status: "working_local", cohortKey: "cohort-test", currentPlanItemId: claimed.items[0].planItemId,
      historicalExecutionCheckpointImported: false, historicalExecutionPathRead: false, simulatorOnly: true });
    expect(claimed.items.filter((item) => item.state === "active_local")).toHaveLength(1);
    expect(claimed.items[0].pages.map((page) => page.pageId)).toEqual([
      "page:Anagrafica Beneficiario", "page:Immobile", "page:Intervento", "page:Generatore dell'impianto termico", "page:Impianto termico esistente",
      "screening:1", "screening:2", "page:Schermature solari", "page:Calcolo costi e detrazioni",
    ]);
    expect(claimed.items[1].pages).toHaveLength(10);

    const intent = store.tick(new Date(start.getTime() + 100));
    expect(intent.items[0]).toMatchObject({ checkpointPhase: "create_intent_checkpointed", createIntentCount: 1, simulatedCreateCount: 0 });
    store.tick(new Date(start.getTime() + 200));
    const pageFilled = store.tick(new Date(start.getTime() + 300));
    expect(pageFilled.items[0].pages[0]).toMatchObject({ state: "fill_checkpointed", fillCheckpointCount: 1, saveAttemptCount: 0 });

    const restarted = new PersistentAprCrmLocalCohortExecutionPlan(root, intake, 1_000, "cohort-test");
    const recovered = restarted.tick(new Date(start.getTime() + 1_400));
    expect(recovered.items[0]).toMatchObject({ state: "queued_local", checkpointPhase: "pages_in_progress", recoveryCount: 1, createIntentCount: 1, simulatedCreateCount: 1 });
    expect(recovered.items[0].pages[0]).toMatchObject({ state: "fill_checkpointed", fillCheckpointCount: 1, saveAttemptCount: 0 });
    const reclaimed = restarted.tick(new Date(start.getTime() + 1_401));
    expect(reclaimed.items[0]).toMatchObject({ state: "active_local", claimAttemptCount: 2 });
    const savedAfterRestart = restarted.tick(new Date(start.getTime() + 1_402));
    expect(savedAfterRestart.items[0].pages[0]).toMatchObject({ state: "save_checkpointed", fillCheckpointCount: 1, saveAttemptCount: 1 });

    let current = savedAfterRestart;
    for (let index = 0; index < 100 && current.status !== "completed_local_simulation"; index += 1) {
      current = restarted.tick(new Date(start.getTime() + 1_403 + index));
      expect(current.items.filter((item) => item.state === "active_local").length).toBeLessThanOrEqual(1);
    }
    expect(current).toMatchObject({ status: "completed_local_simulation", currentPlanItemId: null,
      externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false,
      previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false });
    expect(current.items.map((item) => item.state)).toEqual(["simulated_saved_local", "simulated_saved_local"]);
    expect(current.items.every((item) => item.createIntentCount === 1 && item.simulatedCreateCount === 1 && item.draftSaveIntentCount === 1 && item.simulatedDraftSaveCount === 1)).toBe(true);
    expect(current.items.every((item) => item.pages.every((page) => page.state === "save_checkpointed" && page.fillCheckpointCount === 1 && page.saveAttemptCount === 1))).toBe(true);
    expect(new Date(current.items[0].completedAt!).getTime()).toBeLessThanOrEqual(new Date(current.items[1].startedAt!).getTime());
    expect(sha256(readFileSync(historicalPath))).toBe(historicalBefore);

    const checkpointBefore = readFileSync(restarted.checkpointPath); const repeated = restarted.tick(new Date(start.getTime() + 100_000)); const checkpointAfter = readFileSync(restarted.checkpointPath);
    expect(repeated.revision).toBe(current.revision); expect(sha256(checkpointAfter)).toBe(sha256(checkpointBefore));
  });

  it("si blocca localmente se cardinalita schermature e workflow non coincidono", () => {
    const { root, items, intake } = fixture();
    const artifact = JSON.parse(readFileSync(items[0].packageArtifactPath, "utf8")) as { workflow: { screeningItemCount: number } };
    artifact.workflow.screeningItemCount = 99; const changed = `${JSON.stringify(artifact, null, 2)}\n`; writeFileSync(items[0].packageArtifactPath, changed);
    items[0].packageArtifactSha256 = sha256(changed);
    const store = new PersistentAprCrmLocalCohortExecutionPlan(root, intake, 1_000, "cohort-test");
    const blocked = store.tick(new Date("2026-08-17T12:00:00.000Z"));
    expect(blocked).toMatchObject({ status: "technical_block", currentPlanItemId: null, reason: "package_screening_cardinality_invalid", externalActionAllowed: false, browserAllowed: false });
  });
});
