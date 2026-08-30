import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { CdpPageClient } from "./cdpClient";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close(); });

describe("timeout CDP con terminazione dell'esecuzione browser", () => {
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
    closers.push(async () => {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => (http as Server).close(() => resolve()));
    });

    const client = new CdpPageClient(`ws://127.0.0.1:${address.port}`, 1_000);
    await client.connect();
    await expect(client.evaluate("new Promise(() => {})", true, 25)).rejects.toThrow("apr_cdp_command_timeout:Runtime.evaluate");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(methods).toEqual(["Runtime.enable", "Page.enable", "Runtime.evaluate", "Runtime.terminateExecution"]);
    expect(socketClosed).toBe(true);
  });
});
