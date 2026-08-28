import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySequencerFailure,
  createVerifiedCommonTechnicalFailure,
  SEQUENCER_OPERATOR_ISOLATION_RULE_IDS,
} from "./sequencerFailurePolicy.mjs";

test("isola per default qualunque incoerenza non classificata e conserva una domanda leggibile", () => {
  const result = classifySequencerFailure(new Error("preflight_sources_disagree"));
  assert.equal(result.scope, "case_operator_required");
  assert.equal(result.code, "unresolved_case_inconsistency");
  assert.match(result.reason, /Richiesto intervento operatore/);
  assert.match(result.reason, /pratiche successive proseguono/);
  assert.match(result.question, /Verificare i dati e la classificazione/);
  assert.deepEqual(result.appliedRuleIds, SEQUENCER_OPERATOR_ISOLATION_RULE_IDS);
});

test("non permette a un errore generico che cita la sessione di fermare il lotto", () => {
  expectCaseIsolation(new Error("sessione ENEA forse non disponibile"));
});

test("ferma globalmente solo un problema comune marcato dopo verifica", () => {
  const error = createVerifiedCommonTechnicalFailure(
    "session_unavailable_after_stall_threshold",
    "Sessione ENEA indisponibile dopo cinque minuti senza progresso.",
    { candidateAgeMs: 300_000, progressAgeMs: 300_000, workerRunning: false },
  );
  assert.deepEqual(classifySequencerFailure(error), {
    scope: "common_technical",
    code: "session_unavailable_after_stall_threshold",
    reason: "Sessione ENEA indisponibile dopo cinque minuti senza progresso.",
    evidence: { candidateAgeMs: 300_000, progressAgeMs: 300_000, workerRunning: false },
  });
});

test("rifiuta di marcare come comune una categoria non ammessa", () => {
  assert.throws(
    () => createVerifiedCommonTechnicalFailure("unclassified_case", "Non so classificare la pratica."),
    /sequencer_common_failure_code_not_allowed/,
  );
});

function expectCaseIsolation(error) {
  assert.equal(classifySequencerFailure(error).scope, "case_operator_required");
}
