import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APR_OPERATOR_PIPELINE,
  APR_READY_PIPELINE,
  proposeAprCrmCommands,
  proposeAprCrmRequeueCommand,
  type AprCrmInboundPracticeEvent,
  type AprCrmIntegrationCommand,
  type AprCrmOperatorRequest,
  type AprCrmOperatorResolution,
  type AprLocalCaseOutcome,
} from "../../src/features/enea-shadow-crm/aprCrmIntegrationContract";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { isAprOperatorBlockDescriptor, migrateLegacyOperatorRequest } from "../../src/features/enea-shadow-crm/aprOperatorUnlockContract";
import { applyAprCommandLocally, type LocalCrmSimulationState } from "../../src/features/enea-shadow-crm/aprCrmIntegrationSimulator";

export const APR_CRM_WORKFLOW_VERSION = "apr-crm-persistent-workflow-v2" as const;
const APR_CRM_WORKFLOW_LEGACY_VERSION = "apr-crm-persistent-workflow-v1" as const;
const BASE_RULE_IDS = ["system-apr-crm-integration-boundary", "system-apr-operator-intervention-routing", "system-atomic-checkpoint-resume"];

export type AprCrmWorkflowItemState =
  | "queued"
  | "command_pending"
  | "plan_ready"
  | "draft_saved"
  | "operator_required"
  | "resume_ready"
  | "technical_block";

export interface AprCrmWorkflowCommandRecord {
  command: AprCrmIntegrationCommand;
  state: "pending" | "applied" | "failed";
  stagedAt: string;
  appliedAt: string | null;
  failure: string | null;
}

export interface AprCrmWorkflowItem {
  event: AprCrmInboundPracticeEvent;
  displayName: string;
  state: AprCrmWorkflowItemState;
  outcome: AprLocalCaseOutcome | null;
  operatorRequest: AprCrmOperatorRequest | null;
  operatorResolution: AprCrmOperatorResolution | null;
  draftId: string | null;
  resumeCount: number;
  reason: string;
  nextAction: string;
  startedAt: string;
  updatedAt: string;
}

export interface AprCrmWorkflowAuditEvent {
  revision: number;
  at: string;
  type: "initialized" | "inbound_accepted" | "inbound_deduplicated" | "command_staged" | "command_applied" | "command_failed" | "operator_answered" | "practice_requeued" | "operator_contract_migrated";
  practiceId: string | null;
  commandId: string | null;
  reason: string;
  appliedRuleIds: string[];
}

export interface AprCrmWorkflowState {
  version: typeof APR_CRM_WORKFLOW_VERSION;
  revision: number;
  status: "idle" | "running" | "operator_required" | "technical_block" | "completed";
  items: AprCrmWorkflowItem[];
  commands: AprCrmWorkflowCommandRecord[];
  simulation: LocalCrmSimulationState;
  processedInboundEventIds: string[];
  externalActionAllowed: false;
  reason: string;
  nextAction: string;
  audit: AprCrmWorkflowAuditEvent[];
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmWorkflowState {
  const reason = "Ciclo CRM APR persistente inizializzato; nessun evento Pronte da fare acquisito.";
  return {
    version: APR_CRM_WORKFLOW_VERSION,
    revision: 0,
    status: "idle",
    items: [],
    commands: [],
    simulation: {
      revision: 0,
      customers: {},
      existingAutomations: ["crm-existing-automations-preserved"],
      crmDashboardIntegration: ["crm-dashboard-integration-preserved"],
      processedIdempotencyKeys: [],
      audit: [],
    },
    processedInboundEventIds: [],
    externalActionAllowed: false,
    reason,
    nextAction: "Attendere un evento ENEA dalla pipeline Pronte da fare.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", practiceId: null, commandId: null, reason, appliedRuleIds: BASE_RULE_IDS }],
  };
}

function assertRuleIds(ruleIds: readonly string[]) {
  for (const ruleId of ruleIds) if (!registryRule(ruleId)) throw new Error(`crm_workflow_rule_unknown:${ruleId}`);
}

