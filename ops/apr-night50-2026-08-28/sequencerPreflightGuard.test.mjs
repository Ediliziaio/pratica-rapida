import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPreflightWaitHeartbeat,
  resolveCommonPreflightBlock,
} from "./sequencerPreflightGuard.mjs";

test("riconosce subito un blocked_case comune anche se il gate prodotto e vuoto", () => {
  const block = resolveCommonPreflightBlock({
    status: "completed",
    items: [{
      customerKey: "sabrina-eustomi",
      state: "blocked_case",
      reason: "Dati obbligatori mancanti.",
      blockers: [{ code: "customer_form_missing" }, { code: "tax_code_missing_or_invalid" }],
    }],
  }, "sabrina-eustomi");

  assert.deepEqual(block, {
    customerKey: "sabrina-eustomi",
    state: "blocked_case",
    reason: "Dati obbligatori mancanti.",
    blockerCodes: ["customer_form_missing", "tax_code_missing_or_invalid"],
  });
});

test("non inventa un blocco comune per pratica ready o assente", () => {
  const checkpoint = {
    status: "completed",
    items: [{ customerKey: "caso-ready", state: "ready_local_plan" }],
  };
  assert.equal(resolveCommonPreflightBlock(checkpoint, "caso-ready"), null);
  assert.equal(resolveCommonPreflightBlock(checkpoint, "caso-assente"), null);
});

test("costruisce un heartbeat preflight_wait deterministico e immutabile", () => {
  const item = { customerKey: "caso-1", displayName: "Caso Uno", cohort: 123 };
  const first = buildPreflightWaitHeartbeat(item, "infissi-local-preflight", "2026-08-28T09:10:00.000Z");
  const second = buildPreflightWaitHeartbeat(item, "infissi-local-preflight", "2026-08-28T09:10:00.000Z");
  assert.deepEqual(first, second);
  assert.equal(first.phase, "preflight_wait");
  assert.equal(first.detail.gate, "infissi-local-preflight");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.detail), true);
});
