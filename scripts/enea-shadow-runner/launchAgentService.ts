import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LAUNCH_AGENT_LABEL = "com.praticarapida.enea-shadow-supervisor";
export const LAUNCH_AGENT_TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config/launchd/com.praticarapida.enea-shadow-supervisor.plist.template");

export interface LaunchAgentPreparationOptions {
  workingDirectory: string;
  stateDirectory?: string;
  nodeExecutable?: string;
  viteNodePath?: string;
  supervisorCliPath?: string;
  standaloneEntryPath?: string;
  port?: number;
  templatePath?: string;
}

export interface LaunchAgentVerification {
  ready: boolean;
  installationPreconditionsMet: boolean;
  configuredPath: string;
  conventionalInstallTarget: string;
  installationOrLoadPerformed: false;
  systemInstallationState: "not_checked_by_design";
  requiresExplicitConsent: true;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  warnings: string[];
}

function xmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!);
}

function atomicWrite(target: string, contents: string) {
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
}

function resolvedOptions(options: LaunchAgentPreparationOptions) {
  const workingDirectory = path.resolve(options.workingDirectory);
  const stateDirectory = path.resolve(options.stateDirectory ?? path.join(workingDirectory, ".enea-shadow-runtime"));
  const port = options.port ?? 4317;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Porta LaunchAgent non valida.");
  return {
    workingDirectory,
    stateDirectory,
    port,
    nodeExecutable: path.resolve(options.nodeExecutable ?? process.execPath),
    viteNodePath: path.resolve(options.viteNodePath ?? path.join(workingDirectory, "node_modules/vite-node/vite-node.mjs")),
    supervisorCliPath: path.resolve(options.supervisorCliPath ?? path.join(workingDirectory, "scripts/enea-shadow-runner/supervisor-cli.ts")),
    standaloneEntryPath: options.standaloneEntryPath ? path.resolve(options.standaloneEntryPath) : null,
    templatePath: path.resolve(options.templatePath ?? LAUNCH_AGENT_TEMPLATE),
  };
}

export function renderLaunchAgent(options: LaunchAgentPreparationOptions) {
  const resolved = resolvedOptions(options);
  const logDirectory = path.join(resolved.stateDirectory, "logs");
  const replacements: Record<string, string> = {
    LABEL: LAUNCH_AGENT_LABEL,
    PROGRAM_ARGUMENTS: (resolved.standaloneEntryPath
      ? [resolved.nodeExecutable, resolved.standaloneEntryPath, "serve", "--state-dir", resolved.stateDirectory, "--port", String(resolved.port)]
      : [resolved.nodeExecutable, resolved.viteNodePath, resolved.supervisorCliPath, "serve", "--state-dir", resolved.stateDirectory, "--port", String(resolved.port)])
      .map((argument) => `    <string>${xmlEscape(argument)}</string>`).join("\n"),
    WORKING_DIRECTORY: resolved.workingDirectory,
    STDOUT_LOG: path.join(logDirectory, "supervisor.stdout.log"),
    STDERR_LOG: path.join(logDirectory, "supervisor.stderr.log"),
  };
  let content = readFileSync(resolved.templatePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) content = content.replaceAll(`{{${key}}}`, key === "PROGRAM_ARGUMENTS" ? value : xmlEscape(value));
  if (/\{\{[A-Z_]+\}\}/.test(content)) throw new Error("Template LaunchAgent incompleto.");
  return { content, resolved, logDirectory };
}

