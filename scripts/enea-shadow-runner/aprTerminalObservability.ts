import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const APR_TERMINAL_OBSERVABILITY_VERSION = "apr-terminal-observability-snapshot-v1" as const;

export interface AprTerminalObservabilitySnapshot {
  version: typeof APR_TERMINAL_OBSERVABILITY_VERSION;
  revision: number;
  snapshotId: string;
  cohortId: string;
  cohortRoot: string;
  observedAt: string;
  terminal: boolean;
  lifecycleState: "active" | "completed" | "stopped_by_operator" | "technical_stop";
  aprStatus: {
    publicStatus: string | null;
    source: string;
    executionStatus: string;
    workerStatus: string;
    currentCustomerKey: string | null;
    reason: string;
    nextAction: string;
    consistency: "CONSISTENT" | "INCONSISTENT";
  };
  sourceRevisions: { journal: number; execution: number; worker: number };
  sourceFingerprints: { execution: string | null; workerIdentity: string | null };
  caseTruth?: {
    customerKey: string;
    status: "READY" | "blocked_case" | "TECHNICAL_BLOCK" | "INCONSISTENT";
    hasProblem: boolean | null;
    blockerCount: number;
    blockerCodes: string[];
    statement: string;
    reportBlockers: Array<{ code: string; message?: string; question?: string }>;
  } | null;
  safety: { previewAllowed: false; submitAllowed: false; communicationsAllowed: false };
}

export function sequencerTerminalIsCurrent(
  terminal: AprTerminalObservabilitySnapshot | null | undefined,
  execution?: { revision: number; status: string; currentCustomerKey: string | null; sourceFingerprint: string | null } | null,
  worker?: { revision: number; instanceId: string | null } | null,
) {
  if (!terminal?.terminal || terminal.aprStatus.source !== "sequencer_finalizer") return false;
  // An independent observer may only possess the immutable terminal artifact.
  // In that case the artifact is still the best available source.  When the
  // live checkpoint is available, however, a later non-terminal generation
  // must supersede the old verdict instead of inheriting it forever.
  if (!execution && !worker) return true;
  const executionMatches = !execution || (
    execution.revision === terminal.sourceRevisions.execution
    && execution.sourceFingerprint === terminal.sourceFingerprints.execution
  );
  const workerMatches = !worker || (
    worker.revision === terminal.sourceRevisions.worker
    && worker.instanceId === terminal.sourceFingerprints.workerIdentity
  );
  // Once either live source is available, the terminal can describe current
  // truth only if every available source has the exact revision and identity
  // captured by the finalizer. This also prevents an old terminal from
  // resurfacing after a later quiescent/completed generation.
  return executionMatches && workerMatches;
}

function storeRootFor(cohortRoot: string) {
  const resolved = path.resolve(cohortRoot);
  const marker = `${path.sep}cohorts${path.sep}`;
  const index = resolved.indexOf(marker);
  const base = index >= 0 ? resolved.slice(0, index) : resolved;
  return path.join(base, "terminal-observability");
}

function atomicWrite(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function validCohortId(value: string) {
  if (!/^[a-zA-Z0-9._-]{1,240}$/.test(value)) throw new Error("apr_terminal_observability_cohort_id_invalid");
  return value;
}

export class PersistentAprTerminalObservability {
  readonly storeRoot: string;
  readonly cohortId: string;
  readonly snapshotPath: string;

  constructor(readonly cohortRoot: string) {
    this.cohortId = validCohortId(path.basename(path.resolve(cohortRoot)));
    this.storeRoot = storeRootFor(cohortRoot);
    this.snapshotPath = path.join(this.storeRoot, `${this.cohortId}.json`);
  }

  load(): AprTerminalObservabilitySnapshot | null {
    if (!existsSync(this.snapshotPath)) return null;
    const value = JSON.parse(readFileSync(this.snapshotPath, "utf8")) as AprTerminalObservabilitySnapshot;
    if (value.version !== APR_TERMINAL_OBSERVABILITY_VERSION || value.cohortId !== this.cohortId || path.resolve(value.cohortRoot) !== path.resolve(this.cohortRoot) || !Number.isInteger(value.revision) || value.revision < 1) throw new Error("apr_terminal_observability_snapshot_invalid");
    return value;
  }

  publish(input: Omit<AprTerminalObservabilitySnapshot, "version" | "revision" | "snapshotId" | "cohortId" | "cohortRoot">) {
    const previous = this.load();
    // Il verdetto atomico del finalizzatore e' immutabile: anche una nuova
    // rilettura che eredita `source=sequencer_finalizer` non puo' riscriverlo
    // omettendo caseTruth o alterandone le prove.
    if (previous?.terminal && previous.aprStatus.source === "sequencer_finalizer") return previous;
    const snapshot: AprTerminalObservabilitySnapshot = {
      version: APR_TERMINAL_OBSERVABILITY_VERSION,
      revision: (previous?.revision ?? 0) + 1,
      snapshotId: `apr-terminal-${this.cohortId}-${randomUUID()}`,
      cohortId: this.cohortId,
      cohortRoot: path.resolve(this.cohortRoot),
      ...input,
    };
    atomicWrite(this.snapshotPath, snapshot);
    return snapshot;
  }

  list() {
    if (!existsSync(this.storeRoot)) return [] as AprTerminalObservabilitySnapshot[];
    return readdirSync(this.storeRoot).filter((name) => /^[a-zA-Z0-9._-]+\.json$/.test(name)).flatMap((name) => {
      try {
        const value = JSON.parse(readFileSync(path.join(this.storeRoot, name), "utf8")) as AprTerminalObservabilitySnapshot;
        return value.version === APR_TERMINAL_OBSERVABILITY_VERSION ? [value] : [];
      } catch { return []; }
    }).sort((left, right) => left.cohortId.localeCompare(right.cohortId));
  }

  find(cohortId: string) {
    const id = validCohortId(cohortId);
    return this.list().find((item) => item.cohortId === id) ?? null;
  }
}
