import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const repository = process.cwd();
const ops = path.join(repository, "ops/apr-wide100-financial-parser-r31-2026-09-02");
const runtime = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const canonical = path.join(runtime, "canonical-bundle");
const expectedVersion = path.join(canonical, "versions/5156569e-resolved-non-economic-blocker-r31-20260902");
const cohort = path.join(runtime, "cohorts/apr-pilot-3046-global-controller-maurizia-coreggioli");
const run = path.join(runtime, "runs/apr-financial-parser-r31-maurizia-replay-v3");
const keepaliveRoot = path.join(runtime, "keepalive/immortal-enea-session/enea-browser-worker");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r31_install_gate_failed:${reason}`); };
const current = path.join(canonical, "current");
assert(existsSync(current) && lstatSync(current).isSymbolicLink() && path.resolve(canonical, readlinkSync(current)) === expectedVersion, "canonical_pointer");
const receipt = readJson(path.join(ops, "financial-parser-bundle-install-receipt-r31.json"));
for (const [name, hash] of Object.entries(receipt.installedBundle)) assert(sha256(path.join(current, name)) === hash, `active_hash:${name}`);

const checkpoint = readJson(path.join(run, "checkpoint.json"));
const report = readJson(path.join(run, "report.json"));
const preflight = readJson(path.join(cohort, "crm-local-preflight/checkpoint.json"));
const dashboard = readJson(path.join(cohort, "dashboard/status.json"));
const item = preflight.items.find((candidate) => candidate.customerKey === "maurizia-coreggioli");
assert(checkpoint.status === "completed" && checkpoint.results.length === 1 && checkpoint.results[0].state === "operator_required", "sequencer_checkpoint");
assert(report.status === "completed" && report.processed === 1 && report.operatorRequired === 1 && report.technicalBlock === 0 && report.inconsistent === 0, "sequencer_report");
assert(dashboard.state === "OPERATOR_REQUIRED" && dashboard.statusSource === "sequencer_finalizer", "dashboard_truth");
assert(item?.state === "blocked_case" && item.report.financial.invoiceTotal === 5_000 && item.report.financial.reconciledTotal === 5_000 && item.report.financial.tripleReconciliationVerified === true, "case_financial_truth");
assert(item.report.financial.methods.length === 3 && item.report.financial.methods.every((method) => method.ok && method.total === 5_000), "case_triple_methods");
assert(!item.report.blockers.some((blocker) => blocker.code === "invoice_929a8665"), "contradictory_blocker_persisted");
assert(item.report.warnings.some((warning) => warning.code === "resolved_non_economic_total_blocker_retired" && warning.appliedRuleIds.includes("system-resolved-non-economic-total-blocker-retirement-v1")), "retirement_audit_missing");

const keepalive = readJson(path.join(keepaliveRoot, "service.json"));
const serverProof = readJson(path.join(keepaliveRoot, "server-readonly-proof.json"));
process.kill(keepalive.processPid, 0);
process.kill(keepalive.chromePid, 0);
assert(keepalive.forbiddenActionCount === 0 && keepalive.previewAttemptCount === 0 && keepalive.submitAttemptCount === 0 && keepalive.communicationAttemptCount === 0, "keepalive_forbidden_counts");
assert(serverProof.evidence.operationalUrl === "https://bonusfiscali.enea.it/dashboard" && serverProof.evidence.forbiddenActionCount === 0, "server_readonly_proof");

const artifact = {
  version: "apr-financial-parser-r31-install-attestation-v1",
  attestedAt: new Date().toISOString(), status: "installed_and_operationally_verified",
  bundle: { versionId: receipt.versionId, currentTarget: expectedVersion, hashes: receipt.installedBundle },
  monotonicGate: readJson(path.join(ops, "financial-parser-preinstall-gate-attestation-r31.json")).monotonicGate,
  operationalReplay: {
    customerKey: "maurizia-coreggioli", cohort: 3046, publicState: dashboard.state,
    invoiceTotal: item.report.financial.invoiceTotal, reconciledTotal: item.report.financial.reconciledTotal,
    tripleReconciliationVerified: item.report.financial.tripleReconciliationVerified,
    blockerCodes: item.report.blockers.map((blocker) => blocker.code),
    retiredBlocker: "invoice_929a8665", warningCode: "resolved_non_economic_total_blocker_retired",
    reportSha256: sha256(path.join(run, "report.json")), checkpointSha256: sha256(path.join(run, "checkpoint.json")), dashboardSha256: sha256(path.join(cohort, "dashboard/status.json")),
  },
  continuity: {
    keepalivePid: keepalive.processPid, chromePid: keepalive.chromePid, heartbeatAt: keepalive.heartbeatAt,
    serverProofObservedAt: serverProof.observedAt, operationalUrl: serverProof.evidence.operationalUrl,
    keepaliveRestarted: false, chromeRestarted: false,
  },
  safety: report.safety,
};
const target = path.join(ops, "financial-parser-install-attestation-r31.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, replay: artifact.operationalReplay, continuity: artifact.continuity }, null, 2)}\n`);
