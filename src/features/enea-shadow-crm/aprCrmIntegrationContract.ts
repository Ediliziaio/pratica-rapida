import { createHash } from "node:crypto";
import { createAprOperatorBlockDescriptor, type AprOperatorBlockDescriptor } from "./aprOperatorUnlockContract";

export const APR_CRM_INTEGRATION_CONTRACT_VERSION = "apr-crm-integration-contract-v2" as const;
export const APR_READY_PIPELINE = "Pronte da fare" as const;
export const APR_OPERATOR_PIPELINE = "Richiesto intervento operatore" as const;
export const APR_CRM_INTEGRATION_RULE_IDS = Object.freeze([
  "system-apr-crm-integration-boundary",
  "system-apr-operator-intervention-routing",
  "system-apr-customer-artifact-linkage",
] as const);

export interface AprCrmInboundPracticeEvent {
  eventId: string;
  practiceId: string;
  customerId: string;
  module: "ENEA";
  crmRevision: number;
  currentPipeline: string;
  currentStatus: string;
  dossierLocator: string;
}
export interface AprCrmStateExpectation { pipeline: string; status: string; crmRevision: number; }
export interface AprCrmOperatorRequest {
  requestId: string;
  field: string;
  reason: string;
  question: string;
  evidenceText: string;
  sourceIds: string[];
  choices: Array<{ value: string; label: string }>;
  block: AprOperatorBlockDescriptor;
}
export interface AprCrmOperatorResolution {
  requestId: string;
  commandId: string;
  answer: string;
  note: string;
  operatorId: string;
  answeredAt: string;
}
export interface AprCrmIntegrationCommand {
  contractVersion: typeof APR_CRM_INTEGRATION_CONTRACT_VERSION;
  kind: "move_customer" | "link_customer_artifact";
  execution: "local_simulation_only" | "future_adapter_only";
  idempotencyKey: string;
  eventId: string;
  practiceId: string;
  customerId: string;
  expected: AprCrmStateExpectation;
  desired: { pipeline: string; status: string; operatorRequest?: AprCrmOperatorRequest; clearOperatorRequest?: boolean; artifact?: { kind: "enea_pdf" | "enea_email_receipt"; fingerprint: string } };
  compensation: { pipeline: string; status: string; operatorRequest?: AprCrmOperatorRequest; unlinkArtifactFingerprint?: string };
  reason: string;
  appliedRuleIds: readonly string[];
  externalActionAllowed: false;
}

export type AprLocalCaseOutcome =
  | { status: "plan_ready"; reason: string }
  | { status: "draft_saved"; reason: string; draftId: string }
  | { status: "blocked"; reason: string; operatorRequest?: Omit<AprCrmOperatorRequest, "requestId" | "reason" | "block"> & { requestId?: string; block?: AprOperatorBlockDescriptor } };

export function proposeAprCrmCommands(event: AprCrmInboundPracticeEvent, outcome: AprLocalCaseOutcome, now = new Date()): AprCrmIntegrationCommand[] {
  if (!event.eventId.trim() || !event.practiceId.trim() || !event.customerId.trim() || event.module !== "ENEA" || !Number.isInteger(event.crmRevision)) {
    throw new Error("Evento pratica ENEA CRM non valido.");
  }
  const operatorRequest = outcome.status === "blocked" ? (() => {
    const requestId = outcome.operatorRequest?.requestId ?? `operator:${event.practiceId}:${event.crmRevision}`;
    const question = outcome.operatorRequest?.question ?? "Quale dato o documento deve utilizzare APR per risolvere questo blocco?";
    const evidenceText = outcome.operatorRequest?.evidenceText ?? outcome.reason;
    const sourceIds = outcome.operatorRequest?.sourceIds?.length ? outcome.operatorRequest.sourceIds : [event.dossierLocator];
    const choices = outcome.operatorRequest?.choices ?? [];
    return {
    requestId,
    field: outcome.operatorRequest?.field ?? "pratica",
    reason: outcome.reason,
    question,
    evidenceText,
    sourceIds,
    choices,
    block: outcome.operatorRequest?.block ?? createAprOperatorBlockDescriptor({
      blockId: requestId,
      practiceId: event.practiceId,
      customerKey: event.customerId,
      generationId: `crm-generation:${event.practiceId}:${event.crmRevision}`,
      category: "legacy_unclassified",
      code: "crm_operator_request",
      stage: "unknown",
      fieldPath: outcome.operatorRequest?.field ?? "pratica",
      reason: outcome.reason,
      question,
      evidenceText,
      sourceIds,
      ruleIds: [APR_CRM_INTEGRATION_RULE_IDS[1], "system-atomic-checkpoint-resume"],
      resumePolicy: "recompute_before_draft",
      answerSchema: { kind: choices.length ? "controlled_choice" : "text", choices, noteRequired: true },
      createdAt: now.toISOString(),
    }),
  } satisfies AprCrmOperatorRequest; })() : undefined;
  const target = outcome.status === "blocked"
    ? { pipeline: APR_OPERATOR_PIPELINE, status: "APR ENEA · intervento richiesto", operatorRequest }
    : outcome.status === "draft_saved"
      ? { pipeline: event.currentPipeline, status: `APR ENEA · bozza salvata ${outcome.draftId}` }
      : { pipeline: event.currentPipeline, status: "APR ENEA · piano locale pronto" };
  return [{ contractVersion: APR_CRM_INTEGRATION_CONTRACT_VERSION, kind: "move_customer", execution: "local_simulation_only",
    idempotencyKey: `${APR_CRM_INTEGRATION_CONTRACT_VERSION}:${event.eventId}:move:${outcome.status}`, eventId: event.eventId,
    practiceId: event.practiceId, customerId: event.customerId,
    expected: { pipeline: event.currentPipeline, status: event.currentStatus, crmRevision: event.crmRevision }, desired: target,
    compensation: { pipeline: event.currentPipeline, status: event.currentStatus }, reason: outcome.reason,
    appliedRuleIds: [APR_CRM_INTEGRATION_RULE_IDS[0], ...(outcome.status === "blocked" ? [APR_CRM_INTEGRATION_RULE_IDS[1]] : [])], externalActionAllowed: false }];
}

