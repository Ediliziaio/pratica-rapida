import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifySequencerFailure,
  createVerifiedCommonTechnicalFailure,
  SEQUENCER_COMMON_FAILURE_CODES,
  SEQUENCER_OPERATOR_ISOLATION_RULE_IDS,
} from "./sequencerFailurePolicy.mjs";

test("isola per default qualunque eccezione non classificata come difetto tecnico della sola pratica", () => {
  const result = classifySequencerFailure(new Error("preflight_sources_disagree"));
  assert.equal(result.scope, "case_technical");
  assert.equal(result.code, "isolated_case_technical_failure");
  assert.doesNotMatch(result.reason, /Richiesto intervento operatore/);
  assert.match(result.reason, /pratiche successive proseguono/);
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

test("un sintomo portale circoscritto a una pratica non puo essere elevato a stop globale", () => {
  assert.throws(
    () => createVerifiedCommonTechnicalFailure(
      "global_controller_verification_symptom_recurred",
      "mara-fixture:structural_symptom_recurred:apr_cdp_command_timeout:Runtime.evaluate",
    ),
    /sequencer_common_failure_code_not_allowed/,
  );
});

test("registra tutti i codici di arresto comune usati dai sequencer versionati", () => {
  const sequencerSource = readFileSync(new URL("./sequencer.mjs", import.meta.url), "utf8");
  const referencedCodes = [...sequencerSource.matchAll(/createVerifiedCommonTechnicalFailure\(\s*[\r\n ]*"([^"]+)"/g)].map((match) => match[1]);
  for (const code of referencedCodes) assert.ok(SEQUENCER_COMMON_FAILURE_CODES.includes(code), `codice comune non registrato: ${code}`);
});

test("rifiuta di marcare come comune una categoria non ammessa", () => {
  assert.throws(
    () => createVerifiedCommonTechnicalFailure("unclassified_case", "Non so classificare la pratica."),
    /sequencer_common_failure_code_not_allowed/,
  );
});

test("un errore che falsifica scope e codice comuni resta isolato senza il marchio del costruttore", () => {
  const forged = new Error("tentativo di aggirare il fail-safe default");
  forged.aprFailureScope = "common_technical";
  forged.aprFailureCode = "system_crash_verified";
  expectCaseIsolation(forged);
});

function expectCaseIsolation(error) {
  assert.equal(classifySequencerFailure(error).scope, "case_technical");
}
