import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmLocalExecutorIntake } from "./crmLocalExecutorIntake";

export const APR_CRM_LOCAL_COHORT_EXECUTION_PLAN_VERSION = "apr-crm-local-cohort-execution-plan-v1" as const;

const RULE_IDS = [
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
  "system-operator-block-fail-closed",
  "system-apr-crm-integration-boundary",
] as const;
const DEFAULT_LEASE_MS = 10_000;

type IntakeContract = Pick<PersistentAprCrmLocalExecutorIntake, "snapshot">;
type PageState = "pending" | "fill_checkpointed" | "save_checkpointed";

interface PackageWorkflowField {
  portalId: string;
  control: string;
  value: unknown;
}

interface PackageWorkflowStep {
  id: string;
  pageName: string;
  fields: PackageWorkflowField[];
  markerIds: string[];
}

interface LocalDraftPackageArtifact {
  customerKey: string;
  displayName: string;
  practiceId: string;
  mappingFingerprint: string;
  workflowFingerprint: string;
  packageFingerprint: string;
  payload: { mode: string; portalFields: Array<{ id: string }> };
  workflow: {
    preparedFieldIds: string[];
    screeningItemCount: number;
    steps: PackageWorkflowStep[];
    screeningSteps: PackageWorkflowStep[];
  };
  safety: {
    createAllowedAfterPersistentIntent: boolean;
    saveAllowedAfterAllPageCheckpoints: boolean;
    previewAllowed: boolean;
    submitAllowed: boolean;
    communicationsAllowed: boolean;
  };
}

export interface AprCrmLocalCohortPageCheckpoint {
  order: number;
  pageId: string;
  stepId: string;
  pageName: string;
  kind: "base_page" | "screening_item";
  fieldCount: number;
  markerIds: string[];
  state: PageState;
  fillCheckpointCount: number;
  saveAttemptCount: number;
  filledAt: string | null;
  savedAt: string | null;
}

export interface AprCrmLocalCohortExecutionItem {
  planItemId: string;
  handoffId: string;
  customerKey: string;
  displayName: string;
  practiceId: string;
  packageArtifactPath: string;
  packageArtifactSha256: string;
  packageFingerprint: string;
  mappingFingerprint: string;
  workflowFingerprint: string;
  executionFingerprint: string;
  state: "queued_local" | "active_local" | "simulated_saved_local";
  checkpointPhase: "awaiting_claim" | "create_intent_checkpointed" | "create_simulated" | "pages_in_progress" | "draft_save_intent_checkpointed" | "simulated_saved_local";
  currentPageId: string | null;
  pages: AprCrmLocalCohortPageCheckpoint[];
  lockOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  claimAttemptCount: number;
  recoveryCount: number;
  createIntentCount: number;
  simulatedCreateCount: number;
  draftSaveIntentCount: number;
  simulatedDraftSaveCount: number;
  startedAt: string | null;
  lastProgressAt: string | null;
  completedAt: string | null;
  reason: string;
  nextAction: string;
}

export interface AprCrmLocalCohortExecutionPlanState {
  version: typeof APR_CRM_LOCAL_COHORT_EXECUTION_PLAN_VERSION;
  revision: number;
  status: "unprepared" | "queued_local" | "working_local" | "completed_local_simulation" | "technical_block";
  cohortKey: string;
  queueScope: "cohort_specific_local_create_fill_save_simulation";
  executorIdentity: "apr_persistent_runtime";
  sourceSignature: string | null;
  currentPlanItemId: string | null;
  items: AprCrmLocalCohortExecutionItem[];
  historicalExecutionCheckpointImported: false;
  historicalExecutionPathRead: false;
  simulatorOnly: true;
  externalActionAllowed: false;
  browserAllowed: false;
  crmMutationAllowed: false;
  eneaActionAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  receiptAllowed: false;
  communicationsAllowed: false;
  reason: string;
  nextAction: string;
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "plan_synchronized" | "item_claimed" | "create_intent_checkpointed" | "create_simulated" | "page_fill_checkpointed" | "page_save_checkpointed" | "draft_save_intent_checkpointed" | "draft_saved_simulated" | "lease_recovered" | "completed_local_simulation" | "technical_block";
    planItemId: string | null;
    pageId: string | null;
    reason: string;
    appliedRuleIds: string[];
  }>;
}

