import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import WebSocket from "ws";

export const APR_CDP_DEFAULT_PAGE_OPERATION_MS = 5_000;
export const APR_CDP_MAX_PAGE_OPERATION_MS = 20_000;

export interface CdpTargetInfo {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export class CdpPageClient {
  private socket: WebSocket | null = null;
  private closeReported = false;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(
    readonly webSocketUrl: string,
    readonly timeoutMs = 15_000,
    private readonly onClosed: (() => void) | null = null,
  ) {}

  get connected() { return this.socket?.readyState === WebSocket.OPEN; }

  private reportClosed() {
    if (this.closeReported) return;
    this.closeReported = true;
    this.onClosed?.();
  }

  private rejectPending(reason: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return this;
    const socket = new WebSocket(this.webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error("apr_cdp_connect_timeout")); }, this.timeoutMs);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); socket.close(); reject(new Error("apr_cdp_connect_failed")); }, { once: true });
    });
    socket.addEventListener("message", (event) => {
      let message: CdpResponse;
      try { message = JSON.parse(String(event.data)) as CdpResponse; } catch { return; }
      if (!message.id) {
        if (message.method) for (const listener of this.eventListeners.get(message.method) ?? []) listener(message.params);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`apr_cdp_protocol_error:${message.error.code}:${message.error.message}`));
      else pending.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      this.rejectPending("apr_cdp_connection_closed"); this.socket = null; this.reportClosed();
    });
    this.socket = socket;
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onEvent<T = unknown>(method: string, listener: (params: T) => void) {
    const listeners = this.eventListeners.get(method) ?? new Set<(params: unknown) => void>();
    const wrapped = listener as (params: unknown) => void;
    listeners.add(wrapped); this.eventListeners.set(method, listeners);
    return () => { listeners.delete(wrapped); if (listeners.size === 0) this.eventListeners.delete(method); };
  }

  private async terminateTimedOutRuntimeExecution(socket: WebSocket) {
    if (socket.readyState !== WebSocket.OPEN) return;
    const terminationId = ++this.sequence;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(graceTimer);
        socket.removeEventListener("message", onMessage);
        resolve();
      };
      const onMessage = (event: { data: unknown }) => {
        try {
          const message = JSON.parse(String(event.data)) as CdpResponse;
          if (message.id === terminationId) finish();
        } catch { /* attende il limite breve e chiude comunque */ }
      };
      const graceTimer = setTimeout(finish, 1_000);
      socket.addEventListener("message", onMessage);
      try { socket.send(JSON.stringify({ id: terminationId, method: "Runtime.terminateExecution", params: {} })); } catch { finish(); }
    });
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = this.timeoutMs): Promise<T> {
    await this.connect();
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // A Runtime.evaluate that outlives a React remount can leave this CDP
        // session unusable even though the Chrome tab itself is still valid.
        // Detach only the websocket: the next read/preparation gets a fresh
        // client for the same target and no browser mutation is repeated.
        const socket = this.socket;
        this.socket = null;
        void (async () => {
          if (method === "Runtime.evaluate" && socket) await this.terminateTimedOutRuntimeExecution(socket);
          if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
          this.reportClosed();
          reject(new Error(`apr_cdp_command_timeout:${method}`));
        })();
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.socket!.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string, awaitPromise = true, timeoutMs = APR_CDP_DEFAULT_PAGE_OPERATION_MS): Promise<T> {
    const boundedTimeoutMs = Math.min(timeoutMs, APR_CDP_MAX_PAGE_OPERATION_MS);
    const result = await this.send<{ result: { value?: T; description?: string; subtype?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    }, boundedTimeoutMs);
    if (result.exceptionDetails) throw new Error(`apr_cdp_evaluation_failed:${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "unknown"}`);
    return result.result.value as T;
  }

  async navigate(url: string) {
    const result = await this.send<{ frameId: string; errorText?: string }>("Page.navigate", { url });
    if (result.errorText) throw new Error(`apr_cdp_navigation_failed:${result.errorText}`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await this.evaluate<string>("document.readyState");
      if (state === "complete" || state === "interactive") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("apr_cdp_navigation_timeout");
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    this.eventListeners.clear();
    this.rejectPending("apr_cdp_connection_closed");
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    this.reportClosed();
  }
}

