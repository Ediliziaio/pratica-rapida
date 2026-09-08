import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { APR_CDP_EVALUATION_CONTRACTS, APR_CDP_MAX_PAGE_OPERATION_MS, CdpPageClient } from "./cdpClient";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close(); });
async function closeFixture(server: WebSocketServer, http: Server) {
  for (const client of server.clients) client.terminate();
  await Promise.race([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
  if (!http.listening) return;
  await Promise.race([
    new Promise<void>((resolve) => http.close(() => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
}

describe("timeout CDP con terminazione dell'esecuzione browser", () => {
  it("garantisce per ogni classe il ciclo interno dichiarato piu il margine e il massimo globale", () => {
    for (const contract of Object.values(APR_CDP_EVALUATION_CONTRACTS)) {
      expect(contract.timeoutMs).toBeGreaterThanOrEqual(contract.maxInPageWaitMs + contract.safetyMarginMs);
      expect(contract.timeoutMs).toBeLessThanOrEqual(APR_CDP_MAX_PAGE_OPERATION_MS);
    }
    expect(APR_CDP_EVALUATION_CONTRACTS.SHORT_MUTATION.timeoutMs).toBeGreaterThan(8_000);
  });

  it("invia Runtime.terminateExecution e ne attende la risposta prima di chiudere il WebSocket", async () => {
    const http = createServer();
    const server = new WebSocketServer({ server: http });
    const methods: string[] = [];
    let socketClosed = false;
    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const message = JSON.parse(String(raw)) as { id: number; method: string };
        methods.push(message.method);
        if (message.method === "Runtime.evaluate") return;
        socket.send(JSON.stringify({ id: message.id, result: {} }));
      });
      socket.on("close", () => { socketClosed = true; });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    closers.push(() => closeFixture(server, http as Server));

    const client = new CdpPageClient(`ws://127.0.0.1:${address.port}`, 1_000, null, { SERVER_RECONCILIATION: 25 });
    await client.connect();
    await expect(client.evaluateServerReconciliation("new Promise(() => {})")).rejects.toThrow(/apr_cdp_command_timeout:Runtime\.evaluate:class=SERVER_RECONCILIATION:timeout_ms=25:expression=[a-f0-9]{16}/);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(methods).toEqual(["Runtime.enable", "Page.enable", "Runtime.evaluate", "Runtime.terminateExecution"]);
    expect(socketClosed).toBe(true);
  });

  it("usa awaitPromise=false per DOM_READ e true per la riconciliazione dichiarata", async () => {
    const http = createServer();
    const server = new WebSocketServer({ server: http });
    const awaitPromiseValues: boolean[] = [];
    server.on("connection", (socket) => socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as { id: number; method: string; params?: { awaitPromise?: boolean } };
      if (message.method === "Runtime.evaluate") awaitPromiseValues.push(Boolean(message.params?.awaitPromise));
      socket.send(JSON.stringify({ id: message.id, result: message.method === "Runtime.evaluate" ? { result: { value: true } } : {} }));
    }));
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    closers.push(() => closeFixture(server, http as Server));
    const client = new CdpPageClient(`ws://127.0.0.1:${address.port}`);
    await client.connect();
    await client.evaluateDomRead("document.readyState");
    await client.evaluateServerReconciliation("Promise.resolve(true)");
    expect(awaitPromiseValues).toEqual([false, true]);
    client.close();
  });

  it("rende rumoroso Promise was collected con classe, modalità e fingerprint", async () => {
    const http = createServer();
    const server = new WebSocketServer({ server: http });
    server.on("connection", (socket) => socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as { id: number; method: string };
      if (message.method === "Runtime.evaluate") {
        socket.send(JSON.stringify({ id: message.id, error: { code: -32000, message: "Promise was collected" } }));
      } else socket.send(JSON.stringify({ id: message.id, result: {} }));
    }));
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    closers.push(() => closeFixture(server, http as Server));
    const client = new CdpPageClient(`ws://127.0.0.1:${address.port}`);
    await client.connect();
    await expect(client.evaluateDomRead("document.readyState")).rejects.toThrow(/apr_cdp_protocol_error:-32000:Promise was collected:class=DOM_READ:await_promise=false:expression=[a-f0-9]{16}/);
    client.close();
  });

  it("ricontrolla il fencing durante l'intera evaluate e termina il vecchio holder", async () => {
    const http = createServer();
    const server = new WebSocketServer({ server: http });
    const methods: string[] = [];
    let capabilityValid = true;
    let guardChecks = 0;
    let commandBoundaryRenewals = 0;
    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const message = JSON.parse(String(raw)) as { id: number; method: string };
        methods.push(message.method);
        if (message.method === "Runtime.evaluate") return;
        socket.send(JSON.stringify({ id: message.id, result: {} }));
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    closers.push(() => closeFixture(server, http as Server));

    const client = new CdpPageClient(`ws://127.0.0.1:${address.port}`, 1_000, null, { SERVER_RECONCILIATION: 1_000 }, () => {
      guardChecks += 1;
      if (!capabilityValid) throw new Error("apr_global_browser_access_fenced");
    }, () => { commandBoundaryRenewals += 1; });
    await client.connect();
    expect(commandBoundaryRenewals).toBe(2); // Runtime.enable + Page.enable
    const evaluation = client.evaluateServerReconciliation("new Promise(() => {})");
    const renewalsAtCommandBoundary = commandBoundaryRenewals;
    const checksAtCommandBoundary = guardChecks;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(commandBoundaryRenewals).toBe(renewalsAtCommandBoundary);
    expect(guardChecks).toBeGreaterThan(checksAtCommandBoundary);
    capabilityValid = false;
    await expect(evaluation).rejects.toThrow("apr_global_browser_access_fenced");
    expect(methods).toContain("Runtime.terminateExecution");
  });
});
