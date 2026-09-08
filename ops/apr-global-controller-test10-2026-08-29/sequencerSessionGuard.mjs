export const DEFAULT_SESSION_STALL_THRESHOLD_MS = 5 * 60 * 1000;

export function createSessionWaitGuard() {
  return {
    candidateSinceMs: null,
    lastProgressAtMs: null,
    lastProgressFingerprint: null,
  };
}

export function createExecutionProgressGuard() {
  return { lastProgressAtMs: null, lastProgressFingerprint: null };
}

export function observeExecutionProgress(
  guard,
  { nowMs, progressFingerprint, workerRunning, thresholdMs = DEFAULT_SESSION_STALL_THRESHOLD_MS },
) {
  if (guard.lastProgressAtMs === null || guard.lastProgressFingerprint !== progressFingerprint) {
    guard.lastProgressAtMs = nowMs;
    guard.lastProgressFingerprint = progressFingerprint;
    return { action: "progress", workerRunning, progressAgeMs: 0 };
  }
  const progressAgeMs = nowMs - guard.lastProgressAtMs;
  if (progressAgeMs < thresholdMs) return { action: "wait", workerRunning, progressAgeMs };
  return { action: "stalled", workerRunning, progressAgeMs };
}

export function executionProgressFingerprint(execution, entry) {
  return JSON.stringify({
    executionStatus: execution?.status ?? null,
    executionRevision: execution?.revision ?? null,
    entryState: entry?.state ?? null,
    draftId: entry?.draftId ?? null,
    completedPageIds: entry?.completedPageIds ?? [],
    pageCheckpoints: (entry?.pageCheckpoints ?? []).map((checkpoint) => ({
      pageId: checkpoint.pageId,
      state: checkpoint.state,
      saveAttemptCount: checkpoint.saveAttemptCount,
      recoverySaveAttemptCount: checkpoint.recoverySaveAttemptCount,
    })),
  });
}

export function observeSessionWait(
  guard,
  {
    nowMs,
    isCommonSessionWait,
    workerRunning,
    progressFingerprint,
    thresholdMs = DEFAULT_SESSION_STALL_THRESHOLD_MS,
  },
) {
  if (!isCommonSessionWait) {
    guard.candidateSinceMs = null;
    guard.lastProgressAtMs = null;
    guard.lastProgressFingerprint = progressFingerprint;
    return { action: "not_common_session_wait", workerRunning };
  }

  if (guard.candidateSinceMs === null) {
    guard.candidateSinceMs = nowMs;
    guard.lastProgressAtMs = nowMs;
    guard.lastProgressFingerprint = progressFingerprint;
    return { action: "wait", reason: "session_wait_observation_started", workerRunning };
  }

  if (progressFingerprint !== guard.lastProgressFingerprint) {
    guard.lastProgressFingerprint = progressFingerprint;
    guard.lastProgressAtMs = nowMs;
    return { action: "wait", reason: "worker_checkpoint_advanced", workerRunning };
  }

  const candidateAgeMs = nowMs - guard.candidateSinceMs;
  const progressAgeMs = nowMs - (guard.lastProgressAtMs ?? guard.candidateSinceMs);
  if (candidateAgeMs < thresholdMs || progressAgeMs < thresholdMs) {
    return {
      action: "wait",
      reason: workerRunning ? "worker_alive_within_stall_threshold" : "watchdog_recovery_window_open",
      workerRunning,
      candidateAgeMs,
      progressAgeMs,
    };
  }

  return {
    action: "common_block",
    reason: workerRunning ? "worker_alive_but_no_material_progress" : "worker_not_running_and_no_material_progress",
    workerRunning,
    candidateAgeMs,
    progressAgeMs,
  };
}

export function authorizeSequencerResume(state, authorizationId) {
  if (state.status !== "stopped_common_technical_block") return false;
  state.status = "running";
  state.endedAt = null;
  state.commonTechnicalBlock = null;
  state.resumeAuthorizationId = authorizationId;
  state.resumedAt = new Date().toISOString();
  return true;
}

/**
 * Retire only a stale sequencer verdict that was persisted before the
 * uncertain-save probe lifecycle became non-terminal. The execution
 * checkpoint remains authoritative and is never modified here.
 */
export function retireStaleTransientSequencerResults(
  state,
  { authorizationId, observations, nowIso = new Date().toISOString() },
) {
  if (!authorizationId || state.authorizationId !== authorizationId) {
    throw new Error("sequencer_transient_result_retirement_authorization_mismatch");
  }
  if (!Array.isArray(state.results) || !Array.isArray(observations)) {
    throw new Error("sequencer_transient_result_retirement_input_invalid");
  }

  const byCustomer = new Map(observations.map((observation) => [observation.customerKey, observation]));
  const retired = [];
  const retained = [];
  for (const result of state.results) {
    const observation = byCustomer.get(result.customerKey);
    const lifecycleKind = observation?.lifecycle?.kind;
    const transient = lifecycleKind === "wait_for_probes" || lifecycleKind === "wait_for_worker_resume";
    const executionItem = observation?.lifecycle?.item;
    const sameCase = observation
      && observation.cohort === result.cohort
      && String(executionItem?.customerKey ?? "") === String(result.customerKey ?? "")
      && String(executionItem?.draftId ?? "") !== ""
      && (!result.draftId || String(result.draftId) === String(executionItem.draftId));
    const staleRecoveryFillingTechnicalBlock = result.state === "technical_block"
      && result.technicalReason === `${result.customerKey}:uncertain_save_lifecycle_invalid:state_status_mismatch:filling:recovery_authorized`
      && lifecycleKind === "wait_for_worker_resume";
    if ((result.state === "inconsistent" || staleRecoveryFillingTechnicalBlock) && transient && sameCase) {
      retired.push(Object.freeze({
        customerKey: result.customerKey,
        cohort: result.cohort,
        draftId: String(executionItem.draftId),
        priorState: result.state,
        lifecycleKind,
        ruleId: observation.lifecycle.ruleId,
      }));
    } else {
      retained.push(result);
    }
  }
  if (!retired.length) return Object.freeze([]);

  state.results = retained;
  state.status = "running";
  state.endedAt = null;
  state.currentCustomerKey = retired[0].customerKey;
  state.resumeAuthorizationId = authorizationId;
  state.resumedAt = nowIso;
  state.transientResultRetirements = [
    ...(state.transientResultRetirements ?? []),
    ...retired.map((entry) => ({ ...entry, retiredAt: nowIso })),
  ];
  return Object.freeze(retired);
}