export interface AprChromeRuntimeOptions {
  chromeExecutable: string;
  profileDirectory: string;
  remoteDebuggingPort?: number;
  headless?: boolean;
  initialUrl?: string;
}

export class PersistentAprChromeRuntime {
  readonly port: number;
  private child: ChildProcess | null = null;
  private diagnostics = "";
  private pageClients = new Map<string, { webSocketUrl: string; client: CdpPageClient }>();
  private openingPageClients = new Map<string, { webSocketUrl: string; client: CdpPageClient; promise: Promise<CdpPageClient> }>();
  private openedPageClientCount = 0;
  private closedPageClientCount = 0;

  constructor(readonly options: AprChromeRuntimeOptions) {
    this.port = options.remoteDebuggingPort ?? 9331;
    if (!Number.isInteger(this.port) || this.port < 1024 || this.port > 65_535) throw new Error("apr_chrome_debugging_port_invalid");
    if (!path.isAbsolute(options.chromeExecutable) || !path.isAbsolute(options.profileDirectory)) throw new Error("apr_chrome_paths_must_be_absolute");
  }

  get endpoint() { return `http://127.0.0.1:${this.port}`; }
  get profileFingerprint() { return createHash("sha256").update(path.resolve(this.options.profileDirectory)).digest("hex"); }

