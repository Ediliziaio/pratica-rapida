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
      report: { blockers: [{ code: "customer_form_missing" }, { code: "tax_code_missing_or_invalid" }] },
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

test("ignora per Infissi tutti e soli i blocker Schermature, anche nel payload audit", () => {
  const checkpoint = {
    status: "completed",
    items: [{
      customerKey: "roberto-marcello",
      state: "blocked_case",
      report: {
        blockers: [
          { code: "screenings_missing", field: "screenings" },
          { code: "invoice_332a5af9", field: "economic_sources", reason: "Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture." },
        ],
        eneaPayloadAudit: { blockers: [{ code: "missing-schermature.numero", fieldId: "schermature.numero" }] },
      },
    }],
  };
  assert.equal(resolveCommonPreflightBlock(checkpoint, "roberto-marcello", "infissi"), null);
  assert.equal(resolveCommonPreflightBlock(checkpoint, "roberto-marcello", "screening")?.state, "blocked_case");
});

test("mantiene per Infissi un blocker comune reale insieme al rumore Schermature", () => {
  const checkpoint = {
    status: "completed",
    items: [{
      customerKey: "sabrina-eustomi",
      state: "blocked_case",
      report: { blockers: [{ code: "screenings_missing", field: "screenings" }, { code: "customer_form_missing", field: "form" }] },
    }],
  };
  assert.deepEqual(resolveCommonPreflightBlock(checkpoint, "sabrina-eustomi", "infissi")?.blockerCodes, ["customer_form_missing"]);
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
