import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprChromeRuntime } from "../../scripts/enea-shadow-runner/cdpClient";
import { CdpEneaBrowserDriver } from "../../scripts/enea-shadow-runner/cdpEneaBrowserDriver";
import { PersistentAprEneaGlobalBrowserController } from "../../scripts/enea-shadow-runner/aprEneaGlobalBrowserController";
import { verifyAprRuleGovernanceAdmission } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";

const repositoryRoot = process.cwd();
const outputRoot = path.join(repositoryRoot, "ops/apr-workable76-r111-2026-09-11/runtime-readonly-preflight");
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const bundleRoot = path.join(runtimeRoot, "canonical-bundle/current");
const workerPath = path.join(bundleRoot, "apr-enea-worker.mjs");
const configPath = path.join(runtimeRoot, "state/enea-browser-worker/config.json");
const expectedWorkerSha256 = "b0616c276e002c62d5edaad1d97c53ca211e1ffb1273d026254521b5229faebc";
const requiredRuleIds = [
  "system-preflight-upstream-terminal-propagation-v1",
  "user-2026-09-10-explicit-invoice-product-evidence-recovery-v1",
  "system-invoice-multi-document-fiscal-segmentation-v2",
  "user-2026-09-10-infissi-invoice-authoritative-shading-closures-v1",
  "user-2026-09-10-zanzariera-infissi-installation-context-v1",
  "user-2026-09-10-infissi-tabular-abbreviated-thermal-evidence-v1",
  "user-2026-09-10-ideal-sistem-manual-exclusion-v1",
  "user-2026-09-11-invoice-final-printed-total-runtime-authority-v1",
  "user-2026-09-11-advance-balance-fiscal-invoice-equivalence-v1",
  "user-2026-09-11-invoice-slot-content-authority-v1",
  "user-2026-09-11-screening-measurements-in-line-description-v1",
  "user-2026-09-11-infissi-explicit-line-quantity-cardinality-v1",
  "user-2026-09-11-cassonetto-excluded-from-enea-products-v1",
  "user-2026-09-11-zanzariera-first-window-allocation-v1",
  "user-2026-09-11-reseller-form-completion-date-over-invoice-v1",
];

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const atomicJson = (target: string, value: unknown) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
};

const workerBytes = readFileSync(workerPath);
const workerSha256 = sha256(workerBytes);
if (workerSha256 !== expectedWorkerSha256) throw new Error(`runtime_worker_hash_mismatch:${workerSha256}`);
const workerSource = workerBytes.toString("utf8");
const missingRuleIds = requiredRuleIds.filter((ruleId) => !workerSource.includes(ruleId));
if (missingRuleIds.length) throw new Error(`runtime_worker_rules_missing:${missingRuleIds.join(",")}`);

const governance = verifyAprRuleGovernanceAdmission({ executablePath: workerPath });
if (governance.status !== "admitted") throw new Error(`runtime_governance_not_admitted:${governance.failures.join(",")}`);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const runtime = new PersistentAprChromeRuntime({
  chromeExecutable: config.chromeExecutable,
  profileDirectory: config.profileDirectory,
  remoteDebuggingPort: config.remoteDebuggingPort,
  headless: false,
  initialUrl: config.dashboardUrl,
});
const controller = new PersistentAprEneaGlobalBrowserController({
  profileDirectory: config.profileDirectory,
  remoteDebuggingPort: config.remoteDebuggingPort,
});
const ownerId = `apr-r111-runtime-readonly-preflight-${process.pid}`;
const access = controller.tryAcquire({
  ownerId,
  cohortRoot: outputRoot,
  purpose: "diagnostic_readonly",
  accessMode: "readonly",
  processPid: process.pid,
});
if (!access) throw new Error("runtime_browser_controller_busy");

try {
  const browser = await runtime.ensureRunning();
  const capability = controller.createCapability(access);
  const driver = new CdpEneaBrowserDriver(outputRoot, runtime, {
    accessCapability: capability,
    allowedOrigin: config.allowedOrigin,
    dashboardUrl: config.dashboardUrl,
  });
  const session = await driver.verifySession();
  controller.recordKeepalive(access, session.evidenceId);
  const result = {
    version: "apr-r111-runtime-readonly-preflight-v1",
    checkedAt: new Date().toISOString(),
    status: session.authenticated && !session.serverLogoutProven ? "PASS" : "LOGIN_REQUIRED",
    safety: {
      accessMode: access.accessMode,
      purpose: access.purpose,
      portalMethodsAllowed: ["GET", "HEAD"],
      mutationAllowed: false,
      previewAllowed: false,
      submitAllowed: false,
      communicationsAllowed: false,
    },
    runtimeBundle: {
      canonicalDirectory: realpathSync(bundleRoot),
      workerPath: realpathSync(workerPath),
      workerSha256,
      expectedWorkerSha256,
      governanceStatus: governance.status,
      governanceAttestationPath: governance.attestationPath,
      governanceAttestationSha256: governance.attestationSha256,
      requiredRuleIds,
      missingRuleIds,
    },
    browser: {
      pid: browser.pid,
      profileFingerprint: runtime.profileFingerprint,
      remoteDebuggingPort: config.remoteDebuggingPort,
    },
    session: {
      authenticated: session.authenticated,
      serverLogoutProven: session.serverLogoutProven,
      evidenceId: session.evidenceId,
      url: session.url,
      at: session.at,
    },
  };
  atomicJson(path.join(outputRoot, "preflight.json"), result);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 2;
} finally {
  runtime.closeAllPageClients();
  try { controller.release(access); } catch { /* lease eventualmente scaduta: il fencing impedisce riuso */ }
}
