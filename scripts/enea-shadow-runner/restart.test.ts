import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { PersistentEneaRunner, RunnerBusyError } from "./runner";

const temporaryDirectories: string[] = [];
function temporaryStateDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "enea-shadow-restart-"));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("runner CRM ombra persistente su file", () => {
  it("preserva una coda di 15 casi attraverso riavvio e replay senza duplicazioni o perdite", () => {
    const directory = temporaryStateDirectory();
    const template = DEFAULT_AUDITED_OPERATOR_QUEUE[0];
    const queue = Array.from({ length: 15 }, (_, index) => ({
      ...template,
      id: `restart-15-${String(index + 1).padStart(2, "0")}`,
      code: `R15-${String(index + 1).padStart(2, "0")}`,
      displayName: `Fixture persistente ${index + 1}`,
      sources: template.sources.map((source, sourceIndex) => ({ ...source, sourceId: `restart-15-${index + 1}:source:${sourceIndex + 1}` })),
      audit: template.audit.map((event, eventIndex) => ({ ...event, id: `restart-15-${index + 1}:audit:${eventIndex + 1}` })),
    }));
    const first = new PersistentEneaRunner(directory, { allowPracticeOperationsForTest: true });
    const initialized = first.initialize(queue, new Date("2026-08-14T09:00:00.000Z"));
    const replay = first.initialize(queue, new Date("2026-08-14T09:00:01.000Z"));
    const restarted = new PersistentEneaRunner(directory, { allowPracticeOperationsForTest: true }).load();

    expect(initialized.queue).toHaveLength(15);
    expect(new Set(initialized.queue.map((job) => job.practice.id)).size).toBe(15);
    expect(replay.revision).toBe(initialized.revision);
    expect(restarted).toEqual(initialized);
    expect(restarted.queue.every((job) => job.selectionCount === 0 && job.executionState === "queued")).toBe(true);
  });

  it("riparte dopo un crash simulato senza duplicare o perdere job", () => {
    const directory = temporaryStateDirectory();
    const queue = DEFAULT_AUDITED_OPERATOR_QUEUE.map((practice, index) => index === 0
      ? { ...practice, status: "economically_verified" as const, activeBlock: null, reason: "Checkpoint locale già verificato.", nextAction: "Attendere il futuro adattatore autorizzato." }
      : practice);
    const originalIds = queue.map((practice) => practice.id);
    const firstProcess = new PersistentEneaRunner(directory, { allowPracticeOperationsForTest: true });
    firstProcess.initialize(queue, new Date("2026-08-14T10:00:00.000Z"));
    firstProcess.start("processo-a", "command:start-once", new Date("2026-08-14T10:00:01.000Z"));
    const selected = firstProcess.tick("processo-a", "tick:select-once", new Date("2026-08-14T10:00:02.000Z"));
    expect(selected.runner.currentPracticeId).toBe(originalIds[0]);
    expect(selected.queue[0].selectionCount).toBe(1);

    // Il processo A scompare senza stop. Prima della scadenza nessun secondo
    // proprietario può avanzare la coda.
    const restartedProcess = new PersistentEneaRunner(directory, { allowPracticeOperationsForTest: true });
    expect(() => restartedProcess.tick("processo-b", "tick:too-early", new Date("2026-08-14T10:00:05.000Z"))).toThrow(RunnerBusyError);

    // Dopo la lease, il nuovo processo recupera esattamente la stessa pratica.
    restartedProcess.tick("processo-b", "tick:after-restart", new Date("2026-08-14T10:00:18.000Z"));
    const resumed = restartedProcess.tick("processo-b", "tick:evaluate-once", new Date("2026-08-14T10:00:19.000Z"));
    const replayed = restartedProcess.tick("processo-b", "tick:evaluate-once", new Date("2026-08-14T10:00:20.000Z"));

    expect(resumed.runner).toMatchObject({ status: "stopped", currentPracticeId: originalIds[0] });
    expect(resumed.queue.map((job) => job.practice.id)).toEqual(originalIds);
    expect(new Set(resumed.queue.map((job) => job.practice.id)).size).toBe(originalIds.length);
    expect(resumed.queue[0]).toMatchObject({ selectionCount: 1, executionState: "checkpoint_resumable" });
    expect(resumed.audit.filter((event) => event.type === "job_selected")).toHaveLength(1);
    expect(resumed.audit.some((event) => event.type === "runner_lease_recovered")).toBe(true);
    expect(replayed.revision).toBe(resumed.revision);
    expect(readdirSync(path.join(directory, "checkpoints")).filter((name) => name.endsWith(".json"))).toHaveLength(resumed.revision + 1);
  });

  it("non trasforma una dichiarazione manuale o una prova incompleta in successo ENEA", () => {
    const directory = temporaryStateDirectory();
    const manual = DEFAULT_AUDITED_OPERATOR_QUEUE.find((practice) => practice.status === "submitted_manual_exception")!;
    const runner = new PersistentEneaRunner(directory, { allowPracticeOperationsForTest: true });
    runner.initialize([manual], new Date("2026-08-14T11:00:00.000Z"));
    const state = runner.recordSubmissionProof("test", manual.id, {
      evidenceId: "fixture-incompleta",
      source: "enea_dashboard_read_only",
      dashboardStatus: "Inviata",
      cpid: "",
      observedAt: "2026-08-14T11:00:01.000Z",
    }, "proof:incomplete", new Date("2026-08-14T11:00:02.000Z"));
    expect(state.queue[0]).toMatchObject({ executionState: "awaiting_submission_proof", submissionProof: null });
    expect(state.runner.status).toBe("stopped");
    expect(state.audit.at(-1)?.type).toBe("submission_proof_rejected");
  });
});
