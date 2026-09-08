import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ops = path.join(root, "ops/apr-wide100-financial-parser-r30-2026-09-02");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r30_preinstall_gate_failed:${reason}`); };

const r29ReportPath = path.join(root, "ops/apr-wide100-financial-parser-r29-2026-09-02/full-vitest-final-r29.json");
const r30ReportPath = path.join(ops, "full-vitest-r30.json");
const ruleEvidencePath = path.join(ops, "rule-gate-r30/rule-test-evidence.json");
const replayPath = path.join(ops, "replay-current-two-r30.json");
const r29 = readJson(r29ReportPath);
const r30 = readJson(r30ReportPath);
const ruleEvidence = readJson(ruleEvidencePath);
const replay = readJson(replayPath);

assert(r29.success === true && r29.numFailedTests === 0 && r29.numFailedTestSuites === 0, "r29_baseline_not_green");
assert(r30.success === true && r30.numFailedTests === 0 && r30.numFailedTestSuites === 0, "r30_suite_not_green");
assert(r30.numPassedTests === r30.numTotalTests && r30.numPassedTestSuites === r30.numTotalTestSuites, "r30_suite_incomplete");
assert(r30.numTotalTests >= r29.numTotalTests && r30.numTotalTestSuites >= r29.numTotalTestSuites, "non_monotonic_test_cardinality");
assert(ruleEvidence.registryVersion === "enea-operational-registry-v104", "registry_version");
assert(ruleEvidence.matrixVersion === "apr-enea-rule-test-matrix-v82", "matrix_version");
assert(ruleEvidence.passedKeys.length === 97 && Object.keys(ruleEvidence.ruleProofs).length === 97, "rule_cardinality");
for (const key of ["rotated-ocr-fiscal-reading-order", "multipage-bank-receipt-label-reconciliation"]) {
  assert(ruleEvidence.passedKeys.includes(key), `missing_rule:${key}`);
  assert(ruleEvidence.ruleProofs[key]?.positiveTest && ruleEvidence.ruleProofs[key]?.negativeTest, `missing_rule_proofs:${key}`);
}

const expectedReplay = new Map([
  ["giovanna-atzeni", { eligibleExpense: 7900, invoiceTotal: 7900, bankPrincipal: 7900 }],
  ["elena-marcella-berti", { eligibleExpense: 1320, invoiceTotal: 1320, bankPrincipal: 1320 }],
]);
assert(replay.results.length === expectedReplay.size, "replay_cardinality");
for (const result of replay.results) {
  const expected = expectedReplay.get(result.customerKey);
  assert(expected, `unexpected_replay_case:${result.customerKey}`);
  assert(result.outcome === "RESOLVED", `replay_not_resolved:${result.customerKey}`);
  assert(result.eligibleExpense === expected.eligibleExpense, `eligible_expense:${result.customerKey}`);
  assert(result.invoiceReconciliation?.usable === true && result.invoiceReconciliation?.total === expected.invoiceTotal && result.invoiceReconciliation?.blockers?.length === 0, `invoice_reconciliation:${result.customerKey}`);
  assert(result.bankTransferReconciliation?.status === "reconciled" && result.bankTransferReconciliation?.principalTotal === expected.bankPrincipal && result.bankTransferReconciliation?.difference === 0, `bank_reconciliation:${result.customerKey}`);
}

const staging = path.join(ops, "bundle-staging-r30");
const bundleFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const stagedBundle = Object.fromEntries(bundleFiles.map((name) => [name, sha256(path.join(staging, name))]));
const executable = bundleFiles.slice(0, 3).map((name) => readFileSync(path.join(staging, name), "utf8")).join("\n");
assert(executable.includes("system-rotated-ocr-fiscal-reading-order-v1"), "bundle_missing_rotated_rule");
assert(executable.includes("system-multipage-bank-receipt-label-reconciliation-v1"), "bundle_missing_bank_rule");
assert(executable.includes("invoice-parser-v38-rotated-fiscal-bank-layouts-r30"), "bundle_missing_parser_revision");

const artifact = {
  version: "apr-financial-parser-r30-preinstall-gate-attestation-v1",
  attestedAt: new Date().toISOString(),
  status: "tested_not_deployed",
  diagnosis: {
    r29Applied: true,
    originalMultiInvoiceSegmentationFixed: true,
    additionalDefects: [
      "macos_vision_ocr_180_semantic_reading_order_reversed",
      "staggered_vat_row_explicit_separator_rejected",
      "multipage_heterogeneous_bank_receipts_fused",
    ],
  },
  monotonicGate: {
    baseline: { suites: r29.numTotalTestSuites, tests: r29.numTotalTests, reportSha256: sha256(r29ReportPath) },
    candidate: { suites: r30.numTotalTestSuites, tests: r30.numTotalTests, reportSha256: sha256(r30ReportPath) },
    registryVersion: ruleEvidence.registryVersion,
    matrixVersion: ruleEvidence.matrixVersion,
    rulesProved: ruleEvidence.passedKeys.length,
    ruleEvidenceSha256: sha256(ruleEvidencePath),
  },
  operationalReadOnlyReplay: {
    status: "passed",
    artifactSha256: sha256(replayPath),
    cases: replay.results.map((result) => ({
      customerKey: result.customerKey,
      outcome: result.outcome,
      eligibleExpense: result.eligibleExpense,
      invoiceTotal: result.invoiceReconciliation.total,
      bankPrincipalTotal: result.bankTransferReconciliation.principalTotal,
      difference: result.bankTransferReconciliation.difference,
    })),
  },
  stagedBundle,
  safety: { draftOnly: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
};

const target = path.join(ops, "financial-parser-preinstall-gate-attestation-r30.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, tests: artifact.monotonicGate.candidate.tests, rules: artifact.monotonicGate.rulesProved }, null, 2)}\n`);
