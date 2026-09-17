import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

export const APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION = "apr-enea-global-browser-controller-v2" as const;
export const APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID = "system-global-enea-browser-controller-fenced-lease-v2" as const;
export const APR_ENEA_GLOBAL_BROWSER_LOCK_PUBLICATION_RULE_ID = "system-global-browser-lock-atomic-publication-v1" as const;
export const APR_ENEA_BROWSER_LEASE_DEFAULT_MS = 120_000;
export type AprEneaCdpAccessMode = "readonly" | "mutating";

export interface AprEneaGlobalBrowserAccess {
  token: string;
  fencingEpoch: number;
  ownerId: string;
  processPid: number;
  acquiredAt: string;
  leaseUntil: string;
  accessMode: AprEneaCdpAccessMode;
  purpose: "worker_tick" | "case_execution" | "one_shot" | "keepalive" | "diagnostic_readonly";
  cohortRoot: string;
}

interface AprEneaGlobalBrowserLock extends AprEneaGlobalBrowserAccess {
  version: typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION;
  hostname: string;
  profileFingerprint: string;
  canonicalProfileDirectory: string;
  remoteDebuggingPort: number;
}

export interface AprEneaGlobalBrowserControllerState {
  version: typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION;
  revision: number;
  fencingEpoch: number;
  profileFingerprint: string;
  canonicalProfileDirectory: string;
  remoteDebuggingPort: number;
  activeOwnerId: string | null;
  activeProcessPid: number | null;
  activePurpose: AprEneaGlobalBrowserAccess["purpose"] | null;
  activeAccessMode: AprEneaCdpAccessMode | null;
  activeCohortRoot: string | null;
  activeSince: string | null;
  activeLeaseUntil: string | null;
  lastReleasedAt: string | null;
  lastKeepaliveAt: string | null;
  lastKeepaliveEvidenceId: string | null;
  audit: Array<{ revision: number; at: string; type: string; ownerId: string; reason: string; appliedRuleIds: [typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID, typeof APR_ENEA_GLOBAL_BROWSER_LOCK_PUBLICATION_RULE_ID] }>;
}

type ControllerOptions = { profileDirectory: string; remoteDebuggingPort: number; stateRoot?: string; leaseMs?: number; now?: () => Date; pidIsAlive?: (pid: number) => boolean };

