import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-wide100-financial-parser-r31-2026-09-02");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r31_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(root, "ops/apr-wide100-financial-parser-r30-2026-09-02/full-vitest-r30.json");
const candidatePath = path.join(ops, "full-vitest-r31.json");
const evidencePath = path.join(ops, "rule-gate-r31/rule-test-evidence.json");
const replayPath = path.join(ops, "replay-maurizia-r31.json");
const baseline = readJson(baselinePath);
const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath);
const replay = readJson(replayPath);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v105" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v83", "rule_versions");
assert(evidence.passedKeys.length === 98 && evidence.passedKeys.includes("resolved-non-economic-total-blocker-retirement"), "rule_cardinality");
assert(evidence.ruleProofs["resolved-non-economic-total-blocker-retirement"]?.positiveTest && evidence.ruleProofs["resolved-non-economic-total-blocker-retirement"]?.negativeTest, "rule_proofs");
assert(replay.result === "PASS" && replay.before.tripleReconciliationVerified === true && replay.before.blockerCodes.includes("invoice_929a8665"), "replay_before");
assert(replay.after.tripleReconciliationVerified === true && replay.after.invoiceTotal === 5_000 && replay.after.reconciledTotal === 5_000, "replay_after_total");
assert(!replay.after.blockerCodes.includes("invoice_929a8665") && replay.after.warning?.appliedRuleIds?.includes("system-resolved-non-economic-total-blocker-retirement-v1"), "replay_after_retirement");

const staging = path.join(ops, "bundle-staging-r31");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
assert(executable.includes("system-resolved-non-economic-total-blocker-retirement-v1"), "bundle_missing_rule");
assert(executable.includes("resolved_non_economic_total_blocker_retired"), "bundle_missing_audit_warning");

const artifact = {
  version: "apr-financial-parser-r31-preinstall-gate-attestation-v1",
  attestedAt: new Date().toISOString(),
  status: "tested_not_deployed",
  diagnosis: "lower_precedence_generic_unrecognized_total_blocker_survived_higher_precedence_verified_zero_reversal_reconciliation",
  monotonicGate: {
    baseline: { suites: baseline.numTotalTestSuites, tests: baseline.numTotalTests, reportSha256: sha256(baselinePath) },
    candidate: { suites: candidate.numTotalTestSuites, tests: candidate.numTotalTests, reportSha256: sha256(candidatePath) },
    registryVersion: evidence.registryVersion,
    matrixVersion: evidence.matrixVersion,
    rulesProved: evidence.passedKeys.length,
    ruleEvidenceSha256: sha256(evidencePath),
  },
  operationalReadOnlyReplay: { status: "passed", artifactSha256: sha256(replayPath), customerKey: "maurizia-coreggioli", beforeBlocker: true, afterBlocker: false, reconciledTotal: 5_000 },
  stagedBundle,
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "financial-parser-preinstall-gate-attestation-r31.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, tests: artifact.monotonicGate.candidate.tests, rules: artifact.monotonicGate.rulesProved }, null, 2)}\n`);
