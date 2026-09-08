import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-overnight-review-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r32_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(root, "ops/apr-wide100-financial-parser-r31-2026-09-02/full-vitest-r31.json");
const candidatePath = path.join(ops, "full-vitest-post-date.json");
const evidencePath = path.join(ops, "rule-gate-r32/rule-test-evidence.json");
const replayPath = path.join(ops, "dates-batch-01/post-fix-local-replay-attestation.json");
const blindPath = path.join(ops, "dates-batch-01/claude-blind-review.json");
const baseline = readJson(baselinePath);
const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath);
const replay = readJson(replayPath);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v108" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v86", "rule_versions");
assert(evidence.passedKeys.length === 106 && Object.keys(evidence.ruleProofs).length === 106 && evidence.testExitCode === 0, "rule_cardinality");
const newKeys = [
  "explicit-advance-invoice-reference-marker",
  "explicit-original-completion-date",
  "explicit-percentage-causal-technical-supersession",
  "inline-description-product-measurements",
  "invoice-customer-block-crm-cf",
  "original-pratica-rapida-paper-form-explicit-values",
  "positioned-technical-order-products",
  "tabular-equal-price-amount-single-quantity",
];
for (const key of newKeys) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
assert(replay.scope === "local_replay_only_no_enea_action" && replay.replay.deterministicRuns === 2, "replay_scope_or_determinism");
assert(replay.replay.giuseppeDAdduzio.resolvedCompletionDate === "2026-07-17" && replay.replay.giuseppeDAdduzio.dateBlockers.length === 0, "giuseppe_replay");
assert(replay.replay.marcellaCapatti.resolvedCompletionDate === "2026-02-12" && replay.replay.marcellaCapatti.portalYearMismatchRemoved === true, "marcella_replay");
assert(replay.blindReview.sha256 === sha256(blindPath), "blind_review_hash");
assert(replay.safety.externalActionAllowed === false && replay.safety.previewAllowed === false && replay.safety.submitAllowed === false && replay.safety.communicationsAllowed === false, "safety_contract");

const staging = path.join(ops, "bundle-staging-r32");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const ruleId of ["system-explicit-original-completion-date-v1", "system-invoice-customer-block-crm-cf-v1", "system-positioned-technical-order-products-v1"]) assert(executable.includes(ruleId), `bundle_missing_rule:${ruleId}`);

const artifact = {
  version: "apr-overnight-review-r32-preinstall-gate-v1",
  attestedAt: new Date().toISOString(),
  status: "tested_not_deployed",
  monotonicGate: {
    baseline: { suites: baseline.numTotalTestSuites, tests: baseline.numTotalTests, reportSha256: sha256(baselinePath) },
    candidate: { suites: candidate.numTotalTestSuites, tests: candidate.numTotalTests, reportSha256: sha256(candidatePath) },
    registryVersion: evidence.registryVersion,
    matrixVersion: evidence.matrixVersion,
    rulesProved: evidence.passedKeys.length,
    ruleEvidenceSha256: sha256(evidencePath),
  },
  localReplay: { status: "passed", artifactSha256: sha256(replayPath), canonicalSha256: replay.replay.canonicalSha256, blindReviewSha256: sha256(blindPath) },
  stagedBundle,
  safety: replay.safety,
};
const target = path.join(ops, "preinstall-gate-attestation-r32.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, candidate: artifact.monotonicGate.candidate, rules: artifact.monotonicGate.rulesProved, stagedBundle }, null, 2)}\n`);
