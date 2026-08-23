import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LAUNCH_AGENT_LABEL,
  prepareLaunchAgent,
  verifyPreparedLaunchAgent,
} from "./launchAgentService";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("preparazione LaunchAgent senza installazione", () => {
  it("genera e verifica una configurazione privata, idempotente e non caricata", () => {
    const stateDirectory = mkdtempSync(path.join(os.tmpdir(), "enea-shadow-launch-agent-"));
    temporaryDirectories.push(stateDirectory);
    const options = { workingDirectory: process.cwd(), stateDirectory, port: 4317 };
    const first = prepareLaunchAgent(options);
    const firstContent = readFileSync(first.configuredPath, "utf8");
    const second = prepareLaunchAgent(options);
    const secondContent = readFileSync(second.configuredPath, "utf8");

    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
    expect(firstContent).toBe(secondContent);
    expect(first).toMatchObject({ ready: true, installationPreconditionsMet: false, installationOrLoadPerformed: false, systemInstallationState: "not_checked_by_design", requiresExplicitConsent: true });
    expect(first.warnings).toEqual([expect.stringContaining("worktree Codex")]);
    expect(first.conventionalInstallTarget).toBe(`~/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist`);
    expect(first.configuredPath.startsWith(stateDirectory)).toBe(true);
    expect(statSync(first.configuredPath).mode & 0o777).toBe(0o600);
    expect(firstContent).toContain("<key>RunAtLoad</key>");
    expect(firstContent).toContain("<key>KeepAlive</key>");
    expect(firstContent).toContain(process.execPath);
    expect(firstContent).not.toMatch(/\{\{|launchctl|bootstrap/);
    expect(verifyPreparedLaunchAgent(first.configuredPath, options).checks.every((check) => check.ok)).toBe(true);
  });
});
