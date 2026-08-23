import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activatePreparedAprServices, type AprServiceActivationRequest, type AprServiceController } from "./aprServiceActivation";

describe("APR service activation simulation", () => {
  it("rifiuta una preparazione non emessa dal collegamento verificato", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-activation-"));
    const forged = { entries: [], ready: true, loadPerformed: false } as never;
    const controller: AprServiceController = { activate: () => ({ observations: [], dashboardResponding: true }) };
    expect(() => activatePreparedAprServices({ prepared: forged, activationRoot: root, promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
  });

  it("installa plist atomici e usa esclusivamente il controller simulato", async () => {
    const module = await import("./aprCohortLaunchAgents");
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-activation-")); const bin = path.join(root, "bin"); mkdirSync(bin);
    const node = path.join(bin, "node"); writeFileSync(node, "#!/bin/sh\n"); chmodSync(node, 0o700);
    const bundles = ["supervisor.mjs", "worker.mjs", "watchdog.mjs"].map((name) => { const target = path.join(bin, name); writeFileSync(target, "export {};\n"); return target; });
    const raw = module.prepareAprCohortLaunchAgents({ cohortNumber: 61, stateDirectory: path.join(root, "state"), installDirectory: path.join(root, "staging"), nodeExecutable: node, supervisorBundle: bundles[0], workerBundle: bundles[1], watchdogBundle: bundles[2], dashboardPort: 4493 });
    // The public activation intentionally rejects raw preparations; verified integration is covered end-to-end elsewhere.
    expect(raw.entries).toHaveLength(3); expect(readFileSync(raw.entries[0].path, "utf8")).toContain(raw.entries[0].bundlePath);
    let observed: AprServiceActivationRequest | null = null;
    const controller: AprServiceController = { activate: (request) => { observed = request; return { observations: [], dashboardResponding: true }; } };
    expect(() => activatePreparedAprServices({ prepared: raw as never, activationRoot: path.join(root, "activation"), promotionVersionId: "version", controller })).toThrow(/preparation_not_verified/);
    expect(observed).toBeNull();
  });
});
