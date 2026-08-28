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
