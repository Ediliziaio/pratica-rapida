import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareAprWatchdogLaunchAgent, readPreparedAprWatchdogLaunchAgent } from "./aprWatchdogLaunchAgent";
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
describe("LaunchAgent watchdog APR", () => {
  it("prepara senza installare un servizio separato RunAtLoad/KeepAlive con target allowlist", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-launch-agent-")); directories.push(root);
    const node = path.join(root, "node"); const bundle = path.join(root, "watchdog.mjs"); const state = path.join(root, "state"); const service = path.join(root, "service");
    writeFileSync(node, "#!/bin/sh\n"); chmodSync(node, 0o700); writeFileSync(bundle, "export {};\n"); mkdirSync(state);
    const result = prepareAprWatchdogLaunchAgent({ label: "com.praticarapida.apr-test-watchdog", nodeExecutable: node, bundlePath: bundle, stateDirectory: state, serviceDirectory: service, supervisorLabel: "com.praticarapida.apr-test-supervisor", workerLabel: "com.praticarapida.apr-test-worker" });
    const content = readPreparedAprWatchdogLaunchAgent(result.configuredPath);
    expect(result).toMatchObject({ installationOrLoadPerformed: false, runAtLoad: true, keepAlive: true, intervalMs: 15000 });
    expect(content).toContain("<key>RunAtLoad</key><true/>"); expect(content).toContain("<key>KeepAlive</key><true/>"); expect(content).toContain("com.praticarapida.apr-test-supervisor"); expect(content).toContain("com.praticarapida.apr-test-worker");
    expect(content).not.toMatch(/preview|submit|email|receipt/i);
  });
});