function atomicWrite(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

export function atomicCreateExclusiveJson(target: string, value: unknown): boolean {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.publish-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      fsyncSync(descriptor);
    } catch (error) {
      try { unlinkSync(temporary); } catch { /* Preserve the publication failure. */ }
      throw error;
    }
  } finally {
    closeSync(descriptor);
  }
  try {
    try {
      // A same-filesystem hard link publishes the already complete inode in one
      // namespace operation and, unlike rename, never replaces an existing lock.
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
    const directory = openSync(path.dirname(target), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
    return true;
  } finally {
    try { unlinkSync(temporary); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

function canonicalDirectory(directory: string) { mkdirSync(directory, { recursive: true, mode: 0o700 }); return realpathSync(directory); }
function defaultPidIsAlive(pid: number) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch { return false; } }

export interface AprEneaReadonlyCdpCapability {
  readonly kind: "apr_enea_cdp_readonly";
  readonly access: AprEneaGlobalBrowserAccess;
  assertValid(): void;
  renew(): AprEneaGlobalBrowserAccess;
}
export interface AprEneaMutatingCdpCapability extends Omit<AprEneaReadonlyCdpCapability, "kind"> {
  readonly kind: "apr_enea_cdp_mutating";
  assertMutationAllowed(): void;
}
export type AprEneaCdpCapability = AprEneaReadonlyCdpCapability | AprEneaMutatingCdpCapability;

interface LegacyAprEneaGlobalBrowserLock {
  version: "apr-enea-global-browser-controller-v1";
  token: string;
  ownerId: string;
  processPid: number;
  acquiredAt: string;
  purpose: "worker_tick" | "case_execution" | "keepalive" | "diagnostic_readonly";
  cohortRoot: string;
  hostname: string;
  profileFingerprint: string;
  remoteDebuggingPort: number;
}

export class PersistentAprEneaGlobalBrowserController {
  readonly profileFingerprint: string;
  readonly canonicalProfileDirectory: string;
  readonly rootDirectory: string;
  readonly lockPath: string;
  readonly statePath: string;
  private readonly now: () => Date;
  private readonly pidIsAlive: (pid: number) => boolean;
  private readonly leaseMs: number;

  constructor(readonly options: ControllerOptions) {
    if (!path.isAbsolute(options.profileDirectory)) throw new Error("apr_global_browser_profile_path_not_absolute");
    if (!Number.isInteger(options.remoteDebuggingPort) || options.remoteDebuggingPort < 1024 || options.remoteDebuggingPort > 65_535) throw new Error("apr_global_browser_port_invalid");
    this.leaseMs = options.leaseMs ?? APR_ENEA_BROWSER_LEASE_DEFAULT_MS;
    if (!Number.isFinite(this.leaseMs) || this.leaseMs < 1_000) throw new Error("apr_global_browser_lease_invalid");
    this.canonicalProfileDirectory = canonicalDirectory(options.profileDirectory);
    this.profileFingerprint = createHash("sha256").update(this.canonicalProfileDirectory).digest("hex");
    this.rootDirectory = path.resolve(options.stateRoot ?? path.join(path.dirname(this.canonicalProfileDirectory), "global-enea-browser-controller", `${this.profileFingerprint.slice(0, 16)}-${options.remoteDebuggingPort}`));
    this.lockPath = path.join(this.rootDirectory, "exclusive-browser.lock.json");
    this.statePath = path.join(this.rootDirectory, "checkpoint.json");
    this.now = options.now ?? (() => new Date());
    this.pidIsAlive = options.pidIsAlive ?? defaultPidIsAlive;
    mkdirSync(this.rootDirectory, { recursive: true, mode: 0o700 });
  }

  private initialState(): AprEneaGlobalBrowserControllerState {
    return { version: APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION, revision: 0, fencingEpoch: 0, profileFingerprint: this.profileFingerprint, canonicalProfileDirectory: this.canonicalProfileDirectory, remoteDebuggingPort: this.options.remoteDebuggingPort, activeOwnerId: null, activeProcessPid: null, activePurpose: null, activeAccessMode: null, activeCohortRoot: null, activeSince: null, activeLeaseUntil: null, lastReleasedAt: null, lastKeepaliveAt: null, lastKeepaliveEvidenceId: null, audit: [] };
  }

  snapshot(): AprEneaGlobalBrowserControllerState {
    if (!existsSync(this.statePath)) return this.initialState();
    const parsed = JSON.parse(readFileSync(this.statePath, "utf8")) as AprEneaGlobalBrowserControllerState | Record<string, unknown>;
    if (parsed.version === "apr-enea-global-browser-controller-v1"
      && parsed.profileFingerprint === this.profileFingerprint
      && parsed.remoteDebuggingPort === this.options.remoteDebuggingPort) {
      const legacy = parsed as Record<string, unknown>;
      const migrated: AprEneaGlobalBrowserControllerState = {
        ...this.initialState(),
        revision: Number(legacy.revision ?? 0),
        lastReleasedAt: typeof legacy.lastReleasedAt === "string" ? legacy.lastReleasedAt : null,
        lastKeepaliveAt: typeof legacy.lastKeepaliveAt === "string" ? legacy.lastKeepaliveAt : null,
        lastKeepaliveEvidenceId: typeof legacy.lastKeepaliveEvidenceId === "string" ? legacy.lastKeepaliveEvidenceId : null,
        audit: [],
      };
      atomicWrite(this.statePath, migrated);
      return migrated;
    }
    const state = parsed as AprEneaGlobalBrowserControllerState;
    if (state.version !== APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION || state.profileFingerprint !== this.profileFingerprint || state.canonicalProfileDirectory !== this.canonicalProfileDirectory || state.remoteDebuggingPort !== this.options.remoteDebuggingPort) throw new Error("apr_global_browser_state_binding_mismatch");
    return state;
  }

  private persistEvent(input: { type: string; ownerId: string; reason: string; access?: AprEneaGlobalBrowserAccess | null; keepalive?: { at: string; evidenceId: string }; fencingEpoch?: number }) {
    const previous = this.snapshot(); const revision = previous.revision + 1; const at = this.now().toISOString();
    const state: AprEneaGlobalBrowserControllerState = { ...previous, revision, fencingEpoch: input.fencingEpoch ?? previous.fencingEpoch, activeOwnerId: input.access?.ownerId ?? null, activeProcessPid: input.access?.processPid ?? null, activePurpose: input.access?.purpose ?? null, activeAccessMode: input.access?.accessMode ?? null, activeCohortRoot: input.access?.cohortRoot ?? null, activeSince: input.access?.acquiredAt ?? null, activeLeaseUntil: input.access?.leaseUntil ?? null, lastReleasedAt: input.type === "browser_access_released" ? at : previous.lastReleasedAt, lastKeepaliveAt: input.keepalive?.at ?? previous.lastKeepaliveAt, lastKeepaliveEvidenceId: input.keepalive?.evidenceId ?? previous.lastKeepaliveEvidenceId, audit: [...previous.audit, { revision, at, type: input.type, ownerId: input.ownerId, reason: input.reason, appliedRuleIds: [APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID, APR_ENEA_GLOBAL_BROWSER_LOCK_PUBLICATION_RULE_ID] as [typeof APR_ENEA_GLOBAL_BROWSER_CONTROLLER_RULE_ID, typeof APR_ENEA_GLOBAL_BROWSER_LOCK_PUBLICATION_RULE_ID] }].slice(-500) };
    atomicWrite(this.statePath, state); return state;
  }

  private readLock(): AprEneaGlobalBrowserLock | null {
    if (!existsSync(this.lockPath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.lockPath, "utf8")) as AprEneaGlobalBrowserLock | LegacyAprEneaGlobalBrowserLock;
      if (parsed.version === "apr-enea-global-browser-controller-v1") {
        if (parsed.profileFingerprint !== this.profileFingerprint || parsed.remoteDebuggingPort !== this.options.remoteDebuggingPort || !parsed.token || !parsed.ownerId) throw new Error("invalid");
        if (parsed.hostname !== os.hostname() || this.pidIsAlive(parsed.processPid)) throw new Error("apr_global_browser_legacy_holder_requires_quiescence");
        unlinkSync(this.lockPath);
        return null;
      }
      const lock = parsed;
      if (lock.version !== APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION || lock.profileFingerprint !== this.profileFingerprint || lock.canonicalProfileDirectory !== this.canonicalProfileDirectory || lock.remoteDebuggingPort !== this.options.remoteDebuggingPort || !lock.token || !lock.ownerId || !Number.isInteger(lock.fencingEpoch) || !Number.isFinite(Date.parse(lock.leaseUntil))) throw new Error("invalid");
      return lock;
    } catch (error) {
      if (error instanceof Error && error.message === "apr_global_browser_legacy_holder_requires_quiescence") throw error;
      throw new Error("apr_global_browser_lock_corrupt_fail_closed");
    }
  }
  private expired(lock: AprEneaGlobalBrowserLock) { return Date.parse(lock.leaseUntil) <= this.now().getTime(); }

  tryAcquire(input: { ownerId: string; cohortRoot: string; purpose?: AprEneaGlobalBrowserAccess["purpose"]; accessMode?: AprEneaCdpAccessMode; processPid?: number }): AprEneaGlobalBrowserAccess | null {
    if (!input.ownerId.trim()) throw new Error("apr_global_browser_owner_missing");
    const processPid = input.processPid ?? process.pid; const purpose = input.purpose ?? "worker_tick"; const accessMode = input.accessMode ?? (purpose === "keepalive" || purpose === "diagnostic_readonly" ? "readonly" : "mutating");
    const existing = this.readLock(); let recovered: AprEneaGlobalBrowserLock | null = null;
    if (existing) {
      if (existing.hostname === os.hostname() && existing.ownerId === input.ownerId && existing.processPid === processPid && existing.cohortRoot === path.resolve(input.cohortRoot) && existing.purpose === purpose && existing.accessMode === accessMode && !this.expired(existing)) return existing;
      const stale = existing.hostname === os.hostname() && (!this.pidIsAlive(existing.processPid) || this.expired(existing));
      if (!stale) return null;
      try { unlinkSync(this.lockPath); recovered = existing; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    }
    const epoch = this.snapshot().fencingEpoch + 1; const acquiredAt = this.now().toISOString();
    const access: AprEneaGlobalBrowserAccess = { token: randomUUID(), fencingEpoch: epoch, ownerId: input.ownerId, processPid, acquiredAt, leaseUntil: new Date(Date.parse(acquiredAt) + this.leaseMs).toISOString(), accessMode, purpose, cohortRoot: path.resolve(input.cohortRoot) };
    const lock: AprEneaGlobalBrowserLock = { ...access, version: APR_ENEA_GLOBAL_BROWSER_CONTROLLER_VERSION, hostname: os.hostname(), profileFingerprint: this.profileFingerprint, canonicalProfileDirectory: this.canonicalProfileDirectory, remoteDebuggingPort: this.options.remoteDebuggingPort };
    if (!atomicCreateExclusiveJson(this.lockPath, lock)) return null;
    if (recovered) this.persistEvent({ type: this.expired(recovered) ? "expired_browser_lease_fenced" : "stale_browser_lock_recovered", ownerId: input.ownerId, reason: `Holder precedente ${recovered.ownerId}/${recovered.processPid} reso incapace di continuare dall'epoch ${epoch}.`, access, fencingEpoch: epoch });
    this.persistEvent({ type: "browser_access_acquired", ownerId: access.ownerId, reason: `Accesso ${access.accessMode} ${access.purpose} acquisito con fencing epoch ${epoch}.`, access, fencingEpoch: epoch }); return access;
  }

  assertAccess(access: AprEneaGlobalBrowserAccess, requiredMode: AprEneaCdpAccessMode = "readonly") {
    const lock = this.readLock();
    if (!lock || lock.token !== access.token || lock.fencingEpoch !== access.fencingEpoch || lock.ownerId !== access.ownerId || lock.processPid !== access.processPid) throw new Error("apr_global_browser_access_fenced");
    if (this.expired(lock)) throw new Error("apr_global_browser_lease_expired");
    if (requiredMode === "mutating" && lock.accessMode !== "mutating") throw new Error("apr_global_browser_mutation_without_capability");
    return lock;
  }
  renew(access: AprEneaGlobalBrowserAccess) { const lock = this.assertAccess(access); const renewed = { ...lock, leaseUntil: new Date(this.now().getTime() + this.leaseMs).toISOString() }; atomicWrite(this.lockPath, renewed); access.leaseUntil = renewed.leaseUntil; this.persistEvent({ type: "browser_access_renewed", ownerId: access.ownerId, reason: `Lease rinnovata per fencing epoch ${access.fencingEpoch}.`, access }); return access; }
  createCapability(access: AprEneaGlobalBrowserAccess): AprEneaCdpCapability {
    if (access.accessMode === "mutating") return { kind: "apr_enea_cdp_mutating", access, assertValid: () => { this.assertAccess(access); }, assertMutationAllowed: () => { this.assertAccess(access, "mutating"); }, renew: () => this.renew(access) };
    return { kind: "apr_enea_cdp_readonly", access, assertValid: () => { this.assertAccess(access); }, renew: () => this.renew(access) };
  }
  release(access: AprEneaGlobalBrowserAccess) {
    this.assertAccess(access);
    const state = this.persistEvent({ type: "browser_access_released", ownerId: access.ownerId, reason: `Accesso ${access.accessMode} ${access.purpose} epoch ${access.fencingEpoch} rilasciato.` });
    unlinkSync(this.lockPath);
    return state;
  }
  keepaliveDue(intervalMs: number, now = this.now()) { if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("apr_global_browser_keepalive_interval_invalid"); const last = this.snapshot().lastKeepaliveAt; return !last || !Number.isFinite(Date.parse(last)) || now.getTime() - Date.parse(last) >= intervalMs; }
  recordKeepalive(access: AprEneaGlobalBrowserAccess, evidenceId: string) { this.assertAccess(access, "readonly"); if (!evidenceId.trim()) throw new Error("apr_global_browser_keepalive_evidence_missing"); return this.persistEvent({ type: "global_keepalive_verified", ownerId: access.ownerId, reason: "Keepalive read-only della sessione ENEA verificato.", access, keepalive: { at: this.now().toISOString(), evidenceId } }); }
  async runExclusive<T>(input: { ownerId: string; cohortRoot: string; purpose?: AprEneaGlobalBrowserAccess["purpose"]; accessMode?: AprEneaCdpAccessMode; processPid?: number; waitTimeoutMs?: number; retryIntervalMs?: number }, operation: (access: AprEneaGlobalBrowserAccess, capability: AprEneaCdpCapability) => Promise<T>) {
    const startedAt = Date.now(); const waitTimeoutMs = input.waitTimeoutMs ?? 30_000; const retryIntervalMs = input.retryIntervalMs ?? 25; let access: AprEneaGlobalBrowserAccess | null = null;
    while (!access) { access = this.tryAcquire(input); if (access) break; if (Date.now() - startedAt >= waitTimeoutMs) throw new Error("apr_global_browser_access_timeout"); await new Promise((resolve) => setTimeout(resolve, retryIntervalMs)); }
    try { return await operation(access, this.createCapability(access)); } finally { try { this.release(access); } catch (error) { if (!/fenced|expired/.test(error instanceof Error ? error.message : String(error))) throw error; } }
  }
}
