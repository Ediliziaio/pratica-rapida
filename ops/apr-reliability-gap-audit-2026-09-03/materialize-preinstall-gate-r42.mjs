import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r42_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r41-final.json");
const candidatePath = path.join(ops, "full-vitest-r42-final.json");
const evidencePath = path.join(ops, "rule-gate-r42/rule-test-evidence.json");
const [baseline, candidate, evidence] = [baselinePath, candidatePath, evidencePath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 4 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v119" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v96", "rule_versions");
assert(evidence.passedKeys.length === 117 && Object.keys(evidence.ruleProofs).length === 117 && evidence.testExitCode === 0, "rule_cardinality");
for (const key of ["sequencer-uncertain-save-probe-lifecycle", "worker-recovery-queued-continuation", "sequencer-recovery-queued-server-proof"]) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
const assertions = candidate.testResults.flatMap((file) => file.assertionResults ?? []);
const passed = (needle) => assertions.some((item) => item.status === "passed" && item.fullName.includes(needle));
assert(passed("dopo un riavvio riprende probing dalla stessa bozza"), "worker_probe_restart_positive_missing");
assert(passed("mantiene probing e recovery_queued non terminali"), "sequencer_transient_positive_missing");
assert(passed("fallisce chiuso se probing o recovery_queued contraddicono"), "sequencer_transient_negative_missing");
assert(passed("non finalizza probing o recovery_queued come blocchi"), "finalizer_transient_negative_missing");

const staging = path.join(ops, "bundle-staging-r42");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v119", "apr-enea-rule-test-matrix-v96", "system-sequencer-uncertain-save-probe-lifecycle-v1", "uncertain_page_save_probes_incomplete"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);
const sequencerPath = path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const preflightPath = path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs");
for (const marker of ["resolveUncertainSaveLifecycle", "uncertainLifecycleInFlight"]) assert(readFileSync(sequencerPath, "utf8").includes(marker), `sequencer_missing_marker:${marker}`);

const artifact = {
  version: "apr-uncertain-save-probe-lifecycle-r42-preinstall-gate-v1",
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
  correction: { status: "proved_positive_negative_restart_and_finalizer", ruleId: "system-sequencer-uncertain-save-probe-lifecycle-v1" },
  stagedBundle,
  sequencer: { path: path.relative(root, sequencerPath), sha256: sha256(sequencerPath), preflightGuardPath: path.relative(root, preflightPath), preflightGuardSha256: sha256(preflightPath) },
  safety: { localTestsOnly: true, eneaAccessed: false, mutationPerformed: false, previewPerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r42.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, correction: artifact.correction, stagedBundle }, null, 2)}\n`);
