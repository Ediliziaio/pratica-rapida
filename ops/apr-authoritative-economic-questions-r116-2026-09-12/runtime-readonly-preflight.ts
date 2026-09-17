import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprChromeRuntime } from "../../scripts/enea-shadow-runner/cdpClient";
import { CdpEneaBrowserDriver } from "../../scripts/enea-shadow-runner/cdpEneaBrowserDriver";
import { PersistentAprEneaGlobalBrowserController } from "../../scripts/enea-shadow-runner/aprEneaGlobalBrowserController";
import { verifyAprRuleGovernanceAdmission } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

const repositoryRoot = process.cwd();
const outputRoot = path.join(repositoryRoot, "ops/apr-authoritative-economic-questions-r116-2026-09-12/runtime-readonly-preflight");
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const bundleRoot = path.join(runtimeRoot, "canonical-bundle/current");
const workerPath = path.join(bundleRoot, "apr-enea-worker.mjs");
const configPath = path.join(runtimeRoot, "state/enea-browser-worker/config.json");
const expectedWorkerSha256 = "75c629d7e69dd934a10c5d196b2a8e99a39a3709ed7ada2dea8e4766c0785a82";
const requiredRuleIds = [
  USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource,
  USER_AUTHORIZED_RULE_IDS.bankTransferReceiptNeverInvoice,
  USER_AUTHORIZED_RULE_IDS.partialInvoiceTotalsDoNotBlock,
  USER_AUTHORIZED_RULE_IDS.infissiBlockerQuestionPersistence,
  USER_AUTHORIZED_RULE_IDS.missingMeasurementNullPayload,
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

const crm = new PersistentAprCrmAuth(path.join(runtimeRoot, "state"));
await crm.maintainSession();
const crmState = crm.snapshot();
if (crmState.status !== "authenticated") throw new Error(`runtime_crm_not_authenticated:${crmState.status}:${crmState.reason}`);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const runtime = new PersistentAprChromeRuntime({
  chromeExecutable: config.chromeExecutable,
  profileDirectory: config.profileDirectory,
  remoteDebuggingPort: config.remoteDebuggingPort,
  headless: false,
  initialUrl: config.dashboardUrl,
});
const controller = new PersistentAprEneaGlobalBrowserController({ profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort });
const ownerId = `apr-r116-runtime-readonly-preflight-${process.pid}`;
const access = controller.tryAcquire({ ownerId, cohortRoot: outputRoot, purpose: "diagnostic_readonly", accessMode: "readonly", processPid: process.pid });
if (!access) throw new Error("runtime_browser_controller_busy");

try {
  const browser = await runtime.ensureRunning();
  const driver = new CdpEneaBrowserDriver(outputRoot, runtime, { accessCapability: controller.createCapability(access), allowedOrigin: config.allowedOrigin, dashboardUrl: config.dashboardUrl });
  const session = await driver.verifySession();
  controller.recordKeepalive(access, session.evidenceId);
  const result = {
    version: "apr-r116-runtime-readonly-preflight-v1",
    checkedAt: new Date().toISOString(),
    status: session.authenticated && !session.serverLogoutProven ? "PASS" : "LOGIN_REQUIRED",
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
    crm: { status: crmState.status, accountEmailMasked: crmState.accountEmailMasked, lastVerifiedAt: crmState.lastVerifiedAt },
    browser: { pid: browser.pid, profileFingerprint: runtime.profileFingerprint, remoteDebuggingPort: config.remoteDebuggingPort },
    session: { authenticated: session.authenticated, serverLogoutProven: session.serverLogoutProven, evidenceId: session.evidenceId, url: session.url, at: session.at },
    safety: { accessMode: "readonly", portalMethodsAllowed: ["GET", "HEAD"], mutationAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
  atomicJson(path.join(outputRoot, "preflight.json"), result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 2;
} finally {
  runtime.closeAllPageClients();
  try { controller.release(access); } catch { /* fenced */ }
}
