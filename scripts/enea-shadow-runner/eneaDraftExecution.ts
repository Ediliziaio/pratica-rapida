import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
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
import {
  USER_AUTHORIZED_RULE_IDS,
  registryRule,
} from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";

export const APR_ENEA_DRAFT_EXECUTION_VERSION = "apr-enea-draft-execution-v1" as const;
export const APR_ENEA_FROZEN_SOURCE_OBSERVATIONS_VERSION = "apr-enea-frozen-source-observations-v1" as const;

const SYSTEM_RESUME_RULE = "system-atomic-checkpoint-resume";
const SYSTEM_SINGLE_RULE = "system-single-active-practice";
const SYSTEM_FAIL_CLOSED_RULE = "system-operator-block-fail-closed";
const LOCK_LEASE_MS = 10_000;

export interface AprEneaFrozenSourceObservation {
  observedAt: string;
  operation: "prepare" | "prepare_packages";
  frozenSourceFingerprint: string;
  ignoredSourceFingerprint: string;
  reason: "resume_ignored_frozen_execution";
}

export interface AprEneaFrozenSourceObservations {
  version: typeof APR_ENEA_FROZEN_SOURCE_OBSERVATIONS_VERSION;
  observations: AprEneaFrozenSourceObservation[];
}

type PreflightSnapshot = ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>;

export type AprEneaDraftItemState =
  | "queued"
  | "recovery_queued"
  | "create_intent_recorded"
  | "created"
  | "filling"
  | "save_intent_recorded"
  | "saved"
  | "operator_intervention"
  | "deferred_operator";

export interface AprEneaDraftPageCheckpoint {
  pageId: string;
  state: "pending" | "prepared" | "save_intent_recorded" | "staged" | "saved";
  saveAttemptCount: 0 | 1;
  recoverySaveAttemptCount: 0 | 1;
  recoveryAuthorizedEvidenceId: string | null;
  preparedEvidenceId: string | null;
  /** DOM/table evidence only. It is never proof of server persistence. */
  stagedEvidenceId?: string | null;
  savedEvidenceId: string | null;
}

export type AprUncertainPageSaveProbeMethod = "server_redirect" | "persisted_fields_get" | "server_metadata_get";
export type AprUncertainPageSaveProbeOutcome = "saved" | "not_saved" | "inconclusive";

export interface AprUncertainPageSaveProbe {
  method: AprUncertainPageSaveProbeMethod;
  outcome: AprUncertainPageSaveProbeOutcome;
  evidenceId: string;
  observedAt: string;
  reason: string;
  url?: string;
}

export interface AprUncertainPageSaveResolution {
  pageId: string;
  status: "probing" | "operator_required" | "recovery_authorized" | "resolved_staged" | "resolved_saved";
  detectedAt: string;
  detectedEvidenceId: string;
  probes: AprUncertainPageSaveProbe[];
  transientProbeRetryCounts?: Partial<Record<AprUncertainPageSaveProbeMethod, number>>;
  operatorDecision: null | {
    decision: "saved" | "not_saved" | "indeterminate";
    operatorId: string;
    evidenceId: string;
    decidedAt: string;
    note: string;
  };
  reason: string;
  nextAction: string;
}

export interface AprPostCompletionVerification {
  kind: "saved_payload_correction";
  status: "intent_recorded" | "verification_inconclusive" | "resolved_requeued";
  originalMappingFingerprint: string;
  expectedMappingFingerprint: string;
  startedAt: string;
  completedAt: string | null;
  evidenceId: string | null;
  mismatchedPortalIds: string[];
  reason: string;
}

export interface AprEneaDraftExecutionItem {
  generationId: string;
  requiresFreshDraft: boolean;
  customerKey: string;
  displayName: string;
  practiceId: string;
  state: AprEneaDraftItemState;
  mappingFingerprint: string | null;
  workflowFingerprint: string | null;
  requiredPortalFieldCount: number;
  expectedPageIds: string[];
  draftId: string | null;
  portalUrl: string | null;
  createIntentAt: string | null;
  createdAt: string | null;
  saveIntentAt: string | null;
  savedAt: string | null;
  createAttemptCount: 0 | 1;
  recoverableCreateIntent: boolean;
  saveAttemptCount: 0 | 1;
  completedPageIds: string[];
  pageCheckpoints: AprEneaDraftPageCheckpoint[];
  uncertainPageSave: AprUncertainPageSaveResolution | null;
  postCompletionVerification: AprPostCompletionVerification | null;
  operatorGateBlockers: Array<{
    code: string;
    reason: string;
    sourceIds: string[];
    appliedRuleIds: string[];
  }>;
  serverEvidenceIds: string[];
  reason: string;
  nextAction: string;
}

export interface AprEneaDraftSupersededGeneration {
  generationId: string;
  customerKey: string;
  sourceFingerprint: string;
  status: "superseded";
  supersededAt: string;
  supersededByGenerationId: string;
  reason: "updated_source_requeued";
  item: AprEneaDraftExecutionItem;
}

export interface AprEneaDraftExecutionAuditEvent {
  revision: number;
  at: string;
  type:
    | "initialized"
    | "prepared"
    | "validation_eligible_cases_appended"
    | "source_generation_superseded"
    | "login_required"
    | "session_ready"
    | "create_intent_recorded"
    | "draft_created"
    | "required_page_discovered"
    | "page_prepared"
    | "page_save_intent_recorded"
    | "nested_page_staged"
    | "nested_page_server_verified_after_outer_save"
    | "page_saved"
    | "save_intent_recorded"
    | "draft_saved"
    | "draft_saved_from_durable_checkpoint"
    | "final_draft_server_evidence_recovered"
    | "case_blocked_continuing"
    | "case_requeued_recovery"
    | "create_intent_deferred_behind_pending_portal_intent"
    | "created_draft_requeued_page_order"
    | "created_draft_requeued_generator_activation"
    | "created_draft_requeued_screening_navigation"
    | "infissi_rows_requeued_after_staging_classifier_correction"
    | "infissi_partial_rows_requeued_after_empty_canonical_summary"
    | "generator_and_plant_requeued_after_empty_generator_summary"
    | "infissi_rows_requeued_after_authorized_transmittance_correction"
    | "infissi_final_calculation_requeued_after_checkpoint_repair"
    | "screening_react_contract_requeued_preclick"
    | "screening_staged_from_post_save_readonly"
    | "screening_recovery_staged_from_post_save_readonly"
    | "infissi_row_staged_from_post_click_table"
    | "created_draft_requeued_field_verification"
    | "created_draft_requeued_package_mapping_rebind"
    | "created_draft_requeued_pre_save_remount"
    | "page_saved_after_checkpoint_collision"
    | "unclicked_page_requeued_save_control_correction"
    | "created_draft_requeued_transient_readonly_timeout"
    | "authorized_screening_restage_requeued_after_transient_timeout"
    | "created_draft_requeued_infissi_contract_discovery"
    | "uncertain_page_save_requeued_readonly_verification"
    | "legacy_uncertain_page_save_migrated"
    | "legacy_uncertain_page_save_probes_requeued_after_mapping_repair"
    | "uncertain_page_save_transient_probe_requeued"
    | "uncertain_infissi_row_probes_requeued_after_classifier_correction"
    | "uncertain_page_save_detected"
    | "uncertain_page_save_probe_recorded"
    | "uncertain_page_save_auto_resolved"
    | "uncertain_page_save_recovery_auto_authorized"
    | "uncertain_page_save_recovery_requeued_preclick"
    | "uncertain_page_save_recovery_probe_resolved"
    | "uncertain_page_save_recovery_probe_operator_required"
    | "calculation_allocation_input_contract_requeued"
    | "standard_save_delivery_contract_requeued"
    | "municipality_autocomplete_contract_requeued"
    | "calculation_allocation_transient_surface_reclassified"
    | "calculation_allocation_trusted_input_requeued"
    | "authorized_recovery_mapping_rebound"
    | "authorized_recovery_package_available"
    | "authorized_recovery_transient_timeout_requeued"
    | "verified_payload_correction_requeued"
    | "post_completion_verification_intent_recorded"
    | "post_completion_verification_inconclusive"
    | "verified_infissi_package_correction_requeued"
    | "legacy_infissi_rows_requeued_before_summary"
    | "verified_deleted_draft_requeued"
    | "verified_payload_correction_claimed"
    | "uncertain_page_save_operator_required"
    | "uncertain_page_save_operator_decision"
    | "uncertain_page_save_recovery_claimed"
    | "uncertain_page_save_recovery_failed"
    | "page_saved_from_server_redirect"
    | "page_save_requeued_readonly_verification"
    | "pre_external_package_failure_requeued"
    | "infissi_package_availability_failure_requeued"
    | "operator_instruction_upgraded"
    | "validation_operator_gate_applied"
    | "validation_operator_gate_released"
    | "operator_intervention";
  customerKey: string | null;
  commandId: string;
  reason: string;
  nextAction: string;
  appliedRuleIds: string[];
}

export interface AprEneaDraftExecutionState {
  version: typeof APR_ENEA_DRAFT_EXECUTION_VERSION;
  revision: number;
  status: "blocked_preflight" | "ready" | "running" | "login_required" | "operator_intervention" | "completed";
  sourceFingerprint: string | null;
  sourceRevisionFingerprints: string[];
  currentCustomerKey: string | null;
  sessionEvidenceId: string | null;
  sessionVerifiedAt: string | null;
  items: AprEneaDraftExecutionItem[];
  supersededGenerations: AprEneaDraftSupersededGeneration[];
  reason: string;
  nextAction: string;
  createCapability: "one_attempt_after_persistent_intent";
  saveCapability: "one_attempt_after_all_pages_checkpointed";
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  audit: AprEneaDraftExecutionAuditEvent[];
  processedCommandIds: string[];
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function initialState(now: Date): AprEneaDraftExecutionState {
  const reason = "Esecuzione bozza ENEA non preparata: preflight persistente richiesto.";
  return {
    version: APR_ENEA_DRAFT_EXECUTION_VERSION,
    revision: 0,
    status: "blocked_preflight",
    sourceFingerprint: null,
    sourceRevisionFingerprints: [],
    currentCustomerKey: null,
    sessionEvidenceId: null,
    sessionVerifiedAt: null,
    items: [],
    supersededGenerations: [],
    reason,
    nextAction: "Attendere una coorte TEST di almeno due casi con almeno un payload verde; i casi bloccati devono restare isolati e Beatrice Ciotta esclusa.",
    createCapability: "one_attempt_after_persistent_intent",
    saveCapability: "one_attempt_after_all_pages_checkpointed",
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    audit: [{
      revision: 0,
      at: now.toISOString(),
      type: "initialized",
      customerKey: null,
      commandId: "system:draft-execution:init",
      reason,
      nextAction: "Preparare la coda soltanto dal checkpoint preflight verde.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }],
    processedCommandIds: ["system:draft-execution:init"],
  };
}

function validState(value: AprEneaDraftExecutionState) {
  if (value.version !== APR_ENEA_DRAFT_EXECUTION_VERSION || !Number.isInteger(value.revision)) return false;
  if (value.previewAllowed !== false || value.submitAllowed !== false || value.communicationsAllowed !== false) return false;
  if (!Array.isArray(value.items) || !Array.isArray(value.supersededGenerations) || !Array.isArray(value.audit) || !Array.isArray(value.processedCommandIds) || !Array.isArray(value.sourceRevisionFingerprints)) return false;
  if (new Set(value.sourceRevisionFingerprints).size !== value.sourceRevisionFingerprints.length) return false;
  if (new Set(value.items.map((item) => item.customerKey)).size !== value.items.length) return false;
  if (new Set(value.items.map((item) => item.generationId)).size !== value.items.length) return false;
  if (value.items.some((item) => !item.generationId || typeof item.requiresFreshDraft !== "boolean")) return false;
  if (value.supersededGenerations.some((generation) => generation.status !== "superseded" || generation.item.generationId !== generation.generationId)) return false;
  const allGenerationIds = [...value.items.map((item) => item.generationId), ...value.supersededGenerations.map((item) => item.generationId)];
  if (new Set(allGenerationIds).size !== allGenerationIds.length) return false;
  const activeCustomers = new Set(value.items.map((item) => item.customerKey));
  if (value.items.some((item, index) => value.items.findIndex((candidate) => candidate.customerKey === item.customerKey) !== index) || activeCustomers.size !== value.items.length) return false;
  if (value.items.some((item) => item.customerKey === "beatrice-ciotta" && item.state !== "deferred_operator")) return false;
  if (value.items.some((item) => item.createAttemptCount > 1 || item.saveAttemptCount > 1)) return false;
  if (value.items.some((item) => item.postCompletionVerification !== null && (
    item.postCompletionVerification.kind !== "saved_payload_correction"
    || !["intent_recorded", "verification_inconclusive", "resolved_requeued"].includes(item.postCompletionVerification.status)
    || !item.postCompletionVerification.originalMappingFingerprint
    || !item.postCompletionVerification.expectedMappingFingerprint
    || !item.postCompletionVerification.startedAt
    || !Array.isArray(item.postCompletionVerification.mismatchedPortalIds)
  ))) return false;
  if (value.items.some((item) => !Array.isArray(item.pageCheckpoints)
    || item.pageCheckpoints.length !== item.expectedPageIds.length
    || item.pageCheckpoints.some((checkpoint) => checkpoint.saveAttemptCount > 1 || checkpoint.recoverySaveAttemptCount > 1)
    || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "staged" && (checkpoint.saveAttemptCount !== 1 || !checkpoint.stagedEvidenceId || checkpoint.savedEvidenceId !== null))
    || item.completedPageIds.some((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)?.state !== "saved")
    || item.pageCheckpoints.some((checkpoint) => !item.expectedPageIds.includes(checkpoint.pageId)))) return false;
  if (value.items.some((item) => item.state === "saved" && (
    !item.draftId
    || !item.savedAt
    || !item.serverEvidenceIds.length
    || item.completedPageIds.length !== item.expectedPageIds.length
    || item.expectedPageIds.some((pageId) => !item.completedPageIds.includes(pageId))
    || item.pageCheckpoints.some((checkpoint) => checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1 || !checkpoint.savedEvidenceId)
    || (requiresFinalCalculationPage(item) && !item.expectedPageIds.includes("page:Calcolo costi e detrazioni"))
  ))) return false;
  if (value.currentCustomerKey && !value.items.some((item) => item.customerKey === value.currentCustomerKey)) return false;
  return value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function normalizeState(value: AprEneaDraftExecutionState): AprEneaDraftExecutionState {
  value.sourceRevisionFingerprints ??= [];
  value.supersededGenerations ??= [];
  for (const item of value.items ?? []) {
    item.generationId ??= `legacy-${fingerprint({ customerKey: item.customerKey, practiceId: item.practiceId, mappingFingerprint: item.mappingFingerprint, workflowFingerprint: item.workflowFingerprint }).slice(0, 24)}`;
    item.requiresFreshDraft ??= false;
    item.recoverableCreateIntent ??= false;
    item.uncertainPageSave ??= null;
    if (item.uncertainPageSave) item.uncertainPageSave.transientProbeRetryCounts ??= {};
    item.postCompletionVerification ??= null;
    item.operatorGateBlockers ??= [];
    if (!Array.isArray(item.pageCheckpoints)) {
      item.pageCheckpoints = item.expectedPageIds.map((pageId) => ({
        pageId,
        state: item.completedPageIds.includes(pageId) ? "saved" : "pending",
        saveAttemptCount: item.completedPageIds.includes(pageId) ? 1 : 0,
        recoverySaveAttemptCount: 0,
        recoveryAuthorizedEvidenceId: null,
        preparedEvidenceId: null,
        savedEvidenceId: null,
      }));
    }
    for (const checkpoint of item.pageCheckpoints) {
      checkpoint.recoverySaveAttemptCount ??= 0;
      checkpoint.recoveryAuthorizedEvidenceId ??= null;
    }
    item.expectedPageIds = canonicalPortalPageIds(item.expectedPageIds);
    item.pageCheckpoints = item.expectedPageIds.map((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId) ?? ({
      pageId,
      state: item.completedPageIds.includes(pageId) ? "saved" : "pending",
      saveAttemptCount: item.completedPageIds.includes(pageId) ? 1 : 0,
      recoverySaveAttemptCount: 0,
      recoveryAuthorizedEvidenceId: null,
      preparedEvidenceId: null,
      stagedEvidenceId: null,
      savedEvidenceId: null,
    } as AprEneaDraftPageCheckpoint));
    // Legacy checkpoints used `saved` for a row that was only present in the
    // client-side table.  If the owning outer page was never persisted, retain
    // the evidence as staging evidence and remove the false completion claim.
    if (item.state !== "saved") {
      for (const checkpoint of item.pageCheckpoints) {
        const outerPageId = outerPageForNestedCheckpoint(item.expectedPageIds, checkpoint.pageId);
        const outer = outerPageId ? item.pageCheckpoints.find((candidate) => candidate.pageId === outerPageId) : null;
        const legacyStaged = value.audit.some((event) => event.customerKey === item.customerKey
          && event.type === "nested_page_staged"
          && event.reason.includes(checkpoint.pageId));
        const serverVerified = value.audit.some((event) => event.customerKey === item.customerKey
          && event.type === "nested_page_server_verified_after_outer_save"
          && event.reason.includes(checkpoint.pageId));
        if (outer && outer.state !== "saved" && checkpoint.state === "saved" && legacyStaged && !serverVerified) {
          checkpoint.state = "staged";
          checkpoint.stagedEvidenceId = checkpoint.savedEvidenceId;
          checkpoint.savedEvidenceId = null;
          item.completedPageIds = item.completedPageIds.filter((pageId) => pageId !== checkpoint.pageId);
        }
      }
    }
  }
  const cohortTerminal = value.items.length > 0
    && value.items.every((item) => ["saved", "operator_intervention", "deferred_operator"].includes(item.state));
  if (value.status === "completed" && cohortTerminal) {
    const saved = value.items.filter((item) => item.state === "saved").length;
    const isolated = value.items.filter((item) => item.state === "operator_intervention").length;
    const deferred = value.items.filter((item) => item.state === "deferred_operator").length;
    value.reason = `Coda conclusa: ${saved} bozze complete verificate, ${isolated} casi isolati e ${deferred} casi esclusi; nessuna anteprima o invio.`;
    value.nextAction = "Consultare il report; nessuna ulteriore azione ENEA consentita per questa coda.";
  }
  return value;
}

function outerPageForNestedCheckpoint(expectedPageIds: string[], pageId: string) {
  if (pageId === "page:Allocazione costi e detrazioni") return expectedPageIds.find((candidate) => candidate === "page:Calcolo costi e detrazioni") ?? null;
  if (/Generatore/.test(pageId)) return expectedPageIds.find((candidate) => /Impianto termico esistente/.test(candidate)) ?? null;
  if (pageId.startsWith("screening:")) return expectedPageIds.find((candidate) => !candidate.startsWith("screening:") && /schermatur|serrament|infiss/i.test(candidate)) ?? null;
  return null;
}

function canonicalPortalPageIds(pageIds: string[]) {
  const rank = (pageId: string) => {
    const normalized = pageId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
    if (normalized.startsWith("screening:")) return 60;
    if (normalized.includes("beneficiario")) return 10;
    if (normalized.includes("immobile")) return 20;
    if (normalized.includes("intervento")) return 30;
    if (normalized.includes("generatore")) return 40;
    if (normalized.includes("impianto")) return 50;
    if (normalized.includes("schermatur")) return 70;
    if (normalized.includes("calcolo") || normalized.includes("detrazion")) return 80;
    return 65;
  };
  return pageIds.map((pageId, index) => ({ pageId, index })).sort((left, right) => rank(left.pageId) - rank(right.pageId) || left.index - right.index).map(({ pageId }) => pageId);
}

function requiresFinalCalculationPage(item: Pick<AprEneaDraftExecutionItem, "expectedPageIds">) {
  return item.expectedPageIds.some((pageId) => pageId.startsWith("screening:") || /schermatur|allocazione costi/i.test(pageId));
}

export function savedPayloadPostCompletionVerificationEligible(
  item: AprEneaDraftExecutionItem,
  expectedMappingFingerprint: string,
) {
  return item.state === "saved"
    && Boolean(item.draftId)
    && item.completedPageIds.length === item.expectedPageIds.length
    && item.mappingFingerprint !== expectedMappingFingerprint
    && item.postCompletionVerification === null;
}

export function detailedUncertainSaveOperatorInstruction(draftId: string | null, pageId: string) {
  const pageName = pageId.replace(/^page:/, "").replace(/^screening:/, "Riga tecnica ");
  const fields = /beneficiario/i.test(pageName)
    ? "nome, cognome, codice fiscale, nascita, residenza e gli eventuali altri beneficiari"
    : `i dati visibili della sezione ${pageName}`;
  return `Aprire su ENEA la bozza ${draftId ?? "indicata"}, sezione \"${pageName}\", senza premere Salva. Verificare ${fields}. Rispondere SALVATA se tutti i dati attesi sono gia presenti; APR proseguira senza ripetere Salva. Rispondere NON SALVATA se i campi sono vuoti o tornati ai valori iniziali; APR eseguira un solo recupero controllato. Rispondere INDETERMINABILE se i dati sono soltanto parziali o non e possibile verificarli; la pratica restera in Intervento operatore. Allegare uno screenshot o una nota che descriva cio che si vede.`;
}

function expectedPageIds(item: NonNullable<PreflightSnapshot["items"][number]["report"]>) {
  const gate = item.eneaPayloadAudit.portalGate;
  const pageIds = [
    ...gate.supportedPages.map((page) => `page:${page}`),
    ...Array.from({ length: gate.screeningItemCount }, (_, index) => `screening:${index + 1}`),
  ];
  const screeningWorkflow = gate.screeningItemCount > 0 || gate.supportedPages.some((page) => /schermatur/i.test(page));
  if (screeningWorkflow && !pageIds.includes("page:Calcolo costi e detrazioni")) pageIds.push("page:Calcolo costi e detrazioni");
  return canonicalPortalPageIds(pageIds);
}

function expectedPageIdsFromPackage(draftPackage: AprEneaDraftPackage) {
  const pageIds = [
    ...draftPackage.workflow.supportedPages.map((page) => `page:${page}`),
    ...Array.from({ length: draftPackage.workflow.screeningItemCount }, (_, index) => `screening:${index + 1}`),
  ];
  if (draftPackage.workflow.screeningItemCount > 0 && !pageIds.includes("page:Calcolo costi e detrazioni")) {
    pageIds.push("page:Calcolo costi e detrazioni");
  }
  return canonicalPortalPageIds(pageIds);
}

function draftItemFromPreflight(
  item: PreflightSnapshot["items"][number],
  deferred = item.customerKey === "beatrice-ciotta",
  generationId?: string,
  requiresFreshDraft = false,
): AprEneaDraftExecutionItem {
  const report = item.report;
  const pageIds = report?.eneaPayloadAudit ? expectedPageIds(report) : [];
  return {
    generationId: generationId ?? `generation-${fingerprint({ customerKey: item.customerKey, practiceId: item.practiceId, mappingFingerprint: report?.eneaPayloadAudit?.mappingFingerprint ?? null, workflowFingerprint: report?.eneaPayloadAudit?.portalGate.workflowFingerprint ?? null }).slice(0, 24)}`,
    requiresFreshDraft,
    customerKey: item.customerKey,
    displayName: item.displayName,
    practiceId: item.practiceId,
    state: deferred ? "deferred_operator" : "queued",
    mappingFingerprint: report?.eneaPayloadAudit?.mappingFingerprint ?? null,
    workflowFingerprint: report?.eneaPayloadAudit?.portalGate.workflowFingerprint ?? null,
    requiredPortalFieldCount: report?.eneaPayloadAudit?.requiredPortalFieldCount ?? 0,
    expectedPageIds: pageIds,
    draftId: null,
    portalUrl: null,
    createIntentAt: null,
    createdAt: null,
    saveIntentAt: null,
    savedAt: null,
    createAttemptCount: 0,
    recoverableCreateIntent: false,
    saveAttemptCount: 0,
    completedPageIds: [],
    pageCheckpoints: pageIds.map((pageId) => ({ pageId, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null })),
    uncertainPageSave: null,
    postCompletionVerification: null,
    operatorGateBlockers: [],
    serverEvidenceIds: [],
    reason: deferred ? "Accantonata dal pilot su istruzione utente." : "Payload TEST e gate portale verdi; in attesa della sessione ENEA.",
    nextAction: deferred ? "Nessuna azione ENEA." : "Attendere il proprio turno; una sola pratica attiva.",
  };
}

function draftItemFromPackage(draftPackage: AprEneaDraftPackage, generationId?: string, requiresFreshDraft = false): AprEneaDraftExecutionItem {
  const pageIds = expectedPageIdsFromPackage(draftPackage);
  return {
    generationId: generationId ?? `generation-${fingerprint({ customerKey: draftPackage.customerKey, practiceId: draftPackage.practiceId, packageFingerprint: draftPackage.packageFingerprint, workflowFingerprint: draftPackage.workflowFingerprint }).slice(0, 24)}`,
    requiresFreshDraft,
    customerKey: draftPackage.customerKey,
    displayName: draftPackage.displayName,
    practiceId: draftPackage.practiceId,
    state: "queued",
    mappingFingerprint: draftPackage.packageFingerprint,
    workflowFingerprint: draftPackage.workflowFingerprint,
    requiredPortalFieldCount: draftPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0)
      + draftPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0),
    expectedPageIds: pageIds,
    draftId: null,
    portalUrl: null,
    createIntentAt: null,
    createdAt: null,
    saveIntentAt: null,
    savedAt: null,
    createAttemptCount: 0,
    recoverableCreateIntent: false,
    saveAttemptCount: 0,
    completedPageIds: [],
    pageCheckpoints: pageIds.map((pageId) => ({ pageId, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null })),
    uncertainPageSave: null,
    postCompletionVerification: null,
    operatorGateBlockers: [],
    serverEvidenceIds: [],
    reason: "Payload TEST e gate portale del modulo verificati; in attesa della sessione ENEA.",
    nextAction: "Attendere il proprio turno; una sola pratica attiva.",
  };
}

export class PersistentAprEneaDraftExecution {
  readonly rootDirectory: string;
  readonly directory: string;
  readonly checkpointPath: string;
  readonly frozenSourceObservationsPath: string;
  readonly lockDirectory: string;

