import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprEneaGlobalBrowserController } from "./aprEneaGlobalBrowserController";
import { APR_CDP_DEFAULT_PAGE_OPERATION_MS, APR_CDP_MAX_PAGE_OPERATION_MS, CdpPageClient } from "./cdpClient";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-global-browser-"));
  roots.push(root);
  const profileDirectory = path.join(root, "shared-chrome-profile");
  const stateRoot = path.join(root, "controller");
  return {
    first: new PersistentAprEneaGlobalBrowserController({ profileDirectory, remoteDebuggingPort: 9331, stateRoot }),
    second: new PersistentAprEneaGlobalBrowserController({ profileDirectory, remoteDebuggingPort: 9331, stateRoot }),
    stateRoot,
  };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("controllore globale esclusivo Chrome/ENEA", () => {
  it("impedisce a due worker di controllare contemporaneamente la stessa sessione", async () => {
    const { first, second } = fixture();
    let active = 0;
    let maximumActive = 0;
    const events: string[] = [];
    const work = (controller: PersistentAprEneaGlobalBrowserController, ownerId: string, delay: number) => controller.runExclusive({ ownerId, cohortRoot: `/cohorts/${ownerId}`, retryIntervalMs: 2 }, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      events.push(`${ownerId}:start`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      events.push(`${ownerId}:end`);
      active -= 1;
    });

    await Promise.all([work(first, "worker-a", 30), work(second, "worker-b", 1)]);

    expect(maximumActive).toBe(1);
    expect(events).toEqual(["worker-a:start", "worker-a:end", "worker-b:start", "worker-b:end"]);
    expect(registryRule("system-global-enea-browser-controller")).toMatchObject({ kind: "system", step: "runner_lifecycle", outcome: "continue" });
  });

  it("mantiene la stessa lease per l'intera pratica e respinge ogni altro worker tra tick successivi", () => {
    const { first, second } = fixture();
    const firstTick = first.tryAcquire({ ownerId: "worker-case-a", cohortRoot: "/cohorts/a", purpose: "case_execution", processPid: process.pid });
    const secondTick = first.tryAcquire({ ownerId: "worker-case-a", cohortRoot: "/cohorts/a", purpose: "case_execution", processPid: process.pid });

    expect(firstTick).not.toBeNull();
    expect(secondTick).toMatchObject(firstTick!);
    expect(second.tryAcquire({ ownerId: "worker-case-b", cohortRoot: "/cohorts/b", purpose: "case_execution", processPid: process.pid })).toBeNull();
    expect(first.snapshot().audit.filter((event) => event.type === "browser_access_acquired")).toHaveLength(1);

    first.release(firstTick!);
    const nextCase = second.tryAcquire({ ownerId: "worker-case-b", cohortRoot: "/cohorts/b", purpose: "case_execution", processPid: process.pid });
    expect(nextCase).not.toBeNull();
    second.release(nextCase!);
  });

  it("coordina un solo keepalive tra coorti diverse", () => {
    const { first, second } = fixture();
    const accessA = first.tryAcquire({ ownerId: "worker-a", cohortRoot: "/cohorts/a" });
    expect(accessA).not.toBeNull();
    expect(first.keepaliveDue(240_000)).toBe(true);
    first.recordKeepalive(accessA!, "evidence-a");
    first.release(accessA!);

    const accessB = second.tryAcquire({ ownerId: "worker-b", cohortRoot: "/cohorts/b" });
    expect(accessB).not.toBeNull();
    expect(second.keepaliveDue(240_000)).toBe(false);
    second.release(accessB!);
    expect(second.snapshot()).toMatchObject({ lastKeepaliveEvidenceId: "evidence-a" });
    expect(second.snapshot().audit.filter((event) => event.type === "global_keepalive_verified")).toHaveLength(1);
  });

  it("recupera un lock solo quando il processo proprietario è certamente morto", () => {
    const value = fixture();
    const first = new PersistentAprEneaGlobalBrowserController({ profileDirectory: path.join(path.dirname(value.stateRoot), "shared-chrome-profile"), remoteDebuggingPort: 9331, stateRoot: value.stateRoot, pidIsAlive: () => false });
    const access = first.tryAcquire({ ownerId: "dead-worker", cohortRoot: "/cohorts/dead", processPid: 424242 });
    expect(access).not.toBeNull();

    const second = new PersistentAprEneaGlobalBrowserController({ profileDirectory: path.join(path.dirname(value.stateRoot), "shared-chrome-profile"), remoteDebuggingPort: 9331, stateRoot: value.stateRoot, pidIsAlive: () => false });
    const recovered = second.tryAcquire({ ownerId: "replacement", cohortRoot: "/cohorts/replacement", processPid: 434343 });
    expect(recovered).not.toBeNull();
    expect(second.snapshot().audit.some((event) => event.type === "stale_browser_lock_recovered")).toBe(true);
    second.release(recovered!);
  });

  it("fallisce chiuso se il lock persistente è corrotto", () => {
    const { first } = fixture();
    const access = first.tryAcquire({ ownerId: "worker-a", cohortRoot: "/cohorts/a" });
    expect(access).not.toBeNull();
    const lock = JSON.parse(readFileSync(first.lockPath, "utf8")) as Record<string, unknown>;
    delete lock.profileFingerprint;
    writeFileSync(first.lockPath, JSON.stringify(lock));
    expect(() => first.tryAcquire({ ownerId: "worker-b", cohortRoot: "/cohorts/b" })).toThrow(/lock_corrupt_fail_closed/);
  });

  it("è cablato prima di ogni accesso Chrome nel worker e governa il keepalive globale", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/apr-enea-worker-cli.ts"), "utf8");
    const acquisition = source.indexOf("globalBrowserController.tryAcquire");
    const ensureRunning = source.indexOf("activeRuntime.ensureRunning");
    expect(acquisition).toBeGreaterThan(0);
    expect(ensureRunning).toBeGreaterThan(acquisition);
    expect(source).toContain("type: \"global_browser_wait\"");
    expect(source).toContain("globalBrowserController.recordKeepalive(globalBrowserAccess");
    expect(source).toContain("purpose: \"case_execution\"");
    expect(source).toContain("releaseRetainedGlobalBrowserAccess()");
    expect(source).not.toContain("purpose: \"worker_tick\"");
  });

  it("collega isolamento, lease di pratica, terminazione timeout e finalizzazione quiescente", () => {
    const worker = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/apr-enea-worker-cli.ts"), "utf8");
    const cdp = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/cdpClient.ts"), "utf8");
    const sequencer = readFileSync(path.join(process.cwd(), "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs"), "utf8");
    expect(worker).toContain("purpose: \"case_execution\"");
    expect(worker).toContain("stopped_after_quiescence");
    expect(cdp).toContain('method: "Runtime.terminateExecution"');
    expect(sequencer).toContain("quiescePreviousAprCohorts");
    expect(sequencer).toContain("settleCaseTruthAfterWorkerQuiescence");
  });

  it("usa cinque secondi per le evaluate brevi senza troncare l'attesa DOM esplicita da venti secondi", async () => {
    const client = new CdpPageClient("ws://127.0.0.1:1/devtools/page/test");
    const observedTimeouts: number[] = [];
    client.send = (async (_method: string, _params: Record<string, unknown>, timeoutMs: number) => {
      observedTimeouts.push(timeoutMs);
      return { result: { value: true } };
    }) as typeof client.send;
    await expect(client.evaluate<boolean>("true")).resolves.toBe(true);
    await expect(client.evaluate<boolean>("true", true, 20_000)).resolves.toBe(true);
    await expect(client.evaluate<boolean>("true", true, 60_000)).resolves.toBe(true);
    expect(observedTimeouts).toEqual([
      APR_CDP_DEFAULT_PAGE_OPERATION_MS,
      20_000,
      APR_CDP_MAX_PAGE_OPERATION_MS,
    ]);
  });
});
