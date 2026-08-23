import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const APR_WATCHDOG_VERSION = "apr-watchdog-v1" as const;
export const APR_WATCHDOG_STALL_MS = 300_000;
export const APR_WATCHDOG_RECOVERY_TIMEOUT_MS = 60_000;

const RULE_IDS = ["system-apr-independent-runtime", "system-atomic-checkpoint-resume", "system-single-active-practice"];

export type AprPublicRuntimeStatus = "WORKING" | "IDLE" | "OPERATOR_REQUIRED" | "TECHNICAL_BLOCK";
export type AprWatchdogTarget = "supervisor" | "worker";

export interface AprWatchdogObservation {
  observedAt: string;
  supervisor: { pid: number | null; alive: boolean; heartbeatAt: string | null };
  worker: { pid: number | null; alive: boolean; heartbeatAt: string | null };
  work: {
    actionable: boolean;
    target: AprWatchdogTarget;
    customerKey: string | null;
    displayName: string | null;
    phase: string;
    phaseStartedAt: string | null;
    lastProgressAt: string | null;
    progressToken: string;
    nextAction: string;
    operatorRequired: boolean;
    technicalBlock: boolean;
  };
}

export interface AprWatchdogRecovery {
  target: AprWatchdogTarget;
  requestedAt: string;
  priorPid: number | null;
  reason: string;
  commandId: string;
  attemptCount: 1;
}

export interface AprWatchdogState {
  version: typeof APR_WATCHDOG_VERSION;
  revision: number;
  status: AprPublicRuntimeStatus;
  instanceId: string;
  processPid: number;
  heartbeatAt: string;
  currentCustomerKey: string | null;
  currentDisplayName: string | null;
  currentPhase: string;
  phaseStartedAt: string | null;
  lastProgressAt: string | null;
  progressToken: string;
  nextAction: string;
  supervisorPid: number | null;
  workerPid: number | null;
  pendingRecovery: AprWatchdogRecovery | null;
  recoveryCount: number;
  reason: string;
  audit: Array<{ revision: number; at: string; type: string; reason: string; target: AprWatchdogTarget | null; commandId: string; appliedRuleIds: string[] }>;
}

