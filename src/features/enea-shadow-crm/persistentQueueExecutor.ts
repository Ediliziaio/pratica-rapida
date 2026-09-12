import {
  loadAuditedOperatorQueue,
  saveAuditedOperatorQueue,
  type AuditedOperatorPractice,
} from "./auditedOperatorQueue";

export const PERSISTENT_QUEUE_EXECUTOR_VERSION = "enea-queue-executor-v1" as const;
export const QUEUE_EXECUTOR_RUNTIME_KEY = "enea-shadow-crm:queue-executor:runtime:v1";
export const QUEUE_EXECUTOR_COMMANDS_KEY = "enea-shadow-crm:queue-executor:commands:v1";
export const QUEUE_EXECUTOR_EVENTS_KEY = "enea-shadow-crm:queue-executor:events:v1";
export const QUEUE_EXECUTOR_LEASE_MS = 15_000;

export type QueueExecutorStatus = "idle" | "running" | "paused" | "completed";
export type QueueExecutorCommandType = "start" | "resume" | "pause" | "wake";

export interface QueueExecutorCommand {
  id: string;
  type: QueueExecutorCommandType;
  requestedAt: string;
  requestedBy: "cabina" | "laboratorio" | "ui";
  scope: "local_only";
}

export interface QueueExecutorEvent {
  id: string;
  at: string;
  type: "command_accepted" | "lease_acquired" | "lease_recovered" | "practice_selected" | "queue_completed";
  commandId?: string;
  practiceId?: string;
  note: string;
}

export interface QueueExecutorRuntime {
  version: typeof PERSISTENT_QUEUE_EXECUTOR_VERSION;
  revision: number;
  status: QueueExecutorStatus;
  ownerId: string | null;
  leaseUntil: string | null;
  currentPracticeId: string | null;
  processedCommandIds: string[];
  lastTickAt: string | null;
  lastProgressAt: string | null;
  stopReason: string | null;
}

const EMPTY_RUNTIME: QueueExecutorRuntime = {
  version: PERSISTENT_QUEUE_EXECUTOR_VERSION,
  revision: 0,
  status: "idle",
  ownerId: null,
  leaseUntil: null,
  currentPracticeId: null,
  processedCommandIds: [],
  lastTickAt: null,
  lastProgressAt: null,
  stopReason: null,
};

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isRuntime(value: QueueExecutorRuntime): boolean {
  return value.version === PERSISTENT_QUEUE_EXECUTOR_VERSION
    && Number.isInteger(value.revision)
    && ["idle", "running", "paused", "completed"].includes(value.status)
    && Array.isArray(value.processedCommandIds);
}

export function loadQueueExecutorRuntime(storage: Storage): QueueExecutorRuntime {
  const value = readJson(storage, QUEUE_EXECUTOR_RUNTIME_KEY, EMPTY_RUNTIME);
  return isRuntime(value) ? value : { ...EMPTY_RUNTIME };
}

export function enqueueQueueExecutorCommand(storage: Storage, command: QueueExecutorCommand): boolean {
  const commands = readJson<QueueExecutorCommand[]>(storage, QUEUE_EXECUTOR_COMMANDS_KEY, []);
  if (commands.some((item) => item.id === command.id)) return true;
  return writeJson(storage, QUEUE_EXECUTOR_COMMANDS_KEY, [...commands, command]);
}

export function loadQueueExecutorEvents(storage: Storage): QueueExecutorEvent[] {
  return readJson<QueueExecutorEvent[]>(storage, QUEUE_EXECUTOR_EVENTS_KEY, []);
}

function isTerminal(practice: AuditedOperatorPractice): boolean {
  return practice.status === "submitted_manual_exception" || (
    practice.status === "requested_operator" && Boolean(practice.activeBlock)
  );
}

function nextPractice(queue: ReadonlyArray<AuditedOperatorPractice>): AuditedOperatorPractice | null {
  return queue.find((practice) => !isTerminal(practice)) ?? null;
}

function appendEvents(storage: Storage, additions: QueueExecutorEvent[]) {
  if (!additions.length) return;
  const events = loadQueueExecutorEvents(storage);
  writeJson(storage, QUEUE_EXECUTOR_EVENTS_KEY, [...events, ...additions].slice(-500));
}

export function tickPersistentQueueExecutor(
  storage: Storage,
  ownerId: string,
  now = new Date(),
): QueueExecutorRuntime {
  const current = loadQueueExecutorRuntime(storage);
  const nowMs = now.getTime();
  const leaseActive = current.ownerId && current.leaseUntil && Date.parse(current.leaseUntil) > nowMs;
  if (leaseActive && current.ownerId !== ownerId) return current;

  const recovered = Boolean(current.ownerId && current.ownerId !== ownerId);
  const commands = readJson<QueueExecutorCommand[]>(storage, QUEUE_EXECUTOR_COMMANDS_KEY, []);
  const pending = commands.filter((command) => !current.processedCommandIds.includes(command.id));
  let status = current.status;
  let stopReason = current.stopReason;
  const accepted: QueueExecutorCommand[] = [];
  for (const command of pending) {
    if (command.scope !== "local_only") continue;
    accepted.push(command);
    if (command.type === "pause") {
      status = "paused";
      stopReason = "paused_by_command";
    } else {
      status = "running";
      stopReason = null;
    }
  }

  const queue = loadAuditedOperatorQueue(storage);
  const selected = status === "running" ? nextPractice(queue) : null;
  if (status === "running" && !selected) status = "completed";
  const at = now.toISOString();
  const next: QueueExecutorRuntime = {
    ...current,
    revision: current.revision + 1,
    status,
    ownerId,
    leaseUntil: new Date(nowMs + QUEUE_EXECUTOR_LEASE_MS).toISOString(),
    currentPracticeId: selected?.id ?? null,
    processedCommandIds: [...current.processedCommandIds, ...accepted.map((command) => command.id)],
    lastTickAt: at,
    lastProgressAt: selected && selected.id !== current.currentPracticeId ? at : current.lastProgressAt,
    stopReason,
  };
  writeJson(storage, QUEUE_EXECUTOR_RUNTIME_KEY, next);
  saveAuditedOperatorQueue(storage, queue);

  const events: QueueExecutorEvent[] = [];
  events.push({
    id: `executor-event-${next.revision}-lease`, at,
    type: recovered ? "lease_recovered" : "lease_acquired",
    note: recovered ? "Lease scaduta recuperata senza perdere checkpoint." : "Lease locale acquisita o rinnovata.",
  });
  accepted.forEach((command, index) => events.push({
    id: `executor-event-${next.revision}-command-${index}`, at, type: "command_accepted", commandId: command.id,
    note: `Comando ${command.type} accettato una sola volta.`,
  }));
  if (selected && selected.id !== current.currentPracticeId) events.push({
    id: `executor-event-${next.revision}-practice`, at, type: "practice_selected", practiceId: selected.id,
    note: `Ripresa dal checkpoint ${selected.currentStep}; fonti, regole e audit conservati.`,
  });
  if (status === "completed" && current.status !== "completed") events.push({
    id: `executor-event-${next.revision}-complete`, at, type: "queue_completed", note: "Tutte le pratiche hanno uno stato terminale.",
  });
  appendEvents(storage, events);
  return next;
}

