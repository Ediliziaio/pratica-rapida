export const SEQUENCER_OPERATOR_ISOLATION_RULE_IDS = Object.freeze([
  "system-apr-operator-intervention-routing",
  "system-operator-block-fail-closed",
  "system-atomic-checkpoint-resume",
]);

export const SEQUENCER_COMMON_FAILURE_CODES = Object.freeze([
  "session_unavailable_after_stall_threshold",
  "worker_unavailable_after_stall_threshold",
  "system_crash_verified",
  "global_controller_verification_symptom_recurred",
]);

const COMMON_FAILURE_CODES = new Set(SEQUENCER_COMMON_FAILURE_CODES);

export function createVerifiedCommonTechnicalFailure(code, reason, evidence = {}) {
  if (!COMMON_FAILURE_CODES.has(code)) throw new Error(`sequencer_common_failure_code_not_allowed:${code}`);
  if (!reason?.trim()) throw new Error("sequencer_common_failure_reason_missing");
  const error = new Error(reason.trim());
  error.aprFailureScope = "common_technical";
  error.aprFailureCode = code;
  error.aprFailureEvidence = Object.freeze({ ...evidence });
  return error;
}

export function classifySequencerFailure(error) {
  if (error?.aprFailureScope === "common_technical" && COMMON_FAILURE_CODES.has(error.aprFailureCode)) {
    return Object.freeze({
      scope: "common_technical",
      code: error.aprFailureCode,
      reason: error instanceof Error ? error.message : String(error),
      evidence: error.aprFailureEvidence ?? {},
    });
  }
  const technicalReason = error instanceof Error ? error.message : String(error);
  return Object.freeze({
    scope: "case_operator_required",
    code: "unresolved_case_inconsistency",
    reason: `APR non ha potuto classificare o completare questa pratica in sicurezza: ${technicalReason}. Richiesto intervento operatore; le pratiche successive proseguono.`,
    technicalReason,
    question: "Verificare i dati e la classificazione della pratica, quindi rimetterla in coda dopo la correzione.",
    appliedRuleIds: SEQUENCER_OPERATOR_ISOLATION_RULE_IDS,
  });
}
