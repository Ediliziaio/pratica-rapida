import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { PersistentAprCrmAuthenticatedReadOnly } from "./crmAuthenticatedReadOnly";
import type { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmDocumentAnalysis, type LocalPdfAnalyzer } from "./crmDocumentAnalysis";
import type { PersistentAprCrmIncomingReadOnly } from "./crmIncomingReadOnly";
import { PersistentAprCrmLocalExecutorIntake } from "./crmLocalExecutorIntake";
import { PersistentAprCrmLocalCohortExecutionPlan } from "./crmLocalCohortExecutionPlan";
import { PersistentAprGateOrchestrator } from "./aprGateOrchestrator";
import { PersistentAprEneaReadinessAdmission } from "./aprEneaReadinessAdmission";
import { PersistentAprEneaReadOnlyDiscovery } from "./aprEneaReadOnlyDiscovery";
import { PersistentAprEneaRealReadOnlyAttach } from "./aprEneaRealReadOnlyAttach";
import { PersistentAprCrmLocalDraftHandoff } from "./crmLocalDraftHandoff";
import { PersistentAprCrmLocalDraftPackages } from "./crmLocalDraftPackages";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprCrmOriginalDocuments } from "./crmOriginalDocuments";

export const APR_CRM_LIVE_PROCESSING_VERSION = "apr-crm-live-processing-v1" as const;
const RULE_IDS = [
  "system-apr-crm-dedicated-auth", "system-apr-crm-readonly-adapter-contract", "system-apr-crm-integration-boundary",
  "system-apr-operator-intervention-routing", "system-readonly-adapter-contract", "system-single-active-practice", "system-atomic-checkpoint-resume",
] as const;
const PARSER_REVISIONS = [
  "invoice-parser-v3-ciotta-and-historical-exclusion", "invoice-parser-v4-embedded-copy-deduplication", "invoice-parser-v5-rinaldi-ghitti-identity",
  "invoice-parser-v6-parolo-desando-formats", "invoice-parser-v7-split-header-document-identity", "invoice-parser-v8-rinaldi-galbiati-identity-totals",
  "invoice-parser-v9-cohort39-vendor-measures", "invoice-parser-v10-multipage-invoice-segmentation", "invoice-parser-v11-invoice-reference-and-date",
  "invoice-parser-v12-vans-grouped-products", "invoice-parser-v13-vepa-recognition", "invoice-parser-v14-multipage-vat-inclusive-total",
  "invoice-parser-v15-narrative-product-groups",
  "invoice-parser-v16-suman-vans-bank-transfer",
  "invoice-parser-v17-lm-tende-motorized-zanzariera",
  "invoice-parser-v26-zanzasol-description-after-price",
  "invoice-parser-v28-lm-tende-multi-product-balance",
  "invoice-parser-v29-odhaus-avvolgibili-supporting-declaration",
  "invoice-parser-v30-explicit-surface-and-lm-cardinality",
  "invoice-parser-v31-rinaldi-sp-dot-and-vat-layout",
] as const;
const VALIDATION_REVISIONS = [
  "form-group-product-inheritance-v1", "full-enea-payload-audit-v1", "authorized-gtot-payload-provenance-v2", "test-draft-payload-gate-v3",
  "italian-province-label-normalization-v4", "test-draft-portal-workflow-gate-v5", "analysis-results-after-local-repair-v6",
  "financial-signed-rinaldi-rows-v7", "financial-vendor-total-labels-v8", "financial-rinaldi-galbiati-v9",
  "missing-invoice-default-unit-bank-transfer-v10", "invoice-reference-date-v11", "financial-total-from-unique-invoices-v12",
  "payment-rounding-third-evidence-v13", "worker-validator-ownership-v14", "invoice-type-over-form-group-v15", "vepa-deferred-current-phase-v16",
  "vat-inclusive-multipage-total-v17", "distinct-invoice-numbers-same-customer-sum-v18", "narrative-product-groups-v19",
  "invoice-family-over-form-cardinality-v20", "secondary-home-36-percent-allocation-v21", "linea-sole-potito-paper-form-fallbacks-v22",
  "multipage-bank-transfer-classification-v23",
  "lm-tende-motorized-zanzariera-v24",
  "zanzasol-description-after-price-v26",
  "zanzasol-intervention-reconciliation-v27",
  "lm-tende-multi-product-balance-v28",
  "odhaus-avvolgibili-supporting-declaration-v29",
  "explicit-surface-and-lm-cardinality-v30",
  "invoice-primary-identity-and-single-unit-precedence-v31",
  "rinaldi-sp-dot-and-vat-layout-v32",
] as const;