export function verifyPreparedLaunchAgent(configuredPath: string, options: LaunchAgentPreparationOptions): LaunchAgentVerification {
  const resolved = resolvedOptions(options);
  const checks: LaunchAgentVerification["checks"] = [];
  const checkPath = (id: string, target: string, mode: number) => {
    try { accessSync(target, mode); checks.push({ id, ok: true, detail: target }); }
    catch { checks.push({ id, ok: false, detail: `${target} non accessibile` }); }
  };
  checkPath("working_directory", resolved.workingDirectory, constants.R_OK | constants.X_OK);
  checkPath("node_executable", resolved.nodeExecutable, constants.X_OK);
  if (resolved.standaloneEntryPath) checkPath("standalone_entry", resolved.standaloneEntryPath, constants.R_OK);
  else {
    checkPath("vite_node", resolved.viteNodePath, constants.R_OK);
    checkPath("supervisor_cli", resolved.supervisorCliPath, constants.R_OK);
  }
  checkPath("state_directory", resolved.stateDirectory, constants.R_OK | constants.W_OK | constants.X_OK);
  checkPath("configured_plist", configuredPath, constants.R_OK);
  let content = "";
  try { content = readFileSync(configuredPath, "utf8"); } catch { /* check già rosso */ }
  checks.push({ id: "label", ok: content.includes(`<string>${LAUNCH_AGENT_LABEL}</string>`), detail: LAUNCH_AGENT_LABEL });
  checks.push({ id: "run_at_load", ok: /<key>RunAtLoad<\/key>\s*<true\/>/.test(content), detail: "avvio automatico al login" });
  checks.push({ id: "keep_alive", ok: /<key>KeepAlive<\/key>\s*<true\/>/.test(content), detail: "ripresa automatica del processo" });
  checks.push({ id: "loopback_port", ok: content.includes(`<string>${resolved.port}</string>`) && content.includes("<string>serve</string>"), detail: `127.0.0.1:${resolved.port} imposto dal supervisore` });
  checks.push({ id: "no_unresolved_tokens", ok: !/\{\{[A-Z_]+\}\}/.test(content), detail: "template risolto" });
  checks.push({ id: "no_loader_command", ok: !/launchctl|bootstrap|load\s/i.test(content), detail: "nessun comando di installazione/caricamento incluso" });
  if (process.platform === "darwin") {
    const lint = spawnSync("/usr/bin/plutil", ["-lint", configuredPath], { encoding: "utf8" });
    checks.push({ id: "plist_syntax", ok: lint.status === 0, detail: (lint.stdout || lint.stderr).trim() });
  } else checks.push({ id: "plist_syntax", ok: false, detail: "plutil disponibile soltanto su macOS" });
  try {
    const mode = statSync(configuredPath).mode & 0o777;
    checks.push({ id: "private_permissions", ok: mode === 0o600, detail: `mode ${mode.toString(8)}` });
  } catch { checks.push({ id: "private_permissions", ok: false, detail: "file non disponibile" }); }
  checks.push({ id: "platform", ok: process.platform === "darwin", detail: process.platform });
  const warnings: string[] = [];
  if (resolved.workingDirectory.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`)) {
    warnings.push("Il WorkingDirectory è un worktree Codex potenzialmente temporaneo: prima dell'installazione spostare o integrare il software in un percorso stabile e rigenerare il plist.");
  }
  return {
    ready: checks.every((check) => check.ok),
    installationPreconditionsMet: checks.every((check) => check.ok) && warnings.length === 0,
    configuredPath,
    conventionalInstallTarget: `~/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist`,
    installationOrLoadPerformed: false,
    systemInstallationState: "not_checked_by_design",
    requiresExplicitConsent: true,
    checks,
    warnings,
  };
}

export function prepareLaunchAgent(options: LaunchAgentPreparationOptions): LaunchAgentVerification {
  const rendered = renderLaunchAgent(options);
  const serviceDirectory = path.join(rendered.resolved.stateDirectory, "system-service");
  mkdirSync(rendered.resolved.stateDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(rendered.logDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(serviceDirectory, { recursive: true, mode: 0o700 });
  const configuredPath = path.join(serviceDirectory, `${LAUNCH_AGENT_LABEL}.plist`);
  if (!existsSync(configuredPath) || readFileSync(configuredPath, "utf8") !== rendered.content) atomicWrite(configuredPath, rendered.content);
  return verifyPreparedLaunchAgent(configuredPath, options);
}
