import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-vendor-identity-precedence-r34-2026-09-03");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r34_preinstall_gate_failed:${reason}`); };
const baselinePath = path.join(root, "ops/apr-vendor-identity-precedence-r33-2026-09-03/full-vitest-r33.json");
const candidatePath = path.join(ops, "full-vitest-r34-final.json");
const evidencePath = path.join(ops, "rule-gate-r34/rule-test-evidence.json");
const replayPath = path.join(ops, "replay-evidence.json");
const demographicReplayPath = path.join(ops, "demographic-replay-evidence-r34.json");
const scanPath = path.join(ops, "wide100-identity-discrepancy-scan.json");
const baseline = readJson(baselinePath); const candidate = readJson(candidatePath);
const evidence = readJson(evidencePath); const replay = readJson(replayPath);
const demographicReplay = readJson(demographicReplayPath); const scan = readJson(scanPath);

assert(baseline.success === true && baseline.numFailedTests === 0, "baseline_not_green");
assert(candidate.success === true && candidate.numFailedTests === 0 && candidate.numFailedTestSuites === 0, "candidate_not_green");
assert(candidate.numPassedTests === candidate.numTotalTests && candidate.numPassedTestSuites === candidate.numTotalTestSuites, "candidate_incomplete");
assert(candidate.numTotalTests >= baseline.numTotalTests && candidate.numTotalTestSuites >= baseline.numTotalTestSuites, "non_monotonic_cardinality");
assert(evidence.registryVersion === "enea-operational-registry-v110" && evidence.matrixVersion === "apr-enea-rule-test-matrix-v88", "rule_versions");
assert(evidence.passedKeys.length === 108 && Object.keys(evidence.ruleProofs).length === 108 && evidence.testExitCode === 0, "rule_cardinality");
for (const key of ["official-identity-over-manual-crm", "permanent-supplier-automation-exclusion"]) {
  assert(evidence.passedKeys.includes(key), `rule_missing:${key}`);
  assert(evidence.ruleProofs[key]?.positiveTest && evidence.ruleProofs[key]?.negativeTest, `rule_proofs:${key}`);
}
const montemorra = replay.cases.find((item) => item.customerKey === "massimiliano-montemorra");
const formisano = replay.cases.find((item) => item.customerKey === "antonino-formisabo");
assert(replay.localOnly === true && montemorra?.outcome === "blocked_case", "montemorra_outcome");
assert(montemorra.productsProcessed === 0 && montemorra.financialEvidenceProcessed === 0 && montemorra.blockers?.[0]?.code === "permanent_supplier_automation_exclusion", "montemorra_preprocessing_gate");
assert(formisano?.primaryBeneficiaryResolution?.identity?.surname === "Formisano" && formisano.primaryBeneficiaryResolution.identity.birthDate === "1966-09-27", "formisano_document_identity");
assert(scan.manifestCaseCount === 100 && scan.verifiedNameDiscrepancyCount === 3 && scan.otherDemographicDiscrepancyCount === 2, "wide100_scan");
const riccardo = demographicReplay.cases.find((item) => item.customerKey === "riccardo-coda");
const caterina = demographicReplay.cases.find((item) => item.customerKey === "caterina-claudia-garbato");
assert(demographicReplay.localOnly === true && riccardo?.primaryBeneficiaryResolution?.identity?.birthDate === "1950-01-30", "riccardo_birth_date");
assert(caterina?.primaryBeneficiaryResolution?.identity?.birthDate === "1971-09-04", "caterina_birth_date");
assert(riccardo.externalActionAllowed === false && caterina.externalActionAllowed === false, "replay_external_action");

const staging = path.join(ops, "bundle-staging-r34");
const files = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(files.map((name) => [name, sha256(path.join(staging, name))]));
const executable = ["apr-supervisor.mjs", "apr-enea-worker.mjs"].map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
for (const marker of ["user-2026-09-03-official-identity-over-manual-crm-v1", "permanent_supplier_automation_exclusion", "giorno, mese e sesso sono decodificati"]) assert(executable.includes(marker), `bundle_missing_marker:${marker}`);

const artifact = {
  version: "apr-vendor-identity-r34-preinstall-gate-v1", attestedAt: new Date().toISOString(), status: "tested_not_deployed",
  monotonicGate: {
    baseline: { suites: baseline.numTotalTestSuites, tests: baseline.numTotalTests, reportSha256: sha256(baselinePath) },
    candidate: { suites: candidate.numTotalTestSuites, tests: candidate.numTotalTests, reportSha256: sha256(candidatePath) },
    registryVersion: evidence.registryVersion, matrixVersion: evidence.matrixVersion, rulesProved: evidence.passedKeys.length, ruleEvidenceSha256: sha256(evidencePath),
  },
  localReplay: { status: "passed", replaySha256: sha256(replayPath), demographicReplaySha256: sha256(demographicReplayPath), identityScanSha256: sha256(scanPath), externalActionAllowed: false },
  stagedBundle,
  safety: { localOnly: true, externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
};
const target = path.join(ops, "preinstall-gate-attestation-r34.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, candidate: artifact.monotonicGate.candidate, rules: artifact.monotonicGate.rulesProved, stagedBundle }, null, 2)}\n`);