export interface AprWatchdogTickResult {
  state: AprWatchdogState;
  recovery: AprWatchdogRecovery | null;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function milliseconds(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function initialState(instanceId: string, processPid: number, now: Date): AprWatchdogState {
  const at = now.toISOString();
  return {
    version: APR_WATCHDOG_VERSION, revision: 0, status: "IDLE", instanceId, processPid, heartbeatAt: at,
    currentCustomerKey: null, currentDisplayName: null, currentPhase: "coda_vuota", phaseStartedAt: null, lastProgressAt: null, progressToken: "none", nextAction: "Attendere una nuova coda APR persistente.", supervisorPid: null, workerPid: null, pendingRecovery: null, recoveryCount: 0,
    reason: "IDLE — coda vuota.",
    audit: [{ revision: 0, at, type: "watchdog_initialized", reason: "Watchdog APR inizializzato in stato fail-safe.", target: null, commandId: "watchdog:init", appliedRuleIds: [...RULE_IDS] }],
  };
}

export class PersistentAprWatchdog {
  readonly directory: string;
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string, readonly options: { instanceId?: string; processPid?: number; now?: () => Date } = {}) {
    this.directory = path.join(path.resolve(rootDirectory), "watchdog");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }
  private now() { return this.options.now?.() ?? new Date(); }
  private instanceId() { return this.options.instanceId ?? `apr-watchdog-${process.pid}-${crypto.randomUUID()}`; }
  private processPid() { return this.options.processPid ?? process.pid; }
  load(now = this.now()) {
    if (!existsSync(this.checkpointPath)) return initialState(this.instanceId(), this.processPid(), now);
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprWatchdogState;
    if (value.version !== APR_WATCHDOG_VERSION || !value.audit.every((event) => event.appliedRuleIds.length > 0)) throw new Error("apr_watchdog_checkpoint_invalid");
    return value;
  }
  private write(state: AprWatchdogState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  private event(state: AprWatchdogState, at: string, type: string, reason: string, target: AprWatchdogTarget | null, commandId: string) {
    state.revision += 1;
    state.audit.push({ revision: state.revision, at, type, reason, target, commandId, appliedRuleIds: [...RULE_IDS] });
    if (state.audit.length > 500) state.audit = [state.audit[0]!, ...state.audit.slice(-499)];
  }
  tick(observation: AprWatchdogObservation): AprWatchdogTickResult {
    const now = new Date(observation.observedAt);
    if (!Number.isFinite(now.getTime())) throw new Error("apr_watchdog_observation_time_invalid");
    const current = this.load(now);
    const next = structuredClone(current);
    next.instanceId = this.instanceId(); next.processPid = this.processPid(); next.heartbeatAt = observation.observedAt;
    next.supervisorPid = observation.supervisor.pid; next.workerPid = observation.worker.pid;

    if (next.pendingRecovery) {
      const target = next.pendingRecovery.target;
      const processState = observation[target];
      const heartbeat = milliseconds(processState.heartbeatAt);
      const requested = Date.parse(next.pendingRecovery.requestedAt);
      const recovered = processState.alive && ((processState.pid !== null && processState.pid !== next.pendingRecovery.priorPid) || (heartbeat !== null && heartbeat > requested));
      if (recovered) {
        const recovery = next.pendingRecovery;
        next.pendingRecovery = null; next.recoveryCount += 1;
        next.currentCustomerKey = observation.work.customerKey; next.currentDisplayName = observation.work.displayName; next.currentPhase = observation.work.phase;
        next.phaseStartedAt = observation.work.phaseStartedAt; next.lastProgressAt = observation.observedAt; next.progressToken = observation.work.progressToken; next.nextAction = observation.work.nextAction;
        next.status = observation.work.actionable ? "WORKING" : observation.work.operatorRequired ? "OPERATOR_REQUIRED" : observation.work.technicalBlock ? "TECHNICAL_BLOCK" : "IDLE";
        next.reason = next.status === "WORKING" ? `WORKING — ripresa verificata per ${observation.work.displayName ?? "coda APR"} · ${observation.work.phase}.`
          : next.status === "OPERATOR_REQUIRED" ? "OPERATOR_REQUIRED — ripresa verificata; restano soltanto interventi per-pratica."
          : next.status === "TECHNICAL_BLOCK" ? `TECHNICAL_BLOCK — processo ripristinato; resta il safety gate ${observation.work.phase}.`
          : "IDLE — coda vuota.";
        this.event(next, observation.observedAt, "recovery_verified", `${target} ripristinato con heartbeat/PID successivo alla richiesta; checkpoint preservato.`, target, `${recovery.commandId}:verified`);
        return { state: this.write(next), recovery: null };
      } else if (now.getTime() - requested >= APR_WATCHDOG_RECOVERY_TIMEOUT_MS) {
        const recovery = next.pendingRecovery;
        next.pendingRecovery = null; next.status = "TECHNICAL_BLOCK";
        next.reason = `TECHNICAL_BLOCK — ${target} non ripristinato entro 60 secondi.`;
        next.nextAction = "Controllare il LaunchAgent e i log del processo; nessuna pratica viene modificata.";
        this.event(next, observation.observedAt, "recovery_failed", next.reason, target, `${recovery.commandId}:failed`);
        return { state: this.write(next), recovery: null };
      } else return { state: this.write(next), recovery: null };
    }

    const missingTarget: AprWatchdogTarget | null = !observation.supervisor.alive ? "supervisor" : !observation.worker.alive ? "worker" : null;
    const observedProgressAt = milliseconds(observation.work.lastProgressAt) ?? milliseconds(observation.work.phaseStartedAt) ?? now.getTime();
    const watchdogProgressAt = current.progressToken === observation.work.progressToken ? milliseconds(current.lastProgressAt) : null;
    const progressAt = Math.max(observedProgressAt, watchdogProgressAt ?? Number.NEGATIVE_INFINITY);
    const stalledTarget = observation.work.actionable && now.getTime() - progressAt >= APR_WATCHDOG_STALL_MS ? observation.work.target : null;
    const recoveryTarget = missingTarget ?? stalledTarget;
    if (recoveryTarget) {
      const reason = missingTarget ? `${recoveryTarget} non attivo.` : `${observation.work.phase} non avanza da almeno cinque minuti.`;
      const commandId = `watchdog:recover:${recoveryTarget}:${observation.work.progressToken}`;
      const recovery: AprWatchdogRecovery = { target: recoveryTarget, requestedAt: observation.observedAt, priorPid: observation[recoveryTarget].pid, reason, commandId, attemptCount: 1 };
      next.currentCustomerKey = observation.work.customerKey; next.currentDisplayName = observation.work.displayName; next.currentPhase = observation.work.phase;
      next.phaseStartedAt = observation.work.phaseStartedAt; next.lastProgressAt = observation.work.lastProgressAt; next.progressToken = observation.work.progressToken;
      next.pendingRecovery = recovery; next.status = "TECHNICAL_BLOCK"; next.reason = `Ripresa sicura richiesta: ${reason}`; next.nextAction = `Riavviare ${recoveryTarget} una sola volta e verificare PID/heartbeat prima di riprendere.`;
      this.event(next, observation.observedAt, "recovery_requested", next.reason, recoveryTarget, commandId);
      return { state: this.write(next), recovery };
    }

    const progressChanged = current.progressToken !== observation.work.progressToken;
    next.currentCustomerKey = observation.work.customerKey; next.currentDisplayName = observation.work.displayName; next.currentPhase = observation.work.phase;
    next.phaseStartedAt = progressChanged ? observation.work.phaseStartedAt ?? observation.observedAt : current.phaseStartedAt;
    next.lastProgressAt = progressChanged ? observation.work.lastProgressAt ?? observation.observedAt : current.lastProgressAt;
    next.progressToken = observation.work.progressToken; next.nextAction = observation.work.nextAction;
    next.status = observation.work.actionable ? "WORKING" : observation.work.technicalBlock ? "TECHNICAL_BLOCK" : observation.work.operatorRequired ? "OPERATOR_REQUIRED" : "IDLE";
    next.reason = next.status === "WORKING" ? `WORKING — ${observation.work.displayName ?? "coda APR"} · ${observation.work.phase}.`
      : next.status === "OPERATOR_REQUIRED" ? "OPERATOR_REQUIRED — nessun caso eseguibile; interventi per-pratica registrati."
      : next.status === "TECHNICAL_BLOCK" ? "TECHNICAL_BLOCK — il runtime ha registrato un blocco tecnico globale."
      : "IDLE — coda vuota.";
    if (progressChanged || current.status !== next.status || current.currentPhase !== next.currentPhase) this.event(next, observation.observedAt, progressChanged ? "progress_observed" : "status_changed", next.reason, null, `watchdog:observe:${observation.work.progressToken}`);
    return { state: this.write(next), recovery: null };
  }
}
