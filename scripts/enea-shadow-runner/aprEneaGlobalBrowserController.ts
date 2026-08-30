import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

export const APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION = "apr-enea-global-browser-controller-v1" as const;
export const APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID = "system-global-enea-browser-controller" as const;

export interface AprEneaGlobalBrowserAccess {
  token: string;
  ownerId: string;
  processPid: number;
  acquiredAt: string;
  purpose: "worker_tick" | "case_execution" | "keepalive" | "diagnostic_readonly";
  cohortRoot: string;
}

interface AprEneaGlobalBrowserLock extends AprEneaGlobalBrowserAccess {
  version: typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION;
  hostname: string;
  profileFingerprint: string;
  remoteDebuggingPort: number;
}

export interface AprEneaGlobalBrowserControllerState {
  version: typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION;
  revision: number;
  profileFingerprint: string;
  remoteDebuggingPort: number;
  activeOwnerId: string | null;
  activeProcessPid: number | null;
  activePurpose: AprEneaGlobalBrowserAccess["purpose"] | null;
  activeCohortRoot: string | null;
  activeSince: string | null;
  lastReleasedAt: string | null;
  lastKeepaliveAt: string | null;
  lastKeepaliveEvidenceId: string | null;
  audit: Array<{ revision: number; at: string; type: string; ownerId: string; reason: string; appliedRuleIds: [typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID] }>;
}

type ControllerOptions = {
  profileDirectory: string;
  remoteDebuggingPort: number;
  stateRoot?: string;
  now?: () => Date;
  pidIsAlive?: (pid: number) => boolean;
};