function validState(value: AprCrmWorkflowState) {
  return value.version === APR_CRM_WORKFLOW_VERSION
    && value.externalActionAllowed === false
    && Number.isInteger(value.revision)
    && Array.isArray(value.items)
    && Array.isArray(value.commands)
    && Array.isArray(value.processedInboundEventIds)
    && value.items.every((item) => !item.operatorRequest || isAprOperatorBlockDescriptor(item.operatorRequest.block))
    && value.commands.every((record) => (!record.command.desired.operatorRequest || isAprOperatorBlockDescriptor(record.command.desired.operatorRequest.block))
      && (!record.command.compensation.operatorRequest || isAprOperatorBlockDescriptor(record.command.compensation.operatorRequest.block)))
    && Object.values(value.simulation.customers).every((customer) => !customer.operatorRequest || isAprOperatorBlockDescriptor(customer.operatorRequest.block))
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function migrateWorkflowState(value: unknown, now: Date): AprCrmWorkflowState | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Omit<AprCrmWorkflowState, "version"> & { version: string };
  if (legacy.version !== APR_CRM_WORKFLOW_VERSION && legacy.version !== APR_CRM_WORKFLOW_LEGACY_VERSION) return null;
  const next = structuredClone(legacy) as AprCrmWorkflowState;
  let migrated = legacy.version === APR_CRM_WORKFLOW_LEGACY_VERSION;
  const descriptors = new Map<string, AprCrmOperatorRequest["block"]>();
  for (const item of next.items ?? []) {
    if (!item.operatorRequest) continue;
    const request = item.operatorRequest as AprCrmOperatorRequest & { block?: AprCrmOperatorRequest["block"] };
    if (!isAprOperatorBlockDescriptor(request.block)) {
      request.block = migrateLegacyOperatorRequest(request, {
        practiceId: item.event.practiceId,
        customerKey: item.event.customerId,
        generationId: `crm-generation:${item.event.practiceId}:${item.event.crmRevision}`,
        createdAt: item.updatedAt || item.startedAt || now.toISOString(),
        ruleIds: BASE_RULE_IDS,
      });
      migrated = true;
    }
    descriptors.set(request.requestId, request.block);
  }
  const attach = (request: AprCrmOperatorRequest | undefined, fallback?: { practiceId: string; customerKey: string; generationId: string; createdAt: string; ruleIds: readonly string[] }) => {
    if (!request || isAprOperatorBlockDescriptor(request.block)) return;
    const descriptor = descriptors.get(request.requestId) ?? (fallback ? migrateLegacyOperatorRequest(request, fallback) : null);
    if (descriptor) { request.block = descriptor; descriptors.set(request.requestId, descriptor); migrated = true; }
  };
  for (const record of next.commands ?? []) {
    const context = {
      practiceId: record.command.practiceId,
      customerKey: record.command.customerId,
      generationId: `crm-generation:${record.command.practiceId}:${record.command.expected.crmRevision}`,
      createdAt: record.stagedAt || now.toISOString(),
      ruleIds: record.command.appliedRuleIds,
    };
    attach(record.command.desired.operatorRequest, context);
    attach(record.command.compensation.operatorRequest, context);
  }
  for (const [customerKey, customer] of Object.entries(next.simulation?.customers ?? {})) {
    const item = next.items.find((candidate) => candidate.event.customerId === customerKey);
    if (!item) continue;
    attach(customer.operatorRequest, {
      practiceId: item.event.practiceId,
      customerKey,
      generationId: `crm-generation:${item.event.practiceId}:${item.event.crmRevision}`,
      createdAt: item.updatedAt || item.startedAt || now.toISOString(),
      ruleIds: BASE_RULE_IDS,
    });
  }
  next.version = APR_CRM_WORKFLOW_VERSION;
  if (migrated) {
    next.revision += 1;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "operator_contract_migrated", practiceId: null, commandId: null, reason: "Richieste operatore legacy migrate nel contratto canonico con scope non propagabile; coda e checkpoint conservati.", appliedRuleIds: BASE_RULE_IDS });
  }
  return validState(next) ? next : null;
}

