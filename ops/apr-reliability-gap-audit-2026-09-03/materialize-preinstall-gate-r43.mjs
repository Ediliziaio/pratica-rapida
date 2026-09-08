import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r43_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r42-final.json");
const candidatePath = path.join(ops, "full-vitest-r43-final.json");
const evidencePath = path.join(ops, "rule-gate-r43/rule-test-evidence.json");
const [baseline, candidate, evidence] = [baselinePath, candidatePath, evidencePath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0 && baseline.numTotalTests === 1723, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 2 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v120" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v97", "rule_versions");
assert(evidence.passedKeys.length === 117 && Object.keys(evidence.ruleProofs).length === 117 && evidence.testExitCode === 0, "rule_cardinality");
const lifecycleProof = evidence.ruleProofs["sequencer-uncertain-save-probe-lifecycle"];
assert(lifecycleProof?.positiveTest && lifecycleProof?.negativeTest, "lifecycle_rule_proofs");
const assertions = candidate.testResults.flatMap((file) => file.assertionResults ?? []);
const passed = (needle) => assertions.some((item) => item.status === "passed" && item.fullName.includes(needle));
assert(passed("ritira soltanto INCONSISTENT con autorizzazione, coorte e bozza coincidenti"), "stale_result_retirement_positive_missing");
assert(passed("lascia intatto un risultato terminale o con identita discordante"), "stale_result_retirement_negative_missing");
assert(passed("dopo un riavvio riprende probing dalla stessa bozza"), "worker_probe_restart_regression_missing");

const staging = path.join(ops, "bundle-staging-r43");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v120", "apr-enea-rule-test-matrix-v97", "system-sequencer-uncertain-save-probe-lifecycle-v1", "uncertain_page_save_probes_incomplete"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);
const sequencerPath = path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs");
const sessionGuardPath = path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerSessionGuard.mjs");
for (const marker of ["retireStaleTransientSequencerResults", "stale_inconsistent_result_retired_for_uncertain_save_probe_resume"]) assert(readFileSync(sequencerPath, "utf8").includes(marker), `sequencer_missing_marker:${marker}`);
assert(readFileSync(sessionGuardPath, "utf8").includes("sequencer_transient_result_retirement_authorization_mismatch"), "session_guard_fail_closed_marker_missing");

const artifact = {
  version: "apr-uncertain-save-stale-result-retirement-r43-preinstall-gate-v1",
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
  correction: { status: "proved_positive_negative_identity_bound_retirement", ruleId: "system-sequencer-uncertain-save-probe-lifecycle-v1" },
  stagedBundle,
  sequencer: { path: path.relative(root, sequencerPath), sha256: sha256(sequencerPath), sessionGuardPath: path.relative(root, sessionGuardPath), sessionGuardSha256: sha256(sessionGuardPath) },
  safety: { localTestsOnly: true, eneaAccessed: false, mutationPerformed: false, previewPerformed: false, savePerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r43.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, correction: artifact.correction, stagedBundle }, null, 2)}\n`);
