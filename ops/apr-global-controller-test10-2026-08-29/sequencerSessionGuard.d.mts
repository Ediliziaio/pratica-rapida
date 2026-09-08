export const DEFAULT_SESSION_STALL_THRESHOLD_MS: number;
export function createSessionWaitGuard(): { candidateSinceMs: number | null; lastProgressAtMs: number | null; lastProgressFingerprint: string | null };
export function createExecutionProgressGuard(): { lastProgressAtMs: number | null; lastProgressFingerprint: string | null };
export function executionProgressFingerprint(execution: any, entry: any): string;
export function observeSessionWait(guard: any, input: { nowMs: number; isCommonSessionWait: boolean; workerRunning: boolean; progressFingerprint: string; thresholdMs?: number }): any;
export function observeExecutionProgress(guard: any, input: { nowMs: number; progressFingerprint: string; workerRunning: boolean; thresholdMs?: number }): any;
export function authorizeSequencerResume(state: any, authorizationId: string): boolean;
export function retireStaleTransientSequencerResults(state: any, input: { authorizationId: string; observations: any[]; nowIso?: string }): ReadonlyArray<any>;