function normalizedName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function validateInbound(event: AprCrmInboundPracticeEvent, displayName: string) {
  if (!event.eventId.trim() || !event.practiceId.trim() || !event.customerId.trim() || event.module !== "ENEA" || !Number.isInteger(event.crmRevision) || event.crmRevision < 0) throw new Error("crm_workflow_inbound_invalid");
  if (event.currentPipeline !== APR_READY_PIPELINE) throw new Error("crm_workflow_pipeline_not_ready");
  if (!event.dossierLocator.trim() || !displayName.trim()) throw new Error("crm_workflow_source_invalid");
  if (normalizedName(displayName) === "beatrice ciotta") throw new Error("crm_workflow_beatrice_ciotta_excluded");
}

function summarize(state: AprCrmWorkflowState) {
  const technical = state.items.filter((item) => item.state === "technical_block").length;
  const pending = state.commands.filter((record) => record.state === "pending").length;
  const operators = state.items.filter((item) => item.state === "operator_required").length;
  const active = state.items.filter((item) => ["queued", "command_pending", "plan_ready", "resume_ready"].includes(item.state)).length;
  const terminal = state.items.filter((item) => item.state === "draft_saved").length;
  if (technical) return { status: "technical_block" as const, reason: `${technical} pratiche con blocco tecnico locale.`, nextAction: "Correggere il contratto o il conflitto di revisione senza mutazioni CRM reali." };
  if (pending || active) return { status: "running" as const, reason: `${active} pratiche lavorabili e ${pending} comandi persistenti in attesa.`, nextAction: pending ? "Applicare i comandi locali idempotenti dal checkpoint." : "Riprendere la prossima pratica dal checkpoint." };
  if (operators) return { status: "operator_required" as const, reason: `${operators} pratiche attendono una risposta operatore; la coda restante non è bloccata.`, nextAction: "Rispondere alla domanda e riaccodare la sola pratica interessata." };
  if (state.items.length && terminal === state.items.length) return { status: "completed" as const, reason: `${terminal} pratiche concluse con bozza salvata.`, nextAction: "Nessuna azione esterna: attendere nuovi eventi Pronte da fare." };
  return { status: "idle" as const, reason: "IDLE — coda CRM locale vuota.", nextAction: "Attendere un evento ENEA dalla pipeline Pronte da fare." };
}