function atomicWrite(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function defaultPidIsAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export class PersistentAprEneaGlobalBrowserController {
  readonly profileFingerprint: string;
  readonly rootDirectory: string;
  readonly lockPath: string;
  readonly statePath: string;
  private readonly now: () => Date;
  private readonly pidIsAlive: (pid: number) => boolean;

  constructor(readonly options: ControllerOptions) {
    if (!path.isAbsolute(options.profileDirectory)) throw new Error("apr_global_browser_profile_path_not_absolute");
    if (!Number.isInteger(options.remoteDebuggingPort) || options.remoteDebuggingPort < 1024 || options.remoteDebuggingPort > 65_535) throw new Error("apr_global_browser_port_invalid");
    this.profileFingerprint = createHash("sha256").update(path.resolve(options.profileDirectory)).digest("hex");
    this.rootDirectory = path.resolve(options.stateRoot ?? path.join(path.dirname(options.profileDirectory), "global-enea-browser-controller", `${this.profileFingerprint.slice(0, 16)}-${options.remoteDebuggingPort}`));
    this.lockPath = path.join(this.rootDirectory, "exclusive-browser.lock.json");
    this.statePath = path.join(this.rootDirectory, "checkpoint.json");
    this.now = options.now ?? (() => new Date());
    this.pidIsAlive = options.pidIsAlive ?? defaultPidIsAlive;
    mkdirSync(this.rootDirectory, { recursive: true, mode: 0o700 });
  }

  private initialState(): AprEneaGlobalBrowserControllerState {
    return {
      version: APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION,
      revision: 0,
      profileFingerprint: this.profileFingerprint,
      remoteDebuggingPort: this.options.remoteDebuggingPort,
      activeOwnerId: null,
      activeProcessPid: null,
      activePurpose: null,
      activeCohortRoot: null,
      activeSince: null,
      lastReleasedAt: null,
      lastKeepaliveAt: null,
      lastKeepaliveEvidenceId: null,
      audit: [],
    };
  }

  snapshot(): AprEneaGlobalBrowserControllerState {
    if (!existsSync(this.statePath)) return this.initialState();
    const state = JSON.parse(readFileSync(this.statePath, "utf8")) as AprEneaGlobalBrowserControllerState;
    if (state.version !== APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION
      || state.profileFingerprint !== this.profileFingerprint
      || state.remoteDebuggingPort !== this.options.remoteDebuggingPort) throw new Error("apr_global_browser_state_binding_mismatch");
    return state;
  }

  private persistEvent(input: { type: string; ownerId: string; reason: string; access?: AprEneaGlobalBrowserAccess | null; keepalive?: { at: string; evidenceId: string } }) {
    const previous = this.snapshot();
    const revision = previous.revision + 1;
    const at = this.now().toISOString();
    const state: AprEneaGlobalBrowserControllerState = {
      ...previous,
      revision,
      activeOwnerId: input.access?.ownerId ?? null,
      activeProcessPid: input.access?.processPid ?? null,
      activePurpose: input.access?.purpose ?? null,
      activeCohortRoot: input.access?.cohortRoot ?? null,
      activeSince: input.access?.acquiredAt ?? null,
      lastReleasedAt: input.type === "browser_access_released" ? at : previous.lastReleasedAt,
      lastKeepaliveAt: input.keepalive?.at ?? previous.lastKeepaliveAt,
      lastKeepaliveEvidenceId: input.keepalive?.evidenceId ?? previous.lastKeepaliveEvidenceId,
      audit: [...previous.audit, { revision, at, type: input.type, ownerId: input.ownerId, reason: input.reason, appliedRuleIds: [APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID] as [typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID] }].slice(-500),
    };
    atomicWrite(this.statePath, state);
    return state;
  }

  private readLock(): AprEneaGlobalBrowserLock | null {
    if (!existsSync(this.lockPath)) return null;
    try {
      const lock = JSON.parse(readFileSync(this.lockPath, "utf8")) as AprEneaGlobalBrowserLock;
      if (lock.version !== APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION
        || lock.profileFingerprint !== this.profileFingerprint
        || lock.remoteDebuggingPort !== this.options.remoteDebuggingPort
        || !lock.token || !lock.ownerId) throw new Error("invalid");
      return lock;
    } catch {
      throw new Error("apr_global_browser_lock_corrupt_fail_closed");
    }
  }

  tryAcquire(input: { ownerId: string; cohortRoot: string; purpose?: AprEneaGlobalBrowserAccess["purpose"]; processPid?: number }): AprEneaGlobalBrowserAccess | null {
    if (!input.ownerId.trim()) throw new Error("apr_global_browser_owner_missing");
    const processPid = input.processPid ?? process.pid;
    const existing = this.readLock();
    let recoveredStalePid: number | null = null;
    if (existing) {
      if (existing.hostname === os.hostname()
        && existing.ownerId === input.ownerId
        && existing.processPid === processPid
        && existing.cohortRoot === path.resolve(input.cohortRoot)
        && existing.purpose === (input.purpose ?? "worker_tick")) {
        return existing;
      }
      const sameHost = existing.hostname === os.hostname();
      if (!sameHost || this.pidIsAlive(existing.processPid)) return null;
      unlinkSync(this.lockPath);
      recoveredStalePid = existing.processPid;
    }
    const access: AprEneaGlobalBrowserAccess = { token: randomUUID(), ownerId: input.ownerId, processPid, acquiredAt: this.now().toISOString(), purpose: input.purpose ?? "worker_tick", cohortRoot: path.resolve(input.cohortRoot) };
    const lock: AprEneaGlobalBrowserLock = {
      ...access,
      version: APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION,
      hostname: os.hostname(),
      profileFingerprint: this.profileFingerprint,
      remoteDebuggingPort: this.options.remoteDebuggingPort,
    };
    try {
      const descriptor = openSync(this.lockPath, "wx", 0o600);
      try { writeFileSync(descriptor, `${JSON.stringify(lock, null, 2)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
      throw error;
    }
    if (recoveredStalePid !== null) this.persistEvent({ type: "stale_browser_lock_recovered", ownerId: input.ownerId, reason: `Lock stale del PID ${recoveredStalePid} rimosso prima di una nuova acquisizione.`, access });
    this.persistEvent({ type: "browser_access_acquired", ownerId: access.ownerId, reason: `Accesso esclusivo ${access.purpose} acquisito dalla coorte ${access.cohortRoot}.`, access });
    return access;
  }

  release(access: AprEneaGlobalBrowserAccess) {
    const lock = this.readLock();
    if (!lock || lock.token !== access.token || lock.ownerId !== access.ownerId || lock.processPid !== access.processPid) throw new Error("apr_global_browser_release_not_owner");
    const state = this.persistEvent({ type: "browser_access_released", ownerId: access.ownerId, reason: `Accesso esclusivo ${access.purpose} rilasciato.` });
    unlinkSync(this.lockPath);
    return state;
  }

  keepaliveDue(intervalMs: number, now = this.now()) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("apr_global_browser_keepalive_interval_invalid");
    const last = this.snapshot().lastKeepaliveAt;
    return !last || !Number.isFinite(Date.parse(last)) || now.getTime() - Date.parse(last) >= intervalMs;
  }

  recordKeepalive(access: AprEneaGlobalBrowserAccess, evidenceId: string) {
    const lock = this.readLock();
    if (!lock || lock.token !== access.token) throw new Error("apr_global_browser_keepalive_without_access");
    if (!evidenceId.trim()) throw new Error("apr_global_browser_keepalive_evidence_missing");
    return this.persistEvent({ type: "global_keepalive_verified", ownerId: access.ownerId, reason: "Keepalive read-only unico della sessione ENEA verificato.", access, keepalive: { at: this.now().toISOString(), evidenceId } });
  }

  async runExclusive<T>(input: { ownerId: string; cohortRoot: string; purpose?: AprEneaGlobalBrowserAccess["purpose"]; processPid?: number; waitTimeoutMs?: number; retryIntervalMs?: number }, operation: (access: AprEneaGlobalBrowserAccess) => Promise<T>) {
    const startedAt = Date.now();
    const waitTimeoutMs = input.waitTimeoutMs ?? 30_000;
    const retryIntervalMs = input.retryIntervalMs ?? 25;
    let access: AprEneaGlobalBrowserAccess | null = null;
    while (!access) {
      access = this.tryAcquire(input);
      if (access) break;
      if (Date.now() - startedAt >= waitTimeoutMs) throw new Error("apr_global_browser_access_timeout");
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }
    try { return await operation(access); } finally { this.release(access); }
  }
}