const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (filePath: string) => sha256(readFileSync(filePath));

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function inferredCohortKey(rootDirectory: string) {
  const root = path.resolve(rootDirectory);
  return path.basename(root) === "runtime" && path.basename(path.dirname(root)) === "crm-live-processing"
    ? path.basename(path.dirname(path.dirname(root)))
    : path.basename(root);
}

function initialState(cohortKey: string, now: Date): AprCrmLocalCohortExecutionPlanState {
  const reason = "Piano esecutivo locale della coorte non ancora sincronizzato.";
  return {
    version: APR_CRM_LOCAL_COHORT_EXECUTION_PLAN_VERSION, revision: 0, status: "unprepared", cohortKey,
    queueScope: "cohort_specific_local_create_fill_save_simulation", executorIdentity: "apr_persistent_runtime", sourceSignature: null,
    currentPlanItemId: null, items: [], historicalExecutionCheckpointImported: false, historicalExecutionPathRead: false, simulatorOnly: true,
    externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false,
    previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false,
    reason, nextAction: "Attendere che tutti gli intake locali siano verificati e rilasciati.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", planItemId: null, pageId: null, reason, appliedRuleIds: [...RULE_IDS] }],
  };
}

function activeItems(state: AprCrmLocalCohortExecutionPlanState) {
  return state.items.filter((item) => item.state === "active_local");
}

