import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, accessSync } from "node:fs";
import path from "node:path";
import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
import { verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import { assertAprInstallationGuard, type AprInstallationGuard } from "./aprPreDeployVerification";

export interface AprCohortLaunchAgentOptions {
  cohortNumber: number;
  stateDirectory: string;
  installDirectory: string;
  nodeExecutable: string;
  supervisorBundle: string;
  workerBundle: string;
  watchdogBundle: string;
  dashboardPort: number;
}

const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

function plist(label: string, args: string[], workingDirectory: string, stdout: string, stderr: string) {
  const argumentsXml = args.map((argument) => `    <string>${xml(argument)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array>
${argumentsXml}
  </array>
  <key>WorkingDirectory</key><string>${xml(workingDirectory)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>ExitTimeOut</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Umask</key><integer>63</integer>
  <key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
  <key>StandardOutPath</key><string>${xml(stdout)}</string>
  <key>StandardErrorPath</key><string>${xml(stderr)}</string>
</dict></plist>
`;
}

export function prepareAprCohortLaunchAgents(options: AprCohortLaunchAgentOptions) {
  if (!Number.isInteger(options.cohortNumber) || options.cohortNumber < 1 || !Number.isInteger(options.dashboardPort) || options.dashboardPort < 1024 || options.dashboardPort > 65535) throw new Error("apr_cohort_launch_agent_options_invalid");
  for (const candidate of [options.stateDirectory, options.installDirectory, options.nodeExecutable, options.supervisorBundle, options.workerBundle, options.watchdogBundle]) {
    if (!path.isAbsolute(candidate)) throw new Error("apr_cohort_launch_agent_absolute_path_required");
  }
  accessSync(options.nodeExecutable, constants.X_OK);
  for (const bundle of [options.supervisorBundle, options.workerBundle, options.watchdogBundle]) accessSync(bundle, constants.R_OK);
  mkdirSync(options.stateDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(options.installDirectory, { recursive: true, mode: 0o700 });
  const logs = path.join(options.stateDirectory, "logs"); mkdirSync(logs, { recursive: true, mode: 0o700 });
  const prefix = `com.praticarapida.apr-enea-cohort${options.cohortNumber}`;
  const supervisorLabel = `${prefix}-supervisor`; const workerLabel = `${prefix}-worker`; const watchdogLabel = `${prefix}-watchdog`;
  const entries = [
    { role: "supervisor", label: supervisorLabel, args: [options.nodeExecutable, options.supervisorBundle, "serve", "--state-dir", options.stateDirectory, "--port", String(options.dashboardPort), "--interval-ms", "2000"] },
    { role: "worker", label: workerLabel, args: [options.nodeExecutable, options.workerBundle, "serve", "--state-dir", options.stateDirectory, "--interval-ms", "2000"] },
    { role: "watchdog", label: watchdogLabel, args: [options.nodeExecutable, options.watchdogBundle, "serve", "--state-dir", options.stateDirectory, "--interval-ms", "15000", "--supervisor-label", supervisorLabel, "--worker-label", workerLabel] },
  ].map((entry) => {
    const target = path.join(options.installDirectory, `${entry.label}.plist`);
    const contents = plist(entry.label, entry.args, path.dirname(options.supervisorBundle), path.join(logs, `${entry.role}.stdout.log`), path.join(logs, `${entry.role}.stderr.log`));
    if (!existsSync(target) || readFileSync(target, "utf8") !== contents) atomicWrite(target, contents);
    const persisted = readFileSync(target, "utf8");
    if (!persisted.includes(`<string>${entry.label}</string>`) || !persisted.includes("<key>RunAtLoad</key><true/>") || !persisted.includes("<key>KeepAlive</key><true/>") || persisted.includes("{{")) throw new Error(`apr_cohort_launch_agent_verification_failed:${entry.role}`);
    return { ...entry, path: target };
  });
  return { cohortNumber: options.cohortNumber, dashboardUrl: `http://127.0.0.1:${options.dashboardPort}/`, entries, ready: true, loadPerformed: false };
}

export interface AprVerifiedCohortLaunchAgentOptions extends Omit<AprCohortLaunchAgentOptions, "supervisorBundle" | "workerBundle" | "watchdogBundle"> {}

export function prepareVerifiedAprCohortLaunchAgents(guard: AprInstallationGuard, receipt: AprBundlePromotionReceipt, options: AprVerifiedCohortLaunchAgentOptions) {
  assertAprInstallationGuard(guard);
  if (!verifyImmutableArtifactEnvelope(receipt)) throw new Error("apr_cohort_launch_agent_promotion_receipt_invalid");
  if (receipt.payload.status !== "PASS") throw new Error("apr_cohort_launch_agent_promotion_receipt_not_pass");
  if (receipt.payload.preDeployCertificateId !== guard.certificateArtifactId) throw new Error("apr_cohort_launch_agent_certificate_mismatch");
  if (!receipt.localMetadata?.promotionRoot) throw new Error("apr_cohort_launch_agent_promotion_root_missing");
  const bundleByRole = new Map(receipt.payload.bundles.map((bundle) => [bundle.role, bundle]));
  for (const role of ["supervisor", "worker", "watchdog"] as const) if (!bundleByRole.has(role)) throw new Error(`apr_cohort_launch_agent_bundle_missing:${role}`);
  const activeDirectory = path.join(receipt.localMetadata.promotionRoot, "current");
  return prepareAprCohortLaunchAgents({
    ...options,
    supervisorBundle: path.join(activeDirectory, bundleByRole.get("supervisor")!.installedRef),
    workerBundle: path.join(activeDirectory, bundleByRole.get("worker")!.installedRef),
    watchdogBundle: path.join(activeDirectory, bundleByRole.get("watchdog")!.installedRef),
  });
}