  private async getJson<T>(pathname: string, init?: { method?: string }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Le fixture headless macOS possono sospendere brevemente il processo
      // Chrome sotto il carico della suite seriale completa. Il runtime GUI
      // operativo conserva il fail-fast a 3 s; soltanto il Chrome headless
      // isolato concede una finestra più ampia prima di dichiarare l'endpoint
      // locale irraggiungibile.
      const endpointTimeoutMs = this.options.headless ? 15_000 : 3_000;
      const operation = request({ hostname: "127.0.0.1", port: this.port, path: pathname, method: init?.method ?? "GET", timeout: endpointTimeoutMs }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) { reject(new Error(`apr_chrome_endpoint_http_${response.statusCode ?? "unknown"}`)); return; }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T); } catch { reject(new Error("apr_chrome_endpoint_json_invalid")); }
        });
      });
      operation.once("timeout", () => operation.destroy(new Error("apr_chrome_endpoint_timeout")));
      operation.once("error", reject);
      operation.end();
    });
  }

  async isRunning() {
    try { const value = await this.getJson<{ webSocketDebuggerUrl?: string }>("/json/version"); return Boolean(value.webSocketDebuggerUrl); } catch { return false; }
  }

  async ensureRunning() {
    if (await this.isRunning()) return { started: false, pid: this.child?.pid ?? null, profileFingerprint: this.profileFingerprint };
    if (!existsSync(this.options.chromeExecutable)) throw new Error("apr_chrome_executable_missing");
    mkdirSync(this.options.profileDirectory, { recursive: true, mode: 0o700 });
    const args = [
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.options.profileDirectory}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-features=OptimizationHints,MediaRouter",
      ...(this.options.headless ? [
        "--headless=new",
        "--disable-gpu",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ] : []),
      this.options.initialUrl ?? "about:blank",
    ];
    this.child = spawn(this.options.chromeExecutable, args, { stdio: ["ignore", "ignore", "pipe"], detached: false });
    this.child.stderr?.on("data", (chunk) => { this.diagnostics = `${this.diagnostics}${String(chunk)}`.slice(-4_000); });
    this.child.once("exit", () => { this.child = null; });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await this.isRunning()) return { started: true, pid: this.child?.pid ?? null, profileFingerprint: this.profileFingerprint };
      if (!this.child) throw new Error("apr_chrome_exited:unknown");
      if (this.child.exitCode !== null) throw new Error(`apr_chrome_exited:${this.child.exitCode}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`apr_chrome_start_timeout:${this.diagnostics.trim().slice(-1_000) || "no_diagnostics"}`);
  }

  async targets() {
    await this.ensureRunning();
    return this.getJson<CdpTargetInfo[]>("/json/list");
  }

  async findPage(predicate: (target: CdpTargetInfo) => boolean) {
    return (await this.targets()).find((target) => target.type === "page" && target.webSocketDebuggerUrl && predicate(target)) ?? null;
  }

  async openPage(url: string) {
    const target = await this.getJson<CdpTargetInfo>(`/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    if (!target.webSocketDebuggerUrl) throw new Error("apr_chrome_new_target_missing_websocket");
    return target;
  }

  async pageClient(target: CdpTargetInfo) {
    if (!target.webSocketDebuggerUrl) throw new Error("apr_chrome_target_missing_websocket");
    const existing = this.pageClients.get(target.id);
    if (existing?.webSocketUrl === target.webSocketDebuggerUrl && existing.client.connected) return existing.client;
    if (existing) this.closePageClient(target.id);
    const opening = this.openingPageClients.get(target.id);
    if (opening?.webSocketUrl === target.webSocketDebuggerUrl) return opening.promise;
    if (opening) this.closePageClient(target.id);
    // Headless fixture Chrome can be deliberately throttled by macOS while it
    // has no visible surface. Give those local probes more time without
    // weakening the 15-second fail-closed deadline of the operational GUI.
    let client: CdpPageClient;
    let countedAsOpened = false;
    client = new CdpPageClient(target.webSocketDebuggerUrl, this.options.headless ? 90_000 : 15_000, () => {
      const registered = this.pageClients.get(target.id);
      if (registered?.client === client) this.pageClients.delete(target.id);
      if (countedAsOpened) this.closedPageClientCount += 1;
    });
    const promise = (async () => {
      try {
        await client.connect();
        if (!client.connected) throw new Error("apr_cdp_connection_closed");
        countedAsOpened = true;
        this.pageClients.set(target.id, { webSocketUrl: target.webSocketDebuggerUrl!, client });
        this.openedPageClientCount += 1;
        return client;
      } catch (error) {
        client.close();
        throw error;
      } finally {
        const registered = this.openingPageClients.get(target.id);
        if (registered?.client === client) this.openingPageClients.delete(target.id);
      }
    })();
    this.openingPageClients.set(target.id, { webSocketUrl: target.webSocketDebuggerUrl, client, promise });
    return promise;
  }

  closePageClient(targetId: string) {
    const opening = this.openingPageClients.get(targetId);
    if (opening) {
      this.openingPageClients.delete(targetId);
      opening.client.close();
    }
    const registered = this.pageClients.get(targetId);
    if (!registered) return;
    this.pageClients.delete(targetId);
    registered.client.close();
  }

  closePageClientsExcept(targetId: string) {
    for (const candidateId of [...this.pageClients.keys()]) if (candidateId !== targetId) this.closePageClient(candidateId);
  }

  closeAllPageClients() {
    for (const targetId of new Set([...this.openingPageClients.keys(), ...this.pageClients.keys()])) this.closePageClient(targetId);
  }

  connectionStats() {
    for (const [targetId, registered] of this.pageClients) if (!registered.client.connected) this.pageClients.delete(targetId);
    return {
      active: this.pageClients.size,
      opened: this.openedPageClientCount,
      closed: this.closedPageClientCount,
      targetIds: [...this.pageClients.keys()].sort(),
    };
  }

  async stop() {
    this.closeAllPageClients();
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5_000);
      child.once("exit", () => { clearTimeout(timer); resolve(true); });
    });
    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    for (let attempt = 0; attempt < 20 && await this.isRunning(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
