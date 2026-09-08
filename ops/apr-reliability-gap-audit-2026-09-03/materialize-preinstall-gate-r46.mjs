import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r46_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r45-final.json");
const candidatePath = path.join(ops, "full-vitest-r46-final.json");
const evidencePath = path.join(ops, "rule-gate-r46/rule-test-evidence.json");
const targetedPath = path.join(ops, "r46-evidence-targeted.json");
const [baseline, candidate, evidence, targeted] = [baselinePath, candidatePath, evidencePath, targetedPath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0 && baseline.numTotalTests === 1728, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 3 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v123" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v100", "rule_versions");
assert(evidence.passedKeys.length === 120 && Object.keys(evidence.ruleProofs).length === 120 && evidence.testExitCode === 0, "rule_cardinality");
assert(evidence.ruleProofs["sequencer-screening-recovery-filling-lifecycle"]?.positiveTest && evidence.ruleProofs["sequencer-screening-recovery-filling-lifecycle"]?.negativeTest, "filling_lifecycle_rule_evidence");
assert(targeted.success === true && targeted.numFailedTests === 0, "targeted_evidence_not_green");
const assertions = candidate.testResults.flatMap((file) => file.assertionResults ?? []);
const passed = (needle) => assertions.some((item) => item.status === "passed" && item.fullName.includes(needle));
assert(passed("mantiene filling recovery_authorized non terminale finche il worker consuma il recupero"), "filling_positive_missing");
assert(passed("rifiuta filling recovery_authorized se identita, prova o budget non coincidono"), "filling_negative_missing");
assert(passed("ritira soltanto il technical_block storico prodotto dal mismatch filling recovery_authorized"), "stale_technical_retirement_missing");

const staging = path.join(ops, "bundle-staging-r46");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v123", "apr-enea-rule-test-matrix-v100", "system-sequencer-screening-recovery-filling-lifecycle-v1"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);
const sequencer = readFileSync(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs"), "utf8");
const guard = readFileSync(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs"), "utf8");
for (const marker of ["cdp-driver.json", "resolveUncertainSaveLifecycle(execution, item.customerKey", "SEQUENCER_SCREENING_RECOVERY_FILLING_LIFECYCLE_RULE_ID", "recovery_filling_checkpoint_invalid"]) assert(`${sequencer}\n${guard}`.includes(marker), `sequencer_missing_marker:${marker}`);

const artifact = {
  version: "apr-sequencer-screening-recovery-filling-lifecycle-r46-preinstall-gate-v1",
  attestedAt: new Date().toISOString(),
  status: "tested_not_deployed",
  monotonicGate: {
    baseline: { suites: baseline.numTotalTestSuites, tests: baseline.numTotalTests, reportSha256: sha256(baselinePath) },
    candidate: { suites: candidate.numTotalTestSuites, tests: candidate.numTotalTests, reportSha256: sha256(candidatePath) },
    registryVersion: evidence.registryVersion,
    matrixVersion: evidence.matrixVersion,
    rulesProved: evidence.passedKeys.length,
    ruleEvidenceSha256: sha256(evidencePath),
    targetedEvidenceSha256: sha256(targetedPath),
  },
  correction: { status: "proved_positive_negative_recovery_filling_lifecycle", ruleId: "system-sequencer-screening-recovery-filling-lifecycle-v1" },
  stagedBundle,
  sequencerSha256: sha256(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs")),
  sequencerGuardSha256: sha256(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs")),
  safety: { localTestsOnly: true, eneaAccessed: false, mutationPerformed: false, previewPerformed: false, savePerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r46.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, correction: artifact.correction, stagedBundle }, null, 2)}\n`);
