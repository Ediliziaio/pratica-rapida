import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const repository = process.cwd();
const ops = path.join(repository, "ops/apr-wide100-financial-parser-r30-2026-09-02");
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const current = path.join(runtimeRoot, "canonical-bundle/current");
const keepaliveRoot = path.join(runtimeRoot, "keepalive/immortal-enea-session");
const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r30_install_attestation_failed:${reason}`); };

const preinstallPath = path.join(ops, "financial-parser-preinstall-gate-attestation-r30.json");
const receiptPath = path.join(ops, "financial-parser-bundle-install-receipt-r30.json");
const activationPath = path.join(ops, "rule-gate-r30/rule-activation/checkpoint.json");
const preinstall = readJson(preinstallPath);
const receipt = readJson(receiptPath);
const activation = readJson(activationPath);
assert(preinstall.status === "tested_not_deployed", "preinstall");
assert(receipt.status === "bundle_promoted_pending_runtime_gate", "bundle_receipt");
assert(activation.status === "active_tested_deployed" && activation.deploymentMatches === true && activation.matrixRules === 97, "activation");
assert(readlinkSync(current) === "versions/68e367e2-rotated-fiscal-bank-layouts-r30-20260902", "current_pointer");
for (const [name, digest] of Object.entries(preinstall.stagedBundle)) assert(sha256(path.join(current, name)) === digest, `active_hash:${name}`);

const launchctl = execFileSync("launchctl", ["print", "gui/501/com.praticarapida.apr-enea-immortal-keepalive"], { encoding: "utf8" });
assert(/state = running/.test(launchctl) && /pid = 35873/.test(launchctl), "keepalive_launchctl");
const processes = execFileSync("ps", ["-p", "35873,3785", "-o", "pid=,command="], { encoding: "utf8" });
assert(processes.includes("35873") && processes.includes("apr-enea-worker.mjs serve"), "keepalive_process");
assert(processes.includes("3785") && processes.includes("remote-debugging-port=9331"), "chrome_process");

const service = readJson(path.join(keepaliveRoot, "enea-browser-worker/service.json"));
const driver = readJson(path.join(keepaliveRoot, "enea-browser-worker/cdp-driver.json"));
const serverProof = readJson(path.join(keepaliveRoot, "enea-browser-worker/server-readonly-proof.json"));
assert(service.status === "setup_ready" && service.processPid === 35873, "service_checkpoint");
assert(service.forbiddenActionCount === 0 && service.previewAttemptCount === 0 && service.submitAttemptCount === 0 && service.communicationAttemptCount === 0, "forbidden_actions");
assert(driver.contract?.ready === true && driver.contract?.operationalUrl === "https://bonusfiscali.enea.it/dashboard", "driver_dashboard");
assert(Date.now() - Date.parse(service.heartbeatAt) < 60_000 && Date.now() - Date.parse(serverProof.observedAt) < 60_000, "stale_persistent_proof");
const targets = await fetch("http://127.0.0.1:9331/json/list").then((response) => { if (!response.ok) throw new Error(`cdp_http_${response.status}`); return response.json(); });
const dashboard = targets.find((target) => target.type === "page" && target.id === driver.activeTargetId);
assert(dashboard?.url === "https://bonusfiscali.enea.it/dashboard" && dashboard?.title === "Bonus Fiscali - ENEA", "cdp_dashboard");

const artifact = {
  version: "apr-financial-parser-r30-install-attestation-v1",
  attestedAt: new Date().toISOString(),
  status: "active_tested_deployed",
  preinstallGateSha256: sha256(preinstallPath),
  bundleInstallReceiptSha256: sha256(receiptPath),
  ruleActivationCheckpointSha256: sha256(activationPath),
  bundleVersion: "68e367e2-rotated-fiscal-bank-layouts-r30-20260902",
  installedBundle: preinstall.stagedBundle,
  ruleGate: { registryVersion: "enea-operational-registry-v104", matrixVersion: "apr-enea-rule-test-matrix-v82", matrixRules: 97, deploymentMatches: true },
  continuityAfterInstall: {
    keepaliveLabel: "com.praticarapida.apr-enea-immortal-keepalive",
    keepalivePid: 35873,
    chromePid: 3785,
    chromeTargetId: dashboard.id,
    operationalUrl: dashboard.url,
    serviceHeartbeatAt: service.heartbeatAt,
    serverReadonlyProofObservedAt: serverProof.observedAt,
    forbiddenActionCount: service.forbiddenActionCount,
    previewAttemptCount: service.previewAttemptCount,
    submitAttemptCount: service.submitAttemptCount,
    communicationAttemptCount: service.communicationAttemptCount,
  },
};
const target = path.join(ops, "financial-parser-install-attestation-r30.json");
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target, status: artifact.status, bundleVersion: artifact.bundleVersion }, null, 2)}\n`);
