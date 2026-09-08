import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeSequencerResume,
  createSessionWaitGuard,
  executionProgressFingerprint,
  observeSessionWait,
  retireStaleTransientSequencerResults,
} from "../apr-global-controller-test10-2026-08-29/sequencerSessionGuard.mjs";

const thresholdMs = 5 * 60 * 1000;

test("non ferma il lotto se il worker avanza durante l'attesa della sessione ENEA", () => {
  const guard = createSessionWaitGuard();
  const queued = executionProgressFingerprint(
    { status: "ready", revision: 1 },
    { state: "queued", completedPageIds: [], pageCheckpoints: [] },
  );
  assert.equal(observeSessionWait(guard, {
    nowMs: 0,
    isCommonSessionWait: true,
    workerRunning: true,
    progressFingerprint: queued,
    thresholdMs,
  }).action, "wait");

  const filling = executionProgressFingerprint(
    { status: "running", revision: 2 },
    {
      state: "filling",
      draftId: "438767",
      completedPageIds: ["page:Anagrafica Beneficiario"],
      pageCheckpoints: [{ pageId: "page:Anagrafica Beneficiario", state: "saved", saveAttemptCount: 1 }],
    },
  );
  const progressed = observeSessionWait(guard, {
    nowMs: 20_000,
    isCommonSessionWait: true,
    workerRunning: true,
    progressFingerprint: filling,
    thresholdMs,
  });
  assert.deepEqual(progressed, {
    action: "wait",
    reason: "worker_checkpoint_advanced",
    workerRunning: true,
  });

  assert.equal(observeSessionWait(guard, {
    nowMs: 4 * 60 * 1000,
    isCommonSessionWait: true,
    workerRunning: true,
    progressFingerprint: filling,
    thresholdMs,
  }).action, "wait");
});

test("dichiara problema comune solo dopo cinque minuti senza progresso materiale", () => {
  const guard = createSessionWaitGuard();
  const fingerprint = executionProgressFingerprint(
    { status: "ready", revision: 1 },
    { state: "queued", completedPageIds: [], pageCheckpoints: [] },
  );
  observeSessionWait(guard, {
    nowMs: 0,
    isCommonSessionWait: true,
    workerRunning: false,
    progressFingerprint: fingerprint,
    thresholdMs,
  });
  assert.equal(observeSessionWait(guard, {
    nowMs: thresholdMs - 1,
    isCommonSessionWait: true,
    workerRunning: false,
    progressFingerprint: fingerprint,
    thresholdMs,
  }).action, "wait");
  assert.equal(observeSessionWait(guard, {
    nowMs: thresholdMs,
    isCommonSessionWait: true,
    workerRunning: false,
    progressFingerprint: fingerprint,
    thresholdMs,
  }).action, "common_block");
});

test("un nuovo avanzamento azzera il tempo di stallo anche oltre la soglia iniziale", () => {
  const guard = createSessionWaitGuard();
  observeSessionWait(guard, {
    nowMs: 0,
    isCommonSessionWait: true,
    workerRunning: true,
    progressFingerprint: "revision-1",
    thresholdMs,
  });
  assert.equal(observeSessionWait(guard, {
    nowMs: thresholdMs,
    isCommonSessionWait: true,
    workerRunning: true,
    progressFingerprint: "revision-2",
    thresholdMs,
  }).action, "wait");
  assert.equal(observeSessionWait(guard, {
    nowMs: thresholdMs + 1,
    isCommonSessionWait: true,
    workerRunning: true,
    progressFingerprint: "revision-2",
    thresholdMs,
  }).action, "wait");
});

test("la ripresa esplicitamente autorizzata conserva i risultati terminali già acquisiti", () => {
  const state = {
    status: "stopped_common_technical_block",
    endedAt: "2026-08-28T00:47:11.038Z",
    commonTechnicalBlock: "session_wait",
    results: [{ customerKey: "fabio-sartori", state: "saved", draftId: "438757" }],
  };
  assert.equal(authorizeSequencerResume(state, "user-2026-08-28-resume-night50-after-session-guard-fix"), true);
  assert.equal(state.status, "running");
  assert.equal(state.endedAt, null);
  assert.equal(state.commonTechnicalBlock, null);
  assert.deepEqual(state.results, [{ customerKey: "fabio-sartori", state: "saved", draftId: "438757" }]);
});

test("ritira un vecchio INCONSISTENT solo quando la stessa bozza deve ancora completare le sonde", () => {
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
    observations: [{
      customerKey: "flavia",
      cohort: 2,
      lifecycle: {
        kind: "wait_for_probes",
        ruleId: "system-sequencer-uncertain-save-probe-lifecycle-v1",
        item: { customerKey: "flavia", draftId: "460574" },
      },
    }],
  });
  assert.equal(retired.length, 1);
  assert.deepEqual(state.results, [{ customerKey: "already-saved", cohort: 1, state: "saved", draftId: "10" }]);
  assert.equal(state.status, "running");
  assert.equal(state.currentCustomerKey, "flavia");
  assert.equal(state.transientResultRetirements[0].draftId, "460574");
});

test("non ritira risultati terminali o una bozza diversa e rifiuta autorizzazioni discordanti", () => {
  const original = {
    authorizationId: "authorized-cohort",
    status: "completed",
    results: [
      { customerKey: "saved", cohort: 1, state: "saved", draftId: "10" },
      { customerKey: "flavia", cohort: 2, state: "inconsistent", draftId: "old-draft" },
    ],
  };
  const state = structuredClone(original);
  const observations = [{
    customerKey: "flavia",
    cohort: 2,
    lifecycle: { kind: "wait_for_probes", item: { customerKey: "flavia", draftId: "new-draft" } },
  }];
  assert.equal(retireStaleTransientSequencerResults(state, { authorizationId: "authorized-cohort", observations }).length, 0);
  assert.deepEqual(state, original);
  assert.throws(
    () => retireStaleTransientSequencerResults(state, { authorizationId: "different", observations }),
    /authorization_mismatch/,
  );
});
