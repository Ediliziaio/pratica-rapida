import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import WebSocket from "ws";

export const APR_CDP_MAX_PAGE_OPERATION_MS = 30_000;
export const APR_CDP_EVALUATION_CONTRACTS = {
  DOM_READ: { timeoutMs: 5_000, maxInPageWaitMs: 0, safetyMarginMs: 1_000 },
  SHORT_MUTATION: { timeoutMs: 25_000, maxInPageWaitMs: 20_000, safetyMarginMs: 5_000 },
  NESTED_SAVE: { timeoutMs: 22_000, maxInPageWaitMs: 15_000, safetyMarginMs: 7_000 },
  SERVER_RECONCILIATION: { timeoutMs: 25_000, maxInPageWaitMs: 15_000, safetyMarginMs: 10_000 },
} as const;
export const APR_CDP_EVALUATION_TIMEOUTS = Object.fromEntries(Object.entries(APR_CDP_EVALUATION_CONTRACTS).map(([operationClass, contract]) => [operationClass, contract.timeoutMs])) as { [K in keyof typeof APR_CDP_EVALUATION_CONTRACTS]: (typeof APR_CDP_EVALUATION_CONTRACTS)[K]["timeoutMs"] };
export type AprCdpEvaluationClass = keyof typeof APR_CDP_EVALUATION_TIMEOUTS;

