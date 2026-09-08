import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r39_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r38-final.json");
const candidatePath = path.join(ops, "full-vitest-r39-final.json");
const evidencePath = path.join(ops, "rule-gate-r39/rule-test-evidence.json");
const beforeReplayPath = path.join(ops, "fresh-original-replay-r36-products.json");
const afterReplayPath = path.join(ops, "fresh-original-replay-r39-products.json");
const diagnosticPath = path.join(ops, "technical-source-binding-diagnostic-r39.json");
const residualPath = path.join(ops, "residual-review-questions-r39.json");
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
assert(candidate.numTotalTests >= baseline.numTotalTests + 4 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v115" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v93", "rule_versions");
assert(evidence.passedKeys.length === 114 && Object.keys(evidence.ruleProofs).length === 114 && evidence.testExitCode === 0, "rule_cardinality");
assert(evidence.passedKeys.includes("technical-document-practice-binding"), "binding_rule_missing");
assert(evidence.ruleProofs["technical-document-practice-binding"]?.positiveTest && evidence.ruleProofs["technical-document-practice-binding"]?.negativeTest, "binding_rule_proofs");
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
const expectedChanged = ["antonino-formisabo", "antonio-scaparrotta", "claudia-sellati", "flavia-cipriani", "gemma-minore", "ivana-mastrangelo", "marco-de-marinis", "santo-giuga"];
assert(JSON.stringify(changed.map((item) => item.customerKey).sort()) === JSON.stringify(expectedChanged), "unexpected_replay_delta");
const sellati = changed.find((item) => item.customerKey === "claudia-sellati");
const flavia = changed.find((item) => item.customerKey === "flavia-cipriani");
const gemma = changed.find((item) => item.customerKey === "gemma-minore");
assert(sellati?.freshOutcome === "READY_LOCAL" && sellati.freshBlockerKeys.length === 0, "sellati_not_ready");
assert(flavia?.freshOutcome === "OPERATOR_REQUIRED_LOCAL" && flavia.freshBlockerKeys.includes("infissi_technical_document_practice_binding_unverified:technical_dimensions"), "flavia_not_safely_closed");
assert(gemma?.freshOutcome === "OPERATOR_REQUIRED_LOCAL" && gemma.freshBlockerKeys.includes("infissi_technical_document_practice_binding_unverified:technical_dimensions"), "gemma_not_safely_closed");
assert(diagnostic.positive?.status === "ready" && diagnostic.positive?.binding?.customerMatched === true && diagnostic.positive?.binding?.orderOrJobReferencesPresent === true && diagnostic.positive?.binding?.productSignatureMatched === true, "positive_diagnostic");
assert(diagnostic.negativeWrongDossier?.status === "operator_required" && diagnostic.negativeWrongDossier?.binding?.customerMatched === false, "wrong_dossier_diagnostic");
assert(diagnostic.negativeUnlinkedReferences?.status === "operator_required" && diagnostic.negativeUnlinkedReferences?.corroboratingOriginalDocuments?.invoiceReferences?.[0] === "1394/2026" && diagnostic.negativeUnlinkedReferences?.corroboratingOriginalDocuments?.technicalSupplyReference === "1613/2026", "unlinked_reference_diagnostic");
assert(residual.count === 29 && residual.cases.every((item) => item.classification && item.exactCause && item.operatorQuestion && "missingDocumentType" in item && item.onboardingGap), "residual_questions_incomplete");

const staging = path.join(ops, "bundle-staging-r39");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["system-single-product-energy-declaration-infissi-v1", "system-parenthesized-uw-certificate-classification-v1", "user-2026-09-03-technical-document-practice-binding-v1", "infissi_technical_document_practice_binding_unverified", "apr-enea-rule-test-matrix-v93", "apr-infissi-automatic-document-evidence-v5"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-technical-source-binding-r39-preinstall-gate-v1",
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
    status: "passed_local_replay_of_hash_verified_original_extractions",
    beforeSha256: sha256(beforeReplayPath),
    afterSha256: sha256(afterReplayPath),
    diagnosticSha256: sha256(diagnosticPath),
    residualReviewSha256: sha256(residualPath),
    documents: afterReplay.sourceIntegrity.documents,
    bytes: afterReplay.sourceIntegrity.bytes,
    changedCases: expectedChanged,
    readyCases: afterReplay.summary.freshReady,
    operatorRequiredCases: afterReplay.summary.freshOperatorRequired,
    externalActionAllowed: false,
  },
  safetyClosure: {
    customerKey: "flavia-cipriani",
    classification: "documentary_link_ambiguous_fail_closed",
    exactCause: diagnostic.negativeUnlinkedReferences.exactCause,
    operatorQuestion: diagnostic.negativeUnlinkedReferences.operatorQuestion,
  },
  stagedBundle,
  safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, saveAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r39.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, candidate: artifact.monotonicGate.candidate, rules: artifact.monotonicGate.rulesProved, replay: artifact.verifiedOriginalReplay, safetyClosure: artifact.safetyClosure, stagedBundle }, null, 2)}\n`);