export function proposeAprCrmRequeueCommand(event: AprCrmInboundPracticeEvent, resolution: AprCrmOperatorResolution): AprCrmIntegrationCommand {
  if (!resolution.requestId.trim() || !resolution.commandId.trim() || !resolution.answer.trim() || !resolution.operatorId.trim() || !Number.isFinite(Date.parse(resolution.answeredAt))) {
    throw new Error("Risoluzione operatore CRM non valida.");
  }
  return {
    contractVersion: APR_CRM_INTEGRATION_CONTRACT_VERSION, kind: "move_customer", execution: "local_simulation_only",
    idempotencyKey: `${APR_CRM_INTEGRATION_CONTRACT_VERSION}:${event.practiceId}:requeue:${resolution.commandId}`,
    eventId: event.eventId, practiceId: event.practiceId, customerId: event.customerId,
    expected: { pipeline: event.currentPipeline, status: event.currentStatus, crmRevision: event.crmRevision },
    desired: { pipeline: APR_READY_PIPELINE, status: "APR ENEA · risposta operatore acquisita", clearOperatorRequest: true },
    compensation: { pipeline: event.currentPipeline, status: event.currentStatus },
    reason: `Risposta ${resolution.requestId} acquisita e auditata; pratica pronta per la ripresa dal checkpoint.`,
    appliedRuleIds: [APR_CRM_INTEGRATION_RULE_IDS[0], APR_CRM_INTEGRATION_RULE_IDS[1], "user-2026-08-16-operator-structured-question-resume", "system-atomic-checkpoint-resume"],
    externalActionAllowed: false,
  };
}

export function proposeFutureCustomerArtifact(event: AprCrmInboundPracticeEvent, kind: "enea_pdf" | "enea_email_receipt", contents: string): AprCrmIntegrationCommand {
  const fingerprint = createHash("sha256").update(contents).digest("hex");
  return { contractVersion: APR_CRM_INTEGRATION_CONTRACT_VERSION, kind: "link_customer_artifact", execution: "future_adapter_only",
    idempotencyKey: `${APR_CRM_INTEGRATION_CONTRACT_VERSION}:${event.eventId}:artifact:${kind}:${fingerprint}`, eventId: event.eventId,
    practiceId: event.practiceId, customerId: event.customerId, expected: { pipeline: event.currentPipeline, status: event.currentStatus, crmRevision: event.crmRevision },
    desired: { pipeline: event.currentPipeline, status: event.currentStatus, artifact: { kind, fingerprint } },
    compensation: { pipeline: event.currentPipeline, status: event.currentStatus, unlinkArtifactFingerprint: fingerprint },
    reason: `Artefatto futuro ${kind} descritto dal contratto ma non eseguibile.`,
    appliedRuleIds: [APR_CRM_INTEGRATION_RULE_IDS[0], APR_CRM_INTEGRATION_RULE_IDS[2]], externalActionAllowed: false };
}

export function aprCrmIntegrationContractSnapshot() {
  return { name: "APR — Automazione PraticaRapida", module: "ENEA", version: APR_CRM_INTEGRATION_CONTRACT_VERSION,
    mode: "local_contract_and_simulation", externalActionAllowed: false, inbound: "Intercetta eventi pratica ENEA idempotenti",
    blockedRouting: APR_OPERATOR_PIPELINE, existingAutomations: "preserve_exactly", crmDashboardIntegration: "preserve_exactly",
    currentCapabilities: ["intercept_contract", "local_case_outcome", "operator_pipeline_proposal", "operator_question_payload", "operator_answer_requeue_proposal", "draft_saved_status_proposal", "progress_state_proposal"],
    futureCapabilities: ["portal_submission", "customer_enea_pdf", "customer_enea_email_receipt"], appliedRuleIds: APR_CRM_INTEGRATION_RULE_IDS };
}
