import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { JournalStore } from "./journalStore";
import { supervise } from "./supervisor";

function baseState() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "enea-shadow-health-"));
  const state = new JournalStore(directory).initialize([DEFAULT_AUDITED_OPERATOR_QUEUE[0]], new Date("2026-08-14T12:00:00.000Z"));
  rmSync(directory, { recursive: true, force: true });
  return state;
}

describe("supervisore salute separato", () => {
  it("distingue runner spento, checkpoint, lease ENEA, operatore e completamento", () => {
    const now = new Date("2026-08-14T12:01:00.000Z");
    const off = baseState();
    expect(supervise(off, now).health).toBe("runner_off");

    const checkpoint = structuredClone(off);
    checkpoint.runner.currentPracticeId = checkpoint.queue[0].practice.id;
    checkpoint.runner.status = "stopped";
    checkpoint.queue[0].executionState = "checkpoint_resumable";
    expect(supervise(checkpoint, now).health).toBe("checkpoint_resumable");

    const lease = structuredClone(checkpoint);
    lease.queue[0].executionState = "waiting_enea_lease";
    expect(supervise(lease, now).health).toBe("enea_lease_unavailable");

    const operator = structuredClone(checkpoint);
    operator.queue[0].executionState = "operator_intervention";
    expect(supervise(operator, now).health).toBe("operator_intervention");

    const complete = structuredClone(checkpoint);
    complete.runner.status = "completed";
    complete.queue[0].executionState = "completed";
    expect(supervise(complete, now).health).toBe("run_completed");

    const testDraftComplete = structuredClone(checkpoint);
    testDraftComplete.queue[0].executionState = "draft_saved";
    testDraftComplete.queue[0].workflowTiming = { startedAt: "2026-08-14T12:00:00.000Z", endedAt: "2026-08-14T12:00:30.000Z", totalDurationMs: 30000, phases: [] };
    expect(supervise(testDraftComplete, now).health).toBe("run_completed");
  });
});
