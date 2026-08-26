import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APR_OPERATOR_UNLOCK_CONTRACT_VERSION,
  isAprOperatorBlockDescriptor,
  operatorEvidenceAppliesToCase,
  type AprOperatorBlockDescriptor,
  type AprSingleCaseOperatorScope,
} from "../../src/features/enea-shadow-crm/aprOperatorUnlockContract";
import type { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";

export const APR_OPERATOR_UNLOCK_REGISTRY_VERSION = "apr-operator-unlock-registry-v1" as const;
const LOCK_LEASE_MS = 30_000;
const RULE_IDS = ["system-apr-operator-intervention-routing", "user-2026-08-16-operator-structured-question-resume", "system-atomic-checkpoint-resume"] as const;

export interface AprOperatorUnlockSubmission {
  blockId: string;
  commandId: string;
  expectedScope: AprSingleCaseOperatorScope;
  answer: string;
  note: string;
  operatorId: string;
  answeredAt: string;
}

export interface AprOperatorUnlockEvidence {
  evidenceId: string;
  blockId: string;
  sourceKind: "operator_unlock_evidence";
  scope: AprSingleCaseOperatorScope;
  answer: string;
  note: string;
  operatorId: string;
  commandId: string;
  answeredAt: string;
  propagation: "forbidden";
  verificationStatus: "pending" | "verified";
  verification: AprOperatorUnlockVerification | null;
  consumed: boolean;
  consumedAt: string | null;
  activationGenerationId: string | null;
}

export interface AprOperatorUnlockVerification {
  verificationId: string;
  blockId: string;
  scope: AprSingleCaseOperatorScope;
  resumePolicy: AprOperatorBlockDescriptor["resumePolicy"];
  outcome: "verified";
  verifiedAt: string;
  sourceEvidenceIds: string[];
  draftId: string | null;
  recomputedItemFingerprint: string | null;
}

export interface AprOperatorUnlockRecord {
  descriptor: AprOperatorBlockDescriptor;
  evidence: AprOperatorUnlockEvidence | null;
  crmSimulation: {
    pipeline: "Richiesto intervento operatore";
    status: "waiting_operator" | "answer_persisted_pending_verification" | "verified_pending_activation" | "activation_consumed";
    nextAction: string;
    externalActionAllowed: false;
  };
}

export interface AprOperatorUnlockRegistryState {
  version: typeof APR_OPERATOR_UNLOCK_REGISTRY_VERSION;
  contractVersion: typeof APR_OPERATOR_UNLOCK_CONTRACT_VERSION;
  revision: number;
  records: AprOperatorUnlockRecord[];
  processedCommandIds: string[];
  externalActionAllowed: false;
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "block_registered" | "answer_persisted" | "answer_verified" | "activation_consumed" | "duplicate_command_ignored";
    blockId: string | null;
    commandId: string | null;
    reason: string;
    appliedRuleIds: string[];
  }>;
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

function initialState(now: Date): AprOperatorUnlockRegistryState {
  return {
    version: APR_OPERATOR_UNLOCK_REGISTRY_VERSION,
    contractVersion: APR_OPERATOR_UNLOCK_CONTRACT_VERSION,
    revision: 0,
    records: [],
    processedCommandIds: [],
    externalActionAllowed: false,
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", blockId: null, commandId: null, reason: "Registro durevole sblocchi operatore inizializzato; nessuna azione CRM o ENEA consentita.", appliedRuleIds: [...RULE_IDS] }],
  };
}

function normalizeState(state: AprOperatorUnlockRegistryState) {
  for (const record of state.records ?? []) {
    if (!record.evidence) continue;
    record.evidence.verificationStatus ??= "pending";
    record.evidence.verification ??= null;
    record.evidence.consumed ??= false;
    record.evidence.consumedAt ??= null;
    record.evidence.activationGenerationId ??= null;
  }
  return state;
}

function validState(value: unknown): value is AprOperatorUnlockRegistryState {
  if (!value || typeof value !== "object") return false;
  const state = value as AprOperatorUnlockRegistryState;
  return state.version === APR_OPERATOR_UNLOCK_REGISTRY_VERSION
    && state.contractVersion === APR_OPERATOR_UNLOCK_CONTRACT_VERSION
    && state.externalActionAllowed === false
    && Number.isInteger(state.revision)
    && Array.isArray(state.records)
    && state.records.every((record) => isAprOperatorBlockDescriptor(record.descriptor)
      && (!record.evidence || (record.evidence.blockId === record.descriptor.blockId
        && record.evidence.scope.practiceId === record.descriptor.scope.practiceId
        && record.evidence.scope.customerKey === record.descriptor.scope.customerKey
        && record.evidence.scope.generationId === record.descriptor.scope.generationId
        && record.evidence.propagation === "forbidden"
        && ["pending", "verified"].includes(record.evidence.verificationStatus)
        && typeof record.evidence.consumed === "boolean"
        && (record.evidence.verificationStatus === "pending" ? record.evidence.verification === null : Boolean(record.evidence.verification))
        && (!record.evidence.verification || (record.evidence.verification.blockId === record.descriptor.blockId
          && sameScope(record.evidence.verification.scope, record.descriptor.scope)
          && record.evidence.verification.resumePolicy === record.descriptor.resumePolicy
          && record.evidence.verification.outcome === "verified"
          && record.evidence.verification.sourceEvidenceIds.length > 0))
        && (record.evidence.consumed
          ? Boolean(record.evidence.consumedAt && record.evidence.activationGenerationId && record.descriptor.status === "consumed")
          : record.evidence.consumedAt === null && record.evidence.activationGenerationId === null))))
    && new Set(state.records.map((record) => record.descriptor.blockId)).size === state.records.length
    && Array.isArray(state.processedCommandIds)
    && new Set(state.processedCommandIds).size === state.processedCommandIds.length
    && Array.isArray(state.audit);
}

function sameScope(left: AprSingleCaseOperatorScope, right: AprSingleCaseOperatorScope) {
  return left.kind === "single_practice_generation" && right.kind === "single_practice_generation"
    && left.practiceId === right.practiceId
    && left.customerKey === right.customerKey
    && left.generationId === right.generationId
    && left.propagation === "forbidden" && right.propagation === "forbidden";
}

function descriptorDefinitionFingerprint(descriptor: AprOperatorBlockDescriptor) {
  return createHash("sha256").update(JSON.stringify({
    blockId: descriptor.blockId,
    idempotencyKey: descriptor.idempotencyKey,
    scope: descriptor.scope,
    category: descriptor.category,
    code: descriptor.code,
    stage: descriptor.stage,
    fieldPath: descriptor.fieldPath,
    draftId: descriptor.draftId,
    pageId: descriptor.pageId,
    portalFieldId: descriptor.portalFieldId,
    reason: descriptor.reason,
    question: descriptor.question,
    evidenceText: descriptor.evidenceText,
    sourceIds: descriptor.sourceIds,
    ruleIds: descriptor.ruleIds,
    resumePolicy: descriptor.resumePolicy,
    answerSchema: descriptor.answerSchema,
    createdAt: descriptor.createdAt,
  })).digest("hex");
}

export class PersistentAprOperatorUnlockRegistry {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly lockDirectory: string;

  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "operator-unlocks");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.lockDirectory = path.join(this.directory, ".lock");
  }

  load(now = new Date()): AprOperatorUnlockRegistryState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = normalizeState(JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprOperatorUnlockRegistryState) as unknown;
      if (!validState(value)) throw new Error("operator_unlock_registry_state_invalid");
      return value;
    } catch (error) {
      if (error instanceof Error && error.message === "operator_unlock_registry_state_invalid") throw error;
      throw new Error("operator_unlock_registry_checkpoint_corrupt");
    }
  }

  private write(state: AprOperatorUnlockRegistryState) {
    if (!validState(state)) throw new Error("operator_unlock_registry_state_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  private withLock<T>(ownerId: string, now: Date, action: () => T): T {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try { mkdirSync(this.lockDirectory, { mode: 0o700 }); }
    catch {
      let lease: { expiresAt?: string } = {};
      try { lease = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* lock non leggibile: recupero fail-closed sotto */ }
      if (!lease.expiresAt || Date.parse(lease.expiresAt) > now.getTime()) throw new Error("operator_unlock_registry_locked");
      try { unlinkSync(path.join(this.lockDirectory, "owner.json")); } catch { /* assente */ }
      try { rmdirSync(this.lockDirectory); } catch { throw new Error("operator_unlock_registry_locked"); }
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    atomicWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ ownerId, expiresAt: new Date(now.getTime() + LOCK_LEASE_MS).toISOString() })}\n`);
    try { return action(); }
    finally {
      try {
        const lease = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (lease.ownerId === ownerId) { unlinkSync(path.join(this.lockDirectory, "owner.json")); rmdirSync(this.lockDirectory); }
      } catch { /* un altro processo ha gia recuperato il lease */ }
    }
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  register(descriptor: AprOperatorBlockDescriptor, now = new Date()) {
    if (!isAprOperatorBlockDescriptor(descriptor)) throw new Error("operator_unlock_descriptor_invalid");
    return this.withLock(`register:${process.pid}:${crypto.randomUUID()}`, now, () => {
      const current = this.initialize(now);
      const existing = current.records.find((record) => record.descriptor.blockId === descriptor.blockId);
      if (existing) {
        if (existing.descriptor.idempotencyKey !== descriptor.idempotencyKey
          || !sameScope(existing.descriptor.scope, descriptor.scope)
          || descriptorDefinitionFingerprint(existing.descriptor) !== descriptorDefinitionFingerprint(descriptor)) throw new Error("operator_unlock_block_identity_collision");
        return current;
      }
      const next = structuredClone(current);
      next.revision += 1;
      next.records.push({
        descriptor: structuredClone(descriptor),
        evidence: null,
        crmSimulation: { pipeline: "Richiesto intervento operatore", status: "waiting_operator", nextAction: descriptor.question, externalActionAllowed: false },
      });
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "block_registered", blockId: descriptor.blockId, commandId: null, reason: `${descriptor.scope.customerKey}: blocco canonico registrato; attesa risposta operatore senza riaccodamento automatico.`, appliedRuleIds: [...RULE_IDS, ...descriptor.ruleIds] });
      return this.write(next);
    });
  }

  syncFromCrmWorkflow(workflow: ReturnType<PersistentAprCrmIntegrationWorkflow["snapshot"]>, now = new Date()) {
    let state = this.initialize(now);
    for (const item of workflow.items) if (["operator_required", "technical_block"].includes(item.state) && item.operatorRequest?.block) state = this.register(item.operatorRequest.block, now);
    return state;
  }

  submit(submission: AprOperatorUnlockSubmission, now = new Date()) {
    if (!submission.blockId.trim() || !submission.commandId.trim() || !submission.answer.trim() || !submission.operatorId.trim() || !Number.isFinite(Date.parse(submission.answeredAt))) throw new Error("operator_unlock_submission_invalid");
    return this.withLock(`submit:${process.pid}:${crypto.randomUUID()}`, now, () => {
      const current = this.initialize(now);
      if (current.processedCommandIds.includes(submission.commandId)) return current;
      const currentRecord = current.records.find((record) => record.descriptor.blockId === submission.blockId);
      if (!currentRecord) throw new Error("operator_unlock_block_not_found");
      if (!sameScope(currentRecord.descriptor.scope, submission.expectedScope)
        || !operatorEvidenceAppliesToCase(currentRecord.descriptor, submission.expectedScope)) throw new Error("operator_unlock_scope_mismatch");
      if (currentRecord.descriptor.status !== "open" || currentRecord.evidence) throw new Error("operator_unlock_already_answered");
      const choices = currentRecord.descriptor.answerSchema.choices;
      if (currentRecord.descriptor.answerSchema.kind === "controlled_choice" && !choices.some((choice) => choice.value === submission.answer)) throw new Error("operator_unlock_answer_not_allowed");
      if (currentRecord.descriptor.answerSchema.noteRequired && !submission.note.trim()) throw new Error("operator_unlock_note_required");
      const evidenceId = `operator-unlock-evidence:${createHash("sha256").update(JSON.stringify({ blockId: submission.blockId, scope: submission.expectedScope, answer: submission.answer.trim(), note: submission.note.trim(), operatorId: submission.operatorId.trim(), commandId: submission.commandId, answeredAt: submission.answeredAt })).digest("hex")}`;
      const next = structuredClone(current);
      const record = next.records.find((candidate) => candidate.descriptor.blockId === submission.blockId)!;
      record.descriptor.status = "answered";
      record.descriptor.answeredAt = submission.answeredAt;
      record.evidence = {
        evidenceId,
        blockId: submission.blockId,
        sourceKind: "operator_unlock_evidence",
        scope: structuredClone(submission.expectedScope),
        answer: submission.answer.trim(),
        note: submission.note.trim().replace(/\s+/g, " ").slice(0, 1_000),
        operatorId: submission.operatorId.trim().slice(0, 120),
        commandId: submission.commandId,
        answeredAt: submission.answeredAt,
        propagation: "forbidden",
        verificationStatus: "pending",
        verification: null,
        consumed: false,
        consumedAt: null,
        activationGenerationId: null,
      };
      record.crmSimulation.status = "answer_persisted_pending_verification";
      record.crmSimulation.nextAction = record.descriptor.resumePolicy === "resume_existing_draft"
        ? "Verificare la correzione sulla stessa bozza; nessuna nuova bozza o riaccodamento ancora autorizzati."
        : "Rieseguire il preflight nel Commit 3; nessuna bozza o riaccodamento ancora autorizzati.";
      next.processedCommandIds.push(submission.commandId);
      next.revision += 1;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "answer_persisted", blockId: submission.blockId, commandId: submission.commandId, reason: "Risposta operatore persistita come evidenza caso-specifica in attesa di verifica; nessuna pratica riaccodata.", appliedRuleIds: [...RULE_IDS, ...record.descriptor.ruleIds] });
      return this.write(next);
    });
  }

  verify(blockId: string, verification: AprOperatorUnlockVerification, commandId: string, now = new Date()) {
    if (!blockId.trim() || !commandId.trim() || verification.blockId !== blockId || verification.outcome !== "verified"
      || !verification.verificationId.trim() || !Number.isFinite(Date.parse(verification.verifiedAt))
      || verification.sourceEvidenceIds.length < 1) throw new Error("operator_unlock_verification_invalid");
    return this.withLock(`verify:${process.pid}:${crypto.randomUUID()}`, now, () => {
      const current = this.initialize(now);
      if (current.processedCommandIds.includes(commandId)) return current;
      const currentRecord = current.records.find((record) => record.descriptor.blockId === blockId);
      if (!currentRecord?.evidence || currentRecord.descriptor.status !== "answered" || currentRecord.evidence.consumed) throw new Error("operator_unlock_verification_state_invalid");
      if (!sameScope(currentRecord.descriptor.scope, verification.scope)
        || verification.resumePolicy !== currentRecord.descriptor.resumePolicy) throw new Error("operator_unlock_verification_scope_mismatch");
      if ((verification.resumePolicy === "resume_existing_draft" && (!verification.draftId || verification.draftId !== currentRecord.descriptor.draftId || verification.recomputedItemFingerprint !== null))
        || (verification.resumePolicy === "recompute_before_draft" && (verification.draftId !== null || !verification.recomputedItemFingerprint))) throw new Error("operator_unlock_verification_proof_invalid");
      const next = structuredClone(current);
      const record = next.records.find((candidate) => candidate.descriptor.blockId === blockId)!;
      record.descriptor.status = "verified";
      record.descriptor.verifiedAt = verification.verifiedAt;
      record.evidence!.verificationStatus = "verified";
      record.evidence!.verification = structuredClone(verification);
      record.crmSimulation.status = "verified_pending_activation";
      record.crmSimulation.nextAction = "Attivare atomicamente la nuova generazione APR e consumare questa evidenza una sola volta.";
      next.processedCommandIds.push(commandId);
      next.revision += 1;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "answer_verified", blockId, commandId, reason: "Risposta e prova verificate per la sola pratica/generazione; attivazione non ancora consumata.", appliedRuleIds: [...RULE_IDS, ...record.descriptor.ruleIds] });
      return this.write(next);
    });
  }

  consume(blockId: string, evidenceId: string, activationGenerationId: string, commandId: string, now = new Date()) {
    if (!blockId.trim() || !evidenceId.trim() || !activationGenerationId.trim() || !commandId.trim()) throw new Error("operator_unlock_consume_invalid");
    return this.withLock(`consume:${process.pid}:${crypto.randomUUID()}`, now, () => {
      const current = this.initialize(now);
      if (current.processedCommandIds.includes(commandId)) return current;
      const currentRecord = current.records.find((record) => record.descriptor.blockId === blockId);
      if (!currentRecord?.evidence || currentRecord.evidence.evidenceId !== evidenceId
        || currentRecord.evidence.verificationStatus !== "verified" || !currentRecord.evidence.verification
        || currentRecord.descriptor.status !== "verified" || currentRecord.evidence.consumed) throw new Error("operator_unlock_consume_state_invalid");
      const next = structuredClone(current);
      const record = next.records.find((candidate) => candidate.descriptor.blockId === blockId)!;
      record.descriptor.status = "consumed";
      record.descriptor.consumedAt = now.toISOString();
      record.evidence!.consumed = true;
      record.evidence!.consumedAt = now.toISOString();
      record.evidence!.activationGenerationId = activationGenerationId;
      record.crmSimulation.status = "activation_consumed";
      record.crmSimulation.nextAction = "Evidenza consumata; APR prosegue esclusivamente dalla generazione attivata.";
      next.processedCommandIds.push(commandId);
      next.revision += 1;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "activation_consumed", blockId, commandId, reason: `Evidenza consumata una sola volta dalla generazione ${activationGenerationId}.`, appliedRuleIds: [...RULE_IDS, ...record.descriptor.ruleIds] });
      return this.write(next);
    });
  }

  snapshot(now = new Date(), customerKey?: string) {
    const state = this.initialize(now);
    const records = customerKey ? state.records.filter((record) => record.descriptor.scope.customerKey === customerKey) : state.records;
    return {
      ...state,
      records,
      progress: {
        total: records.length,
        open: records.filter((record) => record.descriptor.status === "open").length,
        answeredPendingVerification: records.filter((record) => record.descriptor.status === "answered" && record.evidence?.verificationStatus === "pending").length,
        consumed: records.filter((record) => record.descriptor.status === "consumed").length,
      },
      observedAt: now.toISOString(),
      lastEvent: state.audit.at(-1)!,
    };
  }
}
