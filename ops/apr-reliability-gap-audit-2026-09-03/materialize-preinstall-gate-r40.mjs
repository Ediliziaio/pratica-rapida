import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r40_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(ops, "full-vitest-r39-final.json");
const candidatePath = path.join(ops, "full-vitest-r40-final.json");
const evidencePath = path.join(ops, "rule-gate-r40/rule-test-evidence.json");
const beforeReplayPath = path.join(ops, "fresh-original-replay-r39-products.json");
const afterReplayPath = path.join(ops, "fresh-original-replay-r40c-products.json");
const diagnosticPath = path.join(ops, "rinaldi-internal-exclusion-diagnostic-r40.json");
const [baseline, candidate, evidence, beforeReplay, afterReplay, diagnostic] = [baselinePath, candidatePath, evidencePath, beforeReplayPath, afterReplayPath, diagnosticPath].map(readJson);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests + 10 && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v117" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v94", "rule_versions");
assert(evidence.passedKeys.length === 115 && Object.keys(evidence.ruleProofs).length === 115 && evidence.testExitCode === 0, "rule_cardinality");
for (const key of ["rinaldi-scoped", "permanent-internal-practice-exclusion", "permanent-supplier-automation-exclusion"]) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
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
assert(JSON.stringify(changed.map((item) => item.customerKey).sort()) === JSON.stringify(["giuseppe-d-adduzio", "prova-rivenditore-1-30-04"]), "unexpected_replay_delta");
for (const key of ["giuseppe-d-adduzio", "prova-rivenditore-1-30-04"]) {
  const item = changed.find((candidateItem) => candidateItem.customerKey === key);
  assert(item?.freshOutcome === "OPERATOR_REQUIRED_LOCAL" && item.freshBlockerKeys.length === 1 && item.freshBlockerKeys[0].startsWith("permanent_"), `exclusion_not_terminal:${key}`);
}
const claudiaCheckpoint = readJson(path.join(ops, "fresh-original-state-v2/035/claudia-campagna/product-gate-r40c/crm-local-preflight/checkpoint.json"));
const claudia = claudiaCheckpoint.items?.[0]?.report;
assert(claudia?.outcome === "ready_local_plan" && claudia.blockers?.length === 0, "claudia_not_ready");
assert(claudia.financial?.invoiceTotal === 2960 && claudia.financial?.eligibleExpense === 2276.06 && claudia.financial?.reconciledTotal === 2276.06, "claudia_amounts");
assert(claudia.financial?.methods?.length === 3 && claudia.financial.methods.every((method) => method.ok === true && method.total === 2276.06), "claudia_three_methods");
const diagnosticClaudia = diagnostic.rinaldi?.cases?.find((item) => item.customerKey === "claudia-campagna");
assert(diagnostic.rinaldi?.caseCount === 11 && diagnosticClaudia?.result?.total === 2276.06 && diagnosticClaudia?.result?.blockers?.length === 0, "rinaldi_diagnostic");

const staging = path.join(ops, "bundle-staging-r40");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["enea-operational-registry-v117", "apr-enea-rule-test-matrix-v94", "user-2026-08-14-rinaldi-explicit-deductible-total", "insieme_fatture_pratica_rinaldi", "user-2026-08-18-future-test-exclusions", "PROVA RIVENDITORE 1 30/04", "permanent_customer_automation_exclusion"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-rinaldi-practice-total-and-exclusions-r40-preinstall-gate-v1",
  attestedAt: new Date().toISOString(), status: "tested_not_deployed",
  monotonicGate: {
    baseline: { suites: baseline.numTotalTestSuites, tests: baseline.numTotalTests, reportSha256: sha256(baselinePath) },
    candidate: { suites: candidate.numTotalTestSuites, tests: candidate.numTotalTests, reportSha256: sha256(candidatePath) },
    registryVersion: evidence.registryVersion, matrixVersion: evidence.matrixVersion, rulesProved: evidence.passedKeys.length, ruleEvidenceSha256: sha256(evidencePath),
  },
  verifiedOriginalReplay: { status: "passed_local_replay_of_hash_verified_original_extractions", reportSha256: sha256(afterReplayPath), diagnosticSha256: sha256(diagnosticPath), documents: 359, bytes: afterReplay.sourceIntegrity.bytes, hashMismatches: 0, readyCases: 29, operatorRequiredCases: 71, changedCases: changed.map((item) => item.customerKey).sort(), externalActionAllowed: false },
  claudiaCampagna: { status: "ready_local_plan", invoiceGrossSum: 2960, rinaldiEligibleExpense: 2276.06, reconciliationMethods: 3 },
  exclusionClosure: { terminalCases: changed.map((item) => ({ customerKey: item.customerKey, blockerKeys: item.freshBlockerKeys })) },
  stagedBundle,
  safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, saveAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r40.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, monotonicGate: artifact.monotonicGate, replay: artifact.verifiedOriginalReplay, claudiaCampagna: artifact.claudiaCampagna, stagedBundle }, null, 2)}\n`);
