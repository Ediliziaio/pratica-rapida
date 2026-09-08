import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "ops/apr-reliability-gap-audit-2026-09-03");
const sha256 = (name) => createHash("sha256").update(readFileSync(path.join(directory, name))).digest("hex");
const readJson = (name) => JSON.parse(readFileSync(path.join(directory, name), "utf8"));
const suite = readJson("full-vitest-r39-final.json");
const gate = readJson("preinstall-gate-attestation-r39.json");
const receipt = readJson("bundle-install-receipt-r39.json");
const postinstall = readJson("postinstall-attestation-r39.json");
const residual = readJson("residual-review-questions-r39.json");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r39_final_attestation_failed:${reason}`); };

assert(suite.success === true && suite.numFailedTests === 0 && suite.numPassedTests === 1708, "suite");
assert(gate.status === "tested_not_deployed" && gate.monotonicGate.rulesProved === 114, "preinstall_gate");
assert(receipt.status === "bundle_promoted_local_gate_verified" && receipt.versionId === "6481c58d-technical-source-binding-r39-20260903", "installation");
assert(postinstall.status === "installed_selected_session_preserved_operational_replay_pending", "postinstall");
assert(postinstall.tripleVerification.launchctlAndProcesses.state === "running" && postinstall.tripleVerification.persistentCheckpointAndJournal.status === "setup_ready", "continuity");
assert(Object.values(postinstall.safety).every((value) => value === false), "external_actions");
assert(residual.count === 29 && residual.cases.every((item) => item.classification && item.exactCause && item.operatorQuestion && "missingDocumentType" in item && item.onboardingGap), "residual_questions");

const artifact = {
  version: "apr-reliability-audit-r39-final-attestation-v1",
  attestedAt: new Date().toISOString(),
  status: "local_audit_complete_bundle_installed_operational_replay_not_performed",
  bundleVersionId: receipt.versionId,
  localEvidence: { suites: 444, tests: 1708, failedTests: 0, rulesProved: 114, originalDocuments: 359, readyLocal: 29, operatorRequiredLocal: 71 },
  hashes: {
    report: sha256("reliability-audit.md"),
    suite: sha256("full-vitest-r39-final.json"),
    preinstallGate: sha256("preinstall-gate-attestation-r39.json"),
    installReceipt: sha256("bundle-install-receipt-r39.json"),
    postinstall: sha256("postinstall-attestation-r39.json"),
    replay: sha256("fresh-original-replay-r39-products.json"),
    diagnostic: sha256("technical-source-binding-diagnostic-r39.json"),
    residualQuestions: sha256("residual-review-questions-r39.json"),
  },
  pendingDecisions: ["claudia-campagna-economic-precedence", "flavia-cipriani-commessa-fornitura-link", "prova-rivenditore-1-30-04-exclusion"],
  safety: { localOnly: true, eneaOperationalReplayPerformed: false, eneaMutationPerformed: false, previewPerformed: false, savePerformed: false, submitPerformed: false, communicationPerformed: false },
};
const target = path.join(directory, "final-attestation-r39.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, ...artifact }, null, 2)}\n`);
