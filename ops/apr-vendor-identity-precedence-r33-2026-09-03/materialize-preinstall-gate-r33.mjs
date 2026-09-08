import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-vendor-identity-precedence-r33-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r33_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(root, "ops/apr-overnight-review-2026-09-03/full-vitest-post-date.json");
const candidatePath = path.join(ops, "full-vitest-r33.json");
const evidencePath = path.join(ops, "rule-gate-r33/rule-test-evidence.json");
const replayPath = path.join(ops, "replay-evidence.json");
const scanPath = path.join(ops, "wide100-identity-discrepancy-scan.json");
const baseline = readJson(baselinePath); const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath); const replay = readJson(replayPath); const scan = readJson(scanPath);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v109" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v87", "rule_versions");
assert(evidence.passedKeys.length === 108 && Object.keys(evidence.ruleProofs).length === 108 && evidence.testExitCode === 0, "rule_cardinality");
for (const key of ["official-identity-over-manual-crm", "permanent-supplier-automation-exclusion"]) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
const montemorra = replay.cases.find((item) => item.customerKey === "massimiliano-montemorra");
const formisano = replay.cases.find((item) => item.customerKey === "antonino-formisabo");
assert(replay.localOnly === true && montemorra?.outcome === "blocked_case", "montemorra_outcome");
assert(montemorra.productsProcessed === 0 && montemorra.financialEvidenceProcessed === 0 && montemorra.blockers?.[0]?.code === "permanent_supplier_automation_exclusion", "montemorra_preprocessing_gate");
assert(formisano?.primaryBeneficiaryResolution?.identity?.surname === "Formisano" && formisano.primaryBeneficiaryResolution.authority === "official_identity_document", "formisano_document_identity");
assert(scan.manifestCaseCount === 100 && scan.verifiedDiscrepancyCount === 3, "wide100_scan");
assert(scan.cases.some((item) => item.customerKey === "antonino-formisabo" && item.documentaryIdentity?.surname === "Formisano"), "scan_formisano");

const staging = path.join(ops, "bundle-staging-r33");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["user-2026-09-03-official-identity-over-manual-crm-v1", "erre-emme-rm-legno", "permanent_supplier_automation_exclusion"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-vendor-identity-r33-preinstall-gate-v1", attestedAt: new Date().toISOString(), status: "tested_not_deployed",
  monotonicGate: {
    baseline: { suites: baseline.numTotalTestSuites, tests: baseline.numTotalTests, reportSha256: sha256(baselinePath) },
    candidate: { suites: candidate.numTotalTestSuites, tests: candidate.numTotalTests, reportSha256: sha256(candidatePath) },
    registryVersion: evidence.registryVersion, matrixVersion: evidence.matrixVersion, rulesProved: evidence.passedKeys.length, ruleEvidenceSha256: sha256(evidencePath),
  },
  localReplay: { status: "passed", replaySha256: sha256(replayPath), identityScanSha256: sha256(scanPath), externalActionAllowed: false },
  stagedBundle,
  safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r33.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, candidate: artifact.monotonicGate.candidate, rules: artifact.monotonicGate.rulesProved, stagedBundle }, null, 2)}\n`);
