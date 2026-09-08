import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r37_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r36-final.json");
const candidatePath = path.join(ops, "full-vitest-r37-final.json");
const evidencePath = path.join(ops, "rule-gate-r37/rule-test-evidence.json");
const beforeReplayPath = path.join(ops, "fresh-original-replay-r36-products.json");
const afterReplayPath = path.join(ops, "fresh-original-replay-r37-products.json");
const diagnosticPath = path.join(ops, "single-product-declaration-after-r37.json");
const residualPath = path.join(ops, "residual-review-questions-r37.json");
const baseline = readJson(baselinePath);
const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath);
const beforeReplay = readJson(beforeReplayPath);
const afterReplay = readJson(afterReplayPath);
const diagnostic = readJson(diagnosticPath);
const residual = readJson(residualPath);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 2 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v113" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v91", "rule_versions");
assert(evidence.passedKeys.length === 112 && Object.keys(evidence.ruleProofs).length === 112 && evidence.testExitCode === 0, "rule_cardinality");
assert(evidence.passedKeys.includes("single-product-energy-declaration-infissi"), "rule_missing");
assert(evidence.ruleProofs["single-product-energy-declaration-infissi"]?.positiveTest && evidence.ruleProofs["single-product-energy-declaration-infissi"]?.negativeTest, "rule_proofs");
for (const replay of [beforeReplay, afterReplay]) {
  assert(replay.safety?.localOnly === true && replay.safety?.eneaAccessed === false && replay.safety?.crmAccessed === false && replay.safety?.externalActionAllowed === false, "replay_safety");
  assert(replay.manifestSha256 === "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0", "manifest_hash");
  assert(replay.sourceIntegrity?.documents === 359 && replay.sourceIntegrity?.hashMismatches === 0 && replay.summary?.casesWithAnalysisFailure === 0, "source_integrity");
}
assert(afterReplay.summary?.freshReady === 29 && afterReplay.summary?.freshOperatorRequired === 71, "candidate_replay_aggregate");
const beforeByKey = new Map(beforeReplay.cases.map((item) => [item.customerKey, item]));
const changed = afterReplay.cases.filter((item) => {
  const before = beforeByKey.get(item.customerKey);
  return !before || before.freshOutcome !== item.freshOutcome || JSON.stringify(before.freshBlockerKeys) !== JSON.stringify(item.freshBlockerKeys);
});
assert(changed.length === 1 && changed[0].customerKey === "gemma-minore", "unexpected_replay_delta");
assert(JSON.stringify(changed[0].freshBlockerKeys) === JSON.stringify(["co_beneficiary_invoice_identity_unresolved:beneficiary.coBeneficiary"]), "replay_not_improved");
assert(diagnostic.resolution?.version === "apr-infissi-automatic-document-evidence-v4" && diagnostic.resolution?.status === "ready" && diagnostic.resolution?.evidence?.rows?.length === 1 && diagnostic.observation?.candidates?.[0]?.parser === "single-product-energy-declaration", "diagnostic_not_proved");
assert(residual.count === 25 && residual.cases.every((item) => item.classification && item.exactCause && item.operatorQuestion && "missingDocumentType" in item && item.onboardingGap), "residual_questions_incomplete");
const gemma = residual.cases.find((item) => item.customerKey === "gemma-minore");
assert(gemma && gemma.operatorQuestion.includes("secondo beneficiario") && !gemma.operatorQuestion.includes("larghezza"), "stale_residual_question");

const staging = path.join(ops, "bundle-staging-r37");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["system-single-product-energy-declaration-infissi-v1", "single-product-energy-declaration", "apr-enea-rule-test-matrix-v91", "apr-infissi-automatic-document-evidence-v4"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-single-product-energy-declaration-r37-preinstall-gate-v1",
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
  freshOriginalReplay: {
    status: "passed",
    beforeSha256: sha256(beforeReplayPath),
    afterSha256: sha256(afterReplayPath),
    diagnosticSha256: sha256(diagnosticPath),
    residualReviewSha256: sha256(residualPath),
    documents: afterReplay.sourceIntegrity.documents,
    bytes: afterReplay.sourceIntegrity.bytes,
    improvedCases: changed.map((item) => item.customerKey),
    unchangedCases: afterReplay.cases.length - changed.length,
    externalActionAllowed: false,
  },
  stagedBundle,
  safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, saveAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r37.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, candidate: artifact.monotonicGate.candidate, rules: artifact.monotonicGate.rulesProved, replay: artifact.freshOriginalReplay, stagedBundle }, null, 2)}\n`);
