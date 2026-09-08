import { describe, expect, it } from "vitest";
import { createExecutionProgressGuard, createSessionWaitGuard, observeExecutionProgress, observeSessionWait, retireStaleTransientSequencerResults } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerSessionGuard.mjs";
import { classifySequencerFailure, createVerifiedCommonTechnicalFailure } from "./aprSequencerCaseBulkhead.mjs";

describe("watchdog del sequencer senza attese di due ore", () => {
  it("trasforma login_required senza progresso in difetto tecnico comune dopo cinque minuti", () => {
    const guard = createSessionWaitGuard();
    expect(observeSessionWait(guard, { nowMs: 0, isCommonSessionWait: true, workerRunning: true, progressFingerprint: "queued" }).action).toBe("wait");
    const stalled = observeSessionWait(guard, { nowMs: 300_001, isCommonSessionWait: true, workerRunning: true, progressFingerprint: "queued" });
    expect(stalled).toMatchObject({ action: "common_block", reason: "worker_alive_but_no_material_progress" });
    const error = createVerifiedCommonTechnicalFailure("session_unavailable_after_stall_threshold", "login_required senza progresso", stalled);
    expect(classifySequencerFailure(error)).toMatchObject({ scope: "common_technical", code: "session_unavailable_after_stall_threshold" });
  });

  it("azzera il timer quando il checkpoint avanza davvero", () => {
    const guard = createExecutionProgressGuard();
    expect(observeExecutionProgress(guard, { nowMs: 0, progressFingerprint: "queued", workerRunning: true }).action).toBe("progress");
    expect(observeExecutionProgress(guard, { nowMs: 299_999, progressFingerprint: "queued", workerRunning: true }).action).toBe("wait");
    expect(observeExecutionProgress(guard, { nowMs: 300_000, progressFingerprint: "filling:page-1", workerRunning: true }).action).toBe("progress");
    expect(observeExecutionProgress(guard, { nowMs: 600_001, progressFingerprint: "filling:page-1", workerRunning: true })).toMatchObject({ action: "stalled", progressAgeMs: 300_001 });
  });

  it("un timeout watchdog generico non diventa mai intervento operatore sulla pratica", () => {
    const error = createVerifiedCommonTechnicalFailure("execution_stalled_after_watchdog_threshold", "checkpoint invariato oltre soglia", { progressAgeMs: 300_001 });
    expect(classifySequencerFailure(error)).toMatchObject({ scope: "common_technical", code: "execution_stalled_after_watchdog_threshold" });
  });

  it("ritira soltanto INCONSISTENT con autorizzazione, coorte e bozza coincidenti", () => {
    const state = {
      authorizationId: "authorized-cohort",
      status: "completed",
      endedAt: "2026-09-04T00:30:00.000Z",
      currentCustomerKey: null,
      results: [
        { customerKey: "already-saved", cohort: 1, state: "saved", draftId: "10" },
        { customerKey: "flavia", cohort: 2, state: "inconsistent", draftId: "460574" },
      ],
    };
    const retired = retireStaleTransientSequencerResults(state, {
      authorizationId: "authorized-cohort",
      nowIso: "2026-09-04T01:00:00.000Z",
      observations: [{ customerKey: "flavia", cohort: 2, lifecycle: {
        kind: "wait_for_probes",
        ruleId: "system-sequencer-uncertain-save-probe-lifecycle-v1",
        item: { customerKey: "flavia", draftId: "460574" },
      } }],
    });
    expect(retired).toHaveLength(1);
    expect(state.results).toEqual([{ customerKey: "already-saved", cohort: 1, state: "saved", draftId: "10" }]);
    expect(state).toMatchObject({ status: "running", endedAt: null, currentCustomerKey: "flavia" });
  });

  it("lascia intatto un risultato terminale o con identita discordante", () => {
    const state = {
      authorizationId: "authorized-cohort",
      status: "completed",
      results: [
        { customerKey: "saved", cohort: 1, state: "saved", draftId: "10" },
        { customerKey: "flavia", cohort: 2, state: "inconsistent", draftId: "old-draft" },
      ],
    };
    const before = structuredClone(state);
    const observations = [{ customerKey: "flavia", cohort: 2, lifecycle: {
      kind: "wait_for_probes",
      item: { customerKey: "flavia", draftId: "new-draft" },
    } }];
    expect(retireStaleTransientSequencerResults(state, { authorizationId: "authorized-cohort", observations })).toHaveLength(0);
    expect(state).toEqual(before);
    expect(() => retireStaleTransientSequencerResults(state, { authorizationId: "different", observations })).toThrow(/authorization_mismatch/);
  });

  it("ritira soltanto il technical_block storico prodotto dal mismatch filling recovery_authorized ora provato transitorio", () => {
    const state = {
      authorizationId: "authorized-cohort",
      status: "completed",
      endedAt: "2026-09-04T09:08:25.000Z",
      currentCustomerKey: null,
      results: [{ customerKey: "flavia", cohort: 2, state: "technical_block", draftId: "460574", technicalReason: "flavia:uncertain_save_lifecycle_invalid:state_status_mismatch:filling:recovery_authorized" }],
    };
    const lifecycle = { kind: "wait_for_worker_resume", ruleId: "system-sequencer-screening-recovery-filling-lifecycle-v1", item: { customerKey: "flavia", draftId: "460574" } };
    expect(retireStaleTransientSequencerResults(state, { authorizationId: "authorized-cohort", observations: [{ customerKey: "flavia", cohort: 2, lifecycle }] })).toHaveLength(1);
    expect(state.results).toEqual([]);
    expect(state).toMatchObject({ status: "running", currentCustomerKey: "flavia", endedAt: null });

    const unrelated = { authorizationId: "authorized-cohort", status: "completed", results: [{ customerKey: "flavia", cohort: 2, state: "technical_block", draftId: "460574", technicalReason: "another_failure" }] };
    expect(retireStaleTransientSequencerResults(unrelated, { authorizationId: "authorized-cohort", observations: [{ customerKey: "flavia", cohort: 2, lifecycle }] })).toHaveLength(0);
  });
});
