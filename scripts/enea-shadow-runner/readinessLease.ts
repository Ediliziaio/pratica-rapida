import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { registryRule, USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import {
  checkSessionReadiness,
  type SessionReadinessCheck,
  type SessionReadinessInput,
} from "../../src/features/enea-shadow-crm/sessionReadiness";
import {
  ENEA_KEEPALIVE_GRACE_MS,
  ENEA_KEEPALIVE_INTERVAL_MS,
  isAllowedKeepalive,
  type InnocuousEneaSurface,
} from "../../src/features/enea-shadow-crm/eneaSessionLease";

export const READINESS_LEASE_VERSION = "enea-runner-readiness-lease-v1" as const;
export const READINESS_LEASE_MS = 15_000;

export type ReadinessLeaseStatus = "unverified" | "simulation_ready" | "authenticated_active" | "login_required" | "blocked" | "expired" | "released";
export type ReadinessLeaseEventType =
  | "readiness_initialized"
  | "readiness_simulation_acquired"
  | "readiness_simulation_recovered"
  | "readiness_check_blocked"
  | "readiness_keepalive_ok"
  | "readiness_keepalive_rejected"
  | "readiness_real_check_blocked"
  | "readiness_real_check_verified"
  | "readiness_authenticated_keepalive_ok"
  | "readiness_authenticated_keepalive_rejected"
  | "readiness_login_required"
  | "readiness_expired"
  | "readiness_checkpoint_repaired"
  | "readiness_released";

export interface ReadinessLeaseEvent {
  id: string;
  revision: number;
  at: string;
  type: ReadinessLeaseEventType;
  ownerId: string | null;
  idempotencyKey: string;
  appliedRuleIds: string[];
  reason: string;
  nextAction: string;
}

export interface ReadinessLeaseState {
  version: typeof READINESS_LEASE_VERSION;
  revision: number;
  status: ReadinessLeaseStatus;
  evidenceMode: "none" | "local_simulation" | "browser_readonly";
  operationalGate: "blocked_pending_real_readiness";
  ownerId: string | null;
  acquiredAt: string | null;
  heartbeatAt: string | null;
  leaseUntil: string | null;
  reason: string;
  nextAction: string;
  checks: SessionReadinessCheck[];
  safeKeepaliveCount: number;
  processedIdempotencyKeys: string[];
  audit: ReadinessLeaseEvent[];
}

export interface SimulatedKeepaliveInput {
  ok: boolean;
  serverVerified: boolean;
  method: string;
  surface: InnocuousEneaSurface;
  action: string;
  hasBody?: boolean;
  mutativeIntent?: boolean;
  reason?: string;
}

export interface AuthenticatedKeepaliveInput extends SimulatedKeepaliveInput {
  authenticated: boolean;
  readiness?: SessionReadinessInput;
  logoutEvidence?: {
    source: "enea_server_response";
    evidenceId: string;
  };
}

export interface RealReadinessObservationInput {
  readiness: SessionReadinessInput;
  keepalive: SimulatedKeepaliveInput;
  reason: string;
  nextAction: string;
}

export interface ReadinessLeaseSnapshot {
  status: ReadinessLeaseStatus;
  leaseState: "not_acquired" | "active_simulation" | "active_authenticated" | "login_required" | "expired" | "blocked" | "released";
  evidenceMode: ReadinessLeaseState["evidenceMode"];
  operationalGate: ReadinessLeaseState["operationalGate"];
  queueMayRun: false;
  ownerId: string | null;
  heartbeatAt: string | null;
  leaseUntil: string | null;
  reason: string;
  nextAction: string;
  checks: SessionReadinessCheck[];
  safeKeepaliveCount: number;
  revision: number;
  lastEvent: ReadinessLeaseEvent;
  observedAt: string;
}

export class ReadinessLeaseBusyError extends Error {
  constructor(message: string) { super(message); this.name = "ReadinessLeaseBusyError"; }
}

function atomicWrite(target: string, contents: string) {
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
}

function validRuleIds(ruleIds: string[]) {
  return ruleIds.length > 0 && ruleIds.every((ruleId) => registryRule(ruleId) !== null);
}

function validState(value: ReadinessLeaseState): boolean {
  return value.version === READINESS_LEASE_VERSION
    && Number.isInteger(value.revision)
    && ["unverified", "simulation_ready", "authenticated_active", "login_required", "blocked", "expired", "released"].includes(value.status)
    && value.operationalGate === "blocked_pending_real_readiness"
    && Array.isArray(value.checks)
    && Array.isArray(value.audit)
    && Array.isArray(value.processedIdempotencyKeys)
    && value.audit.every((event) => validRuleIds(event.appliedRuleIds));
}

function initialState(now: Date): ReadinessLeaseState {
  const at = now.toISOString();
  const event: ReadinessLeaseEvent = {
    id: "readiness-event-00000000-initialized",
    revision: 0,
    at,
    type: "readiness_initialized",
    ownerId: null,
    idempotencyKey: "readiness:init",
    appliedRuleIds: ["system-atomic-checkpoint-resume", "system-enea-lease-required"],
    reason: "Readiness persistente inizializzata senza prove esterne.",
    nextAction: "Verificare la fase esclusivamente in simulazione locale; la coda resta bloccata.",
  };
  return {
    version: READINESS_LEASE_VERSION,
    revision: 0,
    status: "unverified",
    evidenceMode: "none",
    operationalGate: "blocked_pending_real_readiness",
    ownerId: null,
    acquiredAt: null,
    heartbeatAt: null,
    leaseUntil: null,
    reason: event.reason,
    nextAction: event.nextAction,
    checks: [],
    safeKeepaliveCount: 0,
    processedIdempotencyKeys: [event.idempotencyKey],
    audit: [event],
  };
}

interface TransitionInput {
  ownerId: string | null;
  idempotencyKey: string;
  type: ReadinessLeaseEventType;
  at: Date;
  appliedRuleIds: string[];
  reason: string;
  nextAction: string;
  mutate: (state: ReadinessLeaseState) => void;
}

export class PersistentReadinessLease {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly lockDirectory: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "readiness-lease");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.lockDirectory = path.join(this.directory, "transition.lock");
  }

  private ensureDirectories() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(this.directory, "stale-transition-locks"), { recursive: true, mode: 0o700 });
  }

  initialize(now = new Date()) {
    this.ensureDirectories();
    const existing = this.loadOrNull();
    if (existing) return existing;
    return this.withLock("readiness-initializer", now, () => {
      const concurrent = this.loadOrNull();
      if (concurrent) return concurrent;
      const state = initialState(now);
      this.write(state);
      return state;
    });
  }

  load(): ReadinessLeaseState {
    const state = this.loadOrNull();
    if (!state) throw new Error(`Checkpoint readiness non valido in ${this.checkpointPath}.`);
    return state;
  }

  private loadOrNull(): ReadinessLeaseState | null {
    try {
      const parsed = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as ReadinessLeaseState;
      return validState(parsed) ? parsed : null;
    } catch { return null; }
  }

  private write(state: ReadinessLeaseState) {
    if (!validState(state)) throw new Error("Checkpoint readiness rifiutato: stato o ID regola non validi.");
    this.ensureDirectories();
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
  }

  private withLock<T>(ownerId: string, now: Date, action: () => T): T {
    this.ensureDirectories();
    try { mkdirSync(this.lockDirectory, { mode: 0o700 }); }
    catch {
      let lock: { ownerId?: string; expiresAt?: string } = {};
      try { lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* lock corrotto recuperabile */ }
      if (lock.expiresAt && Date.parse(lock.expiresAt) > now.getTime()) {
        throw new ReadinessLeaseBusyError(`Transizione readiness già posseduta da ${lock.ownerId ?? "sconosciuto"}.`);
      }
      const stale = path.join(this.directory, "stale-transition-locks", `lock-${now.getTime()}-${crypto.randomUUID()}`);
      renameSync(this.lockDirectory, stale);
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    atomicWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ ownerId, expiresAt: new Date(now.getTime() + 10_000).toISOString() })}\n`);
    try { return action(); }
    finally {
      try {
        const lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (lock.ownerId === ownerId) {
          unlinkSync(path.join(this.lockDirectory, "owner.json"));
          rmdirSync(this.lockDirectory);
        }
      } catch { /* un crash lascia un lock diagnosticabile */ }
    }
  }

  private transition(input: TransitionInput): ReadinessLeaseState {
    if (!validRuleIds(input.appliedRuleIds)) throw new Error("Transizione readiness senza ID validi del registro unico.");
    const current = this.load();
    if (current.processedIdempotencyKeys.includes(input.idempotencyKey)) return current;
    const next = structuredClone(current);
    const revision = current.revision + 1;
    input.mutate(next);
    const event: ReadinessLeaseEvent = {
      id: `readiness-event-${String(revision).padStart(8, "0")}-${input.type}`,
      revision,
      at: input.at.toISOString(),
      type: input.type,
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      appliedRuleIds: [...input.appliedRuleIds],
      reason: input.reason,
      nextAction: input.nextAction,
    };
    next.revision = revision;
    next.reason = input.reason;
    next.nextAction = input.nextAction;
    next.processedIdempotencyKeys = [...next.processedIdempotencyKeys, input.idempotencyKey].slice(-1_000);
    next.audit = [...next.audit, event].slice(-500);
    this.write(next);
    return next;
  }

  acquireSimulation(ownerId: string, input: SessionReadinessInput, idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock(ownerId, now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const active = current.status === "simulation_ready" && Boolean(current.leaseUntil) && Date.parse(current.leaseUntil!) > now.getTime();
      if (active && current.ownerId !== ownerId) throw new ReadinessLeaseBusyError(`Lease readiness attiva per ${current.ownerId}.`);
      const run = checkSessionReadiness(input, now);
      if (run.outcome !== "ready") {
        return this.transition({
          ownerId, idempotencyKey, at: now, type: "readiness_check_blocked",
          appliedRuleIds: ["system-enea-lease-required", "system-atomic-checkpoint-resume"],
          reason: "Readiness simulata incompleta; blocco globale confermato.",
          nextAction: "Correggere i controlli falliti nella simulazione locale; non avviare la coda.",
          mutate: (next) => {
            next.status = "blocked";
            next.evidenceMode = "local_simulation";
            next.ownerId = null;
            next.heartbeatAt = now.toISOString();
            next.leaseUntil = now.toISOString();
            next.checks = run.checks;
          },
        });
      }
      const recovered = Boolean(current.ownerId && (!active || current.status === "expired"));
      const reason = recovered
        ? "Lease readiness simulata recuperata dopo scadenza; nessuna pratica sbloccata."
        : "Readiness e lease acquisite in simulazione locale; nessuna prova reale dichiarata.";
      return this.transition({
        ownerId, idempotencyKey, at: now,
        type: recovered ? "readiness_simulation_recovered" : "readiness_simulation_acquired",
        appliedRuleIds: ["system-exclusive-runner-lease", "system-enea-lease-required", "system-atomic-checkpoint-resume"],
        reason,
        nextAction: "Eseguire keepalive simulati sicuri e verificare scadenza/recupero; la coda resta bloccata.",
        mutate: (next) => {
          next.status = "simulation_ready";
          next.evidenceMode = "local_simulation";
          next.ownerId = ownerId;
          next.acquiredAt = now.toISOString();
          next.heartbeatAt = now.toISOString();
          next.leaseUntil = new Date(now.getTime() + READINESS_LEASE_MS).toISOString();
          next.checks = run.checks;
        },
      });
    });
  }

  keepaliveSimulation(ownerId: string, input: SimulatedKeepaliveInput, idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock(ownerId, now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const active = current.status === "simulation_ready" && Boolean(current.leaseUntil) && Date.parse(current.leaseUntil!) > now.getTime();
      if (active && current.ownerId !== ownerId) throw new ReadinessLeaseBusyError(`Lease readiness attiva per ${current.ownerId}.`);
      if (!active) {
        return this.transition({
          ownerId, idempotencyKey, at: now, type: "readiness_expired",
          appliedRuleIds: ["system-exclusive-runner-lease", "system-enea-lease-required", "system-atomic-checkpoint-resume"],
          reason: "Keepalive rifiutato: lease readiness assente o scaduta; blocco globale attivo.",
          nextAction: "Recuperare la lease con una nuova verifica completa; non usare la coda.",
          mutate: (next) => { next.status = "expired"; next.heartbeatAt = now.toISOString(); next.leaseUntil = now.toISOString(); },
        });
      }
      const safe = isAllowedKeepalive(input) && input.ok && input.serverVerified;
      if (!safe) {
        return this.transition({
          ownerId, idempotencyKey, at: now, type: "readiness_keepalive_rejected",
          appliedRuleIds: ["system-enea-lease-required", "system-atomic-checkpoint-resume"],
          reason: input.reason ?? "Keepalive simulato non sicuro o privo di prova server; blocco globale attivo.",
          nextAction: "Ripetere la verifica completa con una sola lettura innocua consentita.",
          mutate: (next) => { next.status = "blocked"; next.heartbeatAt = now.toISOString(); next.leaseUntil = now.toISOString(); },
        });
      }
      return this.transition({
        ownerId, idempotencyKey, at: now, type: "readiness_keepalive_ok",
        appliedRuleIds: ["system-exclusive-runner-lease", "system-enea-lease-required", "system-atomic-checkpoint-resume"],
        reason: "Keepalive locale simulato sicuro: sola lettura innocua e prova server simulate.",
        nextAction: "Continuare l'osservazione della lease; la coda resta bloccata fino alla verifica reale.",
        mutate: (next) => {
          next.heartbeatAt = now.toISOString();
          next.leaseUntil = new Date(now.getTime() + READINESS_LEASE_MS).toISOString();
          next.safeKeepaliveCount += 1;
        },
      });
    });
  }

  recordRealObservationBlocked(ownerId: string, input: RealReadinessObservationInput, idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock(ownerId, now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const run = checkSessionReadiness(input.readiness, now);
      const safeKeepalive = isAllowedKeepalive(input.keepalive) && input.keepalive.ok && input.keepalive.serverVerified;
      if (run.outcome === "ready") throw new Error("Una readiness reale completamente verde richiede una transizione dedicata prima di abilitare la coda.");
      if (!input.reason.trim() || !input.nextAction.trim()) throw new Error("Osservazione reale priva di motivo o prossima azione.");
      return this.transition({
        ownerId,
        idempotencyKey,
        at: now,
        type: "readiness_real_check_blocked",
        appliedRuleIds: ["system-readonly-adapter-contract", "system-enea-lease-required", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
        reason: input.reason,
        nextAction: input.nextAction,
        mutate: (next) => {
          next.status = "blocked";
          next.evidenceMode = "browser_readonly";
          next.ownerId = null;
          next.acquiredAt = null;
          next.heartbeatAt = now.toISOString();
          next.leaseUntil = now.toISOString();
          next.checks = run.checks;
          if (safeKeepalive) next.safeKeepaliveCount += 1;
        },
      });
    });
  }

  recordRealObservationVerifiedBeforeQueue(ownerId: string, input: RealReadinessObservationInput, idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock(ownerId, now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const run = checkSessionReadiness(input.readiness, now);
      const safeKeepalive = isAllowedKeepalive(input.keepalive) && input.keepalive.ok && input.keepalive.serverVerified;
      if (run.outcome !== "ready") throw new Error("Readiness reale non completamente verde.");
      if (!safeKeepalive) throw new Error("Readiness reale priva di keepalive GET/HEAD innocuo con prova server.");
      if (!input.reason.trim() || !input.nextAction.trim()) throw new Error("Osservazione reale priva di motivo o prossima azione.");
      return this.transition({
        ownerId,
        idempotencyKey,
        at: now,
        type: "readiness_real_check_verified",
        appliedRuleIds: ["system-readonly-adapter-contract", "system-enea-lease-required", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
        reason: input.reason,
        nextAction: input.nextAction,
        mutate: (next) => {
          // La verifica reale è verde, ma questa transizione non autorizza la
          // coda: lo stato resta fail-closed e runnerPracticeOperationsAllowed
          // continua a restituire false fino a un gate separato esplicito.
          next.status = "blocked";
          next.evidenceMode = "browser_readonly";
          next.ownerId = null;
          next.acquiredAt = now.toISOString();
          next.heartbeatAt = now.toISOString();
          next.leaseUntil = now.toISOString();
          next.checks = run.checks;
          next.safeKeepaliveCount += 1;
        },
      });
    });
  }

  recordAuthenticatedKeepalive(ownerId: string, input: AuthenticatedKeepaliveInput, idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock(ownerId, now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const readinessRun = input.readiness ? checkSessionReadiness(input.readiness, now) : null;
      const safe = isAllowedKeepalive(input) && input.ok && input.serverVerified && (!readinessRun || readinessRun.outcome === "ready");
      const ruleIds = [
        USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive,
        "system-readonly-adapter-contract",
        "system-enea-lease-required",
        "system-atomic-checkpoint-resume",
      ];
      const verifiedServerLogout = !input.authenticated
        && !input.ok
        && input.serverVerified
        && input.logoutEvidence?.source === "enea_server_response"
        && Boolean(input.logoutEvidence.evidenceId.trim());
      if (verifiedServerLogout) {
        return this.transition({
          ownerId: null,
          idempotencyKey,
          at: now,
          type: "readiness_login_required",
          appliedRuleIds: ruleIds,
          reason: input.reason ?? `Logout ENEA provato dal server (${input.logoutEvidence!.evidenceId}): login_required globale.`,
          nextAction: "Ripristinare il login personale ENEA nella scheda registrata; nessun ticket pratica e nessuna azione ENEA nel frattempo.",
          mutate: (next) => {
            next.status = "login_required";
            next.evidenceMode = "browser_readonly";
            next.ownerId = null;
            next.heartbeatAt = now.toISOString();
            next.leaseUntil = now.toISOString();
          },
        });
      }
      if (!safe) {
        return this.transition({
          ownerId: null,
          idempotencyKey,
          at: now,
          type: "readiness_authenticated_keepalive_rejected",
          appliedRuleIds: ruleIds,
          reason: input.reason ?? "Keepalive autenticato rifiutato o logout non provato dal server: checkpoint verificato preservato e blocco globale fail-closed.",
          nextAction: "Acquisire una nuova prova server innocua; non inferire logout e mantenere vietate tutte le azioni mutative.",
          mutate: (next) => {
            next.status = input.authenticated ? "blocked" : "expired";
            next.evidenceMode = "browser_readonly";
            next.ownerId = null;
            next.leaseUntil = now.toISOString();
          },
        });
      }
      const leaseUntil = new Date(now.getTime() + ENEA_KEEPALIVE_INTERVAL_MS + ENEA_KEEPALIVE_GRACE_MS).toISOString();
      return this.transition({
        ownerId,
        idempotencyKey,
        at: now,
        type: "readiness_authenticated_keepalive_ok",
        appliedRuleIds: ruleIds,
        reason: `Keepalive ENEA autenticato auditato: ${input.method.toUpperCase()} ${input.surface}, sola lettura con prova server.`,
        nextAction: `Ripetere esclusivamente un keepalive innocuo entro ${leaseUntil}; nessuna azione mutativa è autorizzata da questa lease.`,
        mutate: (next) => {
          next.status = "authenticated_active";
          next.evidenceMode = "browser_readonly";
          next.ownerId = ownerId;
          next.acquiredAt ??= now.toISOString();
          next.heartbeatAt = now.toISOString();
          next.leaseUntil = leaseUntil;
          next.safeKeepaliveCount += 1;
          if (readinessRun) next.checks = readinessRun.checks;
        },
      });
    });
  }

  expireIfNeeded(now = new Date()) {
    const current = this.initialize(now);
    const expired = ["simulation_ready", "authenticated_active"].includes(current.status) && Boolean(current.leaseUntil) && Date.parse(current.leaseUntil!) <= now.getTime();
    if (!expired) return current;
    return this.withLock("readiness-expirer", now, () => {
      const latest = this.load();
      const stillExpired = ["simulation_ready", "authenticated_active"].includes(latest.status) && Boolean(latest.leaseUntil) && Date.parse(latest.leaseUntil!) <= now.getTime();
      if (!stillExpired) return latest;
      const authenticatedTimeout = latest.status === "authenticated_active";
      return this.transition({
        ownerId: authenticatedTimeout ? null : latest.ownerId, idempotencyKey: `readiness-expire:${latest.leaseUntil}`, at: now, type: "readiness_expired",
        appliedRuleIds: authenticatedTimeout
          ? [USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive, "system-enea-lease-required", "system-atomic-checkpoint-resume"]
          : ["system-exclusive-runner-lease", "system-enea-lease-required", "system-atomic-checkpoint-resume"],
        reason: authenticatedTimeout
          ? "Lease ENEA autenticata scaduta: checkpoint e prove verificati preservati; logout non inferito e blocco globale attivo."
          : "Lease readiness simulata scaduta senza keepalive; blocco globale attivo.",
        nextAction: authenticatedTimeout
          ? "Acquisire una nuova prova server innocua e riprendere la lease; login_required solo con prova server reale di logout."
          : "Ripetere tutti i controlli e acquisire una nuova lease; non usare la coda.",
        mutate: (next) => { next.status = "expired"; if (authenticatedTimeout) next.ownerId = null; next.leaseUntil = now.toISOString(); },
      });
    });
  }

  repairSpuriousTimeoutLoginRequired(idempotencyKey: string, now = new Date()) {
    this.initialize(now);
    return this.withLock("readiness-repair", now, () => {
      const current = this.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const last = current.audit.at(-1);
      const timeoutMisclassification = current.status === "login_required"
        && last?.type === "readiness_login_required"
        && last.idempotencyKey.startsWith("readiness-expire:")
        && current.evidenceMode === "browser_readonly";
      if (!timeoutMisclassification) return current;
      return this.transition({
        ownerId: null,
        idempotencyKey,
        at: now,
        type: "readiness_checkpoint_repaired",
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive, "system-enea-lease-required", "system-atomic-checkpoint-resume"],
        reason: "Classificazione login_required da solo timeout corretta append-only: prove e audit preservati, lease scaduta e gate globale chiuso.",
        nextAction: "Acquisire una nuova prova server innocua; classificare login_required soltanto con prova server reale di logout.",
        mutate: (next) => {
          next.status = "expired";
          next.ownerId = null;
          next.leaseUntil = now.toISOString();
        },
      });
    });
  }

  release(ownerId: string, idempotencyKey: string, reason = "Lease readiness rilasciata.", now = new Date()) {
    this.initialize(now);
    return this.withLock(ownerId, now, () => {
      const current = this.load();
      if (current.ownerId && current.ownerId !== ownerId && current.status === "simulation_ready") {
        throw new ReadinessLeaseBusyError(`Lease readiness posseduta da ${current.ownerId}.`);
      }
      return this.transition({
        ownerId, idempotencyKey, at: now, type: "readiness_released",
        appliedRuleIds: ["system-exclusive-runner-lease", "system-atomic-checkpoint-resume"],
        reason,
        nextAction: "Eseguire una nuova verifica completa prima di qualsiasi futura abilitazione.",
        mutate: (next) => { next.status = "released"; next.heartbeatAt = now.toISOString(); next.leaseUntil = now.toISOString(); },
      });
    });
  }

  snapshot(now = new Date()): ReadinessLeaseSnapshot {
    const state = this.initialize(now);
    const active = state.status === "simulation_ready" && Boolean(state.leaseUntil) && Date.parse(state.leaseUntil!) > now.getTime();
    const authenticatedActive = state.status === "authenticated_active" && Boolean(state.leaseUntil) && Date.parse(state.leaseUntil!) > now.getTime();
    const leaseState: ReadinessLeaseSnapshot["leaseState"] = authenticatedActive ? "active_authenticated"
      : active ? "active_simulation"
      : state.status === "expired" || (state.status === "simulation_ready" && !active) ? "expired"
        : state.status === "login_required" ? "login_required"
        : state.status === "authenticated_active" && !authenticatedActive ? "expired"
        : state.status === "blocked" ? "blocked"
          : state.status === "released" ? "released" : "not_acquired";
    return {
      status: state.status,
      leaseState,
      evidenceMode: state.evidenceMode,
      operationalGate: state.operationalGate,
      queueMayRun: false,
      ownerId: state.ownerId,
      heartbeatAt: state.heartbeatAt,
      leaseUntil: state.leaseUntil,
      reason: state.reason,
      nextAction: state.nextAction,
      checks: state.checks,
      safeKeepaliveCount: state.safeKeepaliveCount,
      revision: state.revision,
      lastEvent: state.audit.at(-1)!,
      observedAt: now.toISOString(),
    };
  }
}

export function runnerPracticeOperationsAllowed(_rootDirectory: string, _now = new Date()): false {
  // Questa consegna può produrre soltanto evidenza locale simulata. Nessun
  // metodo crea una readiness reale: il gate operativo rimane quindi chiuso.
  return false;
}

export function readOnlyPreflightAllowed(rootDirectory: string): boolean {
  try {
    const state = new PersistentReadinessLease(rootDirectory).load();
    return state.evidenceMode === "browser_readonly"
      && state.status !== "login_required"
      && (state.audit.some((event) => event.type === "readiness_real_check_verified") || state.status === "authenticated_active")
      && state.checks.length === 10
      && state.checks.every((check) => check.ok);
  } catch {
    return false;
  }
}