function validState(value: AprCrmLocalCohortExecutionPlanState) {
  const active = activeItems(value);
  return value.version === APR_CRM_LOCAL_COHORT_EXECUTION_PLAN_VERSION
    && value.queueScope === "cohort_specific_local_create_fill_save_simulation"
    && value.executorIdentity === "apr_persistent_runtime"
    && value.historicalExecutionCheckpointImported === false && value.historicalExecutionPathRead === false && value.simulatorOnly === true
    && value.externalActionAllowed === false && value.browserAllowed === false && value.crmMutationAllowed === false && value.eneaActionAllowed === false
    && value.previewAllowed === false && value.submitAllowed === false && value.receiptAllowed === false && value.communicationsAllowed === false
    && active.length <= 1 && (active[0]?.planItemId ?? null) === value.currentPlanItemId
    && new Set(value.items.map((item) => item.planItemId)).size === value.items.length
    && value.items.every((item) => new Set(item.pages.map((page) => page.pageId)).size === item.pages.length
      && item.pages.every((page, index) => page.order === index + 1 && page.fillCheckpointCount <= 1 && page.saveAttemptCount <= 1)
      && item.createIntentCount <= 1 && item.simulatedCreateCount <= 1 && item.draftSaveIntentCount <= 1 && item.simulatedDraftSaveCount <= 1)
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function parseArtifact(filePath: string): LocalDraftPackageArtifact {
  const artifact = JSON.parse(readFileSync(filePath, "utf8")) as LocalDraftPackageArtifact;
  if (!artifact || typeof artifact !== "object") throw new Error("package_not_object");
  return artifact;
}

function isWorkflowField(field: PackageWorkflowField) {
  return field && typeof field.portalId === "string" && field.portalId.length > 0 && typeof field.control === "string" && "value" in field;
}

function validateAndMapPages(artifact: LocalDraftPackageArtifact) {
  if (artifact.payload?.mode !== "draft_test") throw new Error("package_mode_not_draft_test");
  if (!artifact.safety?.createAllowedAfterPersistentIntent || !artifact.safety.saveAllowedAfterAllPageCheckpoints
    || artifact.safety.previewAllowed || artifact.safety.submitAllowed || artifact.safety.communicationsAllowed) throw new Error("package_safety_contract_invalid");
  if (!Array.isArray(artifact.workflow?.steps) || !Array.isArray(artifact.workflow.screeningSteps) || !Array.isArray(artifact.workflow.preparedFieldIds)) throw new Error("package_workflow_invalid");
  if (artifact.workflow.screeningSteps.length !== artifact.workflow.screeningItemCount) throw new Error("package_screening_cardinality_invalid");
  const requiredStepIds = ["generator", "beneficiary", "building", "intervention", "plant", "screening-summary", "calculation"];
  if (requiredStepIds.some((id) => artifact.workflow.steps.filter((step) => step.id === id).length !== 1)) throw new Error("package_required_page_invalid");
  const allSteps = [...artifact.workflow.steps, ...artifact.workflow.screeningSteps];
  if (allSteps.some((step) => !step.pageName || !Array.isArray(step.fields) || !step.fields.length || !step.fields.every(isWorkflowField) || !Array.isArray(step.markerIds))) throw new Error("package_page_mapping_invalid");
  const mappedFieldCount = allSteps.reduce((total, step) => total + step.fields.length, 0);
  if (mappedFieldCount !== artifact.workflow.preparedFieldIds.length) throw new Error("package_prepared_field_count_mismatch");
  const payloadIds = artifact.payload.portalFields.map((field) => field.id);
  if (payloadIds.some((fieldId) => !artifact.workflow.preparedFieldIds.includes(fieldId))) throw new Error("package_payload_field_unmapped");

  const byId = new Map(artifact.workflow.steps.map((step) => [step.id, step]));
  const orderedSteps: Array<{ step: PackageWorkflowStep; kind: "base_page" | "screening_item"; pageId: string }> = [];
  for (const id of ["beneficiary", "building", "intervention", "generator", "plant"]) {
    const step = byId.get(id)!;
    orderedSteps.push({ step, kind: "base_page", pageId: `page:${step.pageName}` });
  }
  artifact.workflow.screeningSteps.forEach((step, index) => orderedSteps.push({ step, kind: "screening_item", pageId: `screening:${index + 1}` }));
  for (const id of ["screening-summary", "calculation"]) {
    const step = byId.get(id)!;
    orderedSteps.push({ step, kind: "base_page", pageId: `page:${step.pageName}` });
  }
  return orderedSteps.map(({ step, kind, pageId }, index): AprCrmLocalCohortPageCheckpoint => ({
    order: index + 1, pageId, stepId: step.id, pageName: step.pageName, kind, fieldCount: step.fields.length, markerIds: [...step.markerIds],
    state: "pending", fillCheckpointCount: 0, saveAttemptCount: 0, filledAt: null, savedAt: null,
  }));
}

export class PersistentAprCrmLocalCohortExecutionPlan {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly cohortKey: string;

  constructor(readonly rootDirectory: string, readonly intake: IntakeContract, readonly leaseMs = DEFAULT_LEASE_MS, cohortKey?: string) {
    if (!Number.isFinite(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) throw new Error("crm_local_cohort_execution_lease_invalid");
    this.directory = path.join(path.resolve(rootDirectory), "crm-local-cohort-execution-plan");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.cohortKey = cohortKey ?? inferredCohortKey(rootDirectory);
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(this.cohortKey, now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmLocalCohortExecutionPlanState;
      return validState(value) ? value : initialState(this.cohortKey, now);
    } catch { return initialState(this.cohortKey, now); }
  }

  private write(state: AprCrmLocalCohortExecutionPlanState) {
    if (!validState(state)) throw new Error("crm_local_cohort_execution_checkpoint_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  synchronize(now = new Date()) {
    const intake = this.intake.snapshot(now);
    if (intake.status !== "completed_local" || intake.items.some((item) => item.state !== "released_local" || itemHasExternalCapability(intake))) return this.initialize(now);
    const sourceSignature = sha256(intake.items.map((item) => ({ handoffId: item.handoffId, packageArtifactSha256: item.packageArtifactSha256, packageFingerprint: item.packageFingerprint, checkpointPhase: item.checkpointPhase })));
    const current = this.initialize(now);
    if (current.sourceSignature === sourceSignature) return current;
    if (current.sourceSignature && current.items.some((item) => item.state !== "simulated_saved_local")) return this.technicalBlock("intake_changed_while_plan_active", now);
    try {
      const items = intake.items.map((item): AprCrmLocalCohortExecutionItem => {
        if (!existsSync(item.packageArtifactPath) || fileSha256(item.packageArtifactPath) !== item.packageArtifactSha256) throw new Error(`artifact_integrity_failed:${item.handoffId}`);
        const artifact = parseArtifact(item.packageArtifactPath);
        if (artifact.customerKey !== item.customerKey || artifact.practiceId !== item.practiceId || artifact.packageFingerprint !== item.packageFingerprint) throw new Error(`artifact_identity_failed:${item.handoffId}`);
        const pages = validateAndMapPages(artifact);
        const executionFingerprint = sha256({ cohortKey: this.cohortKey, packageFingerprint: artifact.packageFingerprint, mappingFingerprint: artifact.mappingFingerprint, workflowFingerprint: artifact.workflowFingerprint,
          pages: pages.map(({ pageId, stepId, fieldCount, markerIds }) => ({ pageId, stepId, fieldCount, markerIds })) });
        return {
          planItemId: `apr-local-plan:${this.cohortKey}:${item.practiceId}:${executionFingerprint}`,
          handoffId: item.handoffId, customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId,
          packageArtifactPath: item.packageArtifactPath, packageArtifactSha256: item.packageArtifactSha256, packageFingerprint: item.packageFingerprint,
          mappingFingerprint: artifact.mappingFingerprint, workflowFingerprint: artifact.workflowFingerprint, executionFingerprint,
          state: "queued_local", checkpointPhase: "awaiting_claim", currentPageId: null, pages,
          lockOwner: null, leaseToken: null, leaseExpiresAt: null, claimAttemptCount: 0, recoveryCount: 0,
          createIntentCount: 0, simulatedCreateCount: 0, draftSaveIntentCount: 0, simulatedDraftSaveCount: 0,
          startedAt: null, lastProgressAt: null, completedAt: null,
          reason: `${pages.length} checkpoint pagina validati dal pacchetto; simulatore locale non ancora avviato.`,
          nextAction: "Acquisire il lock persistente per una sola pratica.",
        };
      });
      const next = structuredClone(current);
      next.revision += 1; next.sourceSignature = sourceSignature; next.items = items; next.currentPlanItemId = null;
      next.status = items.length ? "queued_local" : "completed_local_simulation";
      next.reason = `${items.length} piani cohort-specific validati; ordine pagine e checkpoint persistiti, esecutore storico escluso.`;
      next.nextAction = items.length ? "Eseguire il simulatore locale una pratica alla volta." : "Nessun piano locale da simulare.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "plan_synchronized", planItemId: null, pageId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    } catch (error) { return this.technicalBlock(error instanceof Error ? error.message : String(error), now); }
  }

  tick(now = new Date()) {
    const current = this.synchronize(now);
    if (["unprepared", "technical_block", "completed_local_simulation"].includes(current.status)) return current;
    const active = activeItems(current)[0];
    if (active?.leaseExpiresAt && new Date(active.leaseExpiresAt).getTime() <= now.getTime()) return this.recoverLease(active.planItemId, now);
    if (!active) return this.claimNext(now);
    if (active.checkpointPhase === "awaiting_claim") return this.checkpointCreateIntent(active.planItemId, now);
    if (active.checkpointPhase === "create_intent_checkpointed") return this.simulateCreate(active.planItemId, now);
    if (active.checkpointPhase === "create_simulated" || active.checkpointPhase === "pages_in_progress") {
      const page = active.pages.find((candidate) => candidate.state !== "save_checkpointed");
      if (!page) return this.checkpointDraftSaveIntent(active.planItemId, now);
      return page.state === "pending" ? this.checkpointPageFill(active.planItemId, page.pageId, now) : this.checkpointPageSave(active.planItemId, page.pageId, now);
    }
    if (active.checkpointPhase === "draft_save_intent_checkpointed") return this.simulateDraftSaved(active.planItemId, now);
    return this.technicalBlock(`unsupported_checkpoint_phase:${active.checkpointPhase}`, now);
  }

  private claimNext(now: Date) {
    const current = this.load(now); const queued = current.items.find((item) => item.state === "queued_local");
    if (!queued) return this.complete(now);
    const next = structuredClone(current); const target = next.items.find((item) => item.planItemId === queued.planItemId)!;
    next.revision += 1; next.status = "working_local"; next.currentPlanItemId = target.planItemId;
    target.state = "active_local"; target.lockOwner = next.executorIdentity; target.leaseToken = randomUUID(); target.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString();
    target.claimAttemptCount += 1; target.startedAt ??= now.toISOString(); target.lastProgressAt = now.toISOString();
    target.reason = `Lock cohort ${next.cohortKey} acquisito dal simulatore APR; nessun browser o endpoint esterno.`;
    target.nextAction = target.checkpointPhase === "awaiting_claim" ? "Persistire l'intento locale di creazione." : "Riprendere dal checkpoint gia persistito.";
    next.reason = `${target.displayName}: unica pratica attiva, lock e lease persistiti.`; next.nextAction = target.nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "item_claimed", planItemId: target.planItemId, pageId: target.currentPageId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  private mutateActive(planItemId: string, now: Date, mutation: (next: AprCrmLocalCohortExecutionPlanState, target: AprCrmLocalCohortExecutionItem) => void) {
    const current = this.load(now); const active = activeItems(current)[0];
    if (!active || active.planItemId !== planItemId) return this.technicalBlock(`active_plan_item_mismatch:${planItemId}`, now);
    const next = structuredClone(current); const target = next.items.find((item) => item.planItemId === planItemId)!;
    next.revision += 1; target.lastProgressAt = now.toISOString(); target.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString(); mutation(next, target);
    return this.write(next);
  }

  private checkpointCreateIntent(planItemId: string, now: Date) {
    return this.mutateActive(planItemId, now, (next, target) => {
      if (target.createIntentCount !== 0) throw new Error("duplicate_create_intent");
      target.createIntentCount = 1; target.checkpointPhase = "create_intent_checkpointed";
      target.reason = "Intento create persistito prima di qualunque operazione; esecuzione soltanto simulata."; target.nextAction = "Simulare localmente la creazione senza browser.";
      next.reason = `${target.displayName}: checkpoint create registrato.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "create_intent_checkpointed", planItemId, pageId: null, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    });
  }

  private simulateCreate(planItemId: string, now: Date) {
    return this.mutateActive(planItemId, now, (next, target) => {
      if (target.createIntentCount !== 1 || target.simulatedCreateCount !== 0) throw new Error("simulated_create_not_idempotent");
      target.simulatedCreateCount = 1; target.checkpointPhase = "create_simulated";
      target.reason = "Creazione bozza simulata localmente; nessuna bozza ENEA reale esiste."; target.nextAction = `Checkpoint fill della prima pagina: ${target.pages[0]?.pageName ?? "nessuna"}.`;
      next.reason = `${target.displayName}: create simulato e checkpointato.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "create_simulated", planItemId, pageId: null, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    });
  }

  private checkpointPageFill(planItemId: string, pageId: string, now: Date) {
    return this.mutateActive(planItemId, now, (next, target) => {
      const page = target.pages.find((candidate) => candidate.pageId === pageId);
      if (!page || page.state !== "pending" || page.fillCheckpointCount !== 0 || target.pages.slice(0, page.order - 1).some((candidate) => candidate.state !== "save_checkpointed")) throw new Error(`page_fill_order_invalid:${pageId}`);
      page.state = "fill_checkpointed"; page.fillCheckpointCount = 1; page.filledAt = now.toISOString(); target.checkpointPhase = "pages_in_progress"; target.currentPageId = pageId;
      target.reason = `${page.pageName}: mapping di ${page.fieldCount} campi validato e fill simulato checkpointato.`; target.nextAction = `Persistire il checkpoint save simulato di ${page.pageName}.`;
      next.reason = `${target.displayName}: fill ${page.order}/${target.pages.length} checkpointato.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "page_fill_checkpointed", planItemId, pageId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    });
  }

  private checkpointPageSave(planItemId: string, pageId: string, now: Date) {
    return this.mutateActive(planItemId, now, (next, target) => {
      const page = target.pages.find((candidate) => candidate.pageId === pageId);
      if (!page || page.state !== "fill_checkpointed" || page.fillCheckpointCount !== 1 || page.saveAttemptCount !== 0) throw new Error(`page_save_checkpoint_invalid:${pageId}`);
      page.state = "save_checkpointed"; page.saveAttemptCount = 1; page.savedAt = now.toISOString(); target.currentPageId = null;
      const remaining = target.pages.find((candidate) => candidate.state !== "save_checkpointed");
      target.reason = `${page.pageName}: save simulato checkpointato una sola volta.`; target.nextAction = remaining ? `Passare alla pagina ${remaining.pageName}.` : "Persistire l'intento di salvataggio finale della bozza simulata.";
      next.reason = `${target.displayName}: save ${page.order}/${target.pages.length} checkpointato.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "page_save_checkpointed", planItemId, pageId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    });
  }

  private checkpointDraftSaveIntent(planItemId: string, now: Date) {
    return this.mutateActive(planItemId, now, (next, target) => {
      if (target.pages.some((page) => page.state !== "save_checkpointed" || page.saveAttemptCount !== 1) || target.draftSaveIntentCount !== 0) throw new Error("draft_save_intent_pages_incomplete");
      target.draftSaveIntentCount = 1; target.checkpointPhase = "draft_save_intent_checkpointed";
      target.reason = "Tutti i checkpoint pagina sono completi; intento di salvataggio finale simulato persistito."; target.nextAction = "Concludere il salvataggio esclusivamente nel simulatore locale.";
      next.reason = `${target.displayName}: intento save finale checkpointato.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "draft_save_intent_checkpointed", planItemId, pageId: null, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    });
  }

  private simulateDraftSaved(planItemId: string, now: Date) {
    return this.mutateActive(planItemId, now, (next, target) => {
      if (target.draftSaveIntentCount !== 1 || target.simulatedDraftSaveCount !== 0) throw new Error("simulated_draft_save_not_idempotent");
      target.simulatedDraftSaveCount = 1; target.checkpointPhase = "simulated_saved_local"; target.state = "simulated_saved_local"; target.completedAt = now.toISOString();
      target.lockOwner = null; target.leaseToken = null; target.leaseExpiresAt = null; target.currentPageId = null; next.currentPlanItemId = null;
      target.reason = "Piano create/fill/save completato nel simulatore locale; nessuna bozza ENEA reale creata."; target.nextAction = "Conservare il checkpoint come prova del gate locale.";
      next.status = next.items.some((item) => item.state === "queued_local") ? "queued_local" : "completed_local_simulation";
      next.reason = `${target.displayName}: simulazione locale completata senza azioni esterne.`; next.nextAction = next.status === "queued_local" ? "Reclamare la pratica successiva." : "Tutti i piani della coorte sono stati simulati e verificati.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "draft_saved_simulated", planItemId, pageId: null, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      if (next.status === "completed_local_simulation") next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed_local_simulation", planItemId: null, pageId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    });
  }

  private recoverLease(planItemId: string, now: Date) {
    const current = this.load(now); const next = structuredClone(current); const target = next.items.find((item) => item.planItemId === planItemId);
    if (!target || target.state !== "active_local") return this.technicalBlock(`lease_recovery_item_invalid:${planItemId}`, now);
    next.revision += 1; next.status = "queued_local"; next.currentPlanItemId = null;
    target.state = "queued_local"; target.lockOwner = null; target.leaseToken = null; target.leaseExpiresAt = null; target.recoveryCount += 1;
    target.reason = `Lease scaduta recuperata dal checkpoint ${target.checkpointPhase}; contatori create/fill/save preservati.`; target.nextAction = "Riaccodare la stessa pratica e riprendere dalla prima transizione incompleta.";
    next.reason = `${target.displayName}: lease locale recuperata senza duplicazioni.`; next.nextAction = target.nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "lease_recovered", planItemId, pageId: target.currentPageId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  private complete(now: Date) {
    const current = this.load(now); if (current.status === "completed_local_simulation") return current;
    const next = structuredClone(current); next.revision += 1; next.status = "completed_local_simulation"; next.currentPlanItemId = null;
    next.reason = "Tutti i piani della coorte sono stati simulati e verificati."; next.nextAction = "Conservare il checkpoint come prova del gate locale.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed_local_simulation", planItemId: null, pageId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  private technicalBlock(reason: string, now: Date) {
    const current = this.load(now); if (current.status === "technical_block" && current.reason === reason) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "technical_block"; next.currentPlanItemId = null;
    for (const item of next.items) if (item.state === "active_local") { item.state = "queued_local"; item.lockOwner = null; item.leaseToken = null; item.leaseExpiresAt = null; }
    next.reason = reason; next.nextAction = "Correggere localmente il contratto del pacchetto e risincronizzare; nessuna azione esterna consentita.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", planItemId: null, pageId: null, reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now); const current = state.items.find((item) => item.planItemId === state.currentPlanItemId) ?? null;
    return {
      ...state, current,
      progress: {
        total: state.items.length, queued: state.items.filter((item) => item.state === "queued_local").length,
        active: state.items.filter((item) => item.state === "active_local").length,
        completed: state.items.filter((item) => item.state === "simulated_saved_local").length,
        pagesTotal: state.items.reduce((total, item) => total + item.pages.length, 0),
        pagesSaved: state.items.reduce((total, item) => total + item.pages.filter((page) => page.state === "save_checkpointed").length, 0),
        recoveries: state.items.reduce((total, item) => total + item.recoveryCount, 0),
      },
      lastEvent: state.audit.at(-1)!, observedAt: now.toISOString(),
    };
  }
}

function itemHasExternalCapability(intake: ReturnType<PersistentAprCrmLocalExecutorIntake["snapshot"]>) {
  return intake.externalActionAllowed || intake.browserAllowed || intake.crmMutationAllowed || intake.eneaActionAllowed
    || intake.previewAllowed || intake.submitAllowed || intake.receiptAllowed || intake.communicationsAllowed;
}