for (const [operationClass, contract] of Object.entries(APR_CDP_EVALUATION_CONTRACTS)) {
  if (contract.timeoutMs > APR_CDP_MAX_PAGE_OPERATION_MS) throw new Error(`apr_cdp_timeout_class_exceeds_max:${operationClass}:${contract.timeoutMs}`);
  if (contract.timeoutMs < contract.maxInPageWaitMs + contract.safetyMarginMs) throw new Error(`apr_cdp_timeout_class_margin_invalid:${operationClass}:${contract.timeoutMs}`);
}

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
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; fencingTimer: ReturnType<typeof setInterval> | null }>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(
    readonly webSocketUrl: string,
    readonly timeoutMs = 15_000,
    private readonly onClosed: (() => void) | null = null,
    private readonly evaluationTimeoutOverrides: Partial<Record<AprCdpEvaluationClass, number>> = {},
    private readonly accessGuard: ((mode: "readonly" | "mutating") => void) | null = null,
    private readonly accessRenewal: ((mode: "readonly" | "mutating") => void) | null = null,
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
      if (pending.fencingTimer) clearInterval(pending.fencingTimer);
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
      clearTimeout(pending.timer);
      if (pending.fencingTimer) clearInterval(pending.fencingTimer);
      this.pending.delete(message.id);
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

  private async sendClassified<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs: number, accessMode: "readonly" | "mutating"): Promise<T> {
    // Il rinnovo e' ammesso soltanto quando inizia un nuovo comando. Il timer
    // di fencing sottostante continua invece a fare sole assert: un comando
    // vivo ma bloccato non puo' auto-rinnovarsi indefinitamente.
    this.accessRenewal?.(accessMode);
    this.accessGuard?.(accessMode);
    await this.connect();
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const fenceOperation = (error: unknown) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        if (pending.fencingTimer) clearInterval(pending.fencingTimer);
        const socket = this.socket;
        this.socket = null;
        void (async () => {
          if (method === "Runtime.evaluate" && socket) await this.terminateTimedOutRuntimeExecution(socket);
          if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate();
          this.reportClosed();
          reject(error instanceof Error ? error : new Error(String(error)));
        })();
      };
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (pending.fencingTimer) clearInterval(pending.fencingTimer);
        // A Runtime.evaluate that outlives a React remount can leave this CDP
        // session unusable even though the Chrome tab itself is still valid.
        // Detach only the websocket: the next read/preparation gets a fresh
        // client for the same target and no browser mutation is repeated.
        const socket = this.socket;
        this.socket = null;
        void (async () => {
          if (method === "Runtime.evaluate" && socket) await this.terminateTimedOutRuntimeExecution(socket);
          if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate();
          this.reportClosed();
          reject(new Error(`apr_cdp_command_timeout:${method}`));
        })();
      }, timeoutMs);
      const fencingTimer = this.accessGuard ? setInterval(() => {
        try { this.accessGuard?.(accessMode); }
        catch (error) { fenceOperation(error); }
      }, Math.min(250, Math.max(25, Math.floor(timeoutMs / 4)))) : null;
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer, fencingTimer });
      this.socket!.send(JSON.stringify({ id, method, params }));
    });
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = this.timeoutMs): Promise<T> {
    const accessMode = /^Input\.|^DOM\.set|^Runtime\.callFunctionOn|^Page\.navigate$|^Target\.(createTarget|closeTarget)$/.test(method) ? "mutating" : "readonly";
    return this.sendClassified<T>(method, params, timeoutMs, accessMode);
  }

  private async evaluateClassified<T>(expression: string, operationClass: AprCdpEvaluationClass, awaitPromise = true): Promise<T> {
    this.accessGuard?.(operationClass === "SHORT_MUTATION" || operationClass === "NESTED_SAVE" ? "mutating" : "readonly");
    const timeoutMs = this.evaluationTimeoutOverrides[operationClass] ?? APR_CDP_EVALUATION_TIMEOUTS[operationClass];
    if (!Number.isFinite(timeoutMs) || timeoutMs > APR_CDP_MAX_PAGE_OPERATION_MS) throw new Error(`apr_cdp_timeout_class_exceeds_max:${operationClass}:${timeoutMs}`);
    if (timeoutMs <= 0 || timeoutMs > APR_CDP_EVALUATION_TIMEOUTS[operationClass]) throw new Error(`apr_cdp_timeout_class_override_invalid:${operationClass}:${timeoutMs}`);
    const expressionFingerprint = createHash("sha256").update(expression).digest("hex").slice(0, 16);
    let result: { result: { value?: T; description?: string; subtype?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
    try {
      result = await this.send<typeof result>("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
      }, timeoutMs);
    } catch (error) {
      if (error instanceof Error && error.message === "apr_cdp_command_timeout:Runtime.evaluate") {
        throw new Error(`${error.message}:class=${operationClass}:timeout_ms=${timeoutMs}:expression=${expressionFingerprint}`);
      }
      if (error instanceof Error && error.message.startsWith("apr_cdp_protocol_error:")) {
        throw new Error(`${error.message}:class=${operationClass}:await_promise=${awaitPromise}:expression=${expressionFingerprint}`);
      }
      throw error;
    }
    if (result.exceptionDetails) throw new Error(`apr_cdp_evaluation_failed:${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "unknown"}`);
    return result.result.value as T;
  }

  evaluateDomRead<T>(expression: string, awaitPromise = false) { return this.evaluateClassified<T>(expression, "DOM_READ", awaitPromise); }
  evaluateShortMutation<T>(expression: string, awaitPromise = true) { return this.evaluateClassified<T>(expression, "SHORT_MUTATION", awaitPromise); }
  evaluateNestedSave<T>(expression: string, awaitPromise = true) { return this.evaluateClassified<T>(expression, "NESTED_SAVE", awaitPromise); }
  evaluateServerReconciliation<T>(expression: string, awaitPromise = true) { return this.evaluateClassified<T>(expression, "SERVER_RECONCILIATION", awaitPromise); }

  async navigate(url: string) {
    this.accessGuard?.("mutating");
    const result = await this.send<{ frameId: string; errorText?: string }>("Page.navigate", { url });
    if (result.errorText) throw new Error(`apr_cdp_navigation_failed:${result.errorText}`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await this.evaluateDomRead<string>("document.readyState");
      if (state === "complete" || state === "interactive") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("apr_cdp_navigation_timeout");
  }

  async navigateReadonlyGet(url: string, allowedOrigin: string) {
    const destination = new URL(url);
    const origin = new URL(allowedOrigin).origin;
    const loopbackFixture = destination.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname);
    if ((destination.protocol !== "https:" && !loopbackFixture) || destination.origin !== origin || destination.username || destination.password) {
      throw new Error("apr_cdp_readonly_navigation_origin_rejected");
    }
    const result = await this.sendClassified<{ frameId: string; errorText?: string }>("Page.navigate", { url: destination.toString() }, this.timeoutMs, "readonly");
    if (result.errorText) throw new Error(`apr_cdp_navigation_failed:${result.errorText}`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await this.evaluateDomRead<string>("document.readyState");
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
  receiptDirectory?: string;
  processIdentityReader?: (pid: number) => { processStartedAt: string; command: string };
}

export interface AprChromeInstanceReceipt {
  version: "apr-chrome-instance-receipt-v1";
  nonce: string;
  pid: number;
  processStartedAt: string;
  chromeExecutable: string;
  canonicalProfileDirectory: string;
  remoteDebuggingPort: number;
  commandFingerprint: string;
  createdAt: string;
}

interface AprCdpClientRegistry {
  version: "apr-cdp-client-registry-v1";
  updatedAt: string;
  clients: Array<{
    clientId: string;
    pid: number;
    processStartedAt: string;
    ownerId: string;
    fencingEpoch: number;
    targetId: string;
    webSocketUrl: string;
    openedAt: string;
  }>;
}

function atomicWriteJson(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

export class PersistentAprChromeRuntime {
  readonly port: number;
  readonly canonicalProfileDirectory: string;
  readonly receiptPath: string;
  readonly clientRegistryPath: string;
  readonly attachReadinessReceiptPath: string;
  private child: ChildProcess | null = null;
  private diagnostics = "";
  private pageClients = new Map<string, { webSocketUrl: string; client: CdpPageClient }>();
  private openingPageClients = new Map<string, { webSocketUrl: string; client: CdpPageClient; promise: Promise<CdpPageClient> }>();
  private openedPageClientCount = 0;
  private closedPageClientCount = 0;
  private accessGuard: ((mode: "readonly" | "mutating") => void) | null = null;
  private accessRenewal: ((mode: "readonly" | "mutating") => void) | null = null;
  private accessIdentity: { ownerId: string; fencingEpoch: number } | null = null;

  constructor(readonly options: AprChromeRuntimeOptions) {
    this.port = options.remoteDebuggingPort ?? 9331;
    if (!Number.isInteger(this.port) || this.port < 1024 || this.port > 65_535) throw new Error("apr_chrome_debugging_port_invalid");
    if (!path.isAbsolute(options.chromeExecutable) || !path.isAbsolute(options.profileDirectory)) throw new Error("apr_chrome_paths_must_be_absolute");
    mkdirSync(options.profileDirectory, { recursive: true, mode: 0o700 });
    this.canonicalProfileDirectory = realpathSync(options.profileDirectory);
    const receiptDirectory = path.resolve(options.receiptDirectory ?? path.join(this.canonicalProfileDirectory, ".apr-runtime"));
    this.receiptPath = path.join(receiptDirectory, `chrome-${this.port}.receipt.json`);
    this.clientRegistryPath = path.join(receiptDirectory, `cdp-clients-${this.port}.json`);
    this.attachReadinessReceiptPath = path.join(receiptDirectory, `cdp-attach-${this.port}.receipt.json`);
  }

  get endpoint() { return `http://127.0.0.1:${this.port}`; }
  get profileFingerprint() { return createHash("sha256").update(this.canonicalProfileDirectory).digest("hex"); }

  setAccessGuard(guard: (mode: "readonly" | "mutating") => void, identity?: { ownerId: string; fencingEpoch: number }, renewal?: (mode: "readonly" | "mutating") => void) {
    this.accessGuard = guard;
    this.accessIdentity = identity ?? null;
    this.accessRenewal = renewal ?? null;
  }

  private readClientRegistry(): AprCdpClientRegistry {
    if (!existsSync(this.clientRegistryPath)) return { version: "apr-cdp-client-registry-v1", updatedAt: new Date(0).toISOString(), clients: [] };
    const value = JSON.parse(readFileSync(this.clientRegistryPath, "utf8")) as AprCdpClientRegistry;
    if (value.version !== "apr-cdp-client-registry-v1" || !Array.isArray(value.clients)) throw new Error("apr_cdp_client_registry_corrupt_fail_closed");
    return value;
  }

  private processIdentityMatches(record: AprCdpClientRegistry["clients"][number]) {
    try { return this.processIdentity(record.pid).processStartedAt === record.processStartedAt; }
    catch { return false; }
  }

  private cleanAndAssertNoForeignCdpClients() {
    if (!this.accessIdentity) throw new Error("apr_cdp_runtime_access_identity_required");
    const registry = this.readClientRegistry();
    const live = registry.clients.filter((record) => this.processIdentityMatches(record));
    const foreign = live.filter((record) => record.pid !== process.pid || record.ownerId !== this.accessIdentity!.ownerId || record.fencingEpoch !== this.accessIdentity!.fencingEpoch);
    if (foreign.length) throw new Error(`apr_cdp_residual_clients_fail_closed:${foreign.map((record) => `${record.ownerId}:${record.pid}:${record.targetId}`).join(",")}`);
    if (live.length !== registry.clients.length) atomicWriteJson(this.clientRegistryPath, { ...registry, updatedAt: new Date().toISOString(), clients: live });
    return live;
  }

  private registerPageClient(clientId: string, target: CdpTargetInfo) {
    const identity = this.accessIdentity;
    if (!identity || !target.webSocketDebuggerUrl) throw new Error("apr_cdp_runtime_access_identity_required");
    const clients = this.cleanAndAssertNoForeignCdpClients();
    const processStartedAt = this.processIdentity(process.pid).processStartedAt;
    const next: AprCdpClientRegistry = { version: "apr-cdp-client-registry-v1", updatedAt: new Date().toISOString(), clients: [...clients, { clientId, pid: process.pid, processStartedAt, ownerId: identity.ownerId, fencingEpoch: identity.fencingEpoch, targetId: target.id, webSocketUrl: target.webSocketDebuggerUrl, openedAt: new Date().toISOString() }] };
    atomicWriteJson(this.clientRegistryPath, next);
  }

  private unregisterPageClient(clientId: string) {
    const registry = this.readClientRegistry();
    const clients = registry.clients.filter((record) => record.clientId !== clientId);
    atomicWriteJson(this.clientRegistryPath, { ...registry, updatedAt: new Date().toISOString(), clients });
  }

  private processIdentity(pid: number) {
    if (this.options.processIdentityReader) return this.options.processIdentityReader(pid);
    try {
      const output = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart=", "-o", "command="], { encoding: "utf8", timeout: 2_000 }).trim();
      const match = output.match(/^(\S+\s+\S+\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/s);
      if (!match) throw new Error("unparseable");
      return { processStartedAt: match[1].replace(/\s+/g, " "), command: match[2] };
    } catch { throw new Error("apr_chrome_process_identity_unavailable"); }
  }

  private commandFingerprint(command: string) { return createHash("sha256").update(command).digest("hex"); }

  private verifyReceipt() {
    if (!existsSync(this.receiptPath)) throw new Error("apr_chrome_instance_receipt_missing_fail_closed");
    const receipt = JSON.parse(readFileSync(this.receiptPath, "utf8")) as AprChromeInstanceReceipt;
    if (receipt.version !== "apr-chrome-instance-receipt-v1" || receipt.remoteDebuggingPort !== this.port || receipt.canonicalProfileDirectory !== this.canonicalProfileDirectory || receipt.chromeExecutable !== realpathSync(this.options.chromeExecutable) || !receipt.nonce) throw new Error("apr_chrome_instance_receipt_binding_mismatch");
    const identity = this.processIdentity(receipt.pid);
    if (identity.processStartedAt !== receipt.processStartedAt || this.commandFingerprint(identity.command) !== receipt.commandFingerprint || !identity.command.includes(`--remote-debugging-port=${this.port}`) || !identity.command.includes(`--user-data-dir=${this.canonicalProfileDirectory}`)) throw new Error("apr_chrome_process_identity_mismatch");
    return receipt;
  }

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
    if (await this.isRunning()) { const receipt = this.verifyReceipt(); return { started: false, pid: receipt.pid, profileFingerprint: this.profileFingerprint, instanceNonce: receipt.nonce }; }
    if (!existsSync(this.options.chromeExecutable)) throw new Error("apr_chrome_executable_missing");
    mkdirSync(this.options.profileDirectory, { recursive: true, mode: 0o700 });
    const args = [
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.canonicalProfileDirectory}`,
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
    // Chrome APR e' un servizio persistente indipendente dal worker che lo
    // avvia. Un bootout/SIGTERM del worker non deve propagarsi al browser.
    this.child = spawn(this.options.chromeExecutable, args, { stdio: "ignore", detached: true });
    this.child.unref();
    this.child.once("exit", () => { this.child = null; });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await this.isRunning()) {
        const pid = this.child?.pid;
        if (!pid) throw new Error("apr_chrome_main_process_pid_missing");
        const identity = this.processIdentity(pid);
        const receipt: AprChromeInstanceReceipt = { version: "apr-chrome-instance-receipt-v1", nonce: randomUUID(), pid, processStartedAt: identity.processStartedAt, chromeExecutable: realpathSync(this.options.chromeExecutable), canonicalProfileDirectory: this.canonicalProfileDirectory, remoteDebuggingPort: this.port, commandFingerprint: this.commandFingerprint(identity.command), createdAt: new Date().toISOString() };
        atomicWriteJson(this.receiptPath, receipt);
        this.verifyReceipt();
        return { started: true, pid, profileFingerprint: this.profileFingerprint, instanceNonce: receipt.nonce };
      }
      if (!this.child) throw new Error("apr_chrome_exited:unknown");
      if (this.child.exitCode !== null) throw new Error(`apr_chrome_exited:${this.child.exitCode}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`apr_chrome_start_timeout:${this.diagnostics.trim().slice(-1_000) || "no_diagnostics"}`);
  }

  async targets() {
    this.accessRenewal?.("readonly");
    this.accessGuard?.("readonly");
    const browser = await this.ensureRunning();
    const targets = await this.getJson<CdpTargetInfo[]>("/json/list");
    const sameOwnerClients = this.cleanAndAssertNoForeignCdpClients();
    atomicWriteJson(this.attachReadinessReceiptPath, {
      version: "apr-cdp-attach-readiness-receipt-v1",
      observedAt: new Date().toISOString(),
      instanceNonce: browser.instanceNonce,
      ownerId: this.accessIdentity!.ownerId,
      fencingEpoch: this.accessIdentity!.fencingEpoch,
      targetIds: targets.filter((target) => target.type === "page").map((target) => target.id).sort(),
      foreignResidualClientCount: 0,
      sameOwnerClientCount: sameOwnerClients.length,
    });
    return targets;
  }

  async findPage(predicate: (target: CdpTargetInfo) => boolean) {
    return (await this.targets()).find((target) => target.type === "page" && target.webSocketDebuggerUrl && predicate(target)) ?? null;
  }

  async openPage(url: string) {
    this.accessRenewal?.("mutating");
    this.accessGuard?.("mutating");
    await this.targets();
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
    const clientId = randomUUID();
    client = new CdpPageClient(target.webSocketDebuggerUrl, this.options.headless ? 90_000 : 15_000, () => {
      const registered = this.pageClients.get(target.id);
      if (registered?.client === client) this.pageClients.delete(target.id);
      if (countedAsOpened) this.closedPageClientCount += 1;
      try { this.unregisterPageClient(clientId); } catch { /* il registro corrotto resta fail-closed alla prossima apertura */ }
    }, {}, (mode) => this.accessGuard?.(mode), (mode) => this.accessRenewal?.(mode));
    const promise = (async () => {
      try {
        this.registerPageClient(clientId, target);
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
    // Compatibilita' per i chiamanti storici: "stop" chiude esclusivamente
    // le connessioni CDP possedute da questo runtime. Il processo Chrome APR
    // non e' un target arrestabile dal software operativo.
    this.closeAllPageClients();
  }

  async disposeEphemeralFixtureForTest() {
    this.closeAllPageClients();
    if (!this.options.headless) throw new Error("apr_persistent_chrome_process_is_immortal");
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
