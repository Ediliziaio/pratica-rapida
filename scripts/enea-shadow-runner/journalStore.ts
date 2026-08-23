import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AuditedOperatorPractice } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import {
  PERSISTENT_RUNNER_STATE_VERSION,
  type PersistentRunnerState,
  type RunnerAuditEvent,
} from "./types";

const PROCESS_LOCK_MS = 10_000;

export class RunnerBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerBusyError";
  }
}

function clonePractice(practice: AuditedOperatorPractice): AuditedOperatorPractice {
  return structuredClone(practice);
}

function initialState(queue: ReadonlyArray<AuditedOperatorPractice>, now: Date): PersistentRunnerState {
  const at = now.toISOString();
  const initialRuleIds = ["system-atomic-checkpoint-resume"];
  const event: RunnerAuditEvent = {
    id: "runner-event-00000000-init",
    revision: 0,
    at,
    type: "state_initialized",
    practiceId: null,
    idempotencyKey: "system:init",
    appliedRuleIds: initialRuleIds,
    reason: "Coda locale inizializzata dal registro e dagli snapshot esistenti.",
    nextAction: "Avviare il runner locale quando autorizzato.",
    ownerId: null,
  };
  return {
    version: PERSISTENT_RUNNER_STATE_VERSION,
    revision: 0,
    createdAt: at,
    updatedAt: at,
    runner: {
      status: "off",
      ownerId: null,
      leaseUntil: null,
      heartbeatAt: null,
      currentPracticeId: null,
      reason: "Runner non ancora avviato.",
      nextAction: "Avviare il runner locale.",
    },
    queue: queue.map((practice) => ({
      practice: clonePractice(practice),
      executionState: "queued",
      checkpoint: {
        step: practice.currentStep,
        practiceRevision: practice.revision,
        resumable: true,
      },
      selectionCount: 0,
      submissionProof: null,
    preflightRun: null,
    draftRun: null,
    finalizationRun: null,
    workflowTiming: null,
    })),
    processedIdempotencyKeys: ["system:init"],
    audit: [event],
  };
}

function validateState(state: PersistentRunnerState): boolean {
  if (state.version !== PERSISTENT_RUNNER_STATE_VERSION || !Number.isInteger(state.revision)) return false;
  if (!Array.isArray(state.queue) || !Array.isArray(state.audit) || !Array.isArray(state.processedIdempotencyKeys)) return false;
  const ids = state.queue.map((job) => job.practice.id);
  if (new Set(ids).size !== ids.length) return false;
  if (state.runner.currentPracticeId && !ids.includes(state.runner.currentPracticeId)) return false;
  return state.audit.every((event) => event.appliedRuleIds.length > 0
    && event.appliedRuleIds.every((ruleId) => registryRule(ruleId) !== null));
}

function durableWrite(target: string, contents: string) {
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directoryDescriptor = openSync(path.dirname(target), "r");
  try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
}

export class JournalStore {
  readonly rootDirectory: string;
  readonly checkpointsDirectory: string;
  readonly lockDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.checkpointsDirectory = path.join(this.rootDirectory, "checkpoints");
    this.lockDirectory = path.join(this.rootDirectory, "runner.lock");
  }

  ensureDirectories() {
    mkdirSync(this.checkpointsDirectory, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(this.rootDirectory, "stale-locks"), { recursive: true, mode: 0o700 });
  }

  initialize(queue: ReadonlyArray<AuditedOperatorPractice>, now = new Date()): PersistentRunnerState {
    this.ensureDirectories();
    const existing = this.loadOrNull();
    if (existing) return existing;
    const state = initialState(queue, now);
    this.writeCheckpoint(state);
    return state;
  }

  load(): PersistentRunnerState {
    const state = this.loadOrNull();
    if (!state) throw new Error(`Nessun checkpoint valido in ${this.checkpointsDirectory}`);
    return state;
  }

  private loadOrNull(): PersistentRunnerState | null {
    if (!existsSync(this.checkpointsDirectory)) return null;
    const candidates = readdirSync(this.checkpointsDirectory)
      .filter((name) => /^checkpoint-\d{12}\.json$/.test(name))
      .sort()
      .reverse();
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(readFileSync(path.join(this.checkpointsDirectory, candidate), "utf8")) as PersistentRunnerState;
        if (validateState(parsed)) return parsed;
      } catch {
        // Un file parziale o corrotto non retrocede oltre l'ultimo checkpoint valido.
      }
    }
    return null;
  }

  writeCheckpoint(state: PersistentRunnerState) {
    if (!validateState(state)) throw new Error("Checkpoint rifiutato: stato o ID regola non validi.");
    this.ensureDirectories();
    const target = path.join(this.checkpointsDirectory, `checkpoint-${String(state.revision).padStart(12, "0")}.json`);
    if (existsSync(target)) {
      const existing = JSON.parse(readFileSync(target, "utf8")) as PersistentRunnerState;
      if (JSON.stringify(existing) === JSON.stringify(state)) return;
      throw new Error(`Conflitto sulla revisione immutabile ${state.revision}.`);
    }
    durableWrite(target, `${JSON.stringify(state, null, 2)}\n`);
    durableWrite(path.join(this.rootDirectory, "HEAD"), `${state.revision}\n`);
  }

  withProcessLock<T>(ownerId: string, now: Date, action: () => T): T {
    this.ensureDirectories();
    const expiresAt = new Date(now.getTime() + PROCESS_LOCK_MS).toISOString();
    try {
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    } catch {
      let lock: { ownerId?: string; expiresAt?: string } = {};
      try { lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* scaduto/corrotto */ }
      if (lock.expiresAt && Date.parse(lock.expiresAt) > now.getTime()) {
        throw new RunnerBusyError(`Lock locale posseduto da ${lock.ownerId ?? "sconosciuto"} fino a ${lock.expiresAt}.`);
      }
      const staleTarget = path.join(this.rootDirectory, "stale-locks", `lock-${now.getTime()}-${crypto.randomUUID()}`);
      renameSync(this.lockDirectory, staleTarget);
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    durableWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ ownerId, acquiredAt: now.toISOString(), expiresAt })}\n`);
    try {
      return action();
    } finally {
      try {
        const lock = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (lock.ownerId === ownerId) {
          unlinkSync(path.join(this.lockDirectory, "owner.json"));
          rmdirSync(this.lockDirectory);
        }
      } catch {
        // Il lock ha già cambiato proprietario o il processo è stato interrotto.
      }
    }
  }
}
