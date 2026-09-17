import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APR_ENEA_BROWSER_LEASE_DEFAULT_MS, atomicCreateExclusiveJson, PersistentAprEneaGlobalBrowserController } from "./aprEneaGlobalBrowserController";
import { APR_CDP_EVALUATION_TIMEOUTS, CdpPageClient } from "./cdpClient";
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
  it("mantiene la lease predefinita a 120 secondi, sotto il watchdog esterno di sette minuti", () => {
    expect(APR_ENEA_BROWSER_LEASE_DEFAULT_MS).toBe(120_000);
    expect(APR_ENEA_BROWSER_LEASE_DEFAULT_MS).toBeLessThan(7 * 60_000);
  });

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
    expect(registryRule("system-global-enea-browser-controller-fenced-lease-v2")).toMatchObject({ kind: "system", step: "runner_lifecycle", outcome: "continue" });
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

  it("fence un holder vivo ma con lease scaduta e invalida la capability precedente", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-global-browser-expiry-"));
    roots.push(root);
    const profileDirectory = path.join(root, "shared-chrome-profile");
    const stateRoot = path.join(root, "controller");
    let now = new Date("2026-08-30T20:00:00.000Z");
    const options = { profileDirectory, remoteDebuggingPort: 9331, stateRoot, leaseMs: 1_000, now: () => now, pidIsAlive: () => true };
    const first = new PersistentAprEneaGlobalBrowserController(options);
    const oldAccess = first.tryAcquire({ ownerId: "live-but-stuck", cohortRoot: "/cohorts/a", purpose: "case_execution", accessMode: "mutating", processPid: 41001 })!;
    const oldCapability = first.createCapability(oldAccess);
    expect(() => oldCapability.assertValid()).not.toThrow();

    now = new Date("2026-08-30T20:00:01.001Z");
    const second = new PersistentAprEneaGlobalBrowserController(options);
    const replacement = second.tryAcquire({ ownerId: "replacement", cohortRoot: "/cohorts/b", purpose: "case_execution", accessMode: "mutating", processPid: 41002 })!;

    expect(replacement.fencingEpoch).toBeGreaterThan(oldAccess.fencingEpoch);
    expect(() => oldCapability.assertValid()).toThrow(/access_fenced/);
    expect(second.snapshot().audit.some((event) => event.type === "expired_browser_lease_fenced")).toBe(true);
    second.release(replacement);
  });

  it("separa capability read-only e mutating e verifica il fencing a ogni uso", () => {
    const { first } = fixture();
    const readonly = first.tryAcquire({ ownerId: "reader", cohortRoot: "/cohorts/read", purpose: "diagnostic_readonly", accessMode: "readonly" })!;
    const capability = first.createCapability(readonly);
    expect(capability.kind).toBe("apr_enea_cdp_readonly");
    expect(() => capability.assertValid()).not.toThrow();
    expect("assertMutationAllowed" in capability).toBe(false);
    first.release(readonly);
    expect(() => capability.assertValid()).toThrow(/access_fenced/);
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

  it("pubblica il lock esclusivo soltanto come JSON completo e già sincronizzato", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-atomic-lock-publication-"));
    roots.push(root);
    const target = path.join(root, "exclusive-browser.lock.json");
    const expected = { version: 1, ownerId: "worker-a", token: "complete" };

    expect(atomicCreateExclusiveJson(target, expected)).toBe(true);
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(expected);
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8").endsWith("\n")).toBe(true);
  });

  it("non sostituisce mai un lock già pubblicato durante la contesa", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-atomic-lock-contention-"));
    roots.push(root);
    const target = path.join(root, "exclusive-browser.lock.json");
    const incumbent = { ownerId: "incumbent", token: "original" };
    writeFileSync(target, `${JSON.stringify(incumbent)}\n`, { mode: 0o600 });

    expect(atomicCreateExclusiveJson(target, { ownerId: "challenger", token: "replacement" })).toBe(false);
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(incumbent);
    expect(readdirSync(root)).toEqual(["exclusive-browser.lock.json"]);
  });

  it("è cablato prima di ogni accesso Chrome nel worker e governa il keepalive globale", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/apr-enea-worker-cli.ts"), "utf8");
    const acquisition = source.indexOf("globalBrowserController.tryAcquire");
    const ensureRunning = source.indexOf("activeRuntime.ensureRunning");
    expect(acquisition).toBeGreaterThan(0);
    expect(ensureRunning).toBeGreaterThan(acquisition);
    expect(source).toContain("type: \"global_browser_wait\"");
    expect(source).toContain("globalBrowserController.recordKeepalive(globalBrowserAccess");
    expect(source).toContain('purpose: mayExecuteCase ? "case_execution" : "keepalive"');
    expect(source).toContain("releaseRetainedGlobalBrowserAccess()");
    expect(source).not.toContain("purpose: \"worker_tick\"");
  });

  it("collega isolamento, lease di pratica, terminazione timeout e finalizzazione quiescente", () => {
    const worker = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/apr-enea-worker-cli.ts"), "utf8");
    const cdp = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/cdpClient.ts"), "utf8");
    const sequencer = readFileSync(path.join(process.cwd(), "ops/apr-global-controller-test10-2026-08-29/sequencer.mjs"), "utf8");
    expect(worker).toContain('purpose: mayExecuteCase ? "case_execution" : "keepalive"');
    expect(worker).toContain("stopped_after_quiescence");
    expect(cdp).toContain('method: "Runtime.terminateExecution"');
    expect(sequencer).toContain("quiescePreviousAprCohorts");
    expect(sequencer).toContain("settleCaseTruthAfterWorkerQuiescence");
    expect(sequencer).toContain('process.env.APR_PRESERVE_CONTINUITY !== "0"');
    expect(sequencer).toContain("settleCaseTruthWhileWorkerContinues(common)");
    expect(sequencer).toContain('ruleId: "system-apr-continuity-no-orchestrator-stop-v1"');
    expect(sequencer).toContain("case_active_services_reused_without_bundle_replacement");
    expect(sequencer).not.toContain("writeAtomic(");
  });

  it("finalizza ogni one-shot chiudendo solo i client CDP e rilasciando sempre la lease", () => {
    const worker = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/apr-enea-worker-cli.ts"), "utf8");
    expect(worker).toContain("function createOneShotRuntime");
    expect(worker).toContain("function finalizeOneShot");
    expect(worker).toContain("oneShotRuntime?.closeAllPageClients()");
    expect(worker).toContain("oneShotController.release(oneShotAccess)");
    expect(worker.trimEnd().endsWith("finalizeOneShot();")).toBe(true);
    expect(worker).not.toContain("oneShotRuntime?.stop()");
  });

  it("rivaluta le prove canoniche fresche prima di consumare le sonde o pubblicare un terminale", () => {
    const worker = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/apr-enea-worker-cli.ts"), "utf8");
    const collection = worker.indexOf('screeningPersistenceProofs.length < 2');
    const recovery = worker.indexOf('screeningPersistenceProofs.length === 2', collection);
    const ordinaryTick = worker.indexOf('const state = await worker.tick()', collection);
    expect(collection).toBeGreaterThan(0);
    expect(recovery).toBeGreaterThan(collection);
    expect(ordinaryTick).toBeGreaterThan(recovery);
    expect(worker.slice(collection, recovery)).toContain("continue;");
    expect(worker.slice(collection, recovery)).not.toContain("recordUncertainPageSaveProbe(");
  });

  it("usa classi esplicite senza default implicito o troncamento silenzioso", async () => {
    const client = new CdpPageClient("ws://127.0.0.1:1/devtools/page/test");
    const observedTimeouts: number[] = [];
    client.send = (async (_method: string, _params: Record<string, unknown>, timeoutMs: number) => {
      observedTimeouts.push(timeoutMs);
      return { result: { value: true } };
    }) as typeof client.send;
    await expect(client.evaluateDomRead<boolean>("true")).resolves.toBe(true);
    await expect(client.evaluateNestedSave<boolean>("true")).resolves.toBe(true);
    await expect(client.evaluateServerReconciliation<boolean>("true")).resolves.toBe(true);
    expect(observedTimeouts).toEqual([
      APR_CDP_EVALUATION_TIMEOUTS.DOM_READ,
      APR_CDP_EVALUATION_TIMEOUTS.NESTED_SAVE,
      APR_CDP_EVALUATION_TIMEOUTS.SERVER_RECONCILIATION,
    ]);
  });
});
