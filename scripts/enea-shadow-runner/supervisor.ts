import type { PersistentRunnerState, RunnerAuditEvent } from "./types";

export type SupervisorHealth =
  | "runner_active"
  | "runner_off"
  | "checkpoint_resumable"
  | "enea_lease_unavailable"
  | "technical_block"
  | "operator_intervention"
  | "run_completed";

export interface SupervisorSnapshot {
  health: SupervisorHealth;
  state: string;
  reason: string;
  nextAction: string;
  currentPracticeId: string | null;
  runnerOwnerId: string | null;
  runnerLeaseUntil: string | null;
  lastEvent: RunnerAuditEvent;
  revision: number;
  observedAt: string;
}

export function supervise(state: PersistentRunnerState, now = new Date()): SupervisorSnapshot {
  const current = state.queue.find((job) => job.practice.id === state.runner.currentPracticeId) ?? null;
  const runnerLeaseActive = state.runner.status === "running"
    && Boolean(state.runner.leaseUntil)
    && Date.parse(state.runner.leaseUntil!) > now.getTime();
  let health: SupervisorHealth;
  if (state.runner.status === "completed"
    || state.queue.every((job) => job.executionState === "completed")
    || (current?.executionState === "draft_saved" && Boolean(current.workflowTiming?.endedAt))) health = "run_completed";
  else if (current?.executionState === "operator_intervention" || current?.executionState === "awaiting_submission_proof") health = "operator_intervention";
  else if (current?.executionState === "waiting_enea_lease") health = "enea_lease_unavailable";
  else if (current?.checkpoint.resumable && !runnerLeaseActive) health = "checkpoint_resumable";
  else if (runnerLeaseActive) health = "runner_active";
  else health = "runner_off";
  return {
    health,
    state: state.runner.status === "running" && !runnerLeaseActive ? "running_lease_expired" : state.runner.status,
    reason: state.runner.reason,
    nextAction: state.runner.nextAction,
    currentPracticeId: state.runner.currentPracticeId,
    runnerOwnerId: state.runner.ownerId,
    runnerLeaseUntil: state.runner.leaseUntil,
    lastEvent: state.audit.at(-1)!,
    revision: state.revision,
    observedAt: now.toISOString(),
  };
}
