import type { AuditedOperatorPractice, OperationalQueueStep } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import type { EneaPreflightRun } from "../../src/features/enea-shadow-crm/preflightContract";

export const PERSISTENT_RUNNER_STATE_VERSION = "enea-shadow-file-runner-v1" as const;

export type RunnerStatus = "off" | "running" | "stopped" | "completed";
export type JobExecutionState =
  | "queued"
  | "checkpoint_resumable"
  | "draft_in_progress"
  | "draft_saved"
  | "finalization_in_progress"
  | "legacy_submit_uncertain"
  | "waiting_enea_lease"
  | "operator_intervention"
  | "awaiting_submission_proof"
  | "completed";

export interface SubmissionProof {
  evidenceId: string;
  source: "enea_dashboard_read_only";
  dashboardStatus: "Inviata";
  cpid: string;
  observedAt: string;
}

export interface PersistentRunnerJob {
  practice: AuditedOperatorPractice;
  executionState: JobExecutionState;
  checkpoint: {
    step: OperationalQueueStep;
    practiceRevision: number;
    resumable: boolean;
  };
  selectionCount: number;
  submissionProof: SubmissionProof | null;
  preflightRun?: EneaPreflightRun | null;
  draftRun?: {
    status: "creating" | "created" | "saved" | "failed";
    preflightId: string;
    policyRuleId: string;
    draftId: string | null;
    portalUrl: string | null;
    startedAt: string;
    savedAt: string | null;
    evidenceCount: number;
    error: string | null;
  } | null;
  finalizationRun?: {
    mode: "test";
    policyRuleId: string;
    draftId: string;
    status: "validation_pending" | "draft_validated" | "preview_pending" | "preview_opened" | "preview_verified" | "submit_intent_recorded" | "submitted" | "uncertain";
    draftValidatedAt: string | null;
    validationEvidenceId: string | null;
    previewOpenedAt: string | null;
    previewVerifiedAt: string | null;
    submitAttempts: 0 | 1;
    submitIntentAt: string | null;
    serverObservedAt: string | null;
    cpid: string | null;
    error: string | null;
  } | null;
  workflowTiming?: {
    startedAt: string;
    endedAt: string | null;
    totalDurationMs: number | null;
    phases: Array<{
      phase: "customer_form" | "source_documents" | "preflight" | "draft_create" | "draft_fill_save";
      startedAt: string;
      endedAt: string;
      durationMs: number;
      status: "completed" | "blocked";
      blockReason: string | null;
    }>;
  } | null;
}

export type RunnerAuditEventType =
  | "state_initialized"
  | "runner_started"
  | "runner_lease_recovered"
  | "runner_stopped"
  | "job_selected"
  | "preflight_conflict_recorded"
  | "preflight_ready_recorded"
  | "draft_started"
  | "draft_created"
  | "draft_block_resolved"
  | "excluded_product_cardinality_audited"
  | "readonly_comparison_completed"
  | "draft_saved"
  | "draft_failed"
  | "test_finalization_authorized"
  | "draft_validation_completed"
  | "preview_opened"
  | "preview_verified"
  | "submit_intent_recorded"
  | "checkpoint_preserved"
  | "operator_block_recorded"
  | "enea_lease_unavailable"
  | "submission_proof_required"
  | "submission_proof_rejected"
  | "submission_proof_recorded"
  | "test_policy_updated"
  | "legacy_submit_uncertain_registered"
  | "phase_timing_recorded"
  | "workflow_timing_completed"
  | "workflow_block_confirmed"
  | "workflow_resumed_after_test_alert"
  | "run_completed";

export interface RunnerAuditEvent {
  id: string;
  revision: number;
  at: string;
  type: RunnerAuditEventType;
  practiceId: string | null;
  idempotencyKey: string;
  appliedRuleIds: string[];
  reason: string;
  nextAction: string;
  ownerId: string | null;
}

export interface PersistentRunnerState {
  version: typeof PERSISTENT_RUNNER_STATE_VERSION;
  revision: number;
  createdAt: string;
  updatedAt: string;
  runner: {
    status: RunnerStatus;
    ownerId: string | null;
    leaseUntil: string | null;
    heartbeatAt: string | null;
    currentPracticeId: string | null;
    reason: string;
    nextAction: string;
  };
  queue: PersistentRunnerJob[];
  processedIdempotencyKeys: string[];
  audit: RunnerAuditEvent[];
}
