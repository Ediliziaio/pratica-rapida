import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./sequencer.mjs", import.meta.url), "utf8");

test("applica il preflight comune in modo coerente con il modulo della pratica", () => {
  assert.match(source, /resolvePreflightTerminalDisposition\(common, product, deepReview, item\.customerKey, item\.module\)/);
  assert.match(source, /resolveInfissiPreflightDisposition\(common, product, item\.customerKey\)/);
  assert.match(source, /--reconcile-common-applicability/);
});

test("pubblica una verita terminale preflight soltanto dopo la deep review", () => {
  assert.match(source, /resolvePreflightTerminalDisposition/);
  assert.match(source, /persistedPreflightTerminalEntry\(item, error\.disposition\)/);
  assert.match(source, /publishSequencerTerminalTruth\(\{[\s\S]*kind: "case_block",[\s\S]*entry,[\s\S]*customerKey: item\.customerKey/);
  assert.match(source, /workerIdentity: `deep-review:/);
  assert.doesNotMatch(source, /case_operator_required_from_preflight/);
});

test("non ripristina il bypass storico del controllo caso", () => {
  assert.doesNotMatch(source, /throwIfCommonPreflightBlocked/);
  assert.doesNotMatch(source, /commonItem\?\.state === "blocked_case" && productItem\?\.state === "ready_local_plan"\) return null/);
});

test("deriva lo stato del report dalla stessa verita terminale pubblicata", () => {
  assert.match(source, /reportStateForSequencerTerminalTruth/);
  assert.match(source, /state:\s*"technical_block"/);
  assert.match(source, /inconsistent:\s*inconsistent\.length/);
  assert.doesNotMatch(source, /case_operator_required_from_unresolved_inconsistency/);
});
