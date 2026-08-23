import { closeSync, constants, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, accessSync } from "node:fs";
import path from "node:path";

export const APR_WATCHDOG_LABEL = "com.praticarapida.apr-watchdog";

export interface AprWatchdogLaunchAgentOptions {
  label?: string;
  nodeExecutable: string;
  bundlePath: string;
  stateDirectory: string;
  serviceDirectory: string;
  supervisorLabel: string;
  workerLabel: string;
  intervalMs?: number;
}

function xml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[char]!); }
function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

export function prepareAprWatchdogLaunchAgent(options: AprWatchdogLaunchAgentOptions) {
  const label = options.label ?? APR_WATCHDOG_LABEL;
  const intervalMs = options.intervalMs ?? 15_000;
  if (!/^com\.praticarapida\.[a-z0-9.-]+$/.test(label) || !/^com\.praticarapida\.[a-z0-9.-]+$/.test(options.supervisorLabel) || !/^com\.praticarapida\.[a-z0-9.-]+$/.test(options.workerLabel)) throw new Error("apr_watchdog_launch_agent_label_invalid");
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000) throw new Error("apr_watchdog_launch_agent_interval_invalid");
  for (const candidate of [options.nodeExecutable, options.bundlePath, options.stateDirectory, options.serviceDirectory]) if (!path.isAbsolute(candidate)) throw new Error("apr_watchdog_launch_agent_absolute_path_required");
  accessSync(options.nodeExecutable, constants.X_OK); accessSync(options.bundlePath, constants.R_OK); accessSync(options.stateDirectory, constants.R_OK | constants.W_OK);
  mkdirSync(path.join(options.stateDirectory, "logs"), { recursive: true, mode: 0o700 }); mkdirSync(options.serviceDirectory, { recursive: true, mode: 0o700 });
  const args = [options.nodeExecutable, options.bundlePath, "serve", "--state-dir", options.stateDirectory, "--interval-ms", String(intervalMs), "--supervisor-label", options.supervisorLabel, "--worker-label", options.workerLabel];
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(options.serviceDirectory)}</string>
<key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer><key>ExitTimeOut</key><integer>10</integer><key>ProcessType</key><string>Background</string><key>LowPriorityIO</key><true/><key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(options.stateDirectory, "logs", "apr-watchdog.stdout.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(options.stateDirectory, "logs", "apr-watchdog.stderr.log"))}</string>
</dict></plist>\n`;
  const configuredPath = path.join(options.serviceDirectory, `${label}.plist`); atomicWrite(configuredPath, content);
  return { label, configuredPath, conventionalInstallTarget: `~/Library/LaunchAgents/${label}.plist`, runAtLoad: true, keepAlive: true, intervalMs, requiresExplicitConsent: true, installationOrLoadPerformed: false } as const;
}

export function readPreparedAprWatchdogLaunchAgent(target: string) { return readFileSync(target, "utf8"); }

