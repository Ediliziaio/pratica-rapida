import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r45_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r44-final.json");
const candidatePath = path.join(ops, "full-vitest-r45-final.json");
const evidencePath = path.join(ops, "rule-gate-r45/rule-test-evidence.json");
const targetedPath = path.join(ops, "r45-evidence-targeted.json");
const [baseline, candidate, evidence, targeted] = [baselinePath, candidatePath, evidencePath, targetedPath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0 && baseline.numTotalTests === 1726, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 2 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v122" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v99", "rule_versions");
assert(evidence.passedKeys.length === 119 && Object.keys(evidence.ruleProofs).length === 119 && evidence.testExitCode === 0, "rule_cardinality");
assert(evidence.ruleProofs["sequencer-screening-canonical-absence-resume"]?.positiveTest && evidence.ruleProofs["sequencer-screening-canonical-absence-resume"]?.negativeTest, "resume_rule_evidence");
assert(targeted.success === true && targeted.numFailedTests === 0, "targeted_evidence_not_green");
const assertions = candidate.testResults.flatMap((file) => file.assertionResults ?? []);
const passed = (needle) => assertions.some((item) => item.status === "passed" && item.fullName.includes(needle));
assert(passed("riapre il worker soltanto con due prove canoniche indipendenti di assenza delle righe"), "resume_positive_missing");
assert(passed("mantiene terminale fail-closed se una prova di assenza non e canonica o il budget e consumato"), "resume_negative_missing");

const staging = path.join(ops, "bundle-staging-r45");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v122", "apr-enea-rule-test-matrix-v99", "system-sequencer-screening-canonical-absence-resume-v1"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);
const sequencer = readFileSync(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs"), "utf8");
const guard = readFileSync(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs"), "utf8");
for (const marker of ["cdp-driver.json", "resolveUncertainSaveLifecycle(execution, item.customerKey", "SEQUENCER_SCREENING_CANONICAL_ABSENCE_RESUME_RULE_ID", "Nessun elemento"]) assert(`${sequencer}\n${guard}`.includes(marker), `sequencer_missing_marker:${marker}`);

const artifact = {
  version: "apr-sequencer-screening-canonical-absence-resume-r45-preinstall-gate-v1",
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
  correction: { status: "proved_positive_negative_canonical_absence_resume", ruleId: "system-sequencer-screening-canonical-absence-resume-v1" },
  stagedBundle,
  sequencerSha256: sha256(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs")),
  sequencerGuardSha256: sha256(path.join(root, "ops/apr-global-controller-test10-2026-08-29/sequencerPreflightGuard.mjs")),
  safety: { localTestsOnly: true, eneaAccessed: false, mutationPerformed: false, previewPerformed: false, savePerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r45.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, correction: artifact.correction, stagedBundle }, null, 2)}\n`);
