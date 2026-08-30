export const DEFAULT_SESSION_STALL_THRESHOLD_MS = 5 * 60 * 1000;

export function createSessionWaitGuard() {
  return {
    candidateSinceMs: null,
    lastProgressAtMs: null,
    lastProgressFingerprint: null,
  };
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
