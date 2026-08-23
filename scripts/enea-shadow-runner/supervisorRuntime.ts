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
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { SupervisorHealth } from "./supervisor";

export const SUPERVISOR_RUNTIME_VERSION = "enea-shadow-supervisor-v1" as const;
export const SUPERVISOR_LEASE_MS = 15_000;

export interface SupervisorRuntimeEvent {
  id: string;
  at: string;
  type: "supervisor_started" | "supervisor_restarted" | "supervisor_heartbeat" | "supervisor_stopped";
  appliedRuleIds: string[];
  reason: string;
}

export interface SupervisorRuntimeState {
  version: typeof SUPERVISOR_RUNTIME_VERSION;
  revision: number;
  status: "running" | "stopped";
  instanceId: string;
  pid: number;
  url: string;
  startedAt: string;
  heartbeatAt: string;
  leaseUntil: string;
  stoppedAt: string | null;
  restartCount: number;
  lastRunnerRevision: number;
  lastHealth: SupervisorHealth;
  audit: SupervisorRuntimeEvent[];
}

export class SupervisorBusyError extends Error {
  constructor(message: string) { super(message); this.name = "SupervisorBusyError"; }
}

function atomicWrite(target: string, contents: string) {
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
}

function validRuntime(value: SupervisorRuntimeState): boolean {
  return value.version === SUPERVISOR_RUNTIME_VERSION
    && Number.isInteger(value.revision)
    && ["running", "stopped"].includes(value.status)
    && Array.isArray(value.audit)
    && value.audit.every((event) => event.appliedRuleIds.length > 0
      && event.appliedRuleIds.every((ruleId) => registryRule(ruleId) !== null));
}

export class SupervisorRuntimeStore {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly lockDirectory: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "supervisor");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.lockDirectory = path.join(this.directory, "transition.lock");
  }

  load(): SupervisorRuntimeState | null {
    try {
      const parsed = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as SupervisorRuntimeState;
      return validRuntime(parsed) ? parsed : null;
    } catch { return null; }
  }

  private withLock<T>(instanceId: string, now: Date, action: () => T): T {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(this.directory, "stale-transition-locks"), { recursive: true, mode: 0o700 });
    try { mkdirSync(this.lockDirectory, { mode: 0o700 }); }
    catch {
      let lock: { instanceId?: string; expiresAt?: string } = {};
      try { lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* lock corrotto recuperabile */ }
      if (lock.expiresAt && Date.parse(lock.expiresAt) > now.getTime()) throw new SupervisorBusyError("Un'altra transizione del supervisore è in corso.");
      renameSync(this.lockDirectory, path.join(this.directory, "stale-transition-locks", `lock-${now.getTime()}-${crypto.randomUUID()}`));
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    atomicWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ instanceId, expiresAt: new Date(now.getTime() + 10_000).toISOString() })}\n`);
    try { return action(); }
    finally {
      try {
        const lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { instanceId?: string };
        if (lock.instanceId === instanceId) {
          unlinkSync(path.join(this.lockDirectory, "owner.json"));
          rmdirSync(this.lockDirectory);
        }
      } catch { /* un crash lascia un lock diagnosticabile */ }
    }
  }

  start(input: { instanceId: string; pid: number; url: string; runnerRevision: number; health: SupervisorHealth; now: Date }) {
    return this.withLock(input.instanceId, input.now, () => {
      const previous = this.load();
      if (previous?.status === "running" && Date.parse(previous.leaseUntil) > input.now.getTime()) {
        throw new SupervisorBusyError(`Supervisore ${previous.instanceId} attivo fino a ${previous.leaseUntil}.`);
      }
      const restarted = Boolean(previous);
      const revision = (previous?.revision ?? -1) + 1;
      const at = input.now.toISOString();
      const event: SupervisorRuntimeEvent = {
        id: `supervisor-event-${String(revision).padStart(8, "0")}-${restarted ? "restart" : "start"}`,
        at,
        type: restarted ? "supervisor_restarted" : "supervisor_started",
        appliedRuleIds: ["system-exclusive-runner-lease", "system-atomic-checkpoint-resume"],
        reason: restarted ? "Supervisore ripristinato dal checkpoint locale precedente." : "Supervisore locale avviato.",
      };
      const next: SupervisorRuntimeState = {
        version: SUPERVISOR_RUNTIME_VERSION,
        revision,
        status: "running",
        instanceId: input.instanceId,
        pid: input.pid,
        url: input.url,
        startedAt: at,
        heartbeatAt: at,
        leaseUntil: new Date(input.now.getTime() + SUPERVISOR_LEASE_MS).toISOString(),
        stoppedAt: null,
        restartCount: previous ? previous.restartCount + 1 : 0,
        lastRunnerRevision: input.runnerRevision,
        lastHealth: input.health,
        audit: [...(previous?.audit ?? []), event].slice(-500),
      };
      atomicWrite(this.checkpointPath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }

  heartbeat(instanceId: string, runnerRevision: number, health: SupervisorHealth, now = new Date()) {
    return this.withLock(instanceId, now, () => {
      const previous = this.load();
      if (!previous || previous.instanceId !== instanceId || previous.status !== "running") throw new SupervisorBusyError("Checkpoint supervisore non posseduto dall'istanza corrente.");
      const revision = previous.revision + 1;
      const at = now.toISOString();
      const event: SupervisorRuntimeEvent = {
        id: `supervisor-event-${String(revision).padStart(8, "0")}-heartbeat`, at,
        type: "supervisor_heartbeat", appliedRuleIds: ["system-atomic-checkpoint-resume"],
        reason: `Runner osservato alla revisione ${runnerRevision} con salute ${health}.`,
      };
      const next: SupervisorRuntimeState = {
        ...previous,
        revision,
        heartbeatAt: at,
        leaseUntil: new Date(now.getTime() + SUPERVISOR_LEASE_MS).toISOString(),
        lastRunnerRevision: runnerRevision,
        lastHealth: health,
        audit: [...previous.audit, event].slice(-500),
      };
      atomicWrite(this.checkpointPath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }

  stop(instanceId: string, reason: string, now = new Date()) {
    return this.withLock(instanceId, now, () => {
      const previous = this.load();
      if (!previous || previous.instanceId !== instanceId) return previous;
      const revision = previous.revision + 1;
      const at = now.toISOString();
      const event: SupervisorRuntimeEvent = {
        id: `supervisor-event-${String(revision).padStart(8, "0")}-stop`, at,
        type: "supervisor_stopped", appliedRuleIds: ["system-atomic-checkpoint-resume"], reason,
      };
      const next: SupervisorRuntimeState = {
        ...previous, revision, status: "stopped", heartbeatAt: at, leaseUntil: at, stoppedAt: at,
        audit: [...previous.audit, event].slice(-500),
      };
      atomicWrite(this.checkpointPath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }
}
