import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CdpPageClient, PersistentAprChromeRuntime, type CdpTargetInfo } from "./cdpClient";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-identity-"));
  roots.push(root);
  const runtime = new PersistentAprChromeRuntime({
    chromeExecutable: process.execPath,
    profileDirectory: path.join(root, "profile"),
    remoteDebuggingPort: 19_331,
    receiptDirectory: path.join(root, "receipts"),
    processIdentityReader: (pid) => ({ processStartedAt: "Sun Aug 30 22:00:00 2026", command: `fixture-process-${pid}` }),
  });
  runtime.setAccessGuard(() => undefined, { ownerId: "cohort-current", fencingEpoch: 7 });
  const targets: CdpTargetInfo[] = [{ id: "page-1", type: "page", title: "APR", url: "https://example.invalid/", webSocketDebuggerUrl: "ws://127.0.0.1/page-1" }];
  const mutable = runtime as unknown as {
    ensureRunning: () => Promise<{ started: boolean; pid: number; profileFingerprint: string; instanceNonce: string }>;
    getJson: <T>(pathname: string) => Promise<T>;
    processIdentity: (pid: number) => { processStartedAt: string; command: string };
  };
  mutable.ensureRunning = async () => ({ started: false, pid: process.pid, profileFingerprint: runtime.profileFingerprint, instanceNonce: "chrome-instance-nonce" });
  mutable.getJson = async <T>() => targets as T;
  return { runtime, mutable };
}

describe("identità Chrome e client CDP residui", () => {
  it("scrive una receipt di attach legata a nonce, owner, epoch e /json/list", async () => {
    const { runtime } = fixture();
    await expect(runtime.targets()).resolves.toHaveLength(1);
    expect(JSON.parse(readFileSync(runtime.attachReadinessReceiptPath, "utf8"))).toMatchObject({
      version: "apr-cdp-attach-readiness-receipt-v1",
      instanceNonce: "chrome-instance-nonce",
      ownerId: "cohort-current",
      fencingEpoch: 7,
      targetIds: ["page-1"],
      foreignResidualClientCount: 0,
    });
  });

  it("rifiuta fail-closed un client vivo appartenente alla coorte precedente", async () => {
    const { runtime, mutable } = fixture();
    const identity = mutable.processIdentity(process.pid);
    mkdirSync(path.dirname(runtime.clientRegistryPath), { recursive: true });
    writeFileSync(runtime.clientRegistryPath, `${JSON.stringify({
      version: "apr-cdp-client-registry-v1",
      updatedAt: new Date().toISOString(),
      clients: [{
        clientId: "foreign-client",
        pid: process.pid,
        processStartedAt: identity.processStartedAt,
        ownerId: "cohort-previous",
        fencingEpoch: 6,
        targetId: "page-old",
        webSocketUrl: "ws://127.0.0.1/page-old",
        openedAt: new Date().toISOString(),
      }],
    }, null, 2)}\n`, "utf8");
    await expect(runtime.targets()).rejects.toThrow("apr_cdp_residual_clients_fail_closed:cohort-previous");
  });

  it("non consente l'attach senza identità della capability", async () => {
    const { runtime } = fixture();
    runtime.setAccessGuard(() => undefined);
    await expect(runtime.targets()).rejects.toThrow("apr_cdp_runtime_access_identity_required");
  });

  it("rifiuta Page.navigate con una capability read-only prima di aprire il websocket", async () => {
    const client = new CdpPageClient("ws://127.0.0.1:1/devtools/page/never-opened", 100, null, {}, (mode) => {
      if (mode === "mutating") throw new Error("apr_global_browser_mutation_without_capability");
    });
    await expect(client.navigate("https://example.invalid/")).rejects.toThrow("apr_global_browser_mutation_without_capability");
  });

  it("consente soltanto una navigazione GET read-only HTTPS sulla stessa origine", async () => {
    const observedModes: string[] = [];
    const client = new CdpPageClient("ws://127.0.0.1:1/devtools/page/never-opened", 100, null, {}, (mode) => {
      observedModes.push(mode);
      if (mode === "mutating") throw new Error("apr_global_browser_mutation_without_capability");
    });
    await expect(client.navigateReadonlyGet("https://other.invalid/dashboard", "https://example.invalid"))
      .rejects.toThrow("apr_cdp_readonly_navigation_origin_rejected");
    await expect(client.navigateReadonlyGet("http://example.invalid/dashboard", "https://example.invalid"))
      .rejects.toThrow("apr_cdp_readonly_navigation_origin_rejected");
    await expect(client.navigateReadonlyGet("http://localhost.invalid/dashboard", "http://localhost.invalid"))
      .rejects.toThrow("apr_cdp_readonly_navigation_origin_rejected");
    await expect(client.navigateReadonlyGet("https://example.invalid/dashboard", "https://example.invalid"))
      .rejects.not.toThrow("apr_global_browser_mutation_without_capability");
    expect(observedModes).toEqual(["readonly"]);
  });
});