export interface AprCrmLiveProcessingState {
  version: typeof APR_CRM_LIVE_PROCESSING_VERSION;
  revision: number;
  status: "idle" | "working" | "operator_required" | "completed" | "login_required" | "technical_block";
  phase: "incoming" | "dossiers" | "documents" | "analysis" | "preflight" | "packages" | "handoff" | "executor_intake" | "cohort_execution_plan" | "gate_orchestration" | "enea_readiness_admission" | "enea_readonly_discovery" | "enea_readonly_attach" | "completed";
  lastChildSignature: string | null;
  externalActionAllowed: false;
  crmMutationAllowed: false;
  eneaActionAllowed: false;
  reason: string;
  nextAction: string;
  audit: Array<{ revision: number; at: string; type: "initialized" | "phase_advanced" | "login_required" | "technical_block" | "completed"; reason: string; appliedRuleIds: string[] }>;
}

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmLiveProcessingState {
  const reason = "Runtime CRM live inizializzato; attende eventi Pronte da fare già checkpointati.";
  return { version: APR_CRM_LIVE_PROCESSING_VERSION, revision: 0, status: "idle", phase: "incoming", lastChildSignature: null,
    externalActionAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, reason,
    nextAction: "Attendere eventi CRM read-only persistiti.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason, appliedRuleIds: [...RULE_IDS] }] };
}

function validState(value: AprCrmLiveProcessingState) {
  return value.version === APR_CRM_LIVE_PROCESSING_VERSION && value.externalActionAllowed === false
    && value.crmMutationAllowed === false && value.eneaActionAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

export class PersistentAprCrmLiveProcessing {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly runtimeRoot: string;
  readonly acquisition: PersistentAprCrmAuthenticatedReadOnly;
  readonly documents: PersistentAprCrmOriginalDocuments;
  readonly analysis: PersistentAprCrmDocumentAnalysis;
  readonly preflight: PersistentAprCrmLocalPreflight;
  readonly draftPackages: PersistentAprCrmLocalDraftPackages;
  readonly draftHandoff: PersistentAprCrmLocalDraftHandoff;
  readonly executorIntake: PersistentAprCrmLocalExecutorIntake;
  readonly cohortExecutionPlan: PersistentAprCrmLocalCohortExecutionPlan;
  readonly gateOrchestrator: PersistentAprGateOrchestrator;
  readonly eneaReadinessAdmission: PersistentAprEneaReadinessAdmission;
  readonly eneaReadOnlyDiscovery: PersistentAprEneaReadOnlyDiscovery;
  readonly eneaRealReadOnlyAttach: PersistentAprEneaRealReadOnlyAttach;

  constructor(readonly rootDirectory: string, readonly incoming: PersistentAprCrmIncomingReadOnly, readonly auth: PersistentAprCrmAuth, analyzer?: LocalPdfAnalyzer) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-live-processing");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.runtimeRoot = path.join(this.directory, "runtime");
    this.acquisition = new PersistentAprCrmAuthenticatedReadOnly(this.runtimeRoot, auth);
    this.documents = new PersistentAprCrmOriginalDocuments(this.runtimeRoot, auth);
    this.analysis = new PersistentAprCrmDocumentAnalysis(this.runtimeRoot, analyzer);
    this.preflight = new PersistentAprCrmLocalPreflight(this.runtimeRoot, this.analysis);
    this.draftPackages = new PersistentAprCrmLocalDraftPackages(this.runtimeRoot, this.preflight);
    this.draftHandoff = new PersistentAprCrmLocalDraftHandoff(this.runtimeRoot, this.draftPackages);
    this.executorIntake = new PersistentAprCrmLocalExecutorIntake(this.runtimeRoot, this.draftHandoff);
    this.cohortExecutionPlan = new PersistentAprCrmLocalCohortExecutionPlan(this.runtimeRoot, this.executorIntake);
    this.gateOrchestrator = new PersistentAprGateOrchestrator(this.runtimeRoot, this.cohortExecutionPlan);
    this.eneaReadinessAdmission = new PersistentAprEneaReadinessAdmission(this.runtimeRoot, this.gateOrchestrator);
    this.eneaReadOnlyDiscovery = new PersistentAprEneaReadOnlyDiscovery(this.runtimeRoot, this.gateOrchestrator, this.eneaReadinessAdmission);
    this.eneaRealReadOnlyAttach = new PersistentAprEneaRealReadOnlyAttach(this.runtimeRoot, this.gateOrchestrator, this.eneaReadOnlyDiscovery);
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmLiveProcessingState; return validState(value) ? value : initialState(now); }
    catch { return initialState(now); }
  }

  private write(state: AprCrmLiveProcessingState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    this.acquisition.initialize(now); this.documents.initialize(now); this.analysis.initialize(now); this.preflight.initialize(now); this.draftPackages.initialize(now); this.draftHandoff.initialize(now); this.executorIntake.initialize(now); this.cohortExecutionPlan.initialize(now); this.gateOrchestrator.initialize(now); this.eneaReadinessAdmission.initialize(now); this.eneaReadOnlyDiscovery.initialize(now); this.eneaRealReadOnlyAttach.initialize(now);
    return state;
  }

  private derive(now: Date) {
    const incoming = this.incoming.snapshot(now);
    const acquisition = this.acquisition.snapshot(now);
    const documents = this.documents.snapshot(now);
    const analysis = this.analysis.snapshot(now);
    const preflight = this.preflight.snapshot(now);
    const draftPackages = this.draftPackages.snapshot(now);
    const draftHandoff = this.draftHandoff.snapshot(now);
    const executorIntake = this.executorIntake.snapshot(now);
    const cohortExecutionPlan = this.cohortExecutionPlan.snapshot(now);
    const gateOrchestrator = this.gateOrchestrator.snapshot(now);
    const eneaReadinessAdmission = this.eneaReadinessAdmission.snapshot(now);
    const eneaReadOnlyDiscovery = this.eneaReadOnlyDiscovery.snapshot(now);
    const eneaRealReadOnlyAttach = this.eneaRealReadOnlyAttach.snapshot(now);
    let status: AprCrmLiveProcessingState["status"] = "working";
    let phase: AprCrmLiveProcessingState["phase"] = "incoming";
    let reason = "Attesa degli eventi CRM persistiti.";
    let nextAction = "Continuare il polling read-only della pipeline Pronte da fare.";
    if (incoming.status === "login_required" || acquisition.status === "waiting_auth" || documents.status === "waiting_auth") {
      status = "login_required"; reason = "Sessione CRM dedicata non disponibile; checkpoint conservati."; nextAction = "Ripristinare il login CRM globale dalla dashboard.";
    } else if (incoming.status === "technical_block") {
      status = "technical_block"; reason = incoming.reason; nextAction = incoming.nextAction;
    } else if (!incoming.progress.dispatched) {
      status = "idle"; reason = "IDLE — nessun evento CRM reale da lavorare."; nextAction = "Continuare il polling GET della pipeline Pronte da fare.";
    } else if (acquisition.status !== "completed") {
      phase = "dossiers"; reason = acquisition.reason; nextAction = acquisition.nextAction;
    } else if (acquisition.progress.acquired === 0 && acquisition.progress.blocked > 0) {
      phase = "completed"; status = "operator_required";
      reason = `Acquisizione dossier conclusa: 0 acquisiti, ${acquisition.progress.blocked} bloccati per-pratica; nessun caso e' stato perso.`;
      nextAction = "Mostrare fonte, campo e motivo dei blocchi dossier; le future pratiche restano indipendenti.";
    } else if (documents.status !== "completed") {
      phase = "documents"; reason = documents.reason; nextAction = documents.nextAction;
    } else if (analysis.status !== "completed") {
      phase = "analysis"; reason = analysis.reason; nextAction = analysis.nextAction;
    } else if (preflight.status !== "completed") {
      phase = "preflight"; reason = preflight.reason; nextAction = preflight.nextAction;
    } else if (draftPackages.status === "unprepared") {
      phase = "packages"; reason = "Preflight concluso; verifica persistente dei pacchetti locali in corso."; nextAction = "Costruire e verificare i soli pacchetti dei preflight verdi, senza armare ENEA.";
    } else if (draftPackages.status === "technical_block") {
      phase = "packages"; status = "technical_block"; reason = draftPackages.reason; nextAction = draftPackages.nextAction;
    } else if (draftHandoff.status === "unprepared") {
      phase = "handoff"; reason = "Pacchetti locali verificati; staging fail-closed della coda esecutore in corso."; nextAction = "Creare riferimenti persistenti agli artefatti senza armare il dispatch esterno.";
    } else if (draftHandoff.status === "technical_block") {
      phase = "handoff"; status = "technical_block"; reason = draftHandoff.reason; nextAction = draftHandoff.nextAction;
    } else if (executorIntake.status === "unprepared" || executorIntake.status === "queued" || executorIntake.status === "working") {
      phase = "executor_intake"; reason = executorIntake.reason; nextAction = executorIntake.nextAction;
    } else if (executorIntake.status === "technical_block") {
      phase = "executor_intake"; status = "technical_block"; reason = executorIntake.reason; nextAction = executorIntake.nextAction;
    } else if (cohortExecutionPlan.status === "unprepared" || cohortExecutionPlan.status === "queued_local" || cohortExecutionPlan.status === "working_local") {
      phase = "cohort_execution_plan"; reason = cohortExecutionPlan.reason; nextAction = cohortExecutionPlan.nextAction;
    } else if (cohortExecutionPlan.status === "technical_block") {
      phase = "cohort_execution_plan"; status = "technical_block"; reason = cohortExecutionPlan.reason; nextAction = cohortExecutionPlan.nextAction;
    } else if (cohortExecutionPlan.progress.total > 0 && (gateOrchestrator.status === "unprepared" || gateOrchestrator.status === "working_local")) {
      phase = "gate_orchestration"; reason = gateOrchestrator.reason; nextAction = gateOrchestrator.nextAction;
    } else if (gateOrchestrator.gates.some((gate) => gate.gateId === "external_enea_readiness_admission" && gate.state === "waiting_safety_gate") && eneaReadinessAdmission.status !== "completed_local_admission" && eneaReadinessAdmission.status !== "technical_block") {
      phase = "enea_readiness_admission"; reason = eneaReadinessAdmission.reason; nextAction = eneaReadinessAdmission.nextAction;
    } else if (eneaReadinessAdmission.status === "technical_block") {
      phase = "enea_readiness_admission"; status = "technical_block"; reason = eneaReadinessAdmission.reason; nextAction = eneaReadinessAdmission.nextAction;
    } else if (gateOrchestrator.gates.some((gate) => gate.gateId === "operational_enea_readonly_discovery" && gate.state === "waiting_safety_gate") && eneaReadOnlyDiscovery.status !== "completed_local_discovery" && eneaReadOnlyDiscovery.status !== "technical_block") {
      phase = "enea_readonly_discovery"; reason = eneaReadOnlyDiscovery.reason; nextAction = eneaReadOnlyDiscovery.nextAction;
    } else if (eneaReadOnlyDiscovery.status === "technical_block") {
      phase = "enea_readonly_discovery"; status = "technical_block"; reason = eneaReadOnlyDiscovery.reason; nextAction = eneaReadOnlyDiscovery.nextAction;
    } else if (gateOrchestrator.gates.some((gate) => gate.gateId === "real_enea_readonly_attach" && gate.state === "waiting_safety_gate") && eneaRealReadOnlyAttach.status === "unprepared") {
      phase = "enea_readonly_attach"; status = "technical_block"; reason = eneaRealReadOnlyAttach.reason; nextAction = eneaRealReadOnlyAttach.nextAction;
    } else if (eneaRealReadOnlyAttach.status === "technical_block") {
      phase = "enea_readonly_attach"; status = "technical_block"; reason = eneaRealReadOnlyAttach.reason; nextAction = eneaRealReadOnlyAttach.nextAction;
    } else if (gateOrchestrator.gates.some((gate) => gate.gateId === "real_enea_server_readonly_probe" && gate.state === "completed")) {
      phase = "completed";
      status = preflight.progress.blocked || acquisition.progress.blocked || documents.progress.blocked || analysis.progress.blocked ? "operator_required" : "completed";
      reason = status === "operator_required"
        ? `Readiness ENEA reale verde; ${preflight.progress.blocked + acquisition.progress.blocked + documents.progress.blocked + analysis.progress.blocked} casi precedenti restano isolati per intervento operatore.`
        : "Readiness ENEA reale verde; nessuna coda operativa attualmente armata.";
      nextAction = status === "operator_required" ? "Conservare i casi isolati e attendere una nuova coda eseguibile." : "IDLE — attendere una nuova coda APR persistente.";
    } else if (cohortExecutionPlan.progress.total > 0 && (gateOrchestrator.status === "waiting_external_safety_gate" || gateOrchestrator.status === "technical_block")) {
      phase = "gate_orchestration"; status = "technical_block"; reason = gateOrchestrator.reason; nextAction = gateOrchestrator.nextAction;
    } else {
      phase = "completed";
      status = preflight.progress.blocked || acquisition.progress.blocked || documents.progress.blocked || analysis.progress.blocked ? "operator_required" : "completed";
      reason = `Preflight live concluso: ${preflight.progress.ready} pronti, ${preflight.progress.blocked} bloccati; ${acquisition.progress.blocked} blocchi dossier, ${documents.progress.blocked} allegati bloccati.`;
      nextAction = status === "operator_required" ? "Mostrare fonte, campo, motivo e domanda per-pratica; nessun blocco ferma gli altri casi." : "Gate locale completato; fermo prima di ENEA.";
    }
    const childSignature = sha256({ incoming: incoming.revision, acquisition: acquisition.revision, documents: documents.revision, analysis: analysis.revision, preflight: preflight.revision, draftPackages: draftPackages.revision, draftHandoff: draftHandoff.revision, executorIntake: executorIntake.revision, cohortExecutionPlan: cohortExecutionPlan.revision, gateOrchestrator: gateOrchestrator.revision, eneaReadinessAdmission: eneaReadinessAdmission.revision, eneaReadOnlyDiscovery: eneaReadOnlyDiscovery.revision, eneaRealReadOnlyAttach: eneaRealReadOnlyAttach.revision, status, phase });
    return { incoming, acquisition, documents, analysis, preflight, draftPackages, draftHandoff, executorIntake, cohortExecutionPlan, gateOrchestrator, eneaReadinessAdmission, eneaReadOnlyDiscovery, eneaRealReadOnlyAttach, status, phase, reason, nextAction, childSignature };
  }

  private recordDerived(now: Date) {
    const derived = this.derive(now);
    const current = this.load(now);
    if (current.lastChildSignature === derived.childSignature) return current;
    const next = structuredClone(current);
    next.revision += 1; next.status = derived.status; next.phase = derived.phase; next.reason = derived.reason; next.nextAction = derived.nextAction; next.lastChildSignature = derived.childSignature;
    const type = derived.status === "login_required" ? "login_required" : derived.status === "technical_block" ? "technical_block" : derived.phase === "completed" ? "completed" : "phase_advanced";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type, reason: `${derived.phase}: ${derived.reason}`, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  async tick(now = new Date()) {
    this.initialize(now);
    const incoming = this.incoming.snapshot(now);
    const dispatched = incoming.items.filter((item) => item.state === "dispatched" && item.event && item.practiceId);
    if (dispatched.length && this.acquisition.snapshot(now).status === "unprepared") {
      this.acquisition.prepareIncoming(dispatched.map((item) => ({ eventId: item.eventId, practiceId: item.practiceId!, displayName: item.displayName })), now);
    }
    if (this.acquisition.snapshot(now).status !== "completed") await this.acquisition.tick(now);
    const acquisition = this.acquisition.snapshot(now);
    if (acquisition.status === "completed") {
      const dossiers = acquisition.items.filter((item) => item.state === "acquired" && item.practiceId && item.dossierPath)
        .map((item) => ({ customerKey: item.customerKey, practiceId: item.practiceId!, dossierPath: item.dossierPath! }));
      if (this.documents.snapshot(now).status === "unprepared") this.documents.prepare(dossiers, now);
    }
    this.documents.applyOriginalImageSupport("original-images-png-jpeg-v1", now);
    this.documents.applyOriginalImageSupport("original-images-storage-contract-v2", now);
    if (this.documents.snapshot(now).status !== "completed") await this.documents.tick(now);
    const documents = this.documents.snapshot(now);
    if (documents.status === "completed" && documents.sourceSetFingerprint) {
      const analysisInputs = documents.items.filter((item) => item.state === "downloaded" && item.localPath && item.responseSha256)
        .map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, localPath: item.localPath!, responseSha256: item.responseSha256! }));
      const analysisFingerprint = sha256({ sourceSetFingerprint: documents.sourceSetFingerprint,
        downloaded: analysisInputs.map((item) => ({ documentKey: item.documentKey, responseSha256: item.responseSha256 })).sort((left, right) => left.documentKey.localeCompare(right.documentKey)) });
      const analysisBefore = this.analysis.snapshot(now);
      if (analysisBefore.status === "unprepared") this.analysis.prepare(analysisInputs, analysisFingerprint, now);
      else if (analysisBefore.status === "completed" && analysisBefore.sourceFingerprint !== analysisFingerprint) this.analysis.extendAfterDocumentCorrection(analysisInputs, analysisFingerprint, now);
    }
    this.analysis.applyAnalyzerRepair("pdf-analyzer-live-runtime-path-v2", now);
    this.analysis.applyNonFiscalImageRepair("original-image-non-fiscal-classification-v3", now);
    if (this.analysis.snapshot(now).status !== "completed") await this.analysis.tick(now);
    if (this.analysis.snapshot(now).status === "completed") for (const revision of PARSER_REVISIONS) this.analysis.applyParserRevision(revision, now);
    const analysis = this.analysis.snapshot(now);
    if (acquisition.status === "completed" && analysis.status === "completed") {
      const acquired = acquisition.items.filter((item) => item.state === "acquired");
      if (acquired.length) {
        const sourceFingerprint = sha256({ candidateFingerprint: acquisition.candidateFingerprint, sourceFingerprint: analysis.sourceFingerprint, parserRevisionsApplied: analysis.parserRevisionsApplied,
          analysisEvidence: analysis.items.map((item) => ({ documentKey: item.documentKey, state: item.state, textSha256: item.textSha256, nonFiscalImageExcluded: item.nonFiscalImageExcluded })).sort((left, right) => left.documentKey.localeCompare(right.documentKey)) });
        const preflightBefore = this.preflight.snapshot(now);
        if (preflightBefore.status === "unprepared") this.preflight.prepare(acquired, sourceFingerprint, now);
        else if (preflightBefore.status === "completed" && preflightBefore.sourceFingerprint !== sourceFingerprint) {
          this.preflight.applySourceRevision(acquired, sourceFingerprint, `source-set-${sourceFingerprint.slice(0, 16)}`, now);
        }
      }
    }
    if (this.preflight.snapshot(now).status !== "completed") this.preflight.tick(now);
    if (this.preflight.snapshot(now).status === "completed") for (const revision of VALIDATION_REVISIONS) this.preflight.applyValidationRevision(revision, now);
    if (this.preflight.snapshot(now).status === "completed") this.draftPackages.synchronize(now);
    if (this.draftPackages.snapshot(now).status === "completed") this.draftHandoff.synchronize(now);
    if (this.draftHandoff.snapshot(now).status === "staged_fail_closed") this.executorIntake.tick(now);
    if (this.executorIntake.snapshot(now).status === "completed_local") this.cohortExecutionPlan.tick(now);
    if (this.cohortExecutionPlan.snapshot(now).status === "completed_local_simulation") this.gateOrchestrator.tick(now);
    if (this.gateOrchestrator.snapshot(now).gates.some((gate) => gate.gateId === "external_enea_readiness_admission" && gate.state === "waiting_safety_gate")) this.eneaReadinessAdmission.tick(now);
    if (this.gateOrchestrator.snapshot(now).gates.some((gate) => gate.gateId === "operational_enea_readonly_discovery" && gate.state === "waiting_safety_gate")) this.eneaReadOnlyDiscovery.tick(now);
    this.recordDerived(now);
    return this.snapshot(now);
  }

  snapshot(now = new Date()) {
    this.initialize(now);
    const state = this.load(now);
    const derived = this.derive(now);
    return {
      ...state, status: derived.status, phase: derived.phase, reason: derived.reason, nextAction: derived.nextAction,
      progress: {
        total: derived.acquisition.progress.total || derived.incoming.progress.dispatched,
        dossiersAcquired: derived.acquisition.progress.acquired,
        dossierBlocks: derived.acquisition.progress.blocked,
        documentsDownloaded: derived.documents.progress.downloaded,
        documentBlocks: derived.documents.progress.blocked,
        documentsAnalyzed: derived.analysis.progress.analyzed,
        analysisBlocks: derived.analysis.progress.blocked,
        nonFiscalImagesExcluded: derived.analysis.items.filter((item) => item.nonFiscalImageExcluded).length,
        preflightReady: derived.preflight.progress.ready,
        preflightBlocked: derived.preflight.progress.blocked,
        localDraftPackagesVerified: derived.draftPackages.progress.verifiedPackages,
        unsupportedProductModules: derived.draftPackages.progress.unsupportedModules,
        operatorRequiredCases: derived.draftPackages.progress.operatorRequired,
        localDraftHandoffStaged: derived.draftHandoff.progress.staged,
        localExecutorReleased: derived.executorIntake.progress.released,
        localExecutorRecovered: derived.executorIntake.progress.recovered,
        cohortPlansCompleted: derived.cohortExecutionPlan.progress.completed,
        cohortPagesSaved: derived.cohortExecutionPlan.progress.pagesSaved,
        cohortPlanRecoveries: derived.cohortExecutionPlan.progress.recoveries,
        gatesCompleted: derived.gateOrchestrator.progress.completed,
        gatesWaitingSafety: derived.gateOrchestrator.progress.waitingSafety,
        readinessAdmissionPhasesCompleted: derived.eneaReadinessAdmission.progress.completedPhases,
        readOnlyDiscoveryPhasesCompleted: derived.eneaReadOnlyDiscovery.progress.completedPhases,
        readOnlyAttachTransportChecksPassed: derived.eneaRealReadOnlyAttach.transportChecksPassed,
      },
      current: {
        dossier: derived.acquisition.currentCustomerKey,
        document: derived.documents.currentDocumentKey,
        analysis: derived.analysis.currentDocumentKey,
        preflight: derived.preflight.currentCustomerKey,
      },
      cases: derived.preflight.items.map((item) => ({ customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId, state: item.state,
        reason: item.reason, blockers: item.report?.blockers ?? [], warnings: item.report?.warnings ?? [], sourceIds: item.report?.sourceIds ?? [] })),
      draftPackages: derived.draftPackages,
      draftHandoff: derived.draftHandoff,
      executorIntake: derived.executorIntake,
      cohortExecutionPlan: derived.cohortExecutionPlan,
      gateOrchestrator: derived.gateOrchestrator,
      eneaReadinessAdmission: derived.eneaReadinessAdmission,
      eneaReadOnlyDiscovery: derived.eneaReadOnlyDiscovery,
      eneaRealReadOnlyAttach: derived.eneaRealReadOnlyAttach,
      componentRevisions: { incoming: derived.incoming.revision, acquisition: derived.acquisition.revision, documents: derived.documents.revision, analysis: derived.analysis.revision, preflight: derived.preflight.revision, draftPackages: derived.draftPackages.revision, draftHandoff: derived.draftHandoff.revision, executorIntake: derived.executorIntake.revision, cohortExecutionPlan: derived.cohortExecutionPlan.revision, gateOrchestrator: derived.gateOrchestrator.revision, eneaReadinessAdmission: derived.eneaReadinessAdmission.revision, eneaReadOnlyDiscovery: derived.eneaReadOnlyDiscovery.revision, eneaRealReadOnlyAttach: derived.eneaRealReadOnlyAttach.revision },
      observedAt: now.toISOString(), lastEvent: state.audit.at(-1)!,
    };
  }
}