export class PersistentAprCrmIntegrationWorkflow {
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string) {
    this.checkpointPath = path.join(path.resolve(rootDirectory), "crm-integration-workflow", "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const raw = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as unknown;
      const value = migrateWorkflowState(raw, now);
      if (!value) return initialState(now);
      if ((raw as { version?: string }).version !== APR_CRM_WORKFLOW_VERSION
        || JSON.stringify(raw) !== JSON.stringify(value)) atomicWrite(this.checkpointPath, `${JSON.stringify(value, null, 2)}\n`);
      return value;
    } catch { return initialState(now); }
  }

  private write(state: AprCrmWorkflowState) {
    const summary = summarize(state);
    state.status = summary.status;
    state.reason = summary.reason;
    state.nextAction = summary.nextAction;
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  ingest(input: { event: AprCrmInboundPracticeEvent; displayName: string }, now = new Date()) {
    validateInbound(input.event, input.displayName);
    const current = this.initialize(now);
    if (current.processedInboundEventIds.includes(input.event.eventId)) return current;
    const next = structuredClone(current);
    const existing = next.items.find((item) => item.event.practiceId === input.event.practiceId);
    if (existing && input.event.crmRevision <= existing.event.crmRevision) {
      next.revision += 1;
      next.processedInboundEventIds.push(input.event.eventId);
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "inbound_deduplicated", practiceId: input.event.practiceId, commandId: null, reason: "Evento precedente o duplicato ignorato; checkpoint conservato.", appliedRuleIds: BASE_RULE_IDS });
      return this.write(next);
    }
    const customer = next.simulation.customers[input.event.customerId];
    if (customer) {
      customer.pipeline = input.event.currentPipeline;
      customer.status = input.event.currentStatus;
      customer.crmRevision = input.event.crmRevision;
    } else next.simulation.customers[input.event.customerId] = { pipeline: input.event.currentPipeline, status: input.event.currentStatus, crmRevision: input.event.crmRevision, artifacts: [] };
    if (existing) {
      existing.event = structuredClone(input.event);
      existing.displayName = input.displayName.trim();
      existing.state = "queued";
      existing.outcome = null;
      existing.reason = "Nuova revisione CRM in Pronte da fare acquisita; ripresa dal checkpoint precedente.";
      existing.nextAction = "Rieseguire il preflight usando risposta operatore o nuovi documenti.";
      existing.resumeCount += 1;
      existing.updatedAt = now.toISOString();
    } else next.items.push({
      event: structuredClone(input.event), displayName: input.displayName.trim(), state: "queued", outcome: null,
      operatorRequest: null, operatorResolution: null, draftId: null, resumeCount: 0,
      reason: "Evento Pronte da fare acquisito e deduplicato.", nextAction: "Eseguire acquisizione e preflight dal dossier originario.",
      startedAt: now.toISOString(), updatedAt: now.toISOString(),
    });
    next.revision += 1;
    next.processedInboundEventIds.push(input.event.eventId);
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: existing ? "practice_requeued" : "inbound_accepted", practiceId: input.event.practiceId, commandId: null, reason: existing ? "Pratica rientrata in Pronte da fare con revisione nuova; nessun job duplicato." : "Evento ENEA accettato dalla pipeline Pronte da fare.", appliedRuleIds: BASE_RULE_IDS });
    return this.write(next);
  }

  stageOutcome(practiceId: string, outcome: AprLocalCaseOutcome, now = new Date()) {
    const current = this.initialize(now);
    const item = current.items.find((candidate) => candidate.event.practiceId === practiceId);
    if (!item) throw new Error("crm_workflow_practice_unknown");
    const command = proposeAprCrmCommands(item.event, outcome, now)[0];
    assertRuleIds(command.appliedRuleIds);
    if (current.commands.some((record) => record.command.idempotencyKey === command.idempotencyKey)) return current;
    const next = structuredClone(current);
    const target = next.items.find((candidate) => candidate.event.practiceId === practiceId)!;
    target.state = "command_pending";
    target.outcome = structuredClone(outcome);
    target.operatorRequest = command.desired.operatorRequest ? structuredClone(command.desired.operatorRequest) : null;
    target.draftId = outcome.status === "draft_saved" ? outcome.draftId : target.draftId;
    target.reason = outcome.reason;
    target.nextAction = "Applicare il comando CRM locale già registrato; nessuna chiamata esterna consentita.";
    target.updatedAt = now.toISOString();
    next.commands.push({ command, state: "pending", stagedAt: now.toISOString(), appliedAt: null, failure: null });
    next.revision += 1;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "command_staged", practiceId, commandId: command.idempotencyKey, reason: `Intento persistente registrato: ${command.reason}`, appliedRuleIds: [...command.appliedRuleIds] });
    return this.write(next);
  }

  applyPending(now = new Date(), maximumCommands = Number.POSITIVE_INFINITY) {
    let state = this.initialize(now);
    let applied = 0;
    for (const pending of state.commands.filter((record) => record.state === "pending")) {
      if (applied >= maximumCommands) break;
      const next = structuredClone(state);
      const record = next.commands.find((candidate) => candidate.command.idempotencyKey === pending.command.idempotencyKey)!;
      const item = next.items.find((candidate) => candidate.event.practiceId === pending.command.practiceId)!;
      try {
        next.simulation = applyAprCommandLocally(next.simulation, pending.command);
        record.state = "applied";
        record.appliedAt = now.toISOString();
        item.state = pending.command.desired.clearOperatorRequest ? "resume_ready"
          : item.outcome?.status === "blocked" ? "operator_required"
            : item.outcome?.status === "draft_saved" ? "draft_saved" : "plan_ready";
        item.reason = pending.command.reason;
        item.nextAction = item.state === "operator_required" ? "Attendere risposta operatore senza fermare le altre pratiche."
          : item.state === "resume_ready" ? "Riprendere la stessa pratica dal checkpoint dopo il ritorno in Pronte da fare."
            : item.state === "draft_saved" ? "Bozza registrata; anteprima, submit e comunicazioni restano vietati."
              : "Piano pronto per la capability bozza separata.";
        item.updatedAt = now.toISOString();
        next.revision += 1;
        next.audit.push({ revision: next.revision, at: now.toISOString(), type: pending.command.desired.clearOperatorRequest ? "practice_requeued" : "command_applied", practiceId: item.event.practiceId, commandId: pending.command.idempotencyKey, reason: pending.command.reason, appliedRuleIds: [...pending.command.appliedRuleIds] });
      } catch (error) {
        record.state = "failed";
        record.failure = error instanceof Error ? error.message : String(error);
        item.state = "technical_block";
        item.reason = record.failure;
        item.nextAction = "Risolvere il conflitto locale; non ripetere o inviare alcuna mutazione CRM.";
        item.updatedAt = now.toISOString();
        next.revision += 1;
        next.audit.push({ revision: next.revision, at: now.toISOString(), type: "command_failed", practiceId: item.event.practiceId, commandId: pending.command.idempotencyKey, reason: record.failure, appliedRuleIds: [...pending.command.appliedRuleIds] });
      }
      state = this.write(next);
      applied += 1;
    }
    return state;
  }

  answerOperator(practiceId: string, resolution: AprCrmOperatorResolution, now = new Date()) {
    const current = this.initialize(now);
    const currentItem = current.items.find((item) => item.event.practiceId === practiceId);
    if (!currentItem) throw new Error("crm_workflow_practice_unknown");
    if (currentItem.operatorResolution?.commandId === resolution.commandId) return current;
    if (currentItem.state !== "operator_required" || !currentItem.operatorRequest || currentItem.operatorRequest.requestId !== resolution.requestId) throw new Error("crm_workflow_operator_answer_state_invalid");
    const customer = current.simulation.customers[currentItem.event.customerId];
    if (!customer?.operatorRequest || customer.pipeline !== APR_OPERATOR_PIPELINE) throw new Error("crm_workflow_operator_pipeline_not_verified");
    const event: AprCrmInboundPracticeEvent = {
      ...currentItem.event,
      eventId: `${currentItem.event.eventId}:answer:${resolution.commandId}`,
      crmRevision: customer.crmRevision ?? currentItem.event.crmRevision + 1,
      currentPipeline: customer.pipeline,
      currentStatus: customer.status,
    };
    const command = proposeAprCrmRequeueCommand(event, resolution);
    assertRuleIds(command.appliedRuleIds);
    const next = structuredClone(current);
    const item = next.items.find((candidate) => candidate.event.practiceId === practiceId)!;
    item.operatorResolution = structuredClone(resolution);
    item.state = "command_pending";
    item.reason = "Risposta operatore persistita prima del comando di riaccodamento.";
    item.nextAction = "Applicare una sola volta il ritorno locale in Pronte da fare.";
    item.updatedAt = now.toISOString();
    next.commands.push({ command, state: "pending", stagedAt: now.toISOString(), appliedAt: null, failure: null });
    next.revision += 1;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "operator_answered", practiceId, commandId: resolution.commandId, reason: `Risposta ${resolution.requestId} acquisita da ${resolution.operatorId}.`, appliedRuleIds: [...command.appliedRuleIds] });
    this.write(next);
    return this.applyPending(now);
  }

  snapshot(now = new Date()) {
    const state = this.initialize(now);
    const summary = summarize(state);
    return {
      ...state,
      ...summary,
      progress: {
        total: state.items.length,
        queued: state.items.filter((item) => item.state === "queued").length,
        pendingCommands: state.commands.filter((command) => command.state === "pending").length,
        planReady: state.items.filter((item) => item.state === "plan_ready").length,
        draftsSaved: state.items.filter((item) => item.state === "draft_saved").length,
        operatorRequired: state.items.filter((item) => item.state === "operator_required").length,
        resumeReady: state.items.filter((item) => item.state === "resume_ready").length,
        technicalBlocks: state.items.filter((item) => item.state === "technical_block").length,
      },
      observedAt: now.toISOString(),
      lastEvent: state.audit.at(-1)!,
    };
  }
}
