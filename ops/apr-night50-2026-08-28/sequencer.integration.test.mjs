import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("il sequencer usa il guard di liveness e progresso prima del common block", () => {
  const source = readFileSync(new URL("./sequencer.mjs", import.meta.url), "utf8");
  assert.match(source, /workerRunning: running\(label\(item, "worker"\)\)/);
  assert.match(source, /progressFingerprint: executionProgressFingerprint\(execution, entry\)/);
  assert.match(source, /if \(observation\.action === "common_block"\)/);
  assert.doesNotMatch(source, /kind: common \? "common_block" : "case_block"/);
});

test("riconcilia il preflight comune con il gate Infissi prima di attendere la pratica", () => {
  const source = readFileSync(new URL("./sequencer.mjs", import.meta.url), "utf8");
  assert.match(source, /--reconcile-common-applicability/);
  assert.doesNotMatch(source, /commonItem\?\.state === "blocked_case" && productItem\?\.state === "ready_local_plan"\) return null/);
});

test("isola ogni errore non marcato come comune e continua la coda", () => {
  const source = readFileSync(new URL("./sequencer.mjs", import.meta.url), "utf8");
  assert.match(source, /const failure = classifySequencerFailure\(error\)/);
  assert.match(source, /if \(failure\.scope === "common_technical"\) throw error/);
  assert.match(source, /case_operator_required_from_unresolved_inconsistency/);
  assert.match(source, /return item/);
});

test("usa una sorgente installabile configurata e non un vecchio worktree temporaneo hardcoded", () => {
  const source = readFileSync(new URL("./sequencer.mjs", import.meta.url), "utf8");
  assert.match(source, /process\.env\.APR_SOURCE_ROOT \?\? process\.cwd\(\)/);
  assert.doesNotMatch(source, /apr-gate-d1b8d00/);
});
