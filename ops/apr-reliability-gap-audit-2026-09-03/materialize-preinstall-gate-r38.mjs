import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r38_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r36-final.json");
const candidatePath = path.join(ops, "full-vitest-r38-final.json");
const evidencePath = path.join(ops, "rule-gate-r38/rule-test-evidence.json");
const beforeReplayPath = path.join(ops, "fresh-original-replay-r36-products.json");
const afterReplayPath = path.join(ops, "fresh-original-replay-r38-products-reclassified.json");
const invalidFreshOcrPath = path.join(ops, "fresh-original-replay-r38-products.json");
const singleProductPath = path.join(ops, "single-product-declaration-after-r37.json");
const parenthesizedUwPath = path.join(ops, "parenthesized-uw-after-r38.json");
const residualPath = path.join(ops, "residual-review-questions-r38.json");
const baseline = readJson(baselinePath);
const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath);
const beforeReplay = readJson(beforeReplayPath);
const afterReplay = readJson(afterReplayPath);
const invalidFreshOcr = readJson(invalidFreshOcrPath);
const singleProduct = readJson(singleProductPath);
const parenthesizedUw = readJson(parenthesizedUwPath);
const residual = readJson(residualPath);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 6 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v114" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v92", "rule_versions");
assert(evidence.passedKeys.length === 113 && Object.keys(evidence.ruleProofs).length === 113 && evidence.testExitCode === 0, "rule_cardinality");
for (const key of ["single-product-energy-declaration-infissi", "parenthesized-uw-certificate-classification"]) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
for (const replay of [beforeReplay, afterReplay]) {
  assert(replay.safety?.localOnly === true && replay.safety?.eneaAccessed === false && replay.safety?.crmAccessed === false && replay.safety?.externalActionAllowed === false, "replay_safety");
  assert(replay.manifestSha256 === "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0", "manifest_hash");
  assert(replay.sourceIntegrity?.documents === 359 && replay.sourceIntegrity?.hashMismatches === 0 && replay.summary?.casesWithAnalysisFailure === 0, "source_integrity");
}
assert(afterReplay.summary?.freshReady === 30 && afterReplay.summary?.freshOperatorRequired === 70, "candidate_replay_aggregate");
const beforeByKey = new Map(beforeReplay.cases.map((item) => [item.customerKey, item]));
const changed = afterReplay.cases.filter((item) => {
  const before = beforeByKey.get(item.customerKey);
  return !before || before.freshOutcome !== item.freshOutcome || JSON.stringify(before.freshBlockerKeys) !== JSON.stringify(item.freshBlockerKeys);
});
assert(JSON.stringify(changed.map((item) => item.customerKey).sort()) === JSON.stringify(["claudia-sellati", "gemma-minore"]), "unexpected_replay_delta");
const gemma = changed.find((item) => item.customerKey === "gemma-minore");
const sellati = changed.find((item) => item.customerKey === "claudia-sellati");
assert(gemma?.freshOutcome === "OPERATOR_REQUIRED_LOCAL" && JSON.stringify(gemma.freshBlockerKeys) === JSON.stringify(["co_beneficiary_invoice_identity_unresolved:beneficiary.coBeneficiary"]), "gemma_not_improved");
assert(sellati?.freshOutcome === "READY_LOCAL" && sellati.freshBlockerKeys.length === 0, "sellati_not_ready");
assert(singleProduct.resolution?.version === "apr-infissi-automatic-document-evidence-v4" && singleProduct.resolution?.status === "ready" && singleProduct.resolution?.evidence?.rows?.length === 1 && singleProduct.observation?.candidates?.[0]?.parser === "single-product-energy-declaration", "single_product_not_proved");
assert(parenthesizedUw.classification?.version === "apr-infissi-technical-document-classifier-v2" && parenthesizedUw.resolution?.version === "apr-infissi-automatic-document-evidence-v4" && parenthesizedUw.resolution?.status === "ready" && parenthesizedUw.resolution?.evidence?.rows?.length === 6, "parenthesized_uw_not_proved");
assert(residual.count === 24 && residual.cases.every((item) => item.classification && item.exactCause && item.operatorQuestion && "missingDocumentType" in item && item.onboardingGap), "residual_questions_incomplete");
assert(invalidFreshOcr.summary?.casesWithAnalysisFailure === 64, "invalid_ocr_attempt_not_recorded");

const staging = path.join(ops, "bundle-staging-r38");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["system-single-product-energy-declaration-infissi-v1", "system-parenthesized-uw-certificate-classification-v1", "single-product-energy-declaration", "parseFormalDopPositionBlocks", "apr-enea-rule-test-matrix-v92", "apr-infissi-automatic-document-evidence-v4", "apr-infissi-technical-document-classifier-v2"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-product-evidence-r38-preinstall-gate-v1",
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
  verifiedOriginalReplay: {
    status: "passed_reclassification_of_hash_verified_original_extractions",
    beforeSha256: sha256(beforeReplayPath),
    afterSha256: sha256(afterReplayPath),
    diagnosticSha256: { singleProduct: sha256(singleProductPath), parenthesizedUw: sha256(parenthesizedUwPath) },
    residualReviewSha256: sha256(residualPath),
    documents: afterReplay.sourceIntegrity.documents,
    bytes: afterReplay.sourceIntegrity.bytes,
    improvedCases: changed.map((item) => item.customerKey).sort(),
    unchangedCases: afterReplay.cases.length - changed.length,
    externalActionAllowed: false,
  },
  excludedInvalidFreshOcrAttempt: {
    status: "invalid_for_verdict_test_tool_limitation",
    reportSha256: sha256(invalidFreshOcrPath),
    casesWithAnalysisFailure: invalidFreshOcr.summary.casesWithAnalysisFailure,
    reason: "The current replay OCR binary cannot reopen a subset of valid encrypted/copy-disabled PDFs. This result is excluded from APR verdicts and installation evidence.",
  },
  stagedBundle,
  safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, saveAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r38.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, candidate: artifact.monotonicGate.candidate, rules: artifact.monotonicGate.rulesProved, replay: artifact.verifiedOriginalReplay, excludedInvalidFreshOcrAttempt: artifact.excludedInvalidFreshOcrAttempt, stagedBundle }, null, 2)}\n`);
