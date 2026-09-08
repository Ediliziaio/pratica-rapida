import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r41_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r40-final.json");
const candidatePath = path.join(ops, "full-vitest-r41-final.json");
const evidencePath = path.join(ops, "rule-gate-r41/rule-test-evidence.json");
const [baseline, candidate, evidence] = [baselinePath, candidatePath, evidencePath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v118" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v95", "rule_versions");
assert(evidence.passedKeys.length === 116 && Object.keys(evidence.ruleProofs).length === 116 && evidence.testExitCode === 0, "rule_cardinality");
for (const key of ["worker-recovery-queued-continuation", "sequencer-recovery-queued-server-proof", "technical-document-practice-binding"]) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
const assertions = candidate.testResults.flatMap((file) => file.assertionResults ?? []);
const passed = (needle) => assertions.some((item) => item.status === "passed" && item.fullName.includes(needle));
assert(passed("GET canonica autorizza il recupero automatico"), "worker_recovery_positive_missing");
assert(passed("dopo tre prove inconcludenti isola solo il caso"), "worker_recovery_negative_missing");
assert(passed("rifiuta fail-closed Flavia quando cliente coincide"), "flavia_binding_scope_missing");

const staging = path.join(ops, "bundle-staging-r41");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v118", "apr-enea-rule-test-matrix-v95", "system-worker-recovery-queued-continuation-v1", "uncertain_page_save_recovery_authorized", "operatorPracticeBindingResolutions"]) {
  assert(executable.includes(marker), `bundle_missing_marker:${marker}`);
}
const sequencerPath = path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const sequencerSource = readFileSync(sequencerPath, "utf8");
for (const marker of ["operatorPracticeBindingResolution", "confirmed_same_practice_products", "--apply-operator-practice-binding-resolution"]) assert(sequencerSource.includes(marker), `sequencer_missing_marker:${marker}`);

const artifact = {
  version: "apr-recovery-continuation-and-scoped-binding-r41-preinstall-gate-v1",
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
  corrections: {
    recoveryQueued: { status: "proved_positive_and_fail_closed", ruleId: "system-worker-recovery-queued-continuation-v1" },
    operatorBindingResolution: { status: "practice_source_and_hash_scoped", propagation: "forbidden" },
  },
  stagedBundle,
  sequencer: { path: path.relative(root, sequencerPath), sha256: sha256(sequencerPath) },
  safety: { localTestsOnly: true, eneaAccessed: false, mutationPerformed: false, previewPerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r41.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, corrections: artifact.corrections, stagedBundle }, null, 2)}\n`);