  readonly allowedPortalOrigin: string;

  constructor(rootDirectory: string, options: { allowedPortalOrigin?: string } = {}) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.directory = path.join(this.rootDirectory, "enea-draft-execution");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.frozenSourceObservationsPath = path.join(this.directory, "frozen-source-observations.json");
    this.lockDirectory = path.join(this.directory, "transition.lock");
    this.allowedPortalOrigin = new URL(options.allowedPortalOrigin ?? "https://bonusfiscali.enea.it").origin;
  }

  private portalUrlAllowed(portalUrl: string) {
    try { return new URL(portalUrl).origin === this.allowedPortalOrigin; } catch { return false; }
  }

  private singleCaseRegressionAuthorized() {
    try {
      const seed = JSON.parse(readFileSync(path.join(this.rootDirectory, "cohort-seed", "checkpoint.json"), "utf8")) as { audit?: Array<{ appliedRuleIds?: string[] }> };
      return seed.audit?.some((event) => event.appliedRuleIds?.includes(USER_AUTHORIZED_RULE_IDS.singleCaseRegressionTest)) === true;
    } catch { return false; }
  }

  initialize(now = new Date()) {
    if (existsSync(this.checkpointPath)) return this.load(now);
    const state = initialState(now);
    this.write(state);
    return state;
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = normalizeState(JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprEneaDraftExecutionState);
      return validState(value) ? value : initialState(now);
    } catch {
      return initialState(now);
    }
  }

  private write(state: AprEneaDraftExecutionState) {
    if (!validState(state)) throw new Error("enea_draft_execution_checkpoint_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  loadFrozenSourceObservations(): AprEneaFrozenSourceObservations {
    if (!existsSync(this.frozenSourceObservationsPath)) {
      return { version: APR_ENEA_FROZEN_SOURCE_OBSERVATIONS_VERSION, observations: [] };
    }
    try {
      const value = JSON.parse(readFileSync(this.frozenSourceObservationsPath, "utf8")) as AprEneaFrozenSourceObservations;
      if (value.version !== APR_ENEA_FROZEN_SOURCE_OBSERVATIONS_VERSION || !Array.isArray(value.observations)) throw new Error("invalid");
      return value;
    } catch {
      return { version: APR_ENEA_FROZEN_SOURCE_OBSERVATIONS_VERSION, observations: [] };
    }
  }

  private recordFrozenSourceObservation(
    operation: AprEneaFrozenSourceObservation["operation"],
    frozenSourceFingerprint: string,
    ignoredSourceFingerprint: string,
    now: Date,
  ) {
    const current = this.loadFrozenSourceObservations();
    const duplicate = current.observations.some((item) => item.operation === operation
      && item.frozenSourceFingerprint === frozenSourceFingerprint
      && item.ignoredSourceFingerprint === ignoredSourceFingerprint);
    if (duplicate) return;
    atomicWrite(this.frozenSourceObservationsPath, `${JSON.stringify({
      version: APR_ENEA_FROZEN_SOURCE_OBSERVATIONS_VERSION,
      observations: [...current.observations, {
        observedAt: now.toISOString(),
        operation,
        frozenSourceFingerprint,
        ignoredSourceFingerprint,
        reason: "resume_ignored_frozen_execution",
      }],
    }, null, 2)}\n`);
  }

  private reopenUpdatedPreflightGenerations(preflight: PreflightSnapshot, sourceFingerprint: string, now: Date) {
    const current = this.initialize(now);
    const incoming = new Map(preflight.items
      .filter((item) => item.state === "ready_local_plan" && item.report?.eneaPayloadAudit?.draftReady && item.report.eneaPayloadAudit.portalGate.status === "ready")
      .map((item) => [item.customerKey, item] as const));
    const changed = current.items.flatMap((item) => {
      if (item.customerKey === "beatrice-ciotta") return [];
      const candidate = incoming.get(item.customerKey);
      if (!candidate?.report?.eneaPayloadAudit) return [];
      const mappingFingerprint = candidate.report.eneaPayloadAudit.mappingFingerprint;
      const workflowFingerprint = candidate.report.eneaPayloadAudit.portalGate.workflowFingerprint;
      return item.mappingFingerprint !== mappingFingerprint || item.workflowFingerprint !== workflowFingerprint ? [{ item, candidate }] : [];
    });
    if (changed.length === 0) return null;
    const commandId = `system:draft-execution:reopen-source:${fingerprint({ sourceFingerprint, cases: changed.map(({ item, candidate }) => ({ customerKey: item.customerKey, previousGenerationId: item.generationId, mappingFingerprint: candidate.report!.eneaPayloadAudit!.mappingFingerprint, workflowFingerprint: candidate.report!.eneaPayloadAudit!.portalGate.workflowFingerprint })) })}`;
    return this.transition("supervisor", commandId, now, {
      type: "source_generation_superseded",
      customerKey: changed.length === 1 ? changed[0].item.customerKey : null,
      reason: `${changed.length} pratiche con fonte aggiornata riaperte in una nuova generazione persistente; le generazioni congelate restano superseded nell'audit.`,
      nextAction: "Il browser worker dovra creare una nuova bozza soltanto quando consumera requiresFreshDraft; nessuna azione ENEA eseguita da questa transizione.",
      appliedRuleIds: [SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      for (const { item, candidate } of changed) {
        const nextGenerationId = `generation-${fingerprint({ customerKey: item.customerKey, previousGenerationId: item.generationId, sourceFingerprint }).slice(0, 24)}`;
        next.supersededGenerations.push({
          generationId: item.generationId,
          customerKey: item.customerKey,
          sourceFingerprint: current.sourceFingerprint!,
          status: "superseded",
          supersededAt: now.toISOString(),
          supersededByGenerationId: nextGenerationId,
          reason: "updated_source_requeued",
          item: structuredClone(item),
        });
        const index = next.items.findIndex((existing) => existing.customerKey === item.customerKey);
        next.items[index] = draftItemFromPreflight(candidate, false, nextGenerationId, true);
        if (next.currentCustomerKey === item.customerKey) next.currentCustomerKey = null;
      }
      next.sourceFingerprint = sourceFingerprint;
      next.status = "ready";
    });
  }

  private reopenUpdatedPackageGenerations(packages: readonly AprEneaDraftPackage[], sourceFingerprint: string, now: Date) {
    const current = this.initialize(now);
    const incoming = new Map(packages.map((item) => [item.customerKey, item] as const));
    const changed = current.items.flatMap((item) => {
      const candidate = incoming.get(item.customerKey);
      return candidate && (item.mappingFingerprint !== candidate.packageFingerprint || item.workflowFingerprint !== candidate.workflowFingerprint) ? [{ item, candidate }] : [];
    });
    if (changed.length === 0) return null;
    const commandId = `system:draft-execution:reopen-packages:${fingerprint({ sourceFingerprint, cases: changed.map(({ item, candidate }) => ({ customerKey: item.customerKey, previousGenerationId: item.generationId, packageFingerprint: candidate.packageFingerprint, workflowFingerprint: candidate.workflowFingerprint })) })}`;
    return this.transition("supervisor", commandId, now, {
      type: "source_generation_superseded",
      customerKey: changed.length === 1 ? changed[0].item.customerKey : null,
      reason: `${changed.length} pacchetti aggiornati riaperti in una nuova generazione persistente; le generazioni congelate restano superseded nell'audit.`,
      nextAction: "Il browser worker dovra creare una nuova bozza soltanto quando consumera requiresFreshDraft; nessuna azione ENEA eseguita da questa transizione.",
      appliedRuleIds: [SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      for (const { item, candidate } of changed) {
        const nextGenerationId = `generation-${fingerprint({ customerKey: item.customerKey, previousGenerationId: item.generationId, sourceFingerprint }).slice(0, 24)}`;
        next.supersededGenerations.push({ generationId: item.generationId, customerKey: item.customerKey, sourceFingerprint: current.sourceFingerprint!, status: "superseded", supersededAt: now.toISOString(), supersededByGenerationId: nextGenerationId, reason: "updated_source_requeued", item: structuredClone(item) });
        const index = next.items.findIndex((existing) => existing.customerKey === item.customerKey);
        next.items[index] = draftItemFromPackage(candidate, nextGenerationId, true);
        if (next.currentCustomerKey === item.customerKey) next.currentCustomerKey = null;
      }
      next.sourceFingerprint = sourceFingerprint;
      next.status = "ready";
    });
  }

  private withLock<T>(ownerId: string, now: Date, action: () => T): T {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try {
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    } catch {
      let lease: { expiresAt?: string } = {};
      try { lease = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* lock corrotto: recupero fail-closed */ }
      if (lease.expiresAt && Date.parse(lease.expiresAt) > now.getTime()) throw new Error("enea_draft_execution_locked");
      try { unlinkSync(path.join(this.lockDirectory, "owner.json")); } catch { /* assente */ }
      try { rmdirSync(this.lockDirectory); } catch { /* sarà rifiutato dal mkdir */ }
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    atomicWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ ownerId, at: now.toISOString(), expiresAt: new Date(now.getTime() + LOCK_LEASE_MS).toISOString() })}\n`);
    try { return action(); }
    finally {
      try {
        const lease = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (lease.ownerId === ownerId) {
          unlinkSync(path.join(this.lockDirectory, "owner.json"));
          rmdirSync(this.lockDirectory);
        }
      } catch { /* un altro processo ha già recuperato il lock */ }
    }
  }

  private transition(
    ownerId: string,
    commandId: string,
    now: Date,
    event: Omit<AprEneaDraftExecutionAuditEvent, "revision" | "at" | "commandId">,
    mutate: (next: AprEneaDraftExecutionState) => void,
  ) {
    if (!ownerId.trim() || !commandId.trim()) throw new Error("enea_draft_execution_identity_required");
    return this.withLock(ownerId, now, () => {
      const current = this.initialize(now);
      if (current.processedCommandIds.includes(commandId)) return current;
      const next = structuredClone(current);
      next.revision += 1;
      mutate(next);
      next.reason = event.reason;
      next.nextAction = event.nextAction;
      next.processedCommandIds.push(commandId);
      next.audit.push({ revision: next.revision, at: now.toISOString(), commandId, ...event });
      return this.write(next);
    });
  }

  prepare(preflight: PreflightSnapshot, now = new Date()) {
    const eligible = preflight.items.filter((item) => item.state === "ready_local_plan" && item.report?.eneaPayloadAudit?.draftReady && item.report.eneaPayloadAudit.portalGate.status === "ready");
    const isolated = preflight.items.filter((item) => item.state === "blocked_case" || item.state === "deferred_operator");
    const ciotta = preflight.items.find((item) => item.customerKey === "beatrice-ciotta");
    const terminalCohortSize = eligible.length + isolated.length;
    const singleCaseRegression = this.singleCaseRegressionAuthorized();
    const minimumCohortSize = singleCaseRegression ? 1 : 2;
    if (preflight.status !== "completed" || terminalCohortSize < minimumCohortSize || eligible.length < 1 || (ciotta && ciotta.state !== "deferred_operator")) return this.initialize(now);
    const sourceFingerprint = fingerprint({
      preflight: preflight.sourceFingerprint,
      items: preflight.items.map((item) => ({
        customerKey: item.customerKey,
        state: item.state,
        mapping: item.report?.eneaPayloadAudit?.mappingFingerprint ?? null,
        workflow: item.report?.eneaPayloadAudit?.portalGate.workflowFingerprint ?? null,
      })),
    });
    const current = this.initialize(now);
    if (current.sourceFingerprint === sourceFingerprint) return current;
    if (current.sourceFingerprint) {
      const reopened = this.reopenUpdatedPreflightGenerations(preflight, sourceFingerprint, now);
      if (reopened) return reopened;
      this.recordFrozenSourceObservation("prepare", current.sourceFingerprint, sourceFingerprint, now);
      return current;
    }
    return this.transition("supervisor", "system:draft-execution:prepare:v1", now, {
      type: "prepared",
      customerKey: null,
      reason: `${terminalCohortSize} casi TEST verificati: ${eligible.length} verdi accodati e ${isolated.length} isolati senza fermare la coda; Beatrice Ciotta esclusa quando presente.`,
      nextAction: "Verificare la sessione ENEA; registrare l'intento prima di creare la prima bozza.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.ciottaPilotLeaveAside, ...(singleCaseRegression ? [USER_AUTHORIZED_RULE_IDS.singleCaseRegressionTest] : []), SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      next.status = "ready";
      next.sourceFingerprint = sourceFingerprint;
      next.items = [...eligible, ...(ciotta ? [ciotta] : [])].map((item) => draftItemFromPreflight(item));
    });
  }

  preparePackages(packages: readonly AprEneaDraftPackage[], sourceFingerprint: string, now = new Date()) {
    const uniqueKeys = new Set(packages.map((item) => item.customerKey));
    const singleCaseRegression = this.singleCaseRegressionAuthorized();
    const minimumCohortSize = singleCaseRegression ? 1 : 2;
    if (!sourceFingerprint.trim() || packages.length < minimumCohortSize || uniqueKeys.size !== packages.length
      || packages.some((item) => item.safety.previewAllowed !== false || item.safety.submitAllowed !== false || item.safety.communicationsAllowed !== false)) {
      return this.initialize(now);
    }
    const durableFingerprint = fingerprint({ sourceFingerprint, packages: packages.map((item) => ({ customerKey: item.customerKey, packageFingerprint: item.packageFingerprint, workflowFingerprint: item.workflowFingerprint })) });
    const current = this.initialize(now);
    if (current.sourceFingerprint === durableFingerprint) return current;
    if (current.sourceFingerprint) {
      const reopened = this.reopenUpdatedPackageGenerations(packages, durableFingerprint, now);
      if (reopened) return reopened;
      this.recordFrozenSourceObservation("prepare_packages", current.sourceFingerprint, durableFingerprint, now);
      return current;
    }
    return this.transition("supervisor", `system:draft-execution:prepare-packages:${durableFingerprint}`, now, {
      type: "prepared",
      customerKey: null,
      reason: `${packages.length} pacchetti TEST del modulo verificati e accodati; una sola pratica attiva, nessuna anteprima o invio.`,
      nextAction: "Verificare la sessione ENEA e registrare l'intento persistente prima della prima bozza.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, ...(singleCaseRegression ? [USER_AUTHORIZED_RULE_IDS.singleCaseRegressionTest] : []), SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      next.status = "ready";
      next.sourceFingerprint = durableFingerprint;
      next.items = packages.map((draftPackage) => draftItemFromPackage(draftPackage));
    });
  }

  appendNewEligibleFromValidation(preflight: PreflightSnapshot, validationRevision: string, now = new Date()) {
    const current = this.initialize(now);
    if (!current.sourceFingerprint || preflight.status !== "completed" || !validationRevision.trim()) return current;
    const existing = new Set(current.items.map((item) => item.customerKey));
    const eligible = preflight.items.filter((item) => item.customerKey !== "beatrice-ciotta"
      && !existing.has(item.customerKey)
      && item.state === "ready_local_plan"
      && item.report?.eneaPayloadAudit?.draftReady
      && item.report.eneaPayloadAudit.portalGate.status === "ready");
    const ciotta = preflight.items.find((item) => item.customerKey === "beatrice-ciotta" && !existing.has(item.customerKey));
    if (eligible.length === 0 && !ciotta) return current;
    const sourceRevisionFingerprint = fingerprint({
      validationRevision,
      preflightSourceFingerprint: preflight.sourceFingerprint,
      items: eligible.map((item) => ({
        customerKey: item.customerKey,
        mapping: item.report?.eneaPayloadAudit?.mappingFingerprint ?? null,
        workflow: item.report?.eneaPayloadAudit?.portalGate.workflowFingerprint ?? null,
      })),
      ciottaDeferred: Boolean(ciotta),
    });
    const commandId = `system:draft-execution:append:${sourceRevisionFingerprint}`;
    return this.transition("supervisor", commandId, now, {
      type: "validation_eligible_cases_appended",
      customerKey: null,
      reason: `${eligible.length} pratiche diventate verdi dopo ${validationRevision} accodate senza sostituire né duplicare il checkpoint operativo esistente.`,
      nextAction: eligible.length > 0 ? "APR riprende dalla prima nuova pratica in coda; una sola pratica attiva." : "Beatrice Ciotta resta esclusa; nessuna azione ENEA.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.ciottaPilotLeaveAside, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      next.sourceRevisionFingerprints.push(sourceRevisionFingerprint);
      next.items.push(...eligible.map((item) => draftItemFromPreflight(item)));
      if (ciotta) next.items.push(draftItemFromPreflight(ciotta, true));
      if (eligible.length > 0 && ["completed", "blocked_preflight"].includes(next.status)) next.status = "ready";
    });
  }

  applyValidationOperatorGates(preflight: PreflightSnapshot, validationRevision: string, now = new Date()) {
    const current = this.initialize(now);
    if (!current.sourceFingerprint || preflight.status !== "completed" || !validationRevision.trim()) return current;
    const blockedByKey = new Map(preflight.items.filter((item) => item.state === "blocked_case" && item.report?.blockers?.some((blocker) => blocker.code === "completion_over_90_days_operator_required" || blocker.code === "completion_date_portal_year_mismatch"))
      .map((item) => [item.customerKey, item] as const));
    const affected = current.items.filter((item) => item.state !== "deferred_operator" && blockedByKey.has(item.customerKey));
    if (affected.length === 0) return current;
    const commandId = `system:draft-execution:validation-operator-gates:${validationRevision}`;
    return this.transition("supervisor", commandId, now, {
      type: "validation_operator_gate_applied",
      customerKey: null,
      reason: `${affected.length} pratiche isolate dal nuovo gate di validazione ${validationRevision}; bozze e pagine già salvate restano conservate senza ulteriori azioni.`,
      nextAction: "Mostrare per ciascuna pratica data, giorni trascorsi, anno portale e azione richiesta all'operatore; proseguire solo con casi ancora eseguibili.",
      appliedRuleIds: [...new Set(affected.flatMap((item) => blockedByKey.get(item.customerKey)!.report!.blockers.flatMap((blocker) => blocker.appliedRuleIds)))],
    }, (next) => {
      for (const target of next.items.filter((item) => affected.some((candidate) => candidate.customerKey === item.customerKey))) {
        const source = blockedByKey.get(target.customerKey)!;
        const dateBlockers = source.report!.blockers.filter((blocker) => blocker.code === "completion_over_90_days_operator_required" || blocker.code === "completion_date_portal_year_mismatch");
        if (dateBlockers.length === 0) continue;
        target.state = "operator_intervention";
        target.operatorGateBlockers = dateBlockers.map((blocker) => ({
          code: blocker.code,
          reason: blocker.reason,
          sourceIds: [...blocker.sourceIds],
          appliedRuleIds: [...blocker.appliedRuleIds],
        }));
        target.reason = dateBlockers.map((blocker) => blocker.reason).join(" ");
        target.nextAction = "Operatore: verificare la procedibilità entro 90 giorni e selezionare il portale ENEA dell'anno corretto; poi rimettere la pratica in Pronte da fare. Non modificare la data sorgente.";
      }
      next.currentCustomerKey = null;
      next.status = next.items.every((item) => ["saved", "operator_intervention", "deferred_operator"].includes(item.state)) ? "completed" : "ready";
    });
  }

  releaseResolvedDateOperatorGates(readyCustomerKeys: readonly string[], validationRevision: string, now = new Date()) {
    const current = this.initialize(now);
    if (!current.sourceFingerprint || !validationRevision.trim()) return current;
    const ready = new Set(readyCustomerKeys);
    const dateCodes = new Set(["completion_over_90_days_operator_required", "completion_date_portal_year_mismatch"]);
    const affected = current.items.filter((item) => item.state === "operator_intervention"
      && ready.has(item.customerKey)
      && item.operatorGateBlockers.length > 0
      && item.operatorGateBlockers.every((blocker) => dateCodes.has(blocker.code)));
    if (affected.length === 0) return current;
    const commandId = `system:draft-execution:validation-operator-gates-released:${validationRevision}`;
    return this.transition("supervisor", commandId, now, {
      type: "validation_operator_gate_released",
      customerKey: null,
      reason: `${affected.length} gate data rimossi dopo ${validationRevision}; bozze e checkpoint esistenti riusati senza duplicazione.`,
      nextAction: "Conservare le bozze complete come salvate; riprendere soltanto le pagine realmente incomplete della stessa bozza.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.enea2026June25NinetyDayWindow, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      for (const target of next.items.filter((item) => affected.some((candidate) => candidate.customerKey === item.customerKey))) {
        const complete = Boolean(target.draftId && target.savedAt)
          && target.expectedPageIds.every((pageId) => target.completedPageIds.includes(pageId));
        target.operatorGateBlockers = [];
        target.state = complete ? "saved" : target.draftId ? "filling" : "queued";
        target.reason = complete
          ? "Bozza completa e salvata; gate data rimosso dalla finestra ufficiale ENEA 2026."
          : "Gate data rimosso dalla finestra ufficiale ENEA 2026; ripresa idempotente dalla stessa bozza e dal primo checkpoint incompleto.";
        target.nextAction = complete
          ? "Nessuna azione esterna ulteriore: anteprima e submit restano vietati."
          : "Riprendere dalla prima pagina non salvata senza creare una nuova bozza.";
      }
      next.currentCustomerKey = null;
      next.status = next.items.every((item) => ["saved", "operator_intervention", "deferred_operator"].includes(item.state)) ? "completed" : "ready";
    });
  }

  appendEligiblePackages(packages: readonly AprEneaDraftPackage[], sourceFingerprint: string, now = new Date()) {
    const current = this.initialize(now);
    if (!current.sourceFingerprint || !sourceFingerprint.trim()) return current;
    const existing = new Set(current.items.map((item) => item.customerKey));
    const eligible = packages.filter((item) => !existing.has(item.customerKey));
    if (eligible.length === 0) return current;
    if (new Set(eligible.map((item) => item.customerKey)).size !== eligible.length
      || eligible.some((item) => item.safety.previewAllowed !== false || item.safety.submitAllowed !== false || item.safety.communicationsAllowed !== false)) {
      throw new Error("enea_draft_execution_append_packages_invalid");
    }
    const sourceRevisionFingerprint = fingerprint({
      sourceFingerprint,
      packages: eligible.map((item) => ({ customerKey: item.customerKey, packageFingerprint: item.packageFingerprint, workflowFingerprint: item.workflowFingerprint })),
    });
    return this.transition("supervisor", `system:draft-execution:append-packages:${sourceRevisionFingerprint}`, now, {
      type: "validation_eligible_cases_appended",
      customerKey: null,
      reason: `${eligible.length} pacchetti TEST del modulo aggiunti alla coda mista senza sostituzioni o duplicazioni.`,
      nextAction: "APR prosegue in sequenza dal primo pacchetto non ancora lavorato.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      next.sourceRevisionFingerprints.push(sourceRevisionFingerprint);
      next.items.push(...eligible.map((draftPackage) => draftItemFromPackage(draftPackage)));
      if (["completed", "blocked_preflight"].includes(next.status)) next.status = "ready";
    });
  }

  recordLoginRequired(reason: string, serverEvidenceId: string, commandId: string, now = new Date()) {
    if (!reason.trim() || !serverEvidenceId.trim()) throw new Error("enea_login_evidence_required");
    return this.transition("enea-session", commandId, now, {
      type: "login_required",
      customerKey: null,
      reason,
      nextAction: "L'utente completa SPID/CIE nella scheda ENEA già aperta; APR riprende dallo stesso checkpoint.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive, SYSTEM_RESUME_RULE],
    }, (next) => {
      next.status = "login_required";
      next.sessionEvidenceId = serverEvidenceId;
      next.sessionVerifiedAt = now.toISOString();
    });
  }

  recordSessionReady(serverEvidenceId: string, commandId: string, now = new Date()) {
    if (!serverEvidenceId.trim()) throw new Error("enea_session_evidence_required");
    const before = this.snapshot(now);
    const cohortTerminal = before.items.length > 0
      && before.items.every((item) => ["saved", "operator_intervention", "deferred_operator"].includes(item.state));
    return this.transition("enea-session", commandId, now, {
      type: "session_ready",
      customerKey: null,
      reason: cohortTerminal
        ? "Sessione ENEA mantenuta attiva; coda conclusa con tutti i casi in stato terminale verificato."
        : "Sessione ENEA autenticata verificata da evidenza DOM/server; lease disponibile per la sola bozza TEST.",
      nextAction: cohortTerminal
        ? "Consultare il report; nessuna ulteriore azione ENEA consentita per questa coda."
        : "Registrare l'intento persistente di creazione della prima pratica in coda.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.authenticatedSessionKeepalive, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (!next.sourceFingerprint) throw new Error("enea_draft_execution_not_prepared");
      next.status = next.items.every((item) => ["saved", "operator_intervention", "deferred_operator"].includes(item.state)) ? "completed" : "ready";
      next.sessionEvidenceId = serverEvidenceId;
      next.sessionVerifiedAt = now.toISOString();
    });
  }

  recordCreateIntent(customerKey: string, commandId: string, now = new Date()) {
    return this.transition("enea-draft-runner", commandId, now, {
      type: "create_intent_recorded",
      customerKey,
      reason: `Intento persistente registrato prima dell'unico tentativo di creazione per ${customerKey}.`,
      nextAction: "Eseguire una sola creazione; se l'esito è incerto, fare discovery read-only senza ripetere.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.status !== "ready" || !next.sessionEvidenceId) throw new Error("enea_session_not_ready");
      const firstQueued = next.items.find((item) => item.state === "queued");
      if (!firstQueued || firstQueued.customerKey !== customerKey) throw new Error("enea_draft_queue_order_violation");
      if (next.currentCustomerKey && next.currentCustomerKey !== customerKey) throw new Error("enea_draft_other_case_active");
      if (firstQueued.createAttemptCount !== 0 && !firstQueued.recoverableCreateIntent) throw new Error("enea_draft_create_already_attempted");
      firstQueued.state = "create_intent_recorded";
      firstQueued.createIntentAt = now.toISOString();
      firstQueued.createAttemptCount = 1;
      const resumed = firstQueued.recoverableCreateIntent;
      firstQueued.recoverableCreateIntent = false;
      firstQueued.reason = resumed ? "Ripresa dello stesso intento: completare il wizard senza ripetere la creazione iniziale." : "Intento di creazione durevole; nessuna seconda creazione è consentita.";
      firstQueued.nextAction = resumed ? "Riprendere dal sotto-checkpoint wizard e acquisire l'ID bozza." : "Creare una sola bozza e registrarne immediatamente ID e URL.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
    });
  }

  recordDraftCreated(customerKey: string, draftId: string, portalUrl: string, serverEvidenceId: string, commandId: string, now = new Date()) {
    if (!draftId.trim() || !this.portalUrlAllowed(portalUrl) || !serverEvidenceId.trim()) throw new Error("enea_draft_created_evidence_invalid");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "draft_created",
      customerKey,
      reason: `Bozza ENEA ${draftId.trim()} individuata dal server dopo l'intento persistente; la stessa bozza sarà riusata.`,
      nextAction: "Compilare le pagine previste registrando un checkpoint dopo ciascuna.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "create_intent_recorded" || item.createAttemptCount !== 1) throw new Error("enea_draft_create_intent_missing");
      if (next.items.some((candidate) => candidate.customerKey !== customerKey && candidate.draftId === draftId.trim())) throw new Error("enea_draft_id_duplicate");
      item.state = "created";
      item.draftId = draftId.trim();
      item.portalUrl = portalUrl;
      item.createdAt = now.toISOString();
      item.serverEvidenceIds.push(serverEvidenceId.trim());
      item.reason = `Bozza ${draftId.trim()} creata e identificata; nessuna anteprima o submit.`;
      item.nextAction = "Compilare la stessa bozza dalle fonti congelate.";
    });
  }

  recordRequiredPageDiscovered(customerKey: string, draftId: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (pageId !== "page:Calcolo costi e detrazioni" || !evidenceId.trim()) throw new Error("enea_required_page_discovery_not_allowlisted");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "required_page_discovered",
      customerKey,
      reason: `Pagina obbligatoria ${pageId} osservata lato server e aggiunta al checkpoint della stessa bozza ${draftId}.`,
      nextAction: "Compilare il solo campo allowlist, rileggerlo e salvarlo una volta dopo intento persistente.",
      appliedRuleIds: ["core-screening-energy-savings", USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.draftId !== draftId || !["created", "filling"].includes(item.state)) throw new Error("enea_required_page_discovery_state_invalid");
      if (!item.expectedPageIds.includes(pageId)) item.expectedPageIds.push(pageId);
      if (!item.pageCheckpoints.some((checkpoint) => checkpoint.pageId === pageId)) {
        item.pageCheckpoints.push({ pageId, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null });
      }
      item.state = "filling";
      item.reason = `${item.completedPageIds.length}/${item.expectedPageIds.length} pagine salvate; pagina Calcolo obbligatoria ancora da completare.`;
      item.nextAction = "Applicare il calcolo versionato e salvare una sola volta la pagina Calcolo.";
    });
  }

  recordPagePrepared(customerKey: string, draftId: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!pageId.trim() || !evidenceId.trim()) throw new Error("enea_page_evidence_required");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "page_prepared",
      customerKey,
      reason: `Pagina ${pageId} compilata e verificata sulla stessa bozza ${draftId}.`,
      nextAction: "Proseguire dalla prima pagina non ancora registrata; non aprire anteprima.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || !["created", "filling"].includes(item.state) || item.draftId !== draftId) throw new Error("enea_draft_page_state_invalid");
      if (!item.expectedPageIds.includes(pageId)) throw new Error("enea_draft_page_not_allowlisted");
      const checkpoint = item.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!checkpoint || checkpoint.state !== "pending") throw new Error("enea_draft_page_prepare_state_invalid");
      item.state = "filling";
      checkpoint.state = "prepared";
      checkpoint.preparedEvidenceId = evidenceId.trim();
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.reason = `Pagina ${pageId} compilata e riletta; salvataggio non ancora tentato.`;
      item.nextAction = "Registrare l'intento persistente per il salvataggio di questa pagina.";
    });
  }

  recordPageSaveIntent(customerKey: string, draftId: string, pageId: string, commandId: string, now = new Date()) {
    return this.transition("enea-draft-runner", commandId, now, {
      type: "page_save_intent_recorded",
      customerKey,
      reason: `Intento persistente registrato prima dell'unico salvataggio della pagina ${pageId}.`,
      nextAction: "Salvare una sola volta; se l'esito è incerto, verificare lato server senza ripetere.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "filling" || item.draftId !== draftId) throw new Error("enea_draft_page_save_state_invalid");
      const checkpoint = item.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!checkpoint || checkpoint.state !== "prepared") throw new Error("enea_draft_page_save_intent_invalid");
      const firstAttempt = checkpoint.saveAttemptCount === 0 && checkpoint.recoverySaveAttemptCount === 0;
      const authorizedRecovery = checkpoint.saveAttemptCount === 1
        && checkpoint.recoverySaveAttemptCount === 0
        && Boolean(checkpoint.recoveryAuthorizedEvidenceId)
        && ((item.uncertainPageSave?.pageId === pageId && item.uncertainPageSave.status === "recovery_authorized")
          || (pageId.startsWith("screening:") && item.serverEvidenceIds.includes(checkpoint.recoveryAuthorizedEvidenceId!)));
      if (!firstAttempt && !authorizedRecovery) throw new Error("enea_draft_page_save_intent_invalid");
      checkpoint.state = "save_intent_recorded";
      if (firstAttempt) checkpoint.saveAttemptCount = 1;
      else checkpoint.recoverySaveAttemptCount = 1;
      item.state = "save_intent_recorded";
      item.reason = authorizedRecovery ? `Recupero singolo della pagina ${pageId} autorizzato da prova operatore che il primo Salva non era persistito.` : `Intento durevole della pagina ${pageId}; nessun retry alla cieca.`;
      item.nextAction = authorizedRecovery ? "Eseguire l'unico salvataggio di recupero e acquisire prova server; nessun ulteriore tentativo." : "Eseguire un solo salvataggio pagina e acquisire prova server.";
    });
  }

  recordPageSaved(customerKey: string, draftId: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!evidenceId.trim()) throw new Error("enea_page_saved_evidence_required");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "page_saved",
      customerKey,
      reason: `Pagina ${pageId} salvata una sola volta e verificata lato server sulla bozza ${draftId}.`,
      nextAction: "Riprendere dalla prima pagina non salvata; non aprire anteprima.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "save_intent_recorded" || item.draftId !== draftId) throw new Error("enea_draft_page_save_intent_missing");
      const checkpoint = item.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1) throw new Error("enea_draft_page_save_intent_missing");
      checkpoint.state = "saved";
      checkpoint.stagedEvidenceId = null;
      checkpoint.savedEvidenceId = evidenceId.trim();
      if (item.uncertainPageSave?.pageId === pageId) {
        item.uncertainPageSave.status = "resolved_saved";
        item.uncertainPageSave.reason = "Pagina verificata salvata dopo il percorso di recupero auditato.";
        item.uncertainPageSave.nextAction = "Riprendere dalla pagina successiva senza altri tentativi sulla pagina risolta.";
      }
      item.state = "filling";
      if (!item.completedPageIds.includes(pageId)) item.completedPageIds.push(pageId);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.reason = `${item.completedPageIds.length}/${item.expectedPageIds.length} pagine salvate e verificate.`;
      item.nextAction = item.completedPageIds.length === item.expectedPageIds.length ? "Registrare il gate finale di verifica della bozza." : "Riprendere dalla prossima pagina non salvata.";
    });
  }

  recordNestedPageStaged(customerKey: string, draftId: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if ((!/Generatore/.test(pageId) && !pageId.startsWith("screening:") && pageId !== "page:Allocazione costi e detrazioni") || !evidenceId.trim()) throw new Error("enea_nested_page_stage_invalid");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "nested_page_staged",
      customerKey,
      reason: `Sottofinestra ${pageId} confermata nello stato della pagina; persistenza server differita al successivo Salva esterno.`,
      nextAction: "Proseguire senza ricaricare la route, eseguire il solo Salva esterno e verificare entrambi lato server.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "save_intent_recorded" || item.draftId !== draftId) throw new Error("enea_nested_page_stage_intent_missing");
      const checkpoint = item.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1) throw new Error("enea_nested_page_stage_intent_missing");
      checkpoint.state = "staged";
      checkpoint.stagedEvidenceId = evidenceId.trim();
      checkpoint.savedEvidenceId = null;
      if (item.uncertainPageSave?.pageId === pageId) {
        item.uncertainPageSave.status = "resolved_staged";
        item.uncertainPageSave.reason = "Pagina annidata presente nella tabella, ma non ancora persistita dal Salva esterno.";
        item.uncertainPageSave.nextAction = "Proseguire fino al Salva esterno e richiedere prova server conclusiva.";
      }
      item.state = "filling";
      // Il click del modale Allocazione non e una prova server: non emette
      // richieste mutative. La prova server viene aggiunta soltanto dopo il
      // Salva esterno della pagina Calcolo.
      if (pageId !== "page:Allocazione costi e detrazioni" && !item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.reason = `${pageId} inserita nella tabella; non ancora conteggiata come salvata finché il Salva esterno non è confermato dal server.`;
      item.nextAction = pageId === "page:Allocazione costi e detrazioni" ? "Proseguire direttamente con Calcolo costi e detrazioni senza ricaricare la pagina." : "Proseguire direttamente con la pagina esterna senza ricaricare la route.";
    });
  }

  recordNestedPageServerVerifiedAfterOuterSave(customerKey: string, draftId: string, nestedPageId: string, outerPageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!evidenceId.trim()) throw new Error("enea_nested_page_outer_server_evidence_required");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "nested_page_server_verified_after_outer_save",
      customerKey,
      reason: `${nestedPageId} verificata lato server dopo l'unico Salva di ${outerPageId}.`,
      nextAction: "Registrare la pagina esterna salvata senza ripetere alcun comando.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const nested = item?.pageCheckpoints.find((candidate) => candidate.pageId === nestedPageId);
      const outer = item?.pageCheckpoints.find((candidate) => candidate.pageId === outerPageId);
      if (!item || item.draftId !== draftId || item.state !== "save_intent_recorded" || !nested || nested.state !== "staged" || !nested.stagedEvidenceId || !outer || outer.state !== "save_intent_recorded") throw new Error("enea_nested_page_outer_server_state_invalid");
      nested.state = "saved";
      nested.savedEvidenceId = evidenceId.trim();
      if (!item.completedPageIds.includes(nestedPageId)) item.completedPageIds.push(nestedPageId);
      if (item.uncertainPageSave?.pageId === nestedPageId) {
        item.uncertainPageSave.status = "resolved_saved";
        item.uncertainPageSave.reason = "La riga staged è stata confermata persistita dalla GET successiva al Salva esterno.";
        item.uncertainPageSave.nextAction = "Proseguire senza ulteriori tentativi sulla riga verificata.";
      }
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
    });
  }

  recordSaveIntent(customerKey: string, draftId: string, commandId: string, now = new Date()) {
    return this.transition("enea-draft-runner", commandId, now, {
      type: "save_intent_recorded",
      customerKey,
      reason: `Intento di salvataggio registrato per la bozza ${draftId}; anteprima e submit restano disabilitati.`,
      nextAction: "Eseguire un solo salvataggio e verificarne lo stato server; nessun retry alla cieca.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "filling" || item.draftId !== draftId) throw new Error("enea_draft_save_state_invalid");
      if (requiresFinalCalculationPage(item) && !item.expectedPageIds.includes("page:Calcolo costi e detrazioni")) throw new Error("enea_draft_final_calculation_page_missing");
      if (item.expectedPageIds.some((pageId) => !item.completedPageIds.includes(pageId))) throw new Error("enea_draft_pages_incomplete");
      if (item.pageCheckpoints.some((checkpoint) => checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1)) throw new Error("enea_draft_page_saves_incomplete");
      if (item.saveAttemptCount !== 0) throw new Error("enea_draft_save_already_attempted");
      item.state = "save_intent_recorded";
      item.saveIntentAt = now.toISOString();
      item.saveAttemptCount = 1;
      item.reason = "Intento di salvataggio durevole; in caso di esito incerto è ammessa soltanto verifica read-only.";
      item.nextAction = "Salvare una sola volta e acquisire prova server della bozza salvata.";
    });
  }

  recordDraftSaved(customerKey: string, draftId: string, portalUrl: string, serverEvidenceId: string, commandId: string, now = new Date()) {
    if (!this.portalUrlAllowed(portalUrl) || !serverEvidenceId.trim()) throw new Error("enea_draft_saved_evidence_invalid");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "draft_saved",
      customerKey,
      reason: `Bozza ENEA ${draftId} completa e salvata verificata lato server; TEST fermato prima di anteprima e submit.`,
      nextAction: "Rilasciare la pratica e passare alla successiva soltanto con una nuova sessione verificata.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "save_intent_recorded" || item.draftId !== draftId || item.saveAttemptCount !== 1) throw new Error("enea_draft_save_intent_missing");
      if (requiresFinalCalculationPage(item) && !item.expectedPageIds.includes("page:Calcolo costi e detrazioni")) throw new Error("enea_draft_final_calculation_page_missing");
      if (item.completedPageIds.length !== item.expectedPageIds.length || item.expectedPageIds.some((pageId) => !item.completedPageIds.includes(pageId))) throw new Error("enea_draft_pages_incomplete");
      if (item.pageCheckpoints.some((checkpoint) => checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1 || !checkpoint.savedEvidenceId)) throw new Error("enea_draft_page_evidence_incomplete");
      item.state = "saved";
      item.portalUrl = portalUrl;
      item.savedAt = now.toISOString();
      if (!item.serverEvidenceIds.includes(serverEvidenceId.trim())) item.serverEvidenceIds.push(serverEvidenceId.trim());
      item.reason = "Bozza completa e salvata; anteprima, submit e comunicazioni non eseguiti.";
      item.nextAction = "Nessuna altra azione su questa bozza TEST.";
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  recordOperatorIntervention(customerKey: string | null, reason: string, nextAction: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!reason.trim() || !nextAction.trim() || !evidenceId.trim()) throw new Error("enea_operator_intervention_evidence_required");
    return this.transition("enea-draft-runner", commandId, now, {
      type: "operator_intervention",
      customerKey,
      reason,
      nextAction,
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (customerKey) {
        const item = next.items.find((candidate) => candidate.customerKey === customerKey);
        if (!item) throw new Error("enea_draft_customer_not_found");
        item.state = "operator_intervention";
        item.reason = reason;
        item.nextAction = nextAction;
        if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      }
      next.status = "operator_intervention";
    });
  }

  recordCaseBlockedAndContinue(customerKey: string, reason: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!reason.trim() || !evidenceId.trim()) throw new Error("enea_case_block_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "case_blocked_continuing",
      customerKey,
      reason,
      nextAction: "Il caso resta isolato per revisione; APR passa automaticamente alla pratica successiva.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state === "saved" || item.state === "deferred_operator") throw new Error("enea_case_block_state_invalid");
      item.state = "operator_intervention";
      item.reason = reason;
      item.nextAction = "Richiesto intervento operatore; nessun retry automatico sul caso.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  resumePreExternalPackageFailures(preflight: PreflightSnapshot, commandId: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.processedCommandIds.includes(commandId)) return current;
    const readyByKey = new Map(preflight.items.filter((item) => item.state === "ready_local_plan"
      && item.report?.eneaPayloadAudit?.draftReady && item.report.eneaPayloadAudit.portalGate.status === "ready")
      .map((item) => [item.customerKey, item]));
    const recoverable = current.items.filter((item) => item.state === "operator_intervention"
      && item.reason === "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready"
      && !item.draftId && !item.portalUrl && item.createAttemptCount === 1 && item.saveAttemptCount === 0
      && item.completedPageIds.length === 0 && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
      && readyByKey.get(item.customerKey)?.report?.eneaPayloadAudit?.mappingFingerprint === item.mappingFingerprint
      && readyByKey.get(item.customerKey)?.report?.eneaPayloadAudit?.portalGate.workflowFingerprint === item.workflowFingerprint);
    if (!recoverable.length) return current;
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "pre_external_package_failure_requeued",
      customerKey: null,
      reason: `${recoverable.length} casi riaccodati dopo riallineamento del validatore; nessun comando browser o tentativo esterno era stato eseguito.`,
      nextAction: "Riprendere dalla validazione del pacchetto corrente prima dell'unico intento esterno.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      for (const item of next.items) if (recoverable.some((candidate) => candidate.customerKey === item.customerKey)) {
        item.state = "queued";
        item.createAttemptCount = 0;
        item.createIntentAt = null;
        item.reason = "Pacchetto nuovamente verde dopo riallineamento locale; nessuna creazione ENEA precedente.";
        item.nextAction = "Attendere il proprio turno e registrare un nuovo intento persistente prima della prima azione esterna.";
      }
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  resumeInfissiPackageAvailabilityFailures(packages: readonly AprEneaDraftPackage[], evidenceId: string, commandId: string, now = new Date()) {
    if (!evidenceId.trim()) throw new Error("enea_infissi_package_recovery_evidence_invalid");
    const current = this.initialize(now);
    if (current.processedCommandIds.includes(commandId)) return current;
    const packagesByKey = new Map(packages.filter((item) => item.module === "infissi").map((item) => [item.customerKey, item]));
    const recoverable = current.items.filter((item) => packagesByKey.has(item.customerKey)
      && item.state === "operator_intervention"
      && item.reason === "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready"
      && item.createAttemptCount === 1
      && item.saveAttemptCount === 0
      && item.completedPageIds.length === 0
      && item.pageCheckpoints.every((checkpoint) => ["pending", "prepared"].includes(checkpoint.state) && checkpoint.saveAttemptCount === 0));
    if (!recoverable.length) return current;
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "infissi_package_availability_failure_requeued",
      customerKey: null,
      reason: `${recoverable.length} casi Infissi riaccodati dopo il completamento stabile di tutte le revisioni locali; bozze esistenti preservate e nessuna duplicazione.`,
      nextAction: "Riprendere prima la bozza gia materializzata, poi i casi senza ID secondo l'ordine della coda.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const withDraft = recoverable.find((item) => Boolean(item.draftId));
      for (const candidate of recoverable) {
        const item = next.items.find((value) => value.customerKey === candidate.customerKey)!;
        const draftPackage = packagesByKey.get(candidate.customerKey)!;
        item.mappingFingerprint = draftPackage.packageFingerprint;
        item.workflowFingerprint = draftPackage.workflowFingerprint;
        item.requiredPortalFieldCount = draftPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0)
          + draftPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0);
        item.expectedPageIds = expectedPageIdsFromPackage(draftPackage);
        item.pageCheckpoints = item.expectedPageIds.map((pageId) => ({
          pageId,
          state: "pending" as const,
          saveAttemptCount: 0 as const,
          recoverySaveAttemptCount: 0 as const,
          recoveryAuthorizedEvidenceId: item.draftId && pageId === item.expectedPageIds[0] ? evidenceId.trim() : null,
          preparedEvidenceId: null,
          savedEvidenceId: null,
        }));
        if (item.draftId) {
          item.state = "created";
          item.reason = "Bozza esistente ripresa prima di qualunque Salva dopo stabilizzazione del pacchetto Infissi.";
          item.nextAction = "Riprendere dalla prima pagina pendente della stessa bozza.";
          if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
        } else {
          item.state = "queued";
          item.createAttemptCount = 0;
          item.createIntentAt = null;
          item.reason = "Pacchetto Infissi stabile prima di qualunque creazione ENEA; caso riaccodato.";
          item.nextAction = "Attendere il proprio turno e registrare il primo intento di creazione.";
        }
      }
      next.currentCustomerKey = withDraft?.customerKey ?? null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = withDraft ? "running" : "ready";
    });
  }

  resumeFinalDraftVerificationFromServerEvidence(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_final_draft_evidence_recovery_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "final_draft_server_evidence_recovered",
      customerKey,
      reason: "Catena completa di prove server già acquisita recuperata dal journal; nessun Salva viene ripetuto.",
      nextAction: "Registrare la bozza salvata usando la prova finale del riepilogo server già presente.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_final_draft_evidence_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 1 || !/Bozza completa e salvata non dimostrabile lato server/.test(item.reason) || item.pageCheckpoints.length === 0 || item.pageCheckpoints.some((checkpoint) => checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1 || !checkpoint.savedEvidenceId) || item.completedPageIds.length !== item.expectedPageIds.length) throw new Error(`enea_final_draft_evidence_recovery_state_invalid:${customerKey}`);
      item.state = "save_intent_recorded";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.reason = "Prova finale server recuperata dal journal; verifica conclusiva read-only pronta, senza secondo Salva.";
      item.nextAction = "Convalidare la catena di prove e chiudere la bozza TEST prima di anteprima e submit.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  recordDraftSavedFromDurableCheckpoint(customerKey: string, finalUrl: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !finalUrl.trim() || !evidenceId.trim()) throw new Error("enea_final_draft_checkpoint_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "draft_saved_from_durable_checkpoint",
      customerKey,
      reason: "Bozza completa confermata dal checkpoint per-pagina e dal redirect server finale gia acquisito; nessun Salva ripetuto.",
      nextAction: "Fermarsi alla bozza salvata; anteprima, submit e comunicazioni restano vietati.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_final_draft_checkpoint_evidence_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const calculation = item?.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Calcolo costi e detrazioni");
      let parsed: URL;
      try { parsed = new URL(finalUrl); } catch { throw new Error("enea_final_draft_checkpoint_url_invalid"); }
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 1
        || !/Bozza completa e salvata non dimostrabile lato server/.test(item.reason)
        || item.pageCheckpoints.length === 0
        || item.pageCheckpoints.some((checkpoint) => checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1 || !checkpoint.savedEvidenceId)
        || item.completedPageIds.length !== item.expectedPageIds.length
        || !calculation
        || calculation.savedEvidenceId !== evidenceId.trim()
        || parsed.origin !== "https://bonusfiscali.enea.it"
        || parsed.pathname !== `/pratica/ecobonus/2026/riepilogo/${item.draftId}`) throw new Error(`enea_final_draft_checkpoint_evidence_state_invalid:${customerKey}`);
      item.state = "saved";
      item.portalUrl = finalUrl;
      item.savedAt = now.toISOString();
      item.reason = "Bozza completa e salvata; prova finale recuperata dal checkpoint durevole senza ripetere azioni ENEA.";
      item.nextAction = "Nessuna anteprima o invio; pratica TEST conclusa alla bozza.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  recordUncertainPageSaveDetected(customerKey: string, pageId: string, reason: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !reason.trim() || !evidenceId.trim()) throw new Error("enea_uncertain_page_save_detection_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_detected",
      customerKey,
      reason: `Esito incerto dopo l'unico Salva di ${pageId}: ${reason}`,
      nextAction: "Eseguire soltanto le prove read-only registrate; nessun secondo Salva senza decisione operatore provata.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item || !item.draftId || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || item.state !== "save_intent_recorded") throw new Error("enea_uncertain_page_save_detection_state_invalid");
      item.uncertainPageSave = {
        pageId,
        status: "probing",
        detectedAt: now.toISOString(),
        detectedEvidenceId: evidenceId.trim(),
        probes: [],
        operatorDecision: null,
        reason: `Esito del Salva su ${pageId} non dimostrato.`,
        nextAction: "Raccogliere redirect server, persistenza campi GET e metadati server in sola lettura.",
      };
      item.state = "operator_intervention";
      item.reason = `Esito tecnico incerto dopo il Salva di ${pageId}; nessun retry automatico.`;
      item.nextAction = "APR esegue tre prove read-only; se inconcludenti richiede decisione operatore.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  migrateLegacyUncertainPageSave(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !evidenceId.trim()) throw new Error("enea_legacy_uncertain_page_save_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "legacy_uncertain_page_save_migrated",
      customerKey,
      reason: `Checkpoint legacy di ${pageId} convertito nel gate strutturato di salvataggio incerto.`,
      nextAction: "Eseguire soltanto le tre prove read-only; nessun nuovo Salva durante la migrazione.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.uncertainPageSave || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0) throw new Error("enea_legacy_uncertain_page_save_state_invalid");
      item.uncertainPageSave = {
        pageId,
        status: "probing",
        detectedAt: now.toISOString(),
        detectedEvidenceId: evidenceId.trim(),
        probes: [],
        operatorDecision: null,
        reason: `Checkpoint legacy: esito del Salva su ${pageId} non ancora dimostrato.`,
        nextAction: "Raccogliere redirect server, persistenza campi GET e metadati server in sola lettura.",
      };
      item.reason = `Checkpoint legacy migrato: esito tecnico incerto dopo il Salva di ${pageId}; nessun retry automatico.`;
      item.nextAction = "APR esegue tre prove read-only; se inconcludenti richiede decisione operatore.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  requeueLegacyUncertainPageSaveProbesAfterMappingRepair(customerKey: string, mappingEvidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !mappingEvidenceId.trim()) throw new Error("enea_legacy_uncertain_page_save_mapping_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "legacy_uncertain_page_save_probes_requeued_after_mapping_repair",
      customerKey,
      reason: "Associazione locale cliente↔bozza ripristinata con GET della stessa bozza; sonde tecniche nuovamente eseguibili.",
      nextAction: "Ripetere soltanto le tre letture tecniche; nessun nuovo Salva.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "operator_required" || resolution.operatorDecision || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || resolution.probes.length !== 3 || !resolution.probes.every((probe) => probe.outcome === "inconclusive" && /apr_cdp_enea_mapping_missing/.test(probe.reason))) throw new Error("enea_legacy_uncertain_page_save_mapping_repair_state_invalid");
      resolution.status = "probing";
      resolution.probes = [];
      resolution.reason = "Associazione locale della stessa bozza ripristinata; prove read-only da ripetere.";
      resolution.nextAction = "Acquisire redirect, campi persistiti e metadati server senza alcun Salva.";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(mappingEvidenceId.trim())) item.serverEvidenceIds.push(mappingEvidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  requeueTransientUncertainPageSaveProbe(customerKey: string, method: AprUncertainPageSaveProbe["method"], commandId: string, now = new Date()) {
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_transient_probe_requeued",
      customerKey,
      reason: `La prova read-only ${method} era inconcludente per un timeout di trasporto; viene ripetuta senza alcun nuovo Salva.`,
      nextAction: "Ripetere soltanto la lettura server fallita e conservare immutato l'intento Salva già registrato.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const probe = resolution?.probes.find((candidate) => candidate.method === method);
      const retryCount = resolution?.transientProbeRetryCounts?.[method] ?? 0;
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "probing" || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || retryCount !== 0 || !probe || probe.outcome !== "inconclusive" || !/apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000)/.test(probe.reason)) throw new Error("enea_uncertain_page_save_transient_probe_requeue_state_invalid");
      resolution.transientProbeRetryCounts ??= {};
      resolution.transientProbeRetryCounts[method] = 1;
      resolution.probes = resolution.probes.filter((candidate) => candidate.method !== method);
      resolution.reason = `Prova ${method} riaperta dopo timeout di trasporto; nessun nuovo Salva autorizzato.`;
      resolution.nextAction = "Ripetere la sola lettura server e classificare la persistenza della pagina.";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  requeueUncertainInfissiRowProbesAfterClassifierCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!evidenceId.trim()) throw new Error("enea_uncertain_infissi_classifier_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_infissi_row_probes_requeued_after_classifier_correction",
      customerKey,
      reason: "La tabella server Infissi provava N-1 righe ma il classificatore generico trattava la riga N assente come inconclusiva; riaperte soltanto le sonde read-only.",
      nextAction: "Rileggere la stessa tabella server; autorizzare un recupero soltanto se l'assenza della riga N è confermata.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const persistedProbe = resolution?.probes.find((probe) => probe.method === "persisted_fields_get");
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "operator_required" || !resolution.pageId.startsWith("screening:") || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || resolution.probes.length !== 3 || !resolution.probes.every((probe) => probe.outcome === "inconclusive") || !persistedProbe || !/^0\/\d+ campi coincidono: prova non conclusiva\.$/.test(persistedProbe.reason)) throw new Error("enea_uncertain_infissi_classifier_requeue_state_invalid");
      resolution.status = "probing";
      resolution.probes = [];
      resolution.reason = "Classificatore riga Infissi corretto; prove read-only da ripetere sulla stessa tabella server.";
      resolution.nextAction = "Rileggere la cardinalità server senza alcun nuovo Salva.";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  authorizeUncertainPageSaveRecoveryFromServerProof(customerKey: string, commandId: string, now = new Date()) {
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_recovery_auto_authorized",
      customerKey,
      reason: "GET canonica della stessa bozza dimostra che la pagina non è persistita; autorizzato un solo Salva di recupero.",
      nextAction: "Riagganciare la stessa bozza ed eseguire un solo Salva di recupero; vietato ogni ulteriore tentativo.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const serverProof = resolution?.probes.find((probe) => probe.method === "persisted_fields_get"
        && probe.outcome === "not_saved"
        && typeof probe.url === "string"
        && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
        && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "operator_required" || resolution.operatorDecision || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || !serverProof) throw new Error("enea_uncertain_page_save_server_recovery_state_invalid");
      checkpoint.state = "pending";
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      checkpoint.recoveryAuthorizedEvidenceId = serverProof.evidenceId;
      resolution.status = "recovery_authorized";
      resolution.reason = "GET canonica della stessa bozza ha dimostrato che il primo Salva non era persistito; autorizzato un solo recupero automatico.";
      resolution.nextAction = "Eseguire un solo salvataggio di recupero; vietato ogni ulteriore tentativo.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  reclassifyPersistedFieldsProbeAsNotSaved(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim() || !commandId.trim()) throw new Error("enea_uncertain_page_save_reclassification_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_recovery_auto_authorized",
      customerKey,
      reason: "La GET canonica mostra vuoti tutti i campi identificativi; le sole coincidenze sono valori iniziali del portale. Il primo Salva non è persistito.",
      nextAction: "Eseguire un solo Salva di recupero sulla stessa bozza; vietato ogni ulteriore tentativo.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const probe = resolution?.probes.find((candidate) => candidate.method === "persisted_fields_get" && candidate.evidenceId === evidenceId);
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "operator_required" || resolution.operatorDecision || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || !probe || probe.outcome !== "inconclusive" || !probe.url?.split(/[?#]/, 1)[0].endsWith(`/${item.draftId}`)) throw new Error("enea_uncertain_page_save_reclassification_state_invalid");
      probe.outcome = "not_saved";
      probe.reason = "GET canonica: tutti i campi identificativi sono vuoti; soltanto valori iniziali del portale coincidono.";
      checkpoint.state = "pending";
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId;
      resolution.status = "recovery_authorized";
      resolution.reason = "GET canonica della stessa bozza dimostra che il primo Salva non è persistito; autorizzato un solo recupero automatico.";
      resolution.nextAction = "Eseguire un solo salvataggio di recupero; vietato ogni ulteriore tentativo.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueUnclickedUncertainPageSaveRecovery(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_uncertain_page_save_preclick_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_recovery_requeued_preclick",
      customerKey,
      reason: "Il recupero si è fermato prima del click perché il controllo Salva non era pronto; nessuna mutazione è stata emessa.",
      nextAction: "Ricompilare e verificare la pagina, poi usare l'unico recupero già autorizzato sulla stessa bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "recovery_authorized" || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 1 || !/apr_cdp_enea_unique_enabled_save_button_not_found:/.test(item.reason) || !item.serverEvidenceIds.includes(evidenceId.trim())) throw new Error("enea_uncertain_page_save_preclick_requeue_state_invalid");
      checkpoint.state = "pending";
      checkpoint.preparedEvidenceId = null;
      checkpoint.recoverySaveAttemptCount = 0;
      item.state = "recovery_queued";
      item.reason = "Recupero non emesso: la pagina sarà ricompilata e verificata prima dell'unico click autorizzato.";
      item.nextAction = "Riagganciare la stessa bozza, ricompilare la pagina e verificare il controllo Salva.";
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  recordUncertainPageSaveProbe(customerKey: string, probe: Omit<AprUncertainPageSaveProbe, "observedAt"> & { observedAt?: string }, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !probe.evidenceId.trim() || !probe.reason.trim()) throw new Error("enea_uncertain_page_save_probe_evidence_required");
    const currentDraftId = this.load().items.find((item) => item.customerKey === customerKey)?.draftId ?? null;
    const autoRecovery = probe.method === "persisted_fields_get"
      && probe.outcome === "not_saved"
      && typeof probe.url === "string"
      && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
      && probe.url.split(/[?#]/, 1)[0].endsWith(`/${currentDraftId ?? ""}`);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: probe.outcome === "saved" ? "uncertain_page_save_auto_resolved" : autoRecovery ? "uncertain_page_save_recovery_auto_authorized" : "uncertain_page_save_probe_recorded",
      customerKey,
      reason: `Prova read-only ${probe.method}: ${probe.outcome}. ${probe.reason}`,
      nextAction: probe.outcome === "saved" ? "Riaccodare la stessa bozza dalla pagina successiva senza ripetere Salva." : autoRecovery ? "Eseguire un solo Salva di recupero sulla stessa bozza." : "Completare le prove mancanti o richiedere una decisione operatore.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item || item.state !== "operator_intervention" || !resolution || !checkpoint || !["probing", "operator_required"].includes(resolution.status)) throw new Error("enea_uncertain_page_save_probe_state_invalid");
      if (resolution.probes.some((candidate) => candidate.method === probe.method)) throw new Error("enea_uncertain_page_save_probe_method_already_recorded");
      resolution.probes.push({ ...probe, observedAt: probe.observedAt ?? now.toISOString() });
      if (!item.serverEvidenceIds.includes(probe.evidenceId.trim())) item.serverEvidenceIds.push(probe.evidenceId.trim());
      if (probe.outcome === "saved") {
        checkpoint.state = "saved";
        checkpoint.savedEvidenceId = probe.evidenceId.trim();
        if (!item.completedPageIds.includes(resolution.pageId)) item.completedPageIds.push(resolution.pageId);
        resolution.status = "resolved_saved";
        resolution.reason = `${probe.method} ha dimostrato la persistenza server della pagina.`;
        resolution.nextAction = "Riprendere dalla pagina successiva senza ripetere il salvataggio risolto.";
        item.state = "recovery_queued";
        item.reason = `Pagina ${resolution.pageId} verificata salvata tramite ${probe.method}; bozza pronta alla ripresa.`;
        item.nextAction = "Riagganciare la stessa bozza e proseguire dalla prima pagina pendente.";
      } else {
        const allMethodsObserved = new Set(resolution.probes.map((candidate) => candidate.method)).size === 3;
        const conclusiveServerNotSaved = probe.method === "persisted_fields_get"
          && probe.outcome === "not_saved"
          && typeof probe.url === "string"
          && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
          && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item.draftId ?? ""}`);
        if (conclusiveServerNotSaved) {
          checkpoint.state = "pending";
          checkpoint.preparedEvidenceId = null;
          checkpoint.savedEvidenceId = null;
          checkpoint.recoveryAuthorizedEvidenceId = probe.evidenceId.trim();
          resolution.status = "recovery_authorized";
          resolution.reason = `${probe.method} sulla stessa bozza dimostra che la pagina non è persistita; autorizzato un solo recupero automatico.`;
          resolution.nextAction = "Eseguire un solo salvataggio di recupero; vietato ogni ulteriore tentativo.";
          item.state = "recovery_queued";
          item.reason = resolution.reason;
          item.nextAction = resolution.nextAction;
        } else if (probe.outcome === "not_saved" || allMethodsObserved) {
          resolution.status = "operator_required";
          resolution.reason = probe.outcome === "not_saved" ? `${probe.method} dimostra che la pagina non è persistita.` : "Tre prove read-only completate senza esito conclusivo.";
          resolution.nextAction = detailedUncertainSaveOperatorInstruction(item.draftId, resolution.pageId);
          item.reason = `Richiesto intervento operatore sulla pagina ${resolution.pageId}: ${resolution.reason}`;
          item.nextAction = resolution.nextAction;
        }
      }
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  upgradeUncertainPageSaveOperatorInstructions(commandId: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.processedCommandIds.includes(commandId)) return current;
    const candidates = current.items.filter((item) => item.state === "operator_intervention"
      && item.uncertainPageSave?.status === "operator_required"
      && !item.uncertainPageSave.operatorDecision
      && !item.uncertainPageSave.nextAction.startsWith("Aprire su ENEA la bozza"));
    if (!candidates.length) return current;
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "operator_instruction_upgraded",
      customerKey: null,
      reason: `${candidates.length} richieste operatore rese esplicite con bozza, pagina, controllo, risposte ammesse e conseguenza operativa.`,
      nextAction: "L'operatore puo eseguire il controllo senza interpretare messaggi tecnici interni.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      for (const candidate of candidates) {
        const item = next.items.find((value) => value.customerKey === candidate.customerKey)!;
        const resolution = item.uncertainPageSave!;
        const instruction = detailedUncertainSaveOperatorInstruction(item.draftId, resolution.pageId);
        resolution.nextAction = instruction;
        item.nextAction = instruction;
      }
    });
  }

  recordUncertainPageSaveOperatorDecision(customerKey: string, decision: "saved" | "not_saved" | "indeterminate", operatorId: string, evidenceId: string, note: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !operatorId.trim() || !evidenceId.trim() || !note.trim()) throw new Error("enea_uncertain_page_save_operator_evidence_required");
    return this.transition("apr-operator-gate", commandId, now, {
      type: "uncertain_page_save_operator_decision",
      customerKey,
      reason: `Decisione operatore ${decision} registrata con prova per il salvataggio incerto.`,
      nextAction: decision === "indeterminate" ? "Mantenere la pratica in Richiesto intervento operatore." : "Riprendere la stessa bozza dal checkpoint auditato.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item || item.state !== "operator_intervention" || !resolution || !checkpoint || !["probing", "operator_required"].includes(resolution.status) || resolution.operatorDecision) throw new Error("enea_uncertain_page_save_operator_state_invalid");
      resolution.operatorDecision = { decision, operatorId: operatorId.trim(), evidenceId: evidenceId.trim(), decidedAt: now.toISOString(), note: note.trim() };
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      if (decision === "saved") {
        checkpoint.state = "saved";
        checkpoint.savedEvidenceId = evidenceId.trim();
        if (!item.completedPageIds.includes(resolution.pageId)) item.completedPageIds.push(resolution.pageId);
        resolution.status = "resolved_saved";
        resolution.reason = "Operatore ha verificato con prova che la pagina era già salvata.";
        resolution.nextAction = "Riprendere dalla pagina successiva; nessun nuovo Salva sulla pagina risolta.";
        item.state = "recovery_queued";
      } else if (decision === "not_saved") {
        checkpoint.state = "pending";
        checkpoint.preparedEvidenceId = null;
        checkpoint.savedEvidenceId = null;
        checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
        resolution.status = "recovery_authorized";
        resolution.reason = "Operatore ha dimostrato che il primo Salva non era persistito; autorizzato un solo recupero.";
        resolution.nextAction = "Eseguire un solo salvataggio di recupero; vietato ogni ulteriore tentativo.";
        item.state = "recovery_queued";
      } else {
        resolution.status = "operator_required";
        resolution.reason = "L'operatore non può determinare l'esito del salvataggio.";
        resolution.nextAction = "Mantenere la pratica in Richiesto intervento operatore senza retry.";
        item.state = "operator_intervention";
      }
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  claimUncertainPageSaveRecovery(customerKey: string, commandId: string, now = new Date()) {
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_recovery_claimed",
      customerKey,
      reason: "Stessa bozza riagganciata dal checkpoint di salvataggio incerto risolto; nessuna nuova bozza.",
      nextAction: "Proseguire dalla pagina pendente o dall'unico recupero autorizzato.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.status !== "ready" || !next.sessionEvidenceId || next.currentCustomerKey) throw new Error("enea_uncertain_page_save_recovery_session_not_ready");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "recovery_queued" || !item.draftId || !item.uncertainPageSave || !["resolved_saved", "recovery_authorized"].includes(item.uncertainPageSave.status)) throw new Error("enea_uncertain_page_save_recovery_claim_invalid");
      item.state = "filling";
      item.reason = "Bozza esistente ripresa dal checkpoint auditato del salvataggio incerto.";
      item.nextAction = item.uncertainPageSave.status === "recovery_authorized" ? "Eseguire l'unico Salva di recupero autorizzato." : "Proseguire dalla prima pagina non salvata.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
    });
  }

  claimVerifiedPayloadCorrectionRecovery(customerKey: string, commandId: string, now = new Date()) {
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_payload_correction_claimed",
      customerKey,
      reason: "Stessa bozza riagganciata dopo correzione del payload verificata in sola lettura; nessuna nuova bozza.",
      nextAction: "Compilare soltanto la pagina corretta e riverificare la bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.status !== "ready" || !next.sessionEvidenceId || next.currentCustomerKey) throw new Error("enea_verified_payload_correction_session_not_ready");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const pending = item?.pageCheckpoints.filter((checkpoint) => checkpoint.state === "pending") ?? [];
      if (!item
        || item.state !== "recovery_queued"
        || !item.draftId
        || item.uncertainPageSave
        || pending.length !== 1
        || pending[0].saveAttemptCount !== 0
        || pending[0].recoverySaveAttemptCount !== 0
        || !pending[0].recoveryAuthorizedEvidenceId
        || item.pageCheckpoints.filter((checkpoint) => checkpoint !== pending[0]).some((checkpoint) => checkpoint.state !== "saved")) throw new Error("enea_verified_payload_correction_claim_invalid");
      item.state = "filling";
      item.reason = "Bozza esistente ripresa dal checkpoint della correzione verificata.";
      item.nextAction = `Compilare e salvare una sola volta ${pending[0].pageId}, quindi verificare la bozza completa.`;
      next.currentCustomerKey = customerKey;
      next.status = "running";
    });
  }

  recordUncertainPageSaveRecoveryFailed(customerKey: string, pageId: string, reason: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !reason.trim() || !evidenceId.trim()) throw new Error("enea_uncertain_page_save_recovery_failure_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_recovery_failed",
      customerKey,
      reason: `Esito incerto dopo l'unico recupero autorizzato di ${pageId}: ${reason}`,
      nextAction: "Richiesto intervento operatore; nessun ulteriore Salva è consentito.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item || item.state !== "save_intent_recorded" || !resolution || resolution.pageId !== pageId || resolution.status !== "recovery_authorized" || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 1) throw new Error("enea_uncertain_page_save_recovery_failure_state_invalid");
      resolution.status = "operator_required";
      resolution.reason = `Anche l'unico recupero autorizzato ha esito incerto: ${reason}`;
      resolution.nextAction = "Verificare manualmente la pagina sulla stessa bozza; nessun ulteriore Salva è consentito.";
      item.state = "operator_intervention";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  recordUncertainPageSaveRecoveryProbe(customerKey: string, probe: Omit<AprUncertainPageSaveProbe, "observedAt"> & { observedAt?: string }, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !probe.evidenceId.trim() || !probe.reason.trim()) throw new Error("enea_uncertain_page_save_recovery_probe_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: probe.outcome === "saved" ? "uncertain_page_save_recovery_probe_resolved" : "uncertain_page_save_recovery_probe_operator_required",
      customerKey,
      reason: `Verifica read-only dopo il recupero: ${probe.outcome}. ${probe.reason}`,
      nextAction: probe.outcome === "saved" ? "Riprendere dalla pagina successiva senza altri Salva sulla pagina risolta." : "Mantenere il caso in intervento operatore; nessun ulteriore Salva consentito.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item || item.state !== "operator_intervention" || !item.draftId || !resolution || resolution.status !== "operator_required" || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 1 || !/unico recupero autorizzato ha esito incerto/.test(item.reason)) throw new Error("enea_uncertain_page_save_recovery_probe_state_invalid");
      if (!item.serverEvidenceIds.includes(probe.evidenceId.trim())) item.serverEvidenceIds.push(probe.evidenceId.trim());
      if (probe.outcome === "saved") {
        checkpoint.state = "saved";
        checkpoint.savedEvidenceId = probe.evidenceId.trim();
        if (!item.completedPageIds.includes(resolution.pageId)) item.completedPageIds.push(resolution.pageId);
        resolution.status = "resolved_saved";
        resolution.reason = `${probe.method} ha dimostrato che l'unico recupero è stato persistito.`;
        resolution.nextAction = "Riprendere dalla pagina successiva; nessun altro Salva sulla pagina risolta.";
        item.state = "recovery_queued";
        item.reason = resolution.reason;
        item.nextAction = resolution.nextAction;
      } else {
        resolution.reason = probe.outcome === "not_saved" ? "La GET canonica dimostra che anche l'unico recupero non è persistito." : "La verifica read-only dopo l'unico recupero resta inconcludente.";
        resolution.nextAction = "Richiesto intervento operatore; nessun ulteriore Salva è consentito.";
        item.reason = resolution.reason;
        item.nextAction = resolution.nextAction;
      }
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = next.items.every((candidate) => ["saved", "operator_intervention", "deferred_operator"].includes(candidate.state)) ? "completed" : "ready";
    });
  }

  requeueCalculationAllocationAfterInputContractUpgrade(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_calculation_allocation_contract_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "calculation_allocation_input_contract_requeued",
      customerKey,
      reason: "Il contratto del campo importo 36% e stato aggiornato e collaudato: input utente reale con formato italiano, sulla stessa bozza.",
      nextAction: "Riprendere la stessa bozza dalla sola allocazione costi; conservare tutte le pagine gia verificate.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const canonicalNotSaved = resolution?.probes.find((probe) => probe.method === "persisted_fields_get"
        && probe.outcome === "not_saved"
        && typeof probe.url === "string"
        && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
        && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || !resolution
        || resolution.status !== "operator_required"
        || resolution.pageId !== "page:Allocazione costi e detrazioni"
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || !canonicalNotSaved
        || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") throw new Error("enea_calculation_allocation_contract_requeue_state_invalid");

      // I contatori sono per generazione del contratto di input. L'audit sopra
      // conserva i due tentativi della generazione precedente; la nuova
      // generazione è ammessa una sola volta dal commandId versionato.
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.recoverySaveAttemptCount = 0;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      resolution.status = "recovery_authorized";
      resolution.reason = "Contratto input 36% aggiornato dopo prova server di mancata persistenza; nuova generazione singola autorizzata.";
      resolution.nextAction = "Inserire l'importo con evento browser reale e formato italiano, poi un solo Salva verificato lato server.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueStandardPageAfterSaveDeliveryContractUpgrade(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_standard_save_delivery_contract_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "standard_save_delivery_contract_requeued",
      customerKey,
      reason: "Il contratto generale Salva e stato aggiornato e collaudato: fallback Enter attendibile solo dopo prova di zero richieste e zero navigazioni.",
      nextAction: "Riprendere la stessa bozza dalla pagina non persistita; nessuna nuova bozza e nessun secondo intento se il server ha ricevuto una richiesta.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const canonicalNotSaved = resolution?.probes.find((probe) => probe.method === "persisted_fields_get"
        && probe.outcome === "not_saved"
        && typeof probe.url === "string"
        && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
        && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || !resolution
        || resolution.status !== "operator_required"
        || resolution.pageId.startsWith("screening:")
        || resolution.pageId === "page:Allocazione costi e detrazioni"
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || !canonicalNotSaved
        || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") throw new Error("enea_standard_save_delivery_contract_requeue_state_invalid");

      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.recoverySaveAttemptCount = 0;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      resolution.status = "recovery_authorized";
      resolution.reason = "Consegna del Salva aggiornata dopo due tentativi senza alcuna richiesta server; nuova generazione singola autorizzata sulla stessa bozza.";
      resolution.nextAction = "Compilare la stessa pagina e consegnare lo stesso intento Salva col fallback attendibile protetto da prova zero-mutation.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueBeneficiaryAfterMunicipalityAutocompleteContractUpgrade(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_municipality_contract_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "municipality_autocomplete_contract_requeued",
      customerKey,
      reason: "Il selettore Comune e stato aggiornato e collaudato: APR usa la lente e la riga autorevole del portale, non il solo testo libero.",
      nextAction: "Riprendere la stessa bozza dall'Anagrafica e verificare lato server entrambi i Comuni selezionati.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const canonicalNotSaved = resolution?.probes.find((probe) => probe.method === "persisted_fields_get" && probe.outcome === "not_saved" && probe.url?.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0
        || !resolution || resolution.status !== "operator_required" || resolution.pageId !== "page:Anagrafica Beneficiario"
        || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId || !canonicalNotSaved) throw new Error("enea_municipality_contract_requeue_state_invalid");
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.recoverySaveAttemptCount = 0;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      resolution.status = "recovery_authorized";
      resolution.reason = "Selettore autorevole dei Comuni aggiornato dopo prova server di mancata persistenza.";
      resolution.nextAction = "Selezionare nascita e residenza dalla superficie autorevole del portale e salvare una sola volta.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  resumeCalculationAllocationReadOnlyVerificationAfterTransientSurface(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_calculation_allocation_transient_surface_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "calculation_allocation_transient_surface_reclassified",
      customerKey,
      reason: "La precedente GET non mostrava la tabella React: la prova not_saved era invalida e viene ripetuta esclusivamente in lettura.",
      nextAction: "Attendere la tabella caricata e verificare i valori server senza emettere un altro Salva.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const falseProof = resolution?.probes.find((probe) => probe.method === "persisted_fields_get" && probe.outcome === "not_saved");
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || !resolution
        || resolution.status !== "operator_required"
        || resolution.pageId !== "page:Allocazione costi e detrazioni"
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || !falseProof
        || !item.serverEvidenceIds.includes(evidenceId.trim())) throw new Error("enea_calculation_allocation_transient_surface_state_invalid");

      resolution.status = "probing";
      resolution.probes = [];
      resolution.reason = "Superficie React assente nella lettura precedente; nuova verifica server read-only in corso.";
      resolution.nextAction = "Attendere la tabella costi e classificare la persistenza senza alcun Salva.";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "completed";
    });
  }

  requeueCalculationAllocationAfterTrustedInputContractUpgrade(customerKey: string, modalEvidenceId: string, persistedEvidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !modalEvidenceId.trim() || !persistedEvidenceId.trim()) throw new Error("enea_calculation_allocation_trusted_input_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "calculation_allocation_trusted_input_requeued",
      customerKey,
      reason: "Il modale reale conferma un input React controllato: la digitazione attendibile deve prevalere senza una seconda chiamata sintetica onChange.",
      nextAction: "Eseguire una sola nuova generazione di recupero sulla stessa bozza e verificarla con GET server.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const persistedProbe = resolution?.probes.find((probe) => probe.method === "persisted_fields_get" && probe.evidenceId === persistedEvidenceId);
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || !resolution
        || resolution.status !== "operator_required"
        || resolution.pageId !== "page:Allocazione costi e detrazioni"
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || ((!persistedProbe || persistedProbe.outcome !== "inconclusive") && !item.serverEvidenceIds.includes(persistedEvidenceId.trim()))) throw new Error("enea_calculation_allocation_trusted_input_state_invalid");

      // Mantiene consumato il tentativo primario e autorizza esattamente un
      // solo recupero della nuova generazione: nessun percorso puo' produrre
      // un secondo click dopo questo upgrade.
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 1;
      checkpoint.recoverySaveAttemptCount = 0;
      checkpoint.recoveryAuthorizedEvidenceId = modalEvidenceId.trim();
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      resolution.status = "recovery_authorized";
      resolution.reason = "Contratto input attendibile aggiornato dopo GET che mostra ancora 50%=totale e 36%=0.";
      resolution.nextAction = "Digitare una volta con eventi browser reali, salvare una volta e verificare lato server.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(modalEvidenceId.trim())) item.serverEvidenceIds.push(modalEvidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  resumeAuthorizedRecoveryAfterMappingRepair(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_authorized_recovery_mapping_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "authorized_recovery_mapping_rebound",
      customerKey,
      reason: "La mappatura locale della stessa bozza e stata riallineata con una GET canonica; l'unico recupero gia autorizzato puo riprendere.",
      nextAction: "Riprendere la pagina pendente sulla stessa bozza, senza creare una nuova pratica e senza ripetere pagine salvate.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_authorized_recovery_mapping_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || !resolution
        || resolution.status !== "recovery_authorized"
        || !checkpoint
        || checkpoint.state !== "pending"
        || checkpoint.recoverySaveAttemptCount !== 0
        || !checkpoint.recoveryAuthorizedEvidenceId
        || !/apr_cdp_enea_mapping_missing/.test(item.reason)) throw new Error("enea_authorized_recovery_mapping_state_invalid");
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "recovery_queued";
      item.reason = "Mappatura della stessa bozza riallineata; recupero gia autorizzato nuovamente eseguibile dal checkpoint.";
      item.nextAction = "Ricompilare la sola pagina pendente e usare l'unico Salva consentito dopo verifica dei campi.";
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  resumeAuthorizedRecoveryAfterPackageAvailability(draftPackage: AprEneaDraftPackage, expectedMappingFingerprint: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!draftPackage.customerKey.trim() || !expectedMappingFingerprint.trim() || !evidenceId.trim()) throw new Error("enea_authorized_recovery_package_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "authorized_recovery_package_available",
      customerKey: draftPackage.customerKey,
      reason: "Il pacchetto locale e nuovamente disponibile e la stessa bozza e stata riassociata con GET; resta valido soltanto il recupero gia autorizzato.",
      nextAction: "Riprendere la pagina pendente della stessa bozza senza creare una nuova pratica e senza ampliare il numero di tentativi consentiti.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_authorized_recovery_package_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === draftPackage.customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.mappingFingerprint !== expectedMappingFingerprint
        || item.workflowFingerprint !== draftPackage.workflowFingerprint
        || !resolution
        || resolution.status !== "recovery_authorized"
        || !checkpoint
        || checkpoint.state !== "pending"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 0
        || !checkpoint.recoveryAuthorizedEvidenceId
        || item.reason !== "Errore circoscritto alla pratica: crm_enea_draft_package_not_ready") {
        throw new Error("enea_authorized_recovery_package_state_invalid");
      }
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "recovery_queued";
      item.reason = "Pacchetto locale nuovamente verde e stessa bozza verificata; unico recupero gia autorizzato nuovamente eseguibile.";
      item.nextAction = "Ricompilare la sola pagina pendente e usare l'unico Salva di recupero dopo la verifica dei campi.";
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  resumeAuthorizedRecoveryAfterTransientReadOnlyTimeout(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_authorized_recovery_timeout_evidence_required");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "authorized_recovery_transient_timeout_requeued",
      customerKey,
      reason: "Il timeout e avvenuto durante una lettura/preparazione precedente al click; l'unico recupero autorizzato non e stato consumato.",
      nextAction: "Riattivare una sola volta il recupero gia autorizzato sulla stessa pagina e sulla stessa bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_authorized_recovery_timeout_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || !resolution
        || resolution.status !== "recovery_authorized"
        || !checkpoint
        || checkpoint.state !== "pending"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 0
        || !checkpoint.recoveryAuthorizedEvidenceId
        || !/apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000:Inspected target navigated or closed)/.test(item.reason)) {
        throw new Error("enea_authorized_recovery_timeout_state_invalid");
      }
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "recovery_queued";
      item.reason = "Timeout pre-click isolato; recupero autorizzato ancora integro e riaccodato una sola volta.";
      item.nextAction = "Ripreparare la pagina e usare l'unico Salva di recupero soltanto dopo verifica dei campi.";
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueVerifiedPayloadCorrection(preflight: PreflightSnapshot, customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_verified_payload_correction_evidence_required");
    const updated = preflight.items.find((candidate) => candidate.customerKey === customerKey);
    const audit = updated?.report?.eneaPayloadAudit;
    if (updated?.state !== "ready_local_plan" || !audit?.draftReady || audit.portalGate.status !== "ready") throw new Error("enea_verified_payload_correction_preflight_invalid");
    const newMappingFingerprint = audit.mappingFingerprint;
    const newWorkflowFingerprint = audit.portalGate.workflowFingerprint;
    if (!newMappingFingerprint || !newWorkflowFingerprint) throw new Error("enea_verified_payload_correction_fingerprint_missing");
    const newExpectedPageIds = expectedPageIds(updated.report!);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_payload_correction_requeued",
      customerKey,
      reason: "Il payload e stato corretto da una regola verificata e il server prova che i dati precedenti non sono persistiti: stessa bozza riaccodata senza duplicarla.",
      nextAction: "Ricompilare la prima pagina con il nuovo fingerprint e consentire un solo Salva della nuova generazione.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const canonicalNotSaved = resolution?.probes.find((probe) => probe.method === "persisted_fields_get"
        && probe.outcome === "not_saved"
        && typeof probe.url === "string"
        && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
        && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || item.completedPageIds.length !== 0
        || !resolution
        || resolution.status !== "operator_required"
        || !/beneficiario/i.test(resolution.pageId)
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || !canonicalNotSaved
        || item.mappingFingerprint === newMappingFingerprint
        || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") throw new Error("enea_verified_payload_correction_requeue_state_invalid");

      item.mappingFingerprint = newMappingFingerprint;
      item.workflowFingerprint = newWorkflowFingerprint;
      item.requiredPortalFieldCount = audit.requiredPortalFieldCount;
      item.expectedPageIds = newExpectedPageIds;
      item.pageCheckpoints = newExpectedPageIds.map((pageId) => ({
        pageId,
        state: "pending",
        saveAttemptCount: 0,
        recoverySaveAttemptCount: 0,
        recoveryAuthorizedEvidenceId: pageId === resolution.pageId ? evidenceId.trim() : null,
        preparedEvidenceId: null,
        savedEvidenceId: null,
      }));
      resolution.status = "recovery_authorized";
      resolution.reason = `Nuovo payload verificato ${newMappingFingerprint}; la generazione precedente non era persistita.`;
      resolution.nextAction = "Ricompilare la stessa pagina sulla stessa bozza con i dati corretti e un solo Salva.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueVerifiedInfissiPackageCorrection(draftPackage: AprEneaDraftPackage, customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (draftPackage.module !== "infissi" || draftPackage.customerKey !== customerKey || !evidenceId.trim()) throw new Error("enea_verified_infissi_package_correction_invalid");
    const newExpectedPageIds = expectedPageIdsFromPackage(draftPackage);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_infissi_package_correction_requeued",
      customerKey,
      reason: "Il mapping anagrafico Infissi e stato corretto e la GET canonica prova che il tentativo precedente non ha persistito dati: stessa bozza riaccodata.",
      nextAction: "Ricompilare la pagina Beneficiario con il nuovo fingerprint, poi proseguire senza duplicare la bozza.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const canonicalNotSaved = resolution?.probes.find((probe) => probe.method === "persisted_fields_get"
        && probe.outcome === "not_saved"
        && typeof probe.url === "string"
        && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || item.completedPageIds.length !== 0
        || !resolution
        || resolution.status !== "operator_required"
        || !/beneficiario/i.test(resolution.pageId)
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || !canonicalNotSaved
        || item.mappingFingerprint === draftPackage.packageFingerprint
        || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") throw new Error("enea_verified_infissi_package_correction_state_invalid");

      item.mappingFingerprint = draftPackage.packageFingerprint;
      item.workflowFingerprint = draftPackage.workflowFingerprint;
      item.requiredPortalFieldCount = draftPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0)
        + draftPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0);
      item.expectedPageIds = newExpectedPageIds;
      item.pageCheckpoints = newExpectedPageIds.map((pageId) => ({
        pageId,
        state: "pending",
        saveAttemptCount: 0,
        recoverySaveAttemptCount: 0,
        recoveryAuthorizedEvidenceId: pageId === resolution.pageId ? evidenceId.trim() : null,
        preparedEvidenceId: null,
        savedEvidenceId: null,
      }));
      resolution.status = "recovery_authorized";
      resolution.reason = `Nuovo pacchetto Infissi verificato ${draftPackage.packageFingerprint}; la generazione precedente non era persistita.`;
      resolution.nextAction = "Ricompilare la stessa pagina sulla stessa bozza con un solo Salva della nuova generazione.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueVerifiedInfissiPackageCorrectionAfterPrimaryNotSaved(draftPackage: AprEneaDraftPackage, customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (draftPackage.module !== "infissi" || draftPackage.customerKey !== customerKey || !evidenceId.trim()) throw new Error("enea_verified_infissi_primary_package_correction_invalid");
    const newExpectedPageIds = expectedPageIdsFromPackage(draftPackage);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_infissi_package_correction_requeued",
      customerKey,
      reason: "La GET canonica prova vuota la prima pagina e il pacchetto Infissi corretto esclude il falso cointestatario: stessa bozza riaccodata senza consumare un recupero col vecchio mapping.",
      nextAction: "Ricompilare Beneficiario con il pacchetto corretto e un solo Salva controllato, poi proseguire.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm, USER_AUTHORIZED_RULE_IDS.invoiceCoBeneficiaryPortalFlow, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const probe = resolution?.probes.find((candidate) => candidate.method === "persisted_fields_get" && candidate.evidenceId === evidenceId);
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || item.completedPageIds.length !== 0
        || !resolution
        || resolution.status !== "operator_required"
        || !/beneficiario/i.test(resolution.pageId)
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 0
        || checkpoint.savedEvidenceId
        || !probe
        || probe.outcome !== "inconclusive"
        || !probe.url?.split(/[?#]/, 1)[0].endsWith(`/${item.draftId}`)
        || item.mappingFingerprint === draftPackage.packageFingerprint) throw new Error("enea_verified_infissi_primary_package_correction_state_invalid");

      probe.outcome = "not_saved";
      probe.reason = "GET canonica: anagrafica principale e tabella altri beneficiari vuote; il primo Salva non ha persistito.";
      item.mappingFingerprint = draftPackage.packageFingerprint;
      item.workflowFingerprint = draftPackage.workflowFingerprint;
      item.requiredPortalFieldCount = draftPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0)
        + draftPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0);
      item.expectedPageIds = newExpectedPageIds;
      item.pageCheckpoints = newExpectedPageIds.map((pageId) => ({
        pageId,
        state: "pending",
        saveAttemptCount: 0,
        recoverySaveAttemptCount: 0,
        recoveryAuthorizedEvidenceId: pageId === resolution.pageId ? evidenceId.trim() : null,
        preparedEvidenceId: null,
        savedEvidenceId: null,
      }));
      resolution.status = "recovery_authorized";
      resolution.reason = `Pacchetto Infissi corretto ${draftPackage.packageFingerprint}; la GET prova che la generazione precedente non era persistita.`;
      resolution.nextAction = "Ricompilare la stessa pagina sulla stessa bozza con un solo Salva del pacchetto corretto.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueAfterVerifiedDraftDeletion(
    customerKey: string,
    draftId: string,
    serverDeletionEvidenceId: string,
    operatorDeletionEvidenceId: string,
    commandId: string,
    now = new Date(),
  ) {
    if (!customerKey.trim() || !/^\d{4,}$/.test(draftId) || !serverDeletionEvidenceId.trim() || !operatorDeletionEvidenceId.trim()) {
      throw new Error("enea_verified_draft_deletion_evidence_required");
    }
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_deleted_draft_requeued",
      customerKey,
      reason: `Bozza TEST ${draftId} eliminata dall'operatore e assente nell'elenco server: il caso viene riaccodato come nuova generazione senza riusare l'ID cancellato.`,
      nextAction: "Verificare la sessione e creare una sola nuova bozza dal payload congelato; il vecchio ID resta nel journal.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_verified_draft_deletion_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const terminalSaved = item?.state === "saved"
        && item.saveAttemptCount === 1
        && item.pageCheckpoints.length > 0
        && item.pageCheckpoints.every((checkpoint) => checkpoint.state === "saved" && checkpoint.saveAttemptCount === 1 && checkpoint.savedEvidenceId);
      const blockedBeforeFinalSave = item?.state === "operator_intervention" && item.saveAttemptCount === 0;
      if (!item
        || (!terminalSaved && !blockedBeforeFinalSave)
        || item.draftId !== draftId
        || item.createAttemptCount !== 1) throw new Error("enea_verified_draft_deletion_state_invalid");

      item.state = "queued";
      item.draftId = null;
      item.portalUrl = null;
      item.createIntentAt = null;
      item.createdAt = null;
      item.saveIntentAt = null;
      item.savedAt = null;
      item.createAttemptCount = 0;
      item.recoverableCreateIntent = false;
      item.saveAttemptCount = 0;
      item.completedPageIds = [];
      item.pageCheckpoints = item.expectedPageIds.map((pageId) => ({
        pageId,
        state: "pending",
        saveAttemptCount: 0,
        recoverySaveAttemptCount: 0,
        recoveryAuthorizedEvidenceId: null,
        preparedEvidenceId: null,
        savedEvidenceId: null,
      }));
      item.uncertainPageSave = null;
      for (const evidenceId of [serverDeletionEvidenceId.trim(), operatorDeletionEvidenceId.trim()]) {
        if (!item.serverEvidenceIds.includes(evidenceId)) item.serverEvidenceIds.push(evidenceId);
      }
      item.reason = `Vecchia bozza TEST ${draftId} cancellata e verificata assente; nuova generazione accodata.`;
      item.nextAction = "Creare una sola nuova bozza dopo il prossimo keepalive autenticato.";
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  requeueVerifiedRemainingPayloadCorrection(preflight: PreflightSnapshot, customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_verified_remaining_payload_correction_evidence_required");
    const updated = preflight.items.find((candidate) => candidate.customerKey === customerKey);
    const audit = updated?.report?.eneaPayloadAudit;
    if (updated?.state !== "ready_local_plan" || !audit?.draftReady || audit.portalGate.status !== "ready") throw new Error("enea_verified_remaining_payload_correction_preflight_invalid");
    const newMappingFingerprint = audit.mappingFingerprint;
    const newWorkflowFingerprint = audit.portalGate.workflowFingerprint;
    if (!newMappingFingerprint || !newWorkflowFingerprint) throw new Error("enea_verified_remaining_payload_correction_fingerprint_missing");
    const newExpectedPageIds = expectedPageIds(updated.report!);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_payload_correction_requeued",
      customerKey,
      reason: "La qualificazione edificio e stata corretta dalla regola unita unica prima che la pagina Immobile fosse persistita; stessa bozza riaccodata.",
      nextAction: "Conservare le pagine gia verificate e ricompilare dalla pagina Immobile con il nuovo fingerprint.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const resolution = item?.uncertainPageSave;
      const checkpoint = resolution ? item?.pageCheckpoints.find((candidate) => candidate.pageId === resolution.pageId) : null;
      const canonicalNotSaved = resolution?.probes.find((probe) => probe.method === "persisted_fields_get"
        && probe.outcome === "not_saved"
        && typeof probe.url === "string"
        && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url)
        && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item?.draftId ?? ""}`));
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || item.completedPageIds.length < 1
        || item.completedPageIds.some((pageId) => item.pageCheckpoints.find((candidate) => candidate.pageId === pageId)?.state !== "saved")
        || !resolution
        || resolution.status !== "operator_required"
        || resolution.pageId !== "page:Immobile"
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || checkpoint.savedEvidenceId
        || !canonicalNotSaved
        || item.mappingFingerprint === newMappingFingerprint
        || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") throw new Error("enea_verified_remaining_payload_correction_requeue_state_invalid");

      if (item.completedPageIds.some((pageId) => !newExpectedPageIds.includes(pageId))) throw new Error("enea_verified_remaining_payload_completed_page_missing");
      item.mappingFingerprint = newMappingFingerprint;
      item.workflowFingerprint = newWorkflowFingerprint;
      item.requiredPortalFieldCount = audit.requiredPortalFieldCount;
      item.expectedPageIds = newExpectedPageIds;
      item.pageCheckpoints = newExpectedPageIds.map((pageId) => {
        const previous = item.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
        if (item.completedPageIds.includes(pageId) && previous) return previous;
        return {
          pageId,
          state: "pending" as const,
          saveAttemptCount: 0 as const,
          recoverySaveAttemptCount: 0 as const,
          recoveryAuthorizedEvidenceId: pageId === resolution.pageId ? evidenceId.trim() : null,
          preparedEvidenceId: null,
          savedEvidenceId: null,
        };
      });
      resolution.status = "recovery_authorized";
      resolution.reason = `Nuovo payload edificio verificato ${newMappingFingerprint}; la pagina precedente non era persistita.`;
      resolution.nextAction = "Riprendere dalla pagina Immobile sulla stessa bozza, senza ripetere Beneficiario.";
      item.state = "recovery_queued";
      item.reason = resolution.reason;
      item.nextAction = resolution.nextAction;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }

  recordSavedPayloadPostCompletionVerificationIntent(customerKey: string, expectedMappingFingerprint: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !expectedMappingFingerprint.trim()) throw new Error("enea_post_completion_verification_intent_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "post_completion_verification_intent_recorded",
      customerKey,
      reason: "Controllo post-completamento registrato prima della lettura DOM; un crash non potra ripetere indefinitamente l'ispezione.",
      nextAction: "Eseguire una sola verifica read-only e persisterne l'esito terminale prima di qualsiasi altro controllo.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item
        || item.state !== "saved"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 1
        || item.completedPageIds.length !== item.expectedPageIds.length
        || item.mappingFingerprint === expectedMappingFingerprint
        || item.postCompletionVerification !== null) throw new Error("enea_post_completion_verification_intent_state_invalid");
      item.postCompletionVerification = {
        kind: "saved_payload_correction",
        status: "intent_recorded",
        originalMappingFingerprint: item.mappingFingerprint ?? "<missing>",
        expectedMappingFingerprint: expectedMappingFingerprint.trim(),
        startedAt: now.toISOString(),
        completedAt: null,
        evidenceId: null,
        mismatchedPortalIds: [],
        reason: "Verifica post-completamento in corso; nessuna mutazione autorizzata.",
      };
      item.reason = item.postCompletionVerification.reason;
      item.nextAction = "Una sola lettura DOM della pagina Immobile; in assenza di differenza isolata, fermarsi con esito inconcludente.";
    });
  }

  recordSavedPayloadPostCompletionVerificationInconclusive(customerKey: string, evidenceId: string, mismatchedPortalIds: string[], commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_post_completion_verification_result_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "post_completion_verification_inconclusive",
      customerKey,
      reason: `La verifica post-completamento non ha isolato una correzione DOM applicabile (${mismatchedPortalIds.join(",") || "nessuna differenza DOM"}); controllo concluso senza mutazioni.`,
      nextAction: "Conservare la bozza salvata e riesaminare il contratto offline; non ripetere automaticamente la lettura browser.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item
        || item.state !== "saved"
        || !item.draftId
        || item.postCompletionVerification?.status !== "intent_recorded") throw new Error("enea_post_completion_verification_result_state_invalid");
      item.postCompletionVerification.status = "verification_inconclusive";
      item.postCompletionVerification.completedAt = now.toISOString();
      item.postCompletionVerification.evidenceId = evidenceId.trim();
      item.postCompletionVerification.mismatchedPortalIds = [...mismatchedPortalIds];
      item.postCompletionVerification.reason = "Verifica terminale inconcludente; la bozza resta salvata e APR non ripetera il controllo automaticamente.";
      item.reason = item.postCompletionVerification.reason;
      item.nextAction = "Revisione offline del mapping; nessuna ulteriore azione browser automatica su questa bozza.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
    });
  }

  requeueSavedDraftPageAfterVerifiedPayloadCorrection(preflight: PreflightSnapshot, customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || pageId !== "page:Immobile" || !evidenceId.trim()) throw new Error("enea_saved_payload_correction_evidence_required");
    const updated = preflight.items.find((candidate) => candidate.customerKey === customerKey);
    const audit = updated?.report?.eneaPayloadAudit;
    if (updated?.state !== "ready_local_plan" || updated.report?.buildingQualification !== "single_unit" || updated.report.buildingUnitCount !== 1 || !audit?.draftReady || audit.portalGate.status !== "ready") throw new Error("enea_saved_payload_correction_preflight_invalid");
    const newMappingFingerprint = audit.mappingFingerprint;
    const newWorkflowFingerprint = audit.portalGate.workflowFingerprint;
    if (!newMappingFingerprint || !newWorkflowFingerprint) throw new Error("enea_saved_payload_correction_fingerprint_missing");
    const newExpectedPageIds = expectedPageIds(updated.report!);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "verified_payload_correction_requeued",
      customerKey,
      reason: "Una bozza gia completa usa ancora la classificazione edilizia precedente; la GET ha isolato la sola pagina Immobile e APR la corregge sulla stessa bozza.",
      nextAction: "Salvare una sola volta la pagina Immobile corretta, poi riverificare la bozza completa lato server.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item
        || item.state !== "saved"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 1
        || item.completedPageIds.length !== item.expectedPageIds.length
        || item.pageCheckpoints.some((candidate) => candidate.state !== "saved" || candidate.saveAttemptCount !== 1 || !candidate.savedEvidenceId)
        || !checkpoint
        || item.postCompletionVerification?.status !== "intent_recorded"
        || item.postCompletionVerification.expectedMappingFingerprint !== newMappingFingerprint
        || item.mappingFingerprint === newMappingFingerprint
        || newExpectedPageIds.length !== item.expectedPageIds.length
        || newExpectedPageIds.some((expectedPageId) => !item.expectedPageIds.includes(expectedPageId))) throw new Error("enea_saved_payload_correction_state_invalid");

      item.mappingFingerprint = newMappingFingerprint;
      item.workflowFingerprint = newWorkflowFingerprint;
      item.requiredPortalFieldCount = audit.requiredPortalFieldCount;
      item.expectedPageIds = newExpectedPageIds;
      item.completedPageIds = item.completedPageIds.filter((candidate) => candidate !== pageId);
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.recoverySaveAttemptCount = 0;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      checkpoint.preparedEvidenceId = null;
      checkpoint.savedEvidenceId = null;
      item.state = "recovery_queued";
      item.saveAttemptCount = 0;
      item.saveIntentAt = null;
      item.savedAt = null;
      item.reason = "Correzione verificata della sola pagina Immobile accodata sulla stessa bozza; nessuna duplicazione.";
      item.nextAction = "Compilare Immobile come costruzione isolata/unita unica e rileggere la bozza completa.";
      item.uncertainPageSave = null;
      item.postCompletionVerification.status = "resolved_requeued";
      item.postCompletionVerification.completedAt = now.toISOString();
      item.postCompletionVerification.evidenceId = evidenceId.trim();
      item.postCompletionVerification.mismatchedPortalIds = ["id-tipologia"];
      item.postCompletionVerification.reason = "La GET ha isolato la sola tipologia edificio; correzione accodata sulla stessa bozza.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      next.currentCustomerKey = null;
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
      next.status = "ready";
    });
  }


  requeueUnmaterializedCreateIntents(customerKeys: string[], evidenceId: string, commandId: string, now = new Date()) {
    if (customerKeys.length < 1 || new Set(customerKeys).size !== customerKeys.length || !evidenceId.trim()) throw new Error("enea_create_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "case_requeued_recovery",
      customerKey: null,
      reason: `${customerKeys.length} intenti senza ID bozza riaccodati sullo stesso tentativo persistente; nessun contatore azzerato.`,
      nextAction: "APR riprende in ordine dal wizard già individuato e registra l'ID prima della compilazione.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_create_recovery_active_case_present");
      for (const customerKey of customerKeys) {
        const item = next.items.find((candidate) => candidate.customerKey === customerKey);
        if (!item || item.state !== "operator_intervention" || item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.completedPageIds.length !== 0 || !/(?:apr_cdp_enea_(?:create_result_not_identifiable|creation_wizard_contract_invalid|other_create_intent_pending)|crm_enea_draft_package_(?:fingerprint_mismatch|rebuild_blocked)|enea_draft_id_duplicate)/.test(item.reason)) throw new Error(`enea_create_recovery_case_invalid:${customerKey}`);
        item.state = "queued";
        item.recoverableCreateIntent = true;
        item.serverEvidenceIds.push(evidenceId.trim());
        item.reason = "Intento di creazione non materializzato: ripresa autorizzata sullo stesso contatore dopo contratto wizard verificato.";
        item.nextAction = "Riprendere il wizard senza un secondo click al collegamento iniziale.";
      }
      next.status = "ready";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  deferActiveCreateIntentBehindPendingPortalIntent(customerKey: string, pendingCustomerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pendingCustomerKey.trim() || customerKey === pendingCustomerKey || !evidenceId.trim()) throw new Error("enea_create_pending_order_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "create_intent_deferred_behind_pending_portal_intent",
      customerKey,
      reason: `${customerKey} rimessa in coda: il sotto-checkpoint portale appartiene ancora a ${pendingCustomerKey}.`,
      nextAction: `Riprendere prima ${pendingCustomerKey}; poi reclamare nuovamente ${customerKey} senza aumentare il contatore di creazione.`,
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey !== customerKey) throw new Error("enea_create_pending_order_active_case_mismatch");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "create_intent_recorded" || item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.completedPageIds.length !== 0) throw new Error("enea_create_pending_order_case_invalid");
      item.state = "queued";
      item.recoverableCreateIntent = true;
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.reason = `Creazione non eseguita: APR preserva l'ordine del sotto-checkpoint portale di ${pendingCustomerKey}.`;
      item.nextAction = `Attendere il completamento dell'intento di ${pendingCustomerKey}, quindi riprendere senza seconda creazione.`;
      next.currentCustomerKey = null;
      next.status = "ready";
    });
  }

  resumeCreatedDraftAfterPageOrderCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_page_order_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_page_order",
      customerKey,
      reason: `Bozza ENEA esistente riattivata dopo correzione dell'attesa route/idratazione; nessuna nuova bozza creata.`,
      nextAction: "Riprendere dalla prima pagina pendente della stessa bozza e avanzare in ordine portale.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_page_order_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.completedPageIds.length !== 0 || !/apr_cdp_enea_page_navigation_not_found:page:(?:Generatore|Anagrafica Beneficiario)/.test(item.reason)) throw new Error(`enea_page_order_recovery_case_invalid:${customerKey}`);
      item.expectedPageIds = canonicalPortalPageIds(item.expectedPageIds);
      item.pageCheckpoints = item.expectedPageIds.map((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId) ?? ({ pageId, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null } as AprEneaDraftPageCheckpoint));
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "created";
      item.reason = "Stessa bozza riattivata; attesa route/idratazione riallineata al flusso sequenziale ENEA.";
      item.nextAction = "Compilare e verificare la prima pagina pendente senza creare una nuova bozza.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterGeneratorActivationCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_generator_activation_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_generator_activation",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo attesa verificata della riga generatore; nessuna nuova bozza creata e nessun Salva ripetuto.",
      nextAction: "Riprendere dal generatore pendente della stessa bozza, preservando tutte le pagine già verificate.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_generator_activation_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const generator = item?.pageCheckpoints.find((checkpoint) => /Generatore/.test(checkpoint.pageId));
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || !generator || generator.state !== "pending" || generator.saveAttemptCount !== 0 || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" || checkpoint.state === "save_intent_recorded") || !/apr_cdp_enea_(?:generator_activation_failed:|mapping_missing)/.test(item.reason)) throw new Error(`enea_generator_activation_recovery_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length > 0 ? "filling" : "created";
      item.reason = "Stessa bozza riattivata; la riga generatore e il relativo controllo Modifica sono stati osservati dopo il mount React.";
      item.nextAction = "Compilare il generatore pendente senza ripetere pagine o salvataggi già verificati.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterFieldVerificationCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_field_verification_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_field_verification",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo correzione verificata dei controlli dinamici Nazione/Comune; nessuna nuova bozza creata.",
      nextAction: "Ricompilare e rileggere Anagrafica Beneficiario sulla stessa bozza prima dell'unico salvataggio.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_field_verification_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" || checkpoint.state === "save_intent_recorded") || !/apr_cdp_enea_(?:field_verification_failed:|co_beneficiary_trusted_input_not_verified|mapping_missing)/.test(item.reason)) throw new Error(`enea_field_verification_recovery_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length > 0 ? "filling" : "created";
      item.reason = "Stessa bozza riattivata; confronto dei controlli riallineato al contratto DOM verificato.";
      item.nextAction = "Compilare e rileggere la prima pagina pendente senza creare una nuova bozza.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterPackageMappingRebind(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_package_mapping_rebind_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_package_mapping_rebind",
      customerKey,
      reason: "Il fingerprint aggiornato e stato riassociato con GET alla stessa bozza ENEA; nessuna bozza o pagina e stata duplicata.",
      nextAction: "Riprendere dalla prima pagina pendente preservando tutti i checkpoint salvati.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_package_mapping_rebind_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0
        || !item.pageCheckpoints.some((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
        || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" || checkpoint.state === "save_intent_recorded")
        || !/apr_cdp_enea_mapping_missing/.test(item.reason)) throw new Error(`enea_package_mapping_rebind_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length > 0 ? "filling" : "created";
      item.reason = "Stessa bozza riagganciata al fingerprint aggiornato; checkpoint e contatori preservati.";
      item.nextAction = "Completare la sola pagina pendente senza ripetere salvataggi gia verificati.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterPreSaveRemount(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_pre_save_remount_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_pre_save_remount",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo un rimontaggio del form avvenuto prima di qualunque click Salva.",
      nextAction: "Ricompilare la sola pagina pendente e salvarla una volta, preservando ID bozza e pagine già verificate.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_pre_save_remount_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.state === "save_intent_recorded" && candidate.saveAttemptCount === 1 && candidate.recoverySaveAttemptCount === 0 && !candidate.savedEvidenceId);
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || !checkpoint
        || item.pageCheckpoints.filter((candidate) => candidate.state === "save_intent_recorded").length !== 1
        || !/apr_cdp_enea_pre_save_field_contract_not_ready:/.test(item.reason)
        || item.completedPageIds.some((pageId) => item.pageCheckpoints.find((candidate) => candidate.pageId === pageId)?.state !== "saved")) {
        throw new Error(`enea_pre_save_remount_recovery_case_invalid:${customerKey}`);
      }
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.preparedEvidenceId = null;
      // This is not a second portal save attempt, but it is a new durable
      // preparation generation.  Carry the no-click evidence so the worker's
      // idempotency key cannot collide with the preparation completed before
      // the React remount was detected.
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length > 0 ? "filling" : "created";
      item.reason = `Stessa bozza riattivata: ${checkpoint.pageId} aveva perso i campi prima del click; nessun salvataggio da ripetere.`;
      item.nextAction = `Ripreparare ${checkpoint.pageId} e verificare i campi nello stesso turno dell'unico Salva.`;
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumePageSavedAfterCheckpointCollision(customerKey: string, pageId: string, evidenceId: string, evidenceUrl: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !evidenceId.trim()) throw new Error("enea_checkpoint_collision_server_evidence_invalid");
    const parsed = new URL(evidenceUrl);
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "page_saved_after_checkpoint_collision",
      customerKey,
      reason: `${pageId} riallineata al redirect server ENEA già acquisito; nessun secondo Salva eseguito.`,
      nextAction: "Riprendere dalla pagina successiva della stessa bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_checkpoint_collision_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      const sourceRoute = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Calcolo costi e detrazioni", "calcolo"]]).get(pageId);
      const observedRoute = item?.draftId ? parsed.pathname.match(new RegExp(`^/pratica/ecobonus/2026/([^/]+)/${item.draftId}$`))?.[1] ?? null : null;
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || !checkpoint
        || checkpoint.state !== "prepared"
        || ![0, 1].includes(checkpoint.saveAttemptCount)
        || checkpoint.savedEvidenceId
        || !/enea_draft_page_save_intent_missing/.test(item.reason)
        || parsed.origin !== "https://bonusfiscali.enea.it"
        || !sourceRoute
        || !observedRoute
        || observedRoute === sourceRoute
        || /(?:anteprima|invia|submit|ricevuta|email|elimina|cancella|errore|error)/i.test(observedRoute)) {
        throw new Error(`enea_checkpoint_collision_case_invalid:${customerKey}`);
      }
      checkpoint.state = "saved";
      checkpoint.saveAttemptCount = 1;
      checkpoint.savedEvidenceId = evidenceId.trim();
      if (!item.completedPageIds.includes(pageId)) item.completedPageIds.push(pageId);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = `${item.completedPageIds.length}/${item.expectedPageIds.length} pagine salvate e verificate; checkpoint riallineato al redirect server.`;
      item.nextAction = "Riprendere dalla prossima pagina pendente senza ripetere il Salva già verificato.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeUnclickedPageAfterSaveControlCorrection(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !evidenceId.trim()) throw new Error("enea_unclicked_save_control_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "unclicked_page_requeued_save_control_correction",
      customerKey,
      reason: `${pageId} riattivata dopo prova journal che il vecchio controllo Salva non aveva emesso alcun click.`,
      nextAction: "Ricompilare e usare una sola volta il controllo Salva server-rendered corretto.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_unclicked_save_control_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 0
        || checkpoint.savedEvidenceId
        || !/apr_cdp_enea_unique_enabled_save_button_not_found:/.test(item.reason)) {
        throw new Error(`enea_unclicked_save_control_case_invalid:${customerKey}`);
      }
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.preparedEvidenceId = null;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length ? "filling" : "created";
      item.reason = `Stessa bozza riattivata: ${pageId} non aveva emesso alcun click Salva.`;
      item.nextAction = `Ripreparare ${pageId} nella nuova generazione idempotente.`;
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterDirectRouteCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_direct_route_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_page_order",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo correzione della navigazione diretta a una pagina pendente; nessuna nuova bozza e nessun Salva ripetuto.",
      nextAction: "Riprendere dalla pagina pendente della stessa bozza preservando le pagine già verificate.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_direct_route_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" || checkpoint.state === "save_intent_recorded") || !/apr_cdp_enea_page_navigation_not_found:page:(?:Anagrafica Beneficiario|Immobile|Intervento|Impianto termico esistente|Schermature solari|Calcolo costi e detrazioni)/.test(item.reason)) throw new Error(`enea_direct_route_recovery_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length > 0 ? "filling" : "created";
      item.reason = "Stessa bozza riattivata; la route diretta allowlistata è disponibile dal checkpoint.";
      item.nextAction = "Compilare e rileggere la prima pagina pendente senza ripetere pagine o salvataggi già verificati.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterTransientReadOnlyTimeout(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_transient_readonly_timeout_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_transient_readonly_timeout",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo interruzione transitoria del solo collegamento di compilazione e rilettura, prima di qualunque Salva; nessuna nuova bozza creata.",
      nextAction: "Riprendere la prima pagina pendente della stessa bozza con tempo massimo coerente con i controlli dinamici del portale.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_transient_readonly_timeout_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.pageCheckpoints.some((checkpoint) => !(["pending", "saved"] as const).includes(checkpoint.state as "pending" | "saved") || (checkpoint.state === "pending" && checkpoint.saveAttemptCount !== 0)) || item.completedPageIds.some((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)?.state !== "saved") || !/apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000:Inspected target navigated or closed)/.test(item.reason)) throw new Error(`enea_transient_readonly_timeout_recovery_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = item.completedPageIds.length > 0 ? "filling" : "created";
      item.reason = "Stessa bozza riattivata dopo timeout precedente al Salva della pagina pendente; pagine verificate, contatori e ID preservati.";
      item.nextAction = "Compilare e rileggere la prima pagina pendente senza creare una nuova bozza o ripetere pagine salvate.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeAuthorizedScreeningRestageAfterTransientTimeout(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_screening_restage_timeout_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "authorized_screening_restage_requeued_after_transient_timeout",
      customerKey,
      reason: "Ripristino 1:1 già autorizzato ripreso dopo timeout precedente al Salva della prossima riga; contatori e prove conservati.",
      nextAction: "Riprendere dalla prima riga di recupero pendente senza ripetere righe salvate.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_screening_restage_timeout_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const pendingRecovery = item?.pageCheckpoints.find((checkpoint) => checkpoint.pageId.startsWith("screening:")
        && checkpoint.state === "pending"
        && checkpoint.saveAttemptCount === 1
        && checkpoint.recoverySaveAttemptCount === 0
        && Boolean(checkpoint.recoveryAuthorizedEvidenceId));
      if (!item || item.state !== "operator_intervention" || !item.draftId || !pendingRecovery
        || !item.serverEvidenceIds.includes(pendingRecovery.recoveryAuthorizedEvidenceId!)
        || !["recovery_authorized", "resolved_staged", "resolved_saved"].includes(item.uncertainPageSave?.status ?? "")
        || item.pageCheckpoints.some((checkpoint) => !(["pending", "staged", "saved"] as const).includes(checkpoint.state as "pending" | "staged" | "saved"))
        || !/apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000:Inspected target navigated or closed)/.test(item.reason)) throw new Error(`enea_screening_restage_timeout_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = "Ripristino delle righe 1:1 ripreso dal checkpoint dopo timeout precedente al Salva della riga pendente.";
      item.nextAction = "Compilare la prima riga di recupero pendente; non ripetere righe già verificate.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterInfissiContractDiscovery(customerKey: string, evidenceId: string, commandId: string, now = new Date(), upgradedPackage?: AprEneaDraftPackage) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_infissi_contract_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_infissi_contract_discovery",
      customerKey,
      reason: "Bozza Infissi esistente riattivata dopo acquisizione read-only del contratto tecnico; nessuna pagina salvata viene ripetuta.",
      nextAction: "Riprendere esclusivamente la pagina Serramenti e infissi pendente sulla stessa bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_infissi_contract_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const pending = item?.pageCheckpoints.filter((checkpoint) => checkpoint.state === "pending") ?? [];
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || pending.length !== 1
        || pending[0].pageId !== "page:Serramenti e infissi"
        || pending[0].saveAttemptCount !== 0
        || item.completedPageIds.length !== item.expectedPageIds.length - 1
        || item.completedPageIds.some((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)?.state !== "saved")
        || !/apr_cdp_enea_infissi_contract_discovered:/.test(item.reason)) throw new Error(`enea_infissi_contract_recovery_case_invalid:${customerKey}`);
      if (upgradedPackage) {
        if (upgradedPackage.module !== "infissi" || upgradedPackage.customerKey !== customerKey || upgradedPackage.workflow.screeningItemCount < 1) throw new Error("enea_infissi_contract_upgrade_package_invalid");
        const upgradedPageIds = expectedPageIdsFromPackage(upgradedPackage);
        const savedById = new Map(item.pageCheckpoints.filter((checkpoint) => checkpoint.state === "saved").map((checkpoint) => [checkpoint.pageId, checkpoint]));
        item.expectedPageIds = upgradedPageIds;
        item.pageCheckpoints = upgradedPageIds.map((pageId) => savedById.get(pageId) ?? { pageId, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null });
        item.completedPageIds = upgradedPageIds.filter((pageId) => savedById.has(pageId));
        item.mappingFingerprint = upgradedPackage.packageFingerprint;
        item.workflowFingerprint = upgradedPackage.workflowFingerprint;
        item.requiredPortalFieldCount = upgradedPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0) + upgradedPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0);
      }
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = "Contratto tecnico Infissi acquisito; stessa bozza riattivata dalla sola pagina pendente.";
      item.nextAction = "Inventariare il modale tecnico senza salvare e completare il mapping verificato.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeLegacyInfissiRowsBeforeSummary(customerKey: string, evidenceId: string, commandId: string, upgradedPackage: AprEneaDraftPackage, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim() || upgradedPackage.module !== "infissi" || upgradedPackage.customerKey !== customerKey || upgradedPackage.workflow.screeningItemCount < 1) throw new Error("enea_legacy_infissi_rows_recovery_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "legacy_infissi_rows_requeued_before_summary",
      customerKey,
      reason: "La GET canonica mostra zero righe tecniche e il vecchio checkpoint tentava il costo prima dei serramenti: stessa bozza aggiornata al flusso 1:1.",
      nextAction: "Inserire una riga per ogni infisso, quindi salvare costo e calcolo automatico sulla stessa bozza.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings, SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_legacy_infissi_rows_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const oldSummary = item?.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Serramenti e infissi");
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || item.expectedPageIds.some((pageId) => pageId.startsWith("screening:"))
        || !oldSummary
        || oldSummary.state !== "pending"
        || oldSummary.saveAttemptCount !== 0
        || item.completedPageIds.length < 1
        || item.completedPageIds.some((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)?.state !== "saved")
        || !/apr_cdp_enea_field_verification_failed:id-costo$/.test(item.reason)) throw new Error(`enea_legacy_infissi_rows_recovery_state_invalid:${customerKey}`);
      const upgradedPageIds = expectedPageIdsFromPackage(upgradedPackage);
      const savedById = new Map(item.pageCheckpoints.filter((checkpoint) => checkpoint.state === "saved").map((checkpoint) => [checkpoint.pageId, checkpoint]));
      item.expectedPageIds = upgradedPageIds;
      item.pageCheckpoints = upgradedPageIds.map((pageId) => savedById.get(pageId) ?? { pageId, state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0, recoveryAuthorizedEvidenceId: null, preparedEvidenceId: null, savedEvidenceId: null });
      item.completedPageIds = upgradedPageIds.filter((pageId) => savedById.has(pageId));
      item.mappingFingerprint = upgradedPackage.packageFingerprint;
      item.workflowFingerprint = upgradedPackage.workflowFingerprint;
      item.requiredPortalFieldCount = upgradedPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0)
        + upgradedPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = "Checkpoint legacy riallineato: righe Infissi 1:1 precedono il riepilogo tecnico.";
      item.nextAction = "Riprendere dalla prima riga Infissi pendente senza ripetere le cinque pagine gia salvate.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterScreeningOrderCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_screening_order_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_page_order",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo prova DOM che il costo schermature resta disabilitato finché non esiste almeno una riga tecnica.",
      nextAction: "Inserire e salvare le righe schermatura 1:1, poi compilare il costo riepilogativo sulla stessa bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_screening_order_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const summary = item?.pageCheckpoints.find((checkpoint) => !checkpoint.pageId.startsWith("screening:") && checkpoint.pageId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").includes("schermatur"));
      const screenings = item?.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")) ?? [];
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || !summary || summary.state !== "pending" || summary.saveAttemptCount !== 0 || screenings.length < 1 || screenings.some((checkpoint) => checkpoint.state !== "pending" || checkpoint.saveAttemptCount !== 0) || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" || checkpoint.state === "save_intent_recorded") || !/apr_cdp_enea_field_verification_failed:id-costo$/.test(item.reason)) throw new Error(`enea_screening_order_recovery_case_invalid:${customerKey}`);
      item.expectedPageIds = canonicalPortalPageIds(item.expectedPageIds);
      item.pageCheckpoints = item.expectedPageIds.map((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)!);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = "Stessa bozza riattivata; righe schermatura ora precedono il costo riepilogativo secondo il DOM ENEA verificato.";
      item.nextAction = "Riprendere dalla prima riga schermatura pendente senza ripetere le pagine già salvate.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeScreeningRowsAfterEmptyServerSummary(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_screening_empty_summary_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_screening_navigation",
      customerKey,
      reason: "Riepilogo tecnico riletto lato server: nessuna riga persistita; autorizzato un solo ripristino 1:1 sulla stessa bozza.",
      nextAction: "Reinserire una sola volta le righe assenti, poi salvare il riepilogo esterno e verificarlo lato server.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_screening_empty_summary_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const screenings = item?.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")) ?? [];
      const summary = item?.pageCheckpoints.find((checkpoint) => !checkpoint.pageId.startsWith("screening:") && /schermatur|infiss/.test(checkpoint.pageId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it")));
      const uncertainScreening = item?.uncertainPageSave?.pageId.startsWith("screening:") ? item.uncertainPageSave.pageId : null;
      const screeningsValid = screenings.every((checkpoint) => checkpoint.saveAttemptCount === 1
        && checkpoint.recoverySaveAttemptCount === 0
        && ((checkpoint.state === "staged" && Boolean(checkpoint.stagedEvidenceId)) || (checkpoint.pageId === uncertainScreening && checkpoint.state === "save_intent_recorded")));
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || screenings.length < 1 || !screeningsValid || !summary || summary.state !== "pending" || summary.saveAttemptCount !== 0 || (!/apr_cdp_enea_field_verification_failed:id-costo$/.test(item.reason) && !uncertainScreening)) throw new Error(`enea_screening_empty_summary_recovery_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      for (const checkpoint of screenings) {
        checkpoint.state = "pending";
        checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
        checkpoint.preparedEvidenceId = null;
        checkpoint.stagedEvidenceId = null;
        checkpoint.savedEvidenceId = null;
      }
      item.completedPageIds = item.completedPageIds.filter((pageId) => !pageId.startsWith("screening:"));
      if (item.uncertainPageSave) {
        item.uncertainPageSave.status = "recovery_authorized";
        item.uncertainPageSave.reason = "GET canonica del riepilogo tecnico mostra zero righe: autorizzato un solo ripristino 1:1 dello staging perso.";
        item.uncertainPageSave.nextAction = "Ripristinare tutte le righe una sola volta e salvarle con il riepilogo esterno.";
      }
      item.state = "filling";
      item.reason = "Stessa bozza riattivata dopo prova server che nessuna riga tecnica era persistita; i precedenti click restano auditati come staging perso.";
      item.nextAction = "Ripristinare le righe 1:1 assenti con un solo tentativo di recupero, senza creare una nuova bozza.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumePartialInfissiRowsAfterEmptyCanonicalSummary(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_infissi_partial_empty_summary_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "infissi_partial_rows_requeued_after_empty_canonical_summary",
      customerKey,
      reason: "La GET canonica prova zero righe Infissi mentre una sequenza parziale era soltanto staged: il prefisso viene ripristinato 1:1 sulla stessa bozza.",
      nextAction: "Ripristinare il prefisso perso, poi continuare le righe mai tentate e salvare il riepilogo esterno.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_infissi_partial_empty_summary_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const screenings = item?.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")) ?? [];
      const summary = item?.pageCheckpoints.find((checkpoint) => !checkpoint.pageId.startsWith("screening:") && /infiss/i.test(checkpoint.pageId));
      const uncertain = item?.uncertainPageSave;
      const currentIndex = uncertain?.pageId.startsWith("screening:") ? Number(uncertain.pageId.slice("screening:".length)) : 0;
      const attemptedPrefix = screenings.filter((checkpoint) => Number(checkpoint.pageId.slice("screening:".length)) <= currentIndex);
      const untouchedSuffix = screenings.filter((checkpoint) => Number(checkpoint.pageId.slice("screening:".length)) > currentIndex);
      if (!item || item.state !== "operator_intervention" || !item.draftId || !summary || summary.state !== "pending" || summary.saveAttemptCount !== 0 || !uncertain || uncertain.status !== "operator_required" || currentIndex < 1
        || attemptedPrefix.length !== currentIndex
        || attemptedPrefix.some((checkpoint) => checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || !(checkpoint.state === "staged" || (checkpoint.pageId === uncertain.pageId && checkpoint.state === "save_intent_recorded")))
        || untouchedSuffix.some((checkpoint) => checkpoint.state !== "pending" || checkpoint.saveAttemptCount !== 0 || checkpoint.recoverySaveAttemptCount !== 0)) throw new Error(`enea_infissi_partial_empty_summary_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      for (const checkpoint of attemptedPrefix) {
        checkpoint.state = "pending";
        checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
        checkpoint.preparedEvidenceId = null;
        checkpoint.stagedEvidenceId = null;
        checkpoint.savedEvidenceId = null;
      }
      item.completedPageIds = item.completedPageIds.filter((pageId) => !pageId.startsWith("screening:"));
      uncertain.status = "recovery_authorized";
      uncertain.reason = "GET canonica a zero righe: autorizzato il solo ripristino del prefisso Infissi staged e perso.";
      uncertain.nextAction = "Ripristinare il prefisso una sola volta, poi continuare le righe non ancora tentate.";
      item.state = "filling";
      item.reason = "Prefisso Infissi riattivato sulla stessa bozza dopo prova canonica di zero righe; righe successive ancora intatte.";
      item.nextAction = "Riprendere da screening:1 senza creare una nuova bozza.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeGeneratorAndPlantAfterEmptyGeneratorSummary(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_generator_empty_summary_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "generator_and_plant_requeued_after_empty_generator_summary",
      customerKey,
      reason: "La diagnostica post-click della pagina Impianto prova che il generatore annidato staged non e presente nella tabella: APR ripristina generatore e Salva esterno sulla stessa bozza.",
      nextAction: "Ripristinare una sola volta il generatore annidato, quindi salvare la pagina Impianto e verificarli lato server.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_generator_empty_summary_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const generator = item?.pageCheckpoints.find((checkpoint) => /Generatore/.test(checkpoint.pageId));
      const plant = item?.pageCheckpoints.find((checkpoint) => !/Generatore/.test(checkpoint.pageId) && /Impianto/.test(checkpoint.pageId));
      const uncertain = item?.uncertainPageSave;
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || !generator
        || generator.state !== "saved"
        || generator.saveAttemptCount !== 1
        || !generator.savedEvidenceId
        || !plant
        || plant.state !== "save_intent_recorded"
        || plant.saveAttemptCount !== 1
        || plant.recoverySaveAttemptCount !== 1
        || plant.savedEvidenceId
        || !uncertain
        || uncertain.pageId !== plant.pageId
        || uncertain.status !== "operator_required"
        || item.reason !== "La GET canonica dimostra che anche l'unico recupero non è persistito.") {
        throw new Error(`enea_generator_empty_summary_case_invalid:${customerKey}`);
      }
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      generator.state = "pending";
      generator.recoveryAuthorizedEvidenceId = evidenceId.trim();
      generator.preparedEvidenceId = null;
      generator.savedEvidenceId = null;
      plant.state = "pending";
      // Entrambe le consegne precedenti del Salva esterno hanno prodotto zero
      // richieste perche la riga generatore era assente. Il journal le conserva;
      // il checkpoint riparte da una nuova generazione, non da un retry cieco.
      plant.saveAttemptCount = 0;
      plant.recoverySaveAttemptCount = 0;
      plant.recoveryAuthorizedEvidenceId = null;
      plant.preparedEvidenceId = null;
      plant.savedEvidenceId = null;
      item.completedPageIds = item.completedPageIds.filter((pageId) => pageId !== generator.pageId && pageId !== plant.pageId);
      uncertain.pageId = generator.pageId;
      uncertain.status = "recovery_authorized";
      uncertain.reason = "Tabella generatori vuota: autorizzato il solo ripristino della sottofinestra staged persa.";
      uncertain.nextAction = "Ripristinare il generatore una sola volta, poi salvare l'Impianto esterno.";
      item.state = "filling";
      item.reason = `Stessa bozza ${item.draftId} riattivata dopo prova di tabella generatori vuota; pagine server precedenti preservate.`;
      item.nextAction = "Riprendere dal generatore annidato senza creare una nuova bozza.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeInfissiRowsAfterStagingClassifierCorrection(customerKey: string, emptyServerEvidenceId: string, classifierEvidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !emptyServerEvidenceId.trim() || !classifierEvidenceId.trim()) throw new Error("enea_infissi_staging_classifier_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "infissi_rows_requeued_after_staging_classifier_correction",
      customerKey,
      reason: "GET canonica prova zero righe persistite e la diagnostica del modale prova tutti i valori React validi; il verificatore di staging e stato corretto per paginazione, riordino e cardinalita.",
      nextAction: "Ripristinare una sola generazione delle righe 1:1 sulla stessa bozza e salvare il riepilogo esterno; nessuna nuova bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_infissi_staging_classifier_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const screenings = item?.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")) ?? [];
      const summary = item?.pageCheckpoints.find((checkpoint) => !checkpoint.pageId.startsWith("screening:") && /infiss/.test(checkpoint.pageId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it")));
      const uncertain = item?.uncertainPageSave;
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || screenings.length < 1 || !summary || summary.state !== "pending" || summary.saveAttemptCount !== 0 || !uncertain || uncertain.status !== "operator_required" || !uncertain.pageId.startsWith("screening:") || screenings.some((checkpoint) => checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 1 || !["saved", "save_intent_recorded"].includes(checkpoint.state))) throw new Error(`enea_infissi_staging_classifier_recovery_case_invalid:${customerKey}`);
      for (const evidenceId of [emptyServerEvidenceId.trim(), classifierEvidenceId.trim()]) if (!item.serverEvidenceIds.includes(evidenceId)) item.serverEvidenceIds.push(evidenceId);
      for (const checkpoint of screenings) {
        checkpoint.state = "pending";
        // Il contatore rappresenta il tentativo della generazione corrente.
        // I due tentativi precedenti restano immutabili nel journal; il reset e
        // ammesso soltanto dalla doppia prova qui validata e dal commandId unico.
        checkpoint.recoverySaveAttemptCount = 0;
        checkpoint.recoveryAuthorizedEvidenceId = emptyServerEvidenceId.trim();
        checkpoint.preparedEvidenceId = null;
        checkpoint.savedEvidenceId = null;
      }
      item.completedPageIds = item.completedPageIds.filter((pageId) => !pageId.startsWith("screening:"));
      uncertain.status = "recovery_authorized";
      uncertain.probes = [];
      uncertain.reason = "Classificatore staging Infissi corretto; server canonico ancora a zero righe, autorizzata una sola generazione di ripristino auditata.";
      uncertain.nextAction = "Ripristinare tutte le righe e salvare il riepilogo esterno prima di qualsiasi reload.";
      item.state = "filling";
      item.reason = `Stessa bozza ${item.draftId} riattivata dopo correzione tecnica del verificatore; le pagine comuni e l'ID restano preservati.`;
      item.nextAction = "Ripristinare le righe Infissi 1:1 e completare il solo riepilogo della bozza.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeInfissiRowsAfterAuthorizedTransmittanceCorrection(
    customerKey: string,
    emptyServerEvidenceId: string,
    rejectedValueEvidenceId: string,
    commandId: string,
    upgradedPackage: AprEneaDraftPackage,
    now = new Date(),
  ) {
    if (!customerKey.trim() || !emptyServerEvidenceId.trim() || !rejectedValueEvidenceId.trim()) throw new Error("enea_infissi_transmittance_correction_evidence_invalid");
    if (upgradedPackage.module !== "infissi" || upgradedPackage.customerKey !== customerKey || upgradedPackage.workflow.screeningItemCount < 1) throw new Error("enea_infissi_transmittance_correction_package_invalid");
    const correctedFields = upgradedPackage.workflow.screeningSteps.flatMap((step) => step.fields)
      .filter((field) => field.portalId === "id-u_post" && field.value === "1,3");
    const sourceCorrected = upgradedPackage.infissiPayload?.windows.some((window) => window.sourceNewWindowThermalTransmittanceWm2K > 1.3
      && window.newWindowThermalTransmittanceWm2K === 1.3);
    if (!sourceCorrected || correctedFields.length < 1 || !upgradedPackage.infissiPayload?.audit.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13)) {
      throw new Error("enea_infissi_transmittance_correction_rule_missing");
    }
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "infissi_rows_requeued_after_authorized_transmittance_correction",
      customerKey,
      reason: "Il valore fonte oltre massimo e il rifiuto ENEA a 1,3 sono provati; la regola utente conserva il valore originario nell'audit e usa 1,3 nel solo campo portale.",
      nextAction: "Ripristinare una sola generazione delle righe 1:1 sulla stessa bozza con il payload corretto, poi salvare il riepilogo esterno.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_infissi_transmittance_correction_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const screenings = item?.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")) ?? [];
      const summary = item?.pageCheckpoints.find((checkpoint) => checkpoint.pageId === "page:Serramenti e infissi");
      const uncertain = item?.uncertainPageSave;
      const rejectedOrdinal = Number(uncertain?.pageId.slice("screening:".length));
      const attemptedPrefix = screenings.filter((checkpoint) => Number(checkpoint.pageId.slice("screening:".length)) <= rejectedOrdinal);
      const untouchedSuffix = screenings.filter((checkpoint) => Number(checkpoint.pageId.slice("screening:".length)) > rejectedOrdinal);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0
        || screenings.length !== upgradedPackage.workflow.screeningItemCount || !summary || summary.state !== "pending" || summary.saveAttemptCount !== 0
        || !uncertain || uncertain.status !== "operator_required" || !uncertain.pageId.startsWith("screening:")
        || !Number.isInteger(rejectedOrdinal) || rejectedOrdinal < 1
        || attemptedPrefix.length !== rejectedOrdinal
        || attemptedPrefix.some((checkpoint) => checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 1 || !["saved", "save_intent_recorded"].includes(checkpoint.state))
        || untouchedSuffix.some((checkpoint) => checkpoint.state !== "pending" || checkpoint.saveAttemptCount !== 0 || checkpoint.recoverySaveAttemptCount !== 0)) {
        throw new Error(`enea_infissi_transmittance_correction_case_invalid:${customerKey}`);
      }
      const upgradedPageIds = expectedPageIdsFromPackage(upgradedPackage);
      const commonSavedById = new Map(item.pageCheckpoints
        .filter((checkpoint) => checkpoint.state === "saved" && !checkpoint.pageId.startsWith("screening:"))
        .map((checkpoint) => [checkpoint.pageId, checkpoint]));
      item.expectedPageIds = upgradedPageIds;
      item.pageCheckpoints = upgradedPageIds.map((pageId) => {
        const common = commonSavedById.get(pageId);
        if (common) return common;
        const prior = item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId);
        return {
          pageId,
          state: "pending" as const,
          saveAttemptCount: prior?.saveAttemptCount === 1 ? 1 as const : 0 as const,
          recoverySaveAttemptCount: 0 as const,
          recoveryAuthorizedEvidenceId: pageId.startsWith("screening:") ? emptyServerEvidenceId.trim() : null,
          preparedEvidenceId: null,
          savedEvidenceId: null,
        };
      });
      item.completedPageIds = upgradedPageIds.filter((pageId) => commonSavedById.has(pageId));
      item.mappingFingerprint = upgradedPackage.packageFingerprint;
      item.workflowFingerprint = upgradedPackage.workflowFingerprint;
      item.requiredPortalFieldCount = upgradedPackage.workflow.steps.reduce((total, step) => total + step.fields.length, 0)
        + upgradedPackage.workflow.screeningSteps.reduce((total, step) => total + step.fields.length, 0);
      for (const evidenceId of [emptyServerEvidenceId.trim(), rejectedValueEvidenceId.trim()]) if (!item.serverEvidenceIds.includes(evidenceId)) item.serverEvidenceIds.push(evidenceId);
      uncertain.status = "recovery_authorized";
      uncertain.probes = [];
      uncertain.reason = "Server canonico a zero righe; nuova generazione autorizzata dalla regola valore oltre massimo -> 1,3 con sorgente e destinazione auditati.";
      uncertain.nextAction = "Ripristinare tutte le righe con 1,3 nel campo ENEA e conservare il valore originario nel payload audit.";
      item.state = "filling";
      item.reason = `Stessa bozza ${item.draftId} riattivata con mapping valore oltre massimo -> 1,3; pagine comuni e ID preservati.`;
      item.nextAction = "Ripristinare le righe Infissi 1:1, salvare il riepilogo e verificare la bozza senza preview o submit.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeInfissiFinalCalculationAfterCheckpointRepair(
    customerKey: string,
    observedCalculationEvidenceId: string,
    commandId: string,
    upgradedPackage: AprEneaDraftPackage,
    now = new Date(),
  ) {
    if (!customerKey.trim() || !observedCalculationEvidenceId.trim()) throw new Error("enea_infissi_final_calculation_recovery_evidence_invalid");
    if (upgradedPackage.module !== "infissi" || upgradedPackage.customerKey !== customerKey
      || !upgradedPackage.workflow.supportedPages.includes("Calcolo costi e detrazioni")
      || upgradedPackage.workflow.steps.find((step) => step.pageName === "Calcolo costi e detrazioni")?.fields.length !== 0
      || !upgradedPackage.infissiPayload?.audit.appliedRuleIds.includes(USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings)) {
      throw new Error("enea_infissi_final_calculation_recovery_package_invalid");
    }
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "infissi_final_calculation_requeued_after_checkpoint_repair",
      customerKey,
      reason: "La pagina Calcolo Infissi era stata omessa dal checkpoint di recupero; la route ENEA e la regola portal-managed sono provate senza valorizzare il risparmio energetico.",
      nextAction: "Aprire la sola pagina Calcolo della stessa bozza, osservare il valore automatico ENEA, salvarla una volta e verificare lato server.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_infissi_final_calculation_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0
        || item.expectedPageIds.includes("page:Calcolo costi e detrazioni")
        || item.pageCheckpoints.some((checkpoint) => checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1 || !checkpoint.savedEvidenceId)
        || item.completedPageIds.length !== item.expectedPageIds.length
        || !item.expectedPageIds.some((pageId) => pageId.startsWith("screening:"))
        || !item.expectedPageIds.includes("page:Serramenti e infissi")
        || !/enea_draft_final_calculation_page_missing/.test(item.reason)) {
        throw new Error(`enea_infissi_final_calculation_recovery_case_invalid:${customerKey}`);
      }
      const calculationPageId = "page:Calcolo costi e detrazioni";
      item.expectedPageIds = expectedPageIdsFromPackage(upgradedPackage);
      if (!item.expectedPageIds.includes(calculationPageId)) throw new Error("enea_infissi_final_calculation_recovery_page_missing");
      item.pageCheckpoints = item.expectedPageIds.map((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId) ?? {
        pageId,
        state: "pending" as const,
        saveAttemptCount: 0 as const,
        recoverySaveAttemptCount: 0 as const,
        recoveryAuthorizedEvidenceId: pageId === calculationPageId ? observedCalculationEvidenceId.trim() : null,
        preparedEvidenceId: null,
        savedEvidenceId: null,
      });
      item.completedPageIds = item.pageCheckpoints.filter((checkpoint) => checkpoint.state === "saved").map((checkpoint) => checkpoint.pageId);
      item.mappingFingerprint = upgradedPackage.packageFingerprint;
      item.workflowFingerprint = upgradedPackage.workflowFingerprint;
      if (!item.serverEvidenceIds.includes(observedCalculationEvidenceId.trim())) item.serverEvidenceIds.push(observedCalculationEvidenceId.trim());
      item.state = "filling";
      item.reason = `Stessa bozza ${item.draftId}: ${item.completedPageIds.length}/${item.expectedPageIds.length} pagine salvate; Calcolo Infissi ripristinato nel checkpoint.`;
      item.nextAction = "Completare esclusivamente Calcolo costi e detrazioni senza valorizzare il risparmio energetico.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeCreatedDraftAfterScreeningNavigationCorrection(customerKey: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !evidenceId.trim()) throw new Error("enea_screening_navigation_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "created_draft_requeued_screening_navigation",
      customerKey,
      reason: "Bozza ENEA esistente riattivata dopo correzione testata dell'apertura annidata Aggiungi schermatura; nessuna nuova bozza creata.",
      nextAction: "Inserire le righe schermatura 1:1 e salvarle nella pagina riepilogativa della stessa bozza.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_screening_navigation_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const screenings = item?.pageCheckpoints.filter((checkpoint) => checkpoint.pageId.startsWith("screening:")) ?? [];
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || item.completedPageIds.length < 1 || screenings.length < 1 || screenings.some((checkpoint) => checkpoint.state !== "pending" || checkpoint.saveAttemptCount !== 0) || item.pageCheckpoints.some((checkpoint) => checkpoint.state === "prepared" || checkpoint.state === "save_intent_recorded") || !/apr_cdp_enea_(?:page_navigation_not_found|screening_activation_failed|screening_add_not_unique|screening_markers_missing):screening:1/.test(item.reason)) throw new Error(`enea_screening_navigation_recovery_case_invalid:${customerKey}`);
      item.expectedPageIds = canonicalPortalPageIds(item.expectedPageIds);
      item.pageCheckpoints = item.expectedPageIds.map((pageId) => item.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId)!);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = "Stessa bozza riattivata; apertura Aggiungi schermatura validata su fixture locale con persistenza dopo reload.";
      item.nextAction = "Riprendere dalla prima riga schermatura pendente senza ripetere pagine già salvate.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  requeueScreeningAfterUnclickedReactContractFailure(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.startsWith("screening:") || !evidenceId.trim()) throw new Error("enea_screening_react_preclick_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "screening_react_contract_requeued_preclick",
      customerKey,
      reason: `Il contratto React di ${pageId} non era ancora allineato prima del click: nessun Salva è stato emesso e la stessa riga viene ripreparata.`,
      nextAction: "Ripreparare la stessa riga sulla stessa bozza; preservare tutte le righe già salvate e non creare duplicati.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      const generationRepair = next.currentCustomerKey === customerKey
        && item?.state === "filling"
        && item.draftId
        && checkpoint?.state === "pending"
        && checkpoint.saveAttemptCount === 0
        && checkpoint.recoverySaveAttemptCount === 0
        && !checkpoint.preparedEvidenceId
        && !checkpoint.savedEvidenceId
        && !checkpoint.recoveryAuthorizedEvidenceId
        && /Stessa bozza riattivata: il journal prova che screening:\d+ non ha emesso alcun click Salva/.test(item.reason);
      if (generationRepair) {
        checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
        if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
        item.reason = `Ripresa ${pageId} riallineata a una nuova generazione idempotente; nessun Salva precedente da ripetere.`;
        item.nextAction = `Ripreparare ${pageId} una sola volta con la nuova generazione e proseguire sulla stessa bozza.`;
        next.status = "running";
        next.sessionEvidenceId = null;
        next.sessionVerifiedAt = null;
        return;
      }
      if (next.currentCustomerKey) throw new Error("enea_screening_react_preclick_recovery_active_case_present");
      if (!item
        || item.state !== "operator_intervention"
        || !item.draftId
        || item.createAttemptCount !== 1
        || item.saveAttemptCount !== 0
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 0
        || checkpoint.savedEvidenceId
        || checkpoint.preparedEvidenceId !== evidenceId.trim()
        || !new RegExp(`apr_cdp_enea_screening_react_contract_not_ready:${pageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(item.reason)) {
        throw new Error(`enea_screening_react_preclick_recovery_case_invalid:${customerKey}`);
      }
      checkpoint.state = "pending";
      checkpoint.saveAttemptCount = 0;
      checkpoint.preparedEvidenceId = null;
      checkpoint.recoveryAuthorizedEvidenceId = evidenceId.trim();
      item.state = "filling";
      item.reason = `Stessa bozza riattivata: il journal prova che ${pageId} non ha emesso alcun click Salva; le righe precedenti restano invariate.`;
      item.nextAction = `Ripreparare ${pageId}, attendere l'allineamento React e registrare l'intento solo dopo la rilettura verde.`;
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeReadOnlyVerificationOfPriorPageSave(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !evidenceId.trim()) throw new Error("enea_page_save_verification_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "page_save_requeued_readonly_verification",
      customerKey,
      reason: `Il precedente click Salva su ${pageId} viene sottoposto a rilettura GET; nessun secondo salvataggio consentito.`,
      nextAction: "Ricaricare la stessa bozza e dimostrare i valori persistiti lato server.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_page_save_verification_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || !checkpoint || checkpoint.state !== "saved" || checkpoint.saveAttemptCount !== 1 || !item.completedPageIds.includes(pageId) || !/apr_cdp_enea_page_navigation_not_found:page:Immobile/.test(item.reason)) throw new Error(`enea_page_save_verification_recovery_case_invalid:${customerKey}`);
      checkpoint.state = "save_intent_recorded";
      checkpoint.savedEvidenceId = null;
      item.completedPageIds = item.completedPageIds.filter((completed) => completed !== pageId);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "save_intent_recorded";
      item.reason = "Salvataggio precedente in verifica read-only; il contatore resta uno.";
      item.nextAction = "Rileggere la pagina dal server; isolare senza retry se i valori non risultano persistiti.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeReadOnlyVerificationOfUncertainPageSave(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !evidenceId.trim()) throw new Error("enea_uncertain_page_save_recovery_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "uncertain_page_save_requeued_readonly_verification",
      customerKey,
      reason: `Il solo click Salva su ${pageId} non viene considerato prova: APR riprende esclusivamente con rilettura GET, senza secondo salvataggio.`,
      nextAction: "Rileggere i valori persistiti lato server sulla stessa bozza; isolare definitivamente il caso se non coincidono.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_uncertain_page_save_recovery_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const page = item?.pageCheckpoints.find((checkpoint) => checkpoint.pageId === pageId);
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || !page || page.state !== "save_intent_recorded" || page.saveAttemptCount !== 1 || !/(?:Esito (?:salvataggio pagina|tecnico incerto dopo il Salva)|apr_cdp_command_timeout:Runtime\.evaluate)/.test(item.reason)) throw new Error(`enea_uncertain_page_save_recovery_case_invalid:${customerKey}`);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "save_intent_recorded";
      item.reason = `Rilettura GET richiesta per ${pageId}; il contatore Salva resta invariato a uno.`;
      item.nextAction = "Verificare i campi salvati senza emettere alcun nuovo Salva.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  recordScreeningStagedFromPostSaveReadOnly(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.startsWith("screening:") || !evidenceId.trim()) throw new Error("enea_screening_post_save_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "screening_staged_from_post_save_readonly",
      customerKey,
      reason: `${pageId} verificata nella tabella riepilogativa dopo l'unico Salva; nessun secondo click emesso.`,
      nextAction: "Proseguire dalla riga successiva sulla stessa bozza, conservando cardinalità e checkpoint.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_screening_post_save_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      const uncertain = item?.uncertainPageSave;
      if (!item || item.state !== "operator_intervention" || !item.draftId || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || checkpoint.savedEvidenceId || !uncertain || uncertain.pageId !== pageId || uncertain.status !== "probing" || !/Esito tecnico incerto dopo il Salva di screening:\d+/.test(item.reason)) throw new Error(`enea_screening_post_save_case_invalid:${customerKey}`);
      checkpoint.state = "staged";
      checkpoint.stagedEvidenceId = evidenceId.trim();
      checkpoint.savedEvidenceId = null;
      uncertain.status = "resolved_staged";
      uncertain.reason = "La tabella read-only successiva al click contiene la riga, ma la persistenza dipende ancora dal Salva esterno.";
      uncertain.nextAction = "Proseguire fino al Salva esterno e verificare la persistenza server.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = `${pageId} verificata nella tabella read-only; persistenza server ancora subordinata al Salva esterno.`;
      item.nextAction = "Riprendere dalla prima pagina o riga non completata senza ripetere salvataggi precedenti.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  recordInfissiRowStagedFromPostClickTable(customerKey: string, pageId: string, observedRowCount: number, evidenceId: string, commandId: string, now = new Date()) {
    const expectedRowCount = Number(pageId.slice("screening:".length));
    if (!customerKey.trim() || !pageId.startsWith("screening:") || !Number.isInteger(expectedRowCount) || expectedRowCount < 1 || observedRowCount !== expectedRowCount || !evidenceId.trim()) throw new Error("enea_infissi_post_click_table_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "infissi_row_staged_from_post_click_table",
      customerKey,
      reason: `${pageId} Infissi confermata dalla tabella post-click con ${observedRowCount} righe 1:1; nessun secondo Salva emesso.`,
      nextAction: "Proseguire dalla riga Infissi successiva; la persistenza definitiva resta verificata dal Salva esterno.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_infissi_post_click_table_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      const uncertain = item?.uncertainPageSave;
      const hasInfissiSummary = item?.pageCheckpoints.some((candidate) => /infiss/i.test(candidate.pageId));
      if (!item || item.state !== "operator_intervention" || !item.draftId || !hasInfissiSummary || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || checkpoint.recoverySaveAttemptCount !== 0 || checkpoint.savedEvidenceId || !uncertain || uncertain.pageId !== pageId || uncertain.status !== "operator_required") throw new Error(`enea_infissi_post_click_table_case_invalid:${customerKey}`);
      checkpoint.state = "staged";
      checkpoint.stagedEvidenceId = evidenceId.trim();
      checkpoint.savedEvidenceId = null;
      uncertain.status = "resolved_staged";
      uncertain.reason = `La tabella post-click mostra esattamente ${observedRowCount} righe tecniche dopo ${pageId}.`;
      uncertain.nextAction = "Proseguire fino al Salva esterno senza ripetere il click della riga.";
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = `${pageId} Infissi staged e verificata 1:1; non ancora dichiarata persistita sul server.`;
      item.nextAction = "Riprendere dalla prima riga o pagina non completata.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  recordScreeningRecoveryStagedFromPostSaveReadOnly(customerKey: string, pageId: string, evidenceId: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.startsWith("screening:") || !evidenceId.trim()) throw new Error("enea_screening_recovery_post_save_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "screening_recovery_staged_from_post_save_readonly",
      customerKey,
      reason: `${pageId} ripristinata e verificata dalla singola riga server dopo l'unico recupero autorizzato.`,
      nextAction: "Proseguire dalla riga successiva; nessun ulteriore Salva sulla riga verificata.",
      appliedRuleIds: [SYSTEM_FAIL_CLOSED_RULE, SYSTEM_SINGLE_RULE, SYSTEM_RESUME_RULE, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    }, (next) => {
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      if (!item
        || next.currentCustomerKey !== customerKey
        || item.state !== "save_intent_recorded"
        || !item.draftId
        || !checkpoint
        || checkpoint.state !== "save_intent_recorded"
        || checkpoint.saveAttemptCount !== 1
        || checkpoint.recoverySaveAttemptCount !== 1
        || !checkpoint.recoveryAuthorizedEvidenceId
        || checkpoint.savedEvidenceId) throw new Error(`enea_screening_recovery_post_save_case_invalid:${customerKey}`);
      checkpoint.state = "staged";
      checkpoint.stagedEvidenceId = evidenceId.trim();
      checkpoint.savedEvidenceId = null;
      item.uncertainPageSave = {
        pageId,
        status: "resolved_staged",
        detectedAt: now.toISOString(),
        detectedEvidenceId: evidenceId.trim(),
        probes: [],
        operatorDecision: null,
        reason: "La tabella read-only contiene la riga ripristinata; la persistenza server resta da confermare dopo il Salva esterno.",
        nextAction: "Proseguire fino al Salva esterno; nessun altro click sulla riga ripristinata.",
      };
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = `${pageId} ripristinata nella tabella; la persistenza server resta da confermare dopo il Salva esterno.`;
      item.nextAction = "Riprendere dalla prima riga o pagina non completata.";
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  recordPageSavedFromServerRedirect(customerKey: string, pageId: string, evidenceId: string, evidenceUrl: string, commandId: string, now = new Date()) {
    if (!customerKey.trim() || !pageId.trim() || !evidenceId.trim()) throw new Error("enea_server_redirect_page_save_evidence_invalid");
    return this.transition("apr-enea-browser-worker", commandId, now, {
      type: "page_saved_from_server_redirect",
      customerKey,
      reason: `Pagina ${pageId} verificata dal redirect server ENEA alla pagina successiva della stessa bozza; nessun secondo Salva.`,
      nextAction: "Proseguire dalla pagina successiva mantenendo invariato il contatore del salvataggio.",
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, SYSTEM_RESUME_RULE],
    }, (next) => {
      if (next.currentCustomerKey) throw new Error("enea_server_redirect_page_save_active_case_present");
      const item = next.items.find((candidate) => candidate.customerKey === customerKey);
      const checkpoint = item?.pageCheckpoints.find((candidate) => candidate.pageId === pageId);
      const parsed = new URL(evidenceUrl);
      const sourceRoute = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Calcolo costi e detrazioni", "calcolo"]]).get(pageId);
      const observedRoute = item?.draftId ? parsed.pathname.match(new RegExp(`^/pratica/ecobonus/2026/([^/]+)/${item.draftId}$`))?.[1] ?? null : null;
      if (!item || item.state !== "operator_intervention" || !item.draftId || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0 || !checkpoint || checkpoint.state !== "save_intent_recorded" || checkpoint.saveAttemptCount !== 1 || !sourceRoute || !observedRoute || observedRoute === sourceRoute || /(?:anteprima|invia|submit|ricevuta|email|elimina|cancella|errore|error)/i.test(observedRoute) || parsed.origin !== "https://bonusfiscali.enea.it" || !/Esito salvataggio pagina/.test(item.reason)) throw new Error(`enea_server_redirect_page_save_case_invalid:${customerKey}`);
      checkpoint.state = "saved";
      checkpoint.savedEvidenceId = evidenceId.trim();
      if (!item.completedPageIds.includes(pageId)) item.completedPageIds.push(pageId);
      if (!item.serverEvidenceIds.includes(evidenceId.trim())) item.serverEvidenceIds.push(evidenceId.trim());
      item.state = "filling";
      item.reason = `${item.completedPageIds.length}/${item.expectedPageIds.length} pagine salvate e verificate; ultima prova: redirect server ENEA.`;
      item.nextAction = "Riprendere dalla prossima pagina non salvata; non aprire anteprima.";
      next.currentCustomerKey = customerKey;
      next.status = "running";
      next.sessionEvidenceId = null;
      next.sessionVerifiedAt = null;
    });
  }

  resumeDecision(now = new Date()) {
    const state = this.load(now);
    const item = state.currentCustomerKey ? state.items.find((candidate) => candidate.customerKey === state.currentCustomerKey) ?? null : null;
    if (!item) return { action: state.status === "login_required" ? "login_required" as const : "claim_next" as const, customerKey: null, draftId: null };
    if (item.state === "create_intent_recorded") return { action: "discover_existing_draft_readonly" as const, customerKey: item.customerKey, draftId: null };
    if (["created", "filling"].includes(item.state)) return { action: "resume_existing_draft" as const, customerKey: item.customerKey, draftId: item.draftId };
    if (item.state === "save_intent_recorded") {
      const page = item.pageCheckpoints.find((checkpoint) => checkpoint.state === "save_intent_recorded");
      return { action: page ? "verify_page_saved_state_readonly" as const : "verify_saved_state_readonly" as const, customerKey: item.customerKey, draftId: item.draftId, ...(page ? { pageId: page.pageId } : {}) };
    }
    return { action: "operator_intervention" as const, customerKey: item.customerKey, draftId: item.draftId };
  }

  assertActionAllowed(action: string) {
    if (/preview|anteprima|submit|invia|ricevuta|email|comunicazione/i.test(action)) throw new Error("enea_test_action_forbidden_by_policy");
    if (!/^(create_draft|fill_allowlisted_field|save_draft|readonly_discovery|readonly_verify)$/i.test(action)) throw new Error("enea_action_not_allowlisted");
    return true;
  }

  snapshot(now = new Date()) {
    const state = this.initialize(now);
    return {
      ...state,
      progress: {
        total: state.items.length,
        queued: state.items.filter((item) => ["queued", "recovery_queued"].includes(item.state)).length,
        recoveryQueued: state.items.filter((item) => item.state === "recovery_queued").length,
        active: state.items.filter((item) => ["create_intent_recorded", "created", "filling", "save_intent_recorded"].includes(item.state)).length,
        saved: state.items.filter((item) => item.state === "saved").length,
        blocked: state.items.filter((item) => item.state === "operator_intervention").length,
        deferred: state.items.filter((item) => item.state === "deferred_operator").length,
      },
      resume: this.resumeDecision(now),
      lastEvent: state.audit.at(-1)!,
      observedAt: now.toISOString(),
    };
  }
}
