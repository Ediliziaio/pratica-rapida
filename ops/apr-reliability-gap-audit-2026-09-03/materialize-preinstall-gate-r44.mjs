import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r44_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r43-final.json");
const candidatePath = path.join(ops, "full-vitest-r44-final.json");
const evidencePath = path.join(ops, "rule-gate-r44/rule-test-evidence.json");
const targetedPath = path.join(ops, "r44-evidence-targeted.json");
const [baseline, candidate, evidence, targeted] = [baselinePath, candidatePath, evidencePath, targetedPath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0 && baseline.numTotalTests === 1725, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 1 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v121" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v98", "rule_versions");
assert(evidence.passedKeys.length === 118 && Object.keys(evidence.ruleProofs).length === 118 && evidence.testExitCode === 0, "rule_cardinality");
const freshProof = evidence.ruleProofs["screening-fresh-proof-before-terminal"];
assert(freshProof?.positiveTest && freshProof?.negativeTest, "fresh_proof_rule_evidence");
assert(targeted.success === true && targeted.numFailedTests === 0, "targeted_evidence_not_green");
const assertions = candidate.testResults.flatMap((file) => file.assertionResults ?? []);
const passed = (needle) => assertions.some((item) => item.status === "passed" && item.fullName.includes(needle));
assert(passed("rivaluta le prove canoniche fresche prima di consumare le sonde o pubblicare un terminale"), "fresh_proof_wiring_missing");
assert(passed("mantiene OPERATOR_REQUIRED quando una delle due prove di assenza non e conclusiva"), "fresh_proof_negative_missing");
assert(passed("ripristina tutte le righe annidate quando il crash sull'ultima lascia il riepilogo server vuoto"), "fresh_proof_recovery_missing");

const staging = path.join(ops, "bundle-staging-r44");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v121", "apr-enea-rule-test-matrix-v98", "system-screening-fresh-proof-before-terminal-v1", "screeningPersistenceProofs.length < 2", "continue;"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-screening-fresh-proof-before-terminal-r44-preinstall-gate-v1",
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
  correction: { status: "proved_positive_negative_fresh_checkpoint_before_terminal", ruleId: "system-screening-fresh-proof-before-terminal-v1" },
  stagedBundle,
  safety: { localTestsOnly: true, eneaAccessed: false, mutationPerformed: false, previewPerformed: false, savePerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r44.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, correction: artifact.correction, stagedBundle }, null, 2)}\n`);
