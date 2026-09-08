import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareAprCohortLaunchAgents } from "./aprCohortLaunchAgents";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("LaunchAgent dedicati a una coorte APR", () => {
  it("prepara supervisore, worker e watchdog persistenti senza caricarli", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cohort-services-")); roots.push(root);
    const bin = path.join(root, "bin"); const state = path.join(root, "state"); const install = path.join(root, "agents"); mkdirSync(bin);
    const node = path.join(bin, "node"); writeFileSync(node, "#!/bin/sh\n"); chmodSync(node, 0o700);
    const bundles = ["supervisor.mjs", "worker.mjs", "watchdog.mjs"].map((name) => { const target = path.join(bin, name); writeFileSync(target, "export {};\n"); return target; });
    const result = prepareAprCohortLaunchAgents({ cohortNumber: 39, stateDirectory: state, installDirectory: install, nodeExecutable: node, supervisorBundle: bundles[0], workerBundle: bundles[1], watchdogBundle: bundles[2], dashboardPort: 4471 });
    expect(result).toMatchObject({ ready: true, loadPerformed: false, dashboardUrl: "http://127.0.0.1:4471/" });
    expect(result.entries).toHaveLength(3);
    for (const entry of result.entries) {
      const contents = readFileSync(entry.path, "utf8");
      expect(contents).toContain("<key>RunAtLoad</key><true/>");
      expect(contents).toContain(entry.role === "worker"
        ? "<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>"
        : "<key>KeepAlive</key><true/>");
      expect(contents).toContain(entry.label);
    }
    expect(readFileSync(result.entries.find((entry) => entry.role === "watchdog")!.path, "utf8")).toContain("com.praticarapida.apr-enea-cohort39-worker");
  });
});
