import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { buildCrmLocalPreflightReport, RESOLVED_NON_ECONOMIC_TOTAL_BLOCKER_RETIREMENT_RULE_ID } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

const stateDir = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-3044-global-controller-maurizia-coreggioli";
const customerKey = "maurizia-coreggioli";
const manifestCase = resolveCurrentCohortManifestCase(stateDir, customerKey);
const dossier = JSON.parse(readFileSync(manifestCase.evidence.dossierPath, "utf8"));
const analysis = JSON.parse(readFileSync(manifestCase.evidence.analysisCheckpoint, "utf8"));
const beforeCheckpoint = JSON.parse(readFileSync(`${stateDir}/crm-local-preflight/checkpoint.json`, "utf8"));
const before = beforeCheckpoint.items.find((item: { customerKey?: string }) => item.customerKey === customerKey)?.report;
if (!before) throw new Error("apr_r31_maurizia_before_report_missing");

const after = buildCrmLocalPreflightReport(dossier, customerKey, analysis, new Date("2026-09-02T20:30:00Z"));
const genericCode = "invoice_929a8665";
const warning = after.warnings.find((item) => item.code === "resolved_non_economic_total_blocker_retired");
const assert = (condition: unknown, reason: string) => { if (!condition) throw new Error(`apr_r31_maurizia_replay_failed:${reason}`); };

assert(before.financial?.invoiceTotal === 5_000, "before_invoice_total");
assert(before.financial?.tripleReconciliationVerified === true, "before_reconciliation");
assert(before.blockers?.some((item: { code?: string }) => item.code === genericCode), "before_contradiction_missing");
assert(after.financial.invoiceTotal === 5_000 && after.financial.reconciledTotal === 5_000, "after_total");
assert(after.financial.tripleReconciliationVerified === true, "after_reconciliation");
assert(after.financial.methods.length === 3 && after.financial.methods.every((method) => method.ok && method.total === 5_000), "after_methods");
assert(after.financial.evidence.some((item) => item.kind === "non_economic" && item.grossTotal === 0), "after_zero_reversal");
assert(!after.blockers.some((item) => item.code === genericCode), "after_contradiction_persisted");
assert(warning?.appliedRuleIds.includes(RESOLVED_NON_ECONOMIC_TOTAL_BLOCKER_RETIREMENT_RULE_ID), "after_audit_warning");

const artifact = {
  version: "apr-r31-maurizia-local-readonly-replay-v1",
  generatedAt: new Date().toISOString(),
  source: {
    customerKey,
    practiceId: manifestCase.practiceId,
    dossierPath: manifestCase.evidence.dossierPath,
    analysisCheckpoint: manifestCase.evidence.analysisCheckpoint,
    sourceFingerprint: createHash("sha256").update(JSON.stringify(manifestCase.evidence.sourceSha256)).digest("hex"),
  },
  before: {
    invoiceTotal: before.financial.invoiceTotal,
    reconciledTotal: before.financial.reconciledTotal,
    tripleReconciliationVerified: before.financial.tripleReconciliationVerified,
    blockerCodes: before.blockers.map((item: { code: string }) => item.code),
  },
  after: {
    invoiceTotal: after.financial.invoiceTotal,
    reconciledTotal: after.financial.reconciledTotal,
    tripleReconciliationVerified: after.financial.tripleReconciliationVerified,
    methods: after.financial.methods,
    nonEconomicEvidence: after.financial.evidence.filter((item) => item.kind === "non_economic"),
    blockerCodes: after.blockers.map((item) => item.code),
    warning,
  },
  result: "PASS",
  safety: { localReadOnlyReplay: true, externalActionAllowed: false },
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], serialized, "utf8");
process.stdout.write(serialized);
