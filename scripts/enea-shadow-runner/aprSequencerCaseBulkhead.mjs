export const SEQUENCER_OPERATOR_ISOLATION_RULE_IDS = Object.freeze([
  "system-apr-operator-intervention-routing",
  "system-operator-block-fail-closed",
  "system-atomic-checkpoint-resume",
]);

// Closed whitelist: only failures proven to make every following case unsafe
// may stop the batch. A case-local portal symptom is deliberately absent.
export const SEQUENCER_COMMON_FAILURE_CODES = Object.freeze([
  "session_unavailable_after_stall_threshold",
  "worker_unavailable_after_stall_threshold",
  "execution_stalled_after_watchdog_threshold",
  "system_crash_verified",
]);

const COMMON_FAILURE_CODES = new Set(SEQUENCER_COMMON_FAILURE_CODES);
const verifiedCommonFailures = new WeakSet();

export function createVerifiedCommonTechnicalFailure(code, reason, evidence = {}) {
  if (!COMMON_FAILURE_CODES.has(code)) throw new Error(`sequencer_common_failure_code_not_allowed:${code}`);
  if (!reason?.trim()) throw new Error("sequencer_common_failure_reason_missing");
  const error = new Error(reason.trim());
  error.aprFailureScope = "common_technical";
  error.aprFailureCode = code;
  error.aprFailureEvidence = Object.freeze({ ...evidence });
  verifiedCommonFailures.add(error);
  return error;
}

export function classifySequencerFailure(error) {
  if (error instanceof Error
    && verifiedCommonFailures.has(error)
    && error.aprFailureScope === "common_technical"
    && COMMON_FAILURE_CODES.has(error.aprFailureCode)) {
    return Object.freeze({
      scope: "common_technical",
      code: error.aprFailureCode,
      reason: error.message,
      evidence: error.aprFailureEvidence ?? {},
    });
  }
  const technicalReason = error instanceof Error ? error.message : String(error);
  return Object.freeze({
    scope: "case_technical",
    code: "isolated_case_technical_failure",
    reason: `Difetto tecnico circoscritto alla pratica: ${technicalReason}. Le pratiche successive proseguono.`,
    technicalReason,
    nextAction: "Correggere il difetto tecnico e rimettere in coda la sola pratica interessata.",
    appliedRuleIds: SEQUENCER_OPERATOR_ISOLATION_RULE_IDS,
  });
}

/**
 * Structural case bulkhead. This is the only place allowed to decide whether
 * a case failure is isolated or stops the batch.
 */
export async function executeSequencerCaseBulkhead({ runCase, isolateCase }) {
  try {
    return Object.freeze({ action: "completed", value: await runCase() });
  } catch (error) {
    const failure = classifySequencerFailure(error);
    if (failure.scope === "common_technical") {
      return Object.freeze({ action: "stop_batch", error, failure });
    }
    await isolateCase(failure, error);
    return Object.freeze({ action: "continue", failure });
  }
}
