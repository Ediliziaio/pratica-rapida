import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createVerifiedCommonTechnicalFailure,
  executeSequencerCaseBulkhead,
} from "./aprSequencerCaseBulkhead.mjs";

test("bulkhead isola un errore JavaScript futuro sconosciuto e processa la pratica successiva", async () => {
  const processed = [];
  const isolated = [];
  const cases = ["unknown-error", "next-case"];

  for (const customerKey of cases) {
    const outcome = await executeSequencerCaseBulkhead({
      runCase: async () => {
        processed.push(customerKey);
        if (customerKey === "unknown-error") throw new TypeError("errore-futuro-mai-categorizzato-9f73");
        return customerKey;
      },
      isolateCase: async (failure) => isolated.push({ customerKey, failure }),
    });
    if (outcome.action === "stop_batch") break;
  }

  assert.deepEqual(processed, ["unknown-error", "next-case"]);
  assert.equal(isolated.length, 1);
  assert.equal(isolated[0].customerKey, "unknown-error");
  assert.equal(isolated[0].failure.scope, "case_technical");
  assert.equal(isolated[0].failure.code, "isolated_case_technical_failure");
  assert.doesNotMatch(isolated[0].failure.reason, /Richiesto intervento operatore/);
  assert.match(isolated[0].failure.technicalReason, /errore-futuro-mai-categorizzato-9f73/);
});

test("bulkhead ferma soltanto un errore comune creato dalla whitelist centrale", async () => {
  let isolated = false;
  const common = createVerifiedCommonTechnicalFailure(
    "worker_unavailable_after_stall_threshold",
    "Worker realmente caduto dopo la soglia verificata.",
    { workerRunning: false, stalledForMs: 300_000 },
  );
  const outcome = await executeSequencerCaseBulkhead({
    runCase: async () => { throw common; },
    isolateCase: async () => { isolated = true; },
  });
  assert.equal(outcome.action, "stop_batch");
  assert.equal(outcome.failure.code, "worker_unavailable_after_stall_threshold");
  assert.equal(isolated, false);
});

test("i sequencer operativi delegano la decisione al solo bulkhead centrale", () => {
  const sources = [
    "../../ops/apr-night50-2026-08-28/sequencer.mjs",
    "../../ops/apr-global-controller-test10-2026-08-29/sequencer.mjs",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  for (const source of sources) {
    assert.match(source, /executeSequencerCaseBulkhead\(\{/);
    assert.doesNotMatch(source, /classifySequencerFailure\(/);
    assert.doesNotMatch(source, /global_controller_verification_symptom_recurred/);
  }
});
