import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import WebSocket from "ws";

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
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(readonly webSocketUrl: string, readonly timeoutMs = 15_000) {}

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return this;
    const socket = new WebSocket(this.webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("apr_cdp_connect_timeout")), this.timeoutMs);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("apr_cdp_connect_failed")); }, { once: true });
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
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("apr_cdp_connection_closed")); }
      this.pending.clear(); this.socket = null;
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

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = this.timeoutMs): Promise<T> {
    await this.connect();
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`apr_cdp_command_timeout:${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.socket!.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string, awaitPromise = true, timeoutMs = this.timeoutMs): Promise<T> {
    const result = await this.send<{ result: { value?: T; description?: string; subtype?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
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

  close() { this.socket?.close(); this.socket = null; this.eventListeners.clear(); }
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

  constructor(readonly options: AprChromeRuntimeOptions) {
    this.port = options.remoteDebuggingPort ?? 9331;
    if (!Number.isInteger(this.port) || this.port < 1024 || this.port > 65_535) throw new Error("apr_chrome_debugging_port_invalid");
    if (!path.isAbsolute(options.chromeExecutable) || !path.isAbsolute(options.profileDirectory)) throw new Error("apr_chrome_paths_must_be_absolute");
  }

  get endpoint() { return `http://127.0.0.1:${this.port}`; }
  get profileFingerprint() { return createHash("sha256").update(path.resolve(this.options.profileDirectory)).digest("hex"); }

  private async getJson<T>(pathname: string, init?: { method?: string }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const operation = request({ hostname: "127.0.0.1", port: this.port, path: pathname, method: init?.method ?? "GET", timeout: 3_000 }, (response) => {
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
    // Headless fixture Chrome can be deliberately throttled by macOS while it
    // has no visible surface. Give those local probes more time without
    // weakening the 15-second fail-closed deadline of the operational GUI.
    return new CdpPageClient(target.webSocketDebuggerUrl, this.options.headless ? 90_000 : 15_000).connect();
  }

  async stop() {
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
