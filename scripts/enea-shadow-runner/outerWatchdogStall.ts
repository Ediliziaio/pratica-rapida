export const APR_OUTER_WATCHDOG_STALL_STATE_VERSION = "apr-outer-watchdog-stall-state-v1" as const;

export const APR_OUTER_WATCHDOG_STALL_BLOCKER_CODE = "outer_watchdog_stall_detected" as const;

export interface AprOuterWatchdogStallState {
  version: typeof APR_OUTER_WATCHDOG_STALL_STATE_VERSION;
  customerKey: string;
  cohort: number;
  batchRunId: string;
  detectedAt: string;
  reason: string;
  startedAt: string;
  lastProgressAt: string;
  lastObservedFingerprint: string;
}
