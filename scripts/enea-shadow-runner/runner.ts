import type { AuditedOperatorPractice } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { registryRule, USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { fiscalCodeMatchesIdentity, resolveBeneficiaryFiscalCode, type FiscalCodeIdentity } from "../../src/features/enea-shadow-crm/operationalRules";
import type { EneaPreflightRun } from "../../src/features/enea-shadow-crm/preflightContract";
import { isCompleteReadyPreflight } from "../../src/features/enea-shadow-crm/preflightContract";
import { requiredCrmManualComparisonExclusions } from "../../src/features/enea-shadow-crm/comparisonPolicy";
import { writeLocalDashboard } from "./dashboard";
import { JournalStore, RunnerBusyError } from "./journalStore";
import { readOnlyPreflightAllowed, runnerPracticeOperationsAllowed } from "./readinessLease";
import type {
  PersistentRunnerState,
  RunnerAuditEvent,
  RunnerAuditEventType,
  SubmissionProof,
} from "./types";

export const RUNNER_LEASE_MS = 15_000;

export interface PersistentEneaRunnerOptions {
  allowPracticeOperationsForTest?: boolean;
}

export interface ReadOnlyPreflightTicketInput {
  run: EneaPreflightRun;
  sources: Array<{ sourceId: string; kind: "form" | "document" | "operator_policy" | "audit"; verification: "verified" | "pending"; note: string }>;
  appliedRuleIds: string[];
  reason: string;
  nextAction: string;
}

export class RunnerReadinessBlockedError extends Error {
  constructor(message = "Coda bloccata globalmente: readiness reale non verificata.") {
    super(message);
    this.name = "RunnerReadinessBlockedError";
  }
}

interface CommitInput {
  idempotencyKey: string;
  at: Date;
  type: RunnerAuditEventType;
  practiceId: string | null;
  appliedRuleIds: string[];
  reason: string;
  nextAction: string;
  mutate: (state: PersistentRunnerState) => void;
}

function validateRuleIds(ruleIds: string[]) {
  if (!ruleIds.length || ruleIds.some((ruleId) => registryRule(ruleId) === null)) {
    throw new Error(`Transizione senza ID validi del registro unico: ${ruleIds.join(", ") || "nessuno"}.`);
  }
}

function proofIsConclusive(proof: SubmissionProof): boolean {
  return proof.source === "enea_dashboard_read_only"
    && proof.dashboardStatus === "Inviata"
    && /^[A-Z0-9][A-Z0-9-]{5,}$/i.test(proof.cpid.trim())
    && Boolean(proof.evidenceId.trim())
    && Number.isFinite(Date.parse(proof.observedAt));
}

export class PersistentEneaRunner {
  readonly store: JournalStore;
  readonly allowPracticeOperationsForTest: boolean;

  constructor(readonly rootDirectory: string, options: PersistentEneaRunnerOptions = {}) {
    this.store = new JournalStore(rootDirectory);
    this.allowPracticeOperationsForTest = options.allowPracticeOperationsForTest === true;
  }

  initialize(queue: ReadonlyArray<AuditedOperatorPractice> = DEFAULT_AUDITED_OPERATOR_QUEUE, now = new Date()) {
    return this.store.withProcessLock("initializer", now, () => {
      const state = this.store.initialize(queue, now);
      writeLocalDashboard(this.rootDirectory, state, now);
      return state;
    });
  }

  load() { return this.store.load(); }

  private assertPracticeOperationsAllowed(now: Date) {
    if (this.allowPracticeOperationsForTest) return;
    if (!runnerPracticeOperationsAllowed(this.rootDirectory, now)) throw new RunnerReadinessBlockedError();
  }

  private commit(ownerId: string, input: CommitInput): PersistentRunnerState {
    validateRuleIds(input.appliedRuleIds);
    const current = this.store.load();
    if (current.processedIdempotencyKeys.includes(input.idempotencyKey)) return current;
    const state = structuredClone(current);
    const revision = current.revision + 1;
    input.mutate(state);
    state.revision = revision;
    state.updatedAt = input.at.toISOString();
    state.processedIdempotencyKeys.push(input.idempotencyKey);
    const event: RunnerAuditEvent = {
      id: `runner-event-${String(revision).padStart(12, "0")}-${input.type}`,
      revision,
      at: input.at.toISOString(),
      type: input.type,
      practiceId: input.practiceId,
      idempotencyKey: input.idempotencyKey,
      appliedRuleIds: [...input.appliedRuleIds],
      reason: input.reason,
      nextAction: input.nextAction,
      ownerId,
    };
    state.audit.push(event);
    this.store.writeCheckpoint(state);
    writeLocalDashboard(this.rootDirectory, state, input.at);
    return state;
  }

  start(ownerId: string, idempotencyKey: string, now = new Date()): PersistentRunnerState {
    this.assertPracticeOperationsAllowed(now);
    return this.store.withProcessLock(ownerId, now, () => {
      const state = this.store.load();
      if (state.processedIdempotencyKeys.includes(idempotencyKey)) return state;
      const leaseActive = state.runner.ownerId && state.runner.leaseUntil && Date.parse(state.runner.leaseUntil) > now.getTime();
      if (leaseActive && state.runner.ownerId !== ownerId) throw new RunnerBusyError(`Lease runner attiva per ${state.runner.ownerId}.`);
      const recovered = Boolean(state.runner.ownerId && state.runner.ownerId !== ownerId);
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: recovered ? "runner_lease_recovered" : "runner_started",
        practiceId: state.runner.currentPracticeId,
        appliedRuleIds: ["system-exclusive-runner-lease", "system-atomic-checkpoint-resume"],
        reason: recovered ? "Lease runner scaduta recuperata; checkpoint corrente conservato." : "Runner locale avviato.",
        nextAction: state.runner.currentPracticeId ? "Riprendere la pratica corrente dal checkpoint." : "Selezionare una sola pratica dalla coda.",
        mutate: (next) => {
          next.runner.status = "running";
          next.runner.ownerId = ownerId;
          next.runner.heartbeatAt = now.toISOString();
          next.runner.leaseUntil = new Date(now.getTime() + RUNNER_LEASE_MS).toISOString();
          next.runner.reason = recovered ? "Checkpoint recuperato dopo scadenza lease runner." : "Runner locale attivo.";
          next.runner.nextAction = state.runner.currentPracticeId ? "Riprendere dal checkpoint persistente." : "Selezionare la prossima pratica.";
        },
      });
    });
  }

  tick(ownerId: string, idempotencyKey: string, now = new Date()): PersistentRunnerState {
    this.assertPracticeOperationsAllowed(now);
    return this.store.withProcessLock(ownerId, now, () => {
      let state = this.store.load();
      if (state.processedIdempotencyKeys.includes(idempotencyKey)) return state;
      const foreignLeaseActive = state.runner.ownerId && state.runner.ownerId !== ownerId
        && state.runner.leaseUntil && Date.parse(state.runner.leaseUntil) > now.getTime();
      if (foreignLeaseActive) throw new RunnerBusyError(`Lease runner attiva per ${state.runner.ownerId}.`);
      if (state.runner.ownerId !== ownerId) {
        const previousOwner = state.runner.ownerId;
        state = this.commit(ownerId, {
          idempotencyKey: `${idempotencyKey}:recover`,
          at: now,
          type: previousOwner ? "runner_lease_recovered" : "runner_started",
          practiceId: state.runner.currentPracticeId,
          appliedRuleIds: ["system-exclusive-runner-lease", "system-atomic-checkpoint-resume"],
          reason: previousOwner ? "Lease runner scaduta recuperata; checkpoint corrente conservato." : "Runner locale avviato dal primo tick.",
          nextAction: state.runner.currentPracticeId ? "Riprendere la pratica corrente dal checkpoint." : "Selezionare una sola pratica dalla coda.",
          mutate: (next) => {
            next.runner.status = "running";
            next.runner.ownerId = ownerId;
            next.runner.heartbeatAt = now.toISOString();
            next.runner.leaseUntil = new Date(now.getTime() + RUNNER_LEASE_MS).toISOString();
            next.runner.reason = previousOwner ? "Checkpoint recuperato dopo scadenza lease runner." : "Runner locale attivo.";
            next.runner.nextAction = next.runner.currentPracticeId ? "Riprendere dal checkpoint persistente." : "Selezionare la prossima pratica.";
          },
        });
        if (state.runner.status !== "running") return state;
      }
      if (state.runner.status !== "running") return state;

      const current = state.queue.find((job) => job.practice.id === state.runner.currentPracticeId) ?? null;
      if (!current) {
        const selected = state.queue.find((job) => job.executionState !== "completed" && job.executionState !== "legacy_submit_uncertain") ?? null;
        if (!selected) {
          return this.commit(ownerId, {
            idempotencyKey, at: now, type: "run_completed", practiceId: null,
            appliedRuleIds: ["system-run-completed", "system-atomic-checkpoint-resume"],
            reason: "Tutte le pratiche hanno una prova conclusiva valida.", nextAction: "Nessuna.",
            mutate: (next) => { next.runner.status = "completed"; next.runner.currentPracticeId = null; next.runner.reason = "Run completato."; next.runner.nextAction = "Nessuna."; },
          });
        }
        return this.commit(ownerId, {
          idempotencyKey, at: now, type: "job_selected", practiceId: selected.practice.id,
          appliedRuleIds: ["system-single-active-practice", "system-atomic-checkpoint-resume"],
          reason: `Selezionata ${selected.practice.code} senza mutare dati business.`,
          nextAction: "Valutare il checkpoint persistente corrente.",
          mutate: (next) => {
            const job = next.queue.find((candidate) => candidate.practice.id === selected.practice.id)!;
            job.executionState = "checkpoint_resumable";
            job.selectionCount += 1;
            next.runner.currentPracticeId = job.practice.id;
            next.runner.heartbeatAt = now.toISOString();
            next.runner.leaseUntil = new Date(now.getTime() + RUNNER_LEASE_MS).toISOString();
            next.runner.reason = `Pratica ${job.practice.code} selezionata.`;
            next.runner.nextAction = "Riprendere dal checkpoint senza ripetere passi conclusi.";
          },
        });
      }

      if (current.practice.status === "submitted_manual_exception" && !current.submissionProof) {
        return this.commit(ownerId, {
          idempotencyKey, at: now, type: "submission_proof_required", practiceId: current.practice.id,
          appliedRuleIds: ["system-submission-proof-required", "core-single-submit-cpid", "system-atomic-checkpoint-resume"],
          reason: "Invio riferito ma non provato dalla dashboard ENEA con stato Inviata e CPID.",
          nextAction: "Acquisire in futuro una prova read-only della dashboard Inviata con CPID; non ritentare il submit.",
          mutate: (next) => {
            const job = next.queue.find((candidate) => candidate.practice.id === current.practice.id)!;
            job.executionState = "awaiting_submission_proof";
            next.runner.status = "stopped";
            next.runner.reason = "Intervento operatore: prova Inviata + CPID assente.";
            next.runner.nextAction = "Fornire una prova dashboard read-only verificabile; nessun retry.";
          },
        });
      }

      if (current.practice.activeBlock || current.practice.status === "requested_operator") {
        return this.commit(ownerId, {
          idempotencyKey, at: now, type: "operator_block_recorded", practiceId: current.practice.id,
          appliedRuleIds: ["system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
          reason: current.practice.activeBlock ?? current.practice.reason,
          nextAction: current.practice.nextAction,
          mutate: (next) => {
            const job = next.queue.find((candidate) => candidate.practice.id === current.practice.id)!;
            job.executionState = "operator_intervention";
            next.runner.status = "stopped";
            next.runner.reason = current.practice.activeBlock ?? current.practice.reason;
            next.runner.nextAction = current.practice.nextAction;
          },
        });
      }

      return this.commit(ownerId, {
        idempotencyKey, at: now, type: "checkpoint_preserved", practiceId: current.practice.id,
        appliedRuleIds: ["system-atomic-checkpoint-resume"],
        reason: `Checkpoint ${current.checkpoint.step} persistito; nessun adattatore business o portale è attivo.`,
        nextAction: current.practice.nextAction,
        mutate: (next) => {
          const job = next.queue.find((candidate) => candidate.practice.id === current.practice.id)!;
          job.executionState = "checkpoint_resumable";
          next.runner.status = "stopped";
          next.runner.reason = `Checkpoint ${job.checkpoint.step} riprendibile.`;
          next.runner.nextAction = job.practice.nextAction;
        },
      });
    });
  }

  recordAuthorizedReadOnlyPreflight(
    ownerId: string,
    practiceId: string,
    input: ReadOnlyPreflightTicketInput,
    idempotencyKey: string,
    now = new Date(),
  ): PersistentRunnerState {
    if (!this.allowPracticeOperationsForTest && !readOnlyPreflightAllowed(this.rootDirectory)) {
      throw new RunnerReadinessBlockedError("Preflight read-only bloccato: readiness browser reale non verificata.");
    }
    if (!input.reason.trim() || !input.nextAction.trim()) throw new Error("Ticket preflight privo di motivo o prossima azione.");
    if (input.run.steps.length !== 8 || input.run.steps.some((step) => !step.source.trim() || !step.ruleVersion.trim())) {
      throw new Error("Matrice preflight incompleta o priva di provenienza.");
    }
    if (input.run.caseOverrides?.some((override) => !override.id.trim()
      || override.practiceId !== practiceId
      || !override.field.trim()
      || !override.value.trim()
      || override.scope !== "single_practice_test"
      || override.propagation !== "forbidden"
      || override.authorizationSource !== "explicit_user_authorization"
      || !Number.isFinite(Date.parse(override.authorizedAt))
      || !override.reason.trim())) {
      throw new Error("Override caso-specifico non valido, propagabile o riferito a un'altra pratica.");
    }
    validateRuleIds(input.appliedRuleIds);
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const selected = current.queue.find((job) => job.practice.id === practiceId);
      if (!selected || ["completed", "legacy_submit_uncertain", "draft_saved"].includes(selected.executionState)) throw new Error("La pratica esplicitamente autorizzata non è azionabile.");
      if (current.runner.currentPracticeId && current.runner.currentPracticeId !== practiceId) throw new Error("Un'altra pratica è già corrente.");
      const conflict = input.run.outcome === "requested_operator";
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: conflict ? "preflight_conflict_recorded" : "preflight_ready_recorded",
        practiceId,
        appliedRuleIds: input.appliedRuleIds,
        reason: input.reason,
        nextAction: input.nextAction,
        mutate: (next) => {
          const job = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          const failed = input.run.steps.find((step) => !step.ok);
          const queueStep = failed?.step === "customer_form" ? "form"
            : failed?.step === "identity_property" ? "identity_property"
              : failed?.step === "dates" ? "dates"
                : failed?.step === "economic_sources" || failed?.step === "gross_reconciliation" ? "sources_economy"
                  : failed?.step === "screenings" ? "screenings"
                    : failed?.step === "plant" ? "plant" : "enea_mapping";
          job.selectionCount += next.runner.currentPracticeId === practiceId ? 0 : 1;
          job.preflightRun = structuredClone(input.run);
          job.executionState = conflict ? "operator_intervention" : "checkpoint_resumable";
          job.checkpoint = { step: queueStep, practiceRevision: job.practice.revision + 1, resumable: true };
          const uniqueSources = input.sources.filter((source) => !job.practice.sources.some((existing) => existing.sourceId === source.sourceId));
          job.practice.sources = [...job.practice.sources, ...uniqueSources];
          job.practice.appliedRules = [...new Set([...job.practice.appliedRules, ...input.appliedRuleIds])];
          job.practice.revision += 1;
          job.practice.currentStep = queueStep;
          job.practice.status = conflict ? "requested_operator" : "preflight_ready";
          job.practice.activeBlock = conflict ? input.reason : null;
          job.practice.reason = input.reason;
          job.practice.nextAction = input.nextAction;
          job.practice.updatedAt = now.toISOString();
          job.practice.audit = [...job.practice.audit, {
            id: `${practiceId}:audit:${job.practice.revision}`,
            at: now.toISOString(),
            type: conflict ? "block_recorded" : "checkpoint_reached",
            step: queueStep,
            appliedRuleIds: [...input.appliedRuleIds],
            note: input.reason,
          }];
          next.runner.currentPracticeId = practiceId;
          next.runner.status = "stopped";
          next.runner.ownerId = null;
          next.runner.heartbeatAt = now.toISOString();
          next.runner.leaseUntil = now.toISOString();
          next.runner.reason = input.reason;
          next.runner.nextAction = input.nextAction;
        },
      });
    });
  }

  beginAuthorizedDraft(ownerId: string, practiceId: string, idempotencyKey: string, now = new Date()) {
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job || current.runner.currentPracticeId !== practiceId || job.practice.status !== "preflight_ready" || !isCompleteReadyPreflight(job.preflightRun ?? undefined)) {
        throw new Error("Creazione bozza vietata: serve il preflight verde persistente della pratica corrente.");
      }
      if (job.draftRun?.status === "saved") return current;
      return this.commit(ownerId, { idempotencyKey, at: now, type: "draft_started", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, "core-preview-required", "system-atomic-checkpoint-resume"],
        reason: "Avvio autorizzato della sola bozza ENEA da preflight verde; anteprima finale e submit esclusi.", nextAction: "Creare la bozza una sola volta e registrare immediatamente l'ID portale.",
        mutate: (next) => { const target=next.queue.find((candidate)=>candidate.practice.id===practiceId)!; target.executionState="draft_in_progress"; target.draftRun={status:"creating",preflightId:target.preflightRun!.id,policyRuleId:USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,draftId:null,portalUrl:null,startedAt:now.toISOString(),savedAt:null,evidenceCount:0,error:null}; next.runner.status="stopped"; next.runner.reason="Creazione bozza ENEA autorizzata e in corso."; next.runner.nextAction="Registrare l'ID bozza prima della compilazione."; },
      });
    });
  }

  recordDraftCreated(ownerId:string, practiceId:string, draftId:string, portalUrl:string, idempotencyKey:string, now=new Date()) {
    if (!draftId.trim() || !portalUrl.startsWith("https://bonusfiscali.enea.it/")) throw new Error("Prova creazione bozza ENEA non valida.");
    return this.store.withProcessLock(ownerId, now, () => { const current=this.store.load(); if(current.processedIdempotencyKeys.includes(idempotencyKey)) return current; const job=current.queue.find(c=>c.practice.id===practiceId); if(!job?.draftRun || job.draftRun.status!=="creating") throw new Error("Intento bozza mancante o stato non riprendibile."); return this.commit(ownerId,{idempotencyKey,at:now,type:"draft_created",practiceId,appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,"system-atomic-checkpoint-resume"],reason:`Bozza ENEA creata con ID ${draftId}; nessuna anteprima o submit.`,nextAction:"Compilare e salvare la stessa bozza.",mutate:(next)=>{const target=next.queue.find(c=>c.practice.id===practiceId)!; target.draftRun={...target.draftRun!,status:"created",draftId:draftId.trim(),portalUrl}; next.runner.reason="Bozza ENEA creata; compilazione e salvataggio autorizzati."; next.runner.nextAction="Compilare e salvare senza anteprima finale né submit.";}}); });
  }

  recordDraftSaved(ownerId:string, practiceId:string, draftId:string, portalUrl:string, evidenceCount:number, idempotencyKey:string, now=new Date()) {
    return this.store.withProcessLock(ownerId, now, () => { const current=this.store.load(); if(current.processedIdempotencyKeys.includes(idempotencyKey)) return current; const job=current.queue.find(c=>c.practice.id===practiceId); if(!job?.draftRun || job.draftRun.status!=="created" || job.draftRun.draftId!==draftId || !Number.isInteger(evidenceCount) || evidenceCount<1) throw new Error("Prova salvataggio bozza incoerente."); return this.commit(ownerId,{idempotencyKey,at:now,type:"draft_saved",practiceId,appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft,"system-atomic-checkpoint-resume"],reason:`Bozza ENEA ${draftId} completa e salvata con prova portale; TEST concluso. Anteprima finale e submit non eseguiti e disabilitati dalla policy.`,nextAction:"Nessuna azione successiva: non aprire anteprima, non eseguire submit e non produrre comunicazioni.",mutate:(next)=>{const target=next.queue.find(c=>c.practice.id===practiceId)!; target.executionState="draft_saved"; target.draftRun={...target.draftRun!,status:"saved",portalUrl,savedAt:now.toISOString(),evidenceCount,error:null}; next.runner.status="stopped"; next.runner.reason="TEST concluso alla bozza ENEA completa e salvata."; next.runner.nextAction="Nessuna anteprima, submit, email, ricevuta o comunicazione.";}}); });
  }

  recordDraftFailure(ownerId:string, practiceId:string, error:string, nextAction:string, idempotencyKey:string, now=new Date()) {
    if(!error.trim()||!nextAction.trim()) throw new Error("Ticket errore bozza incompleto."); return this.store.withProcessLock(ownerId,now,()=>{const current=this.store.load();if(current.processedIdempotencyKeys.includes(idempotencyKey))return current;return this.commit(ownerId,{idempotencyKey,at:now,type:"draft_failed",practiceId,appliedRuleIds:[USER_AUTHORIZED_RULE_IDS.greenPreflightDraft,"system-operator-block-fail-closed","system-atomic-checkpoint-resume"],reason:error,nextAction,mutate:(next)=>{const target=next.queue.find(c=>c.practice.id===practiceId)!;target.executionState="operator_intervention";target.draftRun=target.draftRun?{...target.draftRun,status:"failed",error}:null;target.practice.activeBlock=error;target.practice.status="requested_operator";target.practice.reason=error;target.practice.nextAction=nextAction;next.runner.status="stopped";next.runner.reason=error;next.runner.nextAction=nextAction;}});});
  }

  beginAuthorizedTestFinalization(ownerId: string, practiceId: string, draftId: string, testMode: boolean, idempotencyKey: string, now = new Date()) {
    if (registryRule(USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft)) {
      throw new Error("Finalizzazione TEST disabilitata dalla policy permanente: il test termina alla bozza completa e salvata.");
    }
    if (!testMode) throw new Error("Finalizzazione automatica vietata: la policy è limitata alle pratiche TEST.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.executionState !== "draft_saved" || job.draftRun.status !== "saved" || job.draftRun.draftId !== draftId || job.submissionProof) {
        throw new Error("Finalizzazione TEST vietata: serve la stessa bozza valida e salvata, priva di prova di invio.");
      }
      return this.commit(ownerId, {
        idempotencyKey, at: now, type: "test_finalization_authorized", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, "core-preview-required", "core-single-submit-cpid", "system-submission-proof-required", "system-atomic-checkpoint-resume"],
        reason: `Policy permanente TEST applicata alla bozza ENEA ${draftId}: anteprima obbligatoria e un solo submit autorizzati; comunicazioni escluse.`,
        nextAction: "Aprire e verificare l'anteprima obbligatoria; non inviare prima del relativo checkpoint.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.executionState = "finalization_in_progress";
          target.finalizationRun = { mode: "test", policyRuleId: USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, draftId, status: "validation_pending", draftValidatedAt: null, validationEvidenceId: null, previewOpenedAt: null, previewVerifiedAt: null, submitAttempts: 0, submitIntentAt: null, serverObservedAt: null, cpid: null, error: null };
          next.runner.status = "stopped";
          next.runner.reason = "Finalizzazione TEST autorizzata; anteprima ancora da verificare.";
          next.runner.nextAction = "Aprire e chiudere l'anteprima obbligatoria.";
        },
      });
    });
  }

  registerTestStopPolicyAndLegacyUncertain(ownerId: string, practiceId: string, idempotencyKey: string, now = new Date()) {
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.draftRun.status !== "saved" || !job.finalizationRun || job.finalizationRun.status !== "uncertain" || job.finalizationRun.submitAttempts !== 1 || job.submissionProof) {
        throw new Error("Caso legacy incerto non coerente o già provato.");
      }
      return this.commit(ownerId, { idempotencyKey, at: now, type: "legacy_submit_uncertain_registered", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, "system-submission-proof-required", "system-atomic-checkpoint-resume"],
        reason: `Policy TEST aggiornata: Sara ${job.draftRun.draftId} resta caso legacy con esito submit incerto; vietata ogni nuova anteprima, conferma o azione di invio.`,
        nextAction: "Acquisire soltanto in futuro una prova server read-only Inviata+CPID, se disponibile; proseguire con la pratica successiva.",
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.executionState = "legacy_submit_uncertain"; target.practice.activeBlock = null; target.practice.reason = "Caso legacy: singolo submit con esito incerto; nessun retry o altra azione di invio."; target.practice.nextAction = "Solo verifica server read-only Inviata+CPID quando possibile."; next.runner.currentPracticeId = null; next.runner.status = "stopped"; next.runner.reason = "Policy TEST permanente aggiornata: stop alla bozza completa e salvata."; next.runner.nextAction = "Avviare il preflight read-only della pratica successiva."; },
      });
    });
  }

  startAuthorizedReadOnlyPractice(ownerId: string, practiceId: string, idempotencyKey: string, now = new Date()) {
    if (!this.allowPracticeOperationsForTest && !readOnlyPreflightAllowed(this.rootDirectory)) throw new RunnerReadinessBlockedError("Avvio read-only bloccato: readiness browser reale non verificata.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const currentJob = current.queue.find((job) => job.practice.id === current.runner.currentPracticeId);
      const currentIsTerminalTestDraft = currentJob?.executionState === "draft_saved" && Boolean(currentJob.workflowTiming?.endedAt);
      if (current.runner.currentPracticeId && !currentIsTerminalTestDraft) throw new Error("Una pratica è già corrente.");
      const first = current.queue.find((job) => job.practice.id === practiceId && !["completed", "legacy_submit_uncertain", "draft_saved"].includes(job.executionState));
      if (!first) throw new Error("La pratica esplicitamente autorizzata non è azionabile.");
      return this.commit(ownerId, { idempotencyKey, at: now, type: "job_selected", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, "system-single-active-practice", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume"],
        reason: `Avviato workflow TEST read-only per ${first.practice.displayName}; fine test fissata alla bozza completa e salvata.`,
        nextAction: "Acquisire form e fonti originarie read-only; registrare timestamp e blocchi per ogni fase.",
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.executionState = "checkpoint_resumable"; target.selectionCount += 1; target.workflowTiming = { startedAt: now.toISOString(), endedAt: null, totalDurationMs: null, phases: [] }; next.runner.currentPracticeId = practiceId; next.runner.status = "stopped"; next.runner.reason = `Workflow TEST ${target.practice.displayName} avviato.`; next.runner.nextAction = "Acquisire il form originario in sola lettura."; },
      });
    });
  }

  recordWorkflowPhase(ownerId: string, practiceId: string, input: {
    phase: "customer_form" | "source_documents" | "preflight" | "draft_create" | "draft_fill_save";
    startedAt: string; endedAt: string; status: "completed" | "blocked"; blockReason?: string | null;
  }, idempotencyKey: string, now = new Date()) {
    const started = Date.parse(input.startedAt); const ended = Date.parse(input.endedAt);
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started || (input.status === "blocked" && !input.blockReason?.trim())) throw new Error("Timing fase non valido.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load(); if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.workflowTiming || job.workflowTiming.endedAt || job.workflowTiming.phases.some((phase) => phase.phase === input.phase)) throw new Error("Fase timing duplicata o workflow non attivo.");
      const blockReason = input.blockReason?.trim() || null;
      return this.commit(ownerId, { idempotencyKey, at: now, type: "phase_timing_recorded", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, "system-atomic-checkpoint-resume", ...(input.status === "blocked" ? ["system-operator-block-fail-closed"] : [])],
        reason: `Fase ${input.phase} ${input.status}: ${ended - started} ms${blockReason ? `; blocco ${blockReason}` : ""}.`,
        nextAction: input.status === "blocked" ? "Fermare la pratica sul blocco registrato." : "Proseguire alla fase successiva.",
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.workflowTiming!.phases.push({ phase: input.phase, startedAt: new Date(started).toISOString(), endedAt: new Date(ended).toISOString(), durationMs: ended - started, status: input.status, blockReason }); if (input.status === "blocked") { target.executionState = "operator_intervention"; target.practice.activeBlock = blockReason; next.runner.reason = blockReason!; next.runner.nextAction = "Intervento operatore sul blocco registrato."; } },
      });
    });
  }

  completeWorkflowTiming(ownerId: string, practiceId: string, endedAt: string, idempotencyKey: string, now = new Date()) {
    const ended = Date.parse(endedAt); if (!Number.isFinite(ended)) throw new Error("Fine workflow non valida.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load(); if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.workflowTiming || job.workflowTiming.endedAt || ended < Date.parse(job.workflowTiming.startedAt)) throw new Error("Workflow timing non completabile.");
      const blocked = job.workflowTiming.phases.some((phase) => phase.status === "blocked");
      return this.commit(ownerId, { idempotencyKey, at: now, type: "workflow_timing_completed", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, "system-atomic-checkpoint-resume"],
        reason: blocked ? `Workflow TEST fermato su un blocco preflight dopo ${ended - Date.parse(job.workflowTiming.startedAt)} ms; nessuna bozza ENEA creata.` : `Workflow TEST concluso in ${ended - Date.parse(job.workflowTiming.startedAt)} ms alla bozza completa e salvata.`,
        nextAction: blocked ? "Risolvere esclusivamente il blocco registrato prima di qualunque bozza; nessuna anteprima, submit o comunicazione." : "Fermarsi: anteprima finale, submit e comunicazioni sono disabilitati.",
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.workflowTiming = { ...target.workflowTiming!, endedAt: new Date(ended).toISOString(), totalDurationMs: ended - Date.parse(target.workflowTiming!.startedAt) }; next.runner.status = "stopped"; next.runner.reason = blocked ? (target.practice.activeBlock ?? "Workflow TEST fermato su blocco preflight.") : "Test concluso alla bozza ENEA completa e salvata."; next.runner.nextAction = blocked ? target.practice.nextAction : "Nessuna anteprima, submit, email, ricevuta o comunicazione."; },
      });
    });
  }

  confirmBlockedWorkflow(ownerId: string, practiceId: string, idempotencyKey: string, now = new Date()) {
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load(); if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      const blockedPhase = job?.workflowTiming?.phases.find((phase) => phase.status === "blocked");
      if (!job?.workflowTiming?.endedAt || !blockedPhase || job.executionState !== "operator_intervention") throw new Error("Workflow bloccato non confermabile.");
      return this.commit(ownerId, { idempotencyKey, at: now, type: "workflow_block_confirmed", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
        reason: `Workflow TEST confermato fermo in ${blockedPhase.phase}: ${blockedPhase.blockReason}; nessuna bozza ENEA creata.`,
        nextAction: job.practice.nextAction,
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; next.runner.status = "stopped"; next.runner.reason = target.practice.activeBlock ?? blockedPhase.blockReason ?? "Blocco preflight."; next.runner.nextAction = target.practice.nextAction; },
      });
    });
  }

  resumeWorkflowAfterTestDeadlineAlert(ownerId: string, practiceId: string, elapsedDays: number, idempotencyKey: string, now = new Date()) {
    if (!Number.isInteger(elapsedDays) || elapsedDays <= 90) throw new Error("Alert TEST oltre 90 giorni non coerente.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load(); if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      const datePhase = job?.workflowTiming?.phases.find((phase) => phase.phase === "preflight" && phase.status === "blocked");
      if (!job?.workflowTiming?.endedAt || !datePhase || job.executionState !== "checkpoint_resumable" || job.practice.status !== "preflight_ready" || !isCompleteReadyPreflight(job.preflightRun ?? undefined)) {
        throw new Error("Ripresa TEST non coerente: servono il precedente blocco data e il nuovo preflight verde.");
      }
      return this.commit(ownerId, { idempotencyKey, at: now, type: "workflow_resumed_after_test_alert", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert, USER_AUTHORIZED_RULE_IDS.missingCompletionDate, "system-atomic-checkpoint-resume"],
        reason: `Alert TEST auditato: fine lavori oltre soglia di ${elapsedDays} giorni, non bloccante esclusivamente in modalità TEST; nessun override caso-specifico.`,
        nextAction: "Creare, compilare e salvare la sola bozza ENEA; fermarsi prima di anteprima e submit.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.workflowTiming = {
            ...target.workflowTiming!, endedAt: null, totalDurationMs: null,
            phases: target.workflowTiming!.phases.map((phase) => phase.phase === "preflight" && phase.status === "blocked" ? { ...phase, status: "completed", blockReason: `Alert TEST non bloccante: ${elapsedDays} giorni; produzione/reale esclusa.` } : phase),
          };
          target.practice.activeBlock = null;
          target.practice.reason = `Preflight verde con alert TEST non bloccante: ${elapsedDays} giorni dalla fine lavori.`;
          target.practice.nextAction = "Creare e salvare la bozza ENEA; niente anteprima o submit.";
          next.runner.status = "stopped";
          next.runner.reason = target.practice.reason;
          next.runner.nextAction = target.practice.nextAction;
        },
      });
    });
  }

  recordTestDraftValidated(ownerId: string, practiceId: string, draftId: string, evidenceId: string, energySavingsKwhYear: number, idempotencyKey: string, now = new Date()) {
    if (!evidenceId.trim() || !Number.isFinite(energySavingsKwhYear) || energySavingsKwhYear <= 0) throw new Error("Prova validazione bozza TEST incompleta.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.finalizationRun || job.finalizationRun.mode !== "test" || job.finalizationRun.draftId !== draftId
        || !["validation_pending", "preview_pending"].includes(job.finalizationRun.status) || job.finalizationRun.submitAttempts !== 0) {
        throw new Error("Validazione bozza TEST non registrabile nel checkpoint corrente.");
      }
      return this.commit(ownerId, { idempotencyKey, at: now, type: "draft_validation_completed", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, "authorized-26-schermature-risparmio-energia", "core-mapping-complete", "system-atomic-checkpoint-resume"],
        reason: `Bozza TEST ${draftId} validata e salvata sul portale; risparmio energetico ${energySavingsKwhYear.toFixed(2)} kWh/anno applicato con screening-energy-savings-v1.`,
        nextAction: "Aprire l'anteprima obbligatoria e verificarla prima del submit.",
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.finalizationRun = { ...target.finalizationRun!, status: "draft_validated", draftValidatedAt: now.toISOString(), validationEvidenceId: evidenceId.trim() }; next.runner.reason = "Bozza TEST valida e salvata; anteprima obbligatoria disponibile."; next.runner.nextAction = "Aprire e verificare l'anteprima obbligatoria."; },
      });
    });
  }

  recordTestPreviewOpened(ownerId: string, practiceId: string, draftId: string, idempotencyKey: string, now = new Date()) {
    return this.recordTestFinalizationStep(ownerId, practiceId, draftId, "draft_validated", "preview_opened", "preview_opened", idempotencyKey, now,
      "Anteprima obbligatoria ENEA aperta sulla bozza TEST salvata.", "Verificare il contenuto e chiudere/confermare l'anteprima.");
  }

  recordTestPreviewVerified(ownerId: string, practiceId: string, draftId: string, idempotencyKey: string, now = new Date()) {
    return this.recordTestFinalizationStep(ownerId, practiceId, draftId, "preview_opened", "preview_verified", "preview_verified", idempotencyKey, now,
      "Anteprima obbligatoria ENEA verificata e chiusa/confermata.", "Registrare l'intento persistente prima dell'unico submit.");
  }

  private recordTestFinalizationStep(ownerId: string, practiceId: string, draftId: string,
    expected: "draft_validated" | "preview_opened", status: "preview_opened" | "preview_verified",
    type: "preview_opened" | "preview_verified", idempotencyKey: string, now: Date, reason: string, nextAction: string) {
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.finalizationRun || job.finalizationRun.mode !== "test" || job.finalizationRun.draftId !== draftId || job.finalizationRun.status !== expected || job.finalizationRun.submitAttempts !== 0) {
        throw new Error("Checkpoint anteprima TEST incoerente o non riprendibile.");
      }
      return this.commit(ownerId, { idempotencyKey, at: now, type, practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, "core-preview-required", "system-atomic-checkpoint-resume"], reason, nextAction,
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.finalizationRun = { ...target.finalizationRun!, status, ...(status === "preview_opened" ? { previewOpenedAt: now.toISOString() } : { previewVerifiedAt: now.toISOString() }) }; next.runner.reason = reason; next.runner.nextAction = nextAction; },
      });
    });
  }

  recordTestSubmitIntent(ownerId: string, practiceId: string, draftId: string, idempotencyKey: string, now = new Date()) {
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.finalizationRun || job.finalizationRun.mode !== "test" || job.finalizationRun.draftId !== draftId || job.finalizationRun.status !== "preview_verified" || job.finalizationRun.submitAttempts !== 0) {
        throw new Error("Submit TEST vietato: anteprima non verificata oppure tentativo già registrato.");
      }
      return this.commit(ownerId, { idempotencyKey, at: now, type: "submit_intent_recorded", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, "core-single-submit-cpid", "system-submission-proof-required", "system-atomic-checkpoint-resume"],
        reason: `Intento persistente registrato prima dell'unico submit della bozza TEST ${draftId}; ogni retry è ora vietato.`,
        nextAction: "Eseguire un solo submit e verificare server-side dashboard Inviata + CPID; nessun retry se incerto.",
        mutate: (next) => { const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!; target.executionState = "awaiting_submission_proof"; target.finalizationRun = { ...target.finalizationRun!, status: "submit_intent_recorded", submitAttempts: 1, submitIntentAt: now.toISOString() }; next.runner.reason = "Unico tentativo submit impegnato; retry vietato."; next.runner.nextAction = "Verificare dashboard Inviata + CPID senza ritentare."; },
      });
    });
  }

  recordAuthorizedTestSubmissionOutcome(ownerId: string, practiceId: string, input: {
    draftId: string; evidenceId: string; dashboardStatus: "Inviata" | "Incerto"; cpid: string; observedAt: string;
  }, idempotencyKey: string, now = new Date()) {
    const proof: SubmissionProof = { evidenceId: input.evidenceId, source: "enea_dashboard_read_only", dashboardStatus: "Inviata", cpid: input.cpid, observedAt: input.observedAt };
    const conclusive = input.dashboardStatus === "Inviata" && proofIsConclusive(proof);
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.finalizationRun || job.finalizationRun.draftId !== input.draftId || job.finalizationRun.status !== "submit_intent_recorded" || job.finalizationRun.submitAttempts !== 1) {
        throw new Error("Esito submit TEST non registrabile: manca l'unico intento persistente.");
      }
      return this.commit(ownerId, { idempotencyKey, at: now, type: conclusive ? "submission_proof_recorded" : "submission_proof_rejected", practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testDraftPreviewSubmit, "core-single-submit-cpid", "system-submission-proof-required", "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
        reason: conclusive ? `Dashboard ENEA verificata server-side: Inviata con CPID ${input.cpid.trim()}.` : "Esito del singolo submit non conclusivo: Inviata + CPID non entrambi provati; retry vietato.",
        nextAction: conclusive ? "Pratica TEST conclusa; non generare email, ricevute o comunicazioni." : "Intervento operatore sul solo esito server; non ritentare il submit.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.finalizationRun = { ...target.finalizationRun!, status: conclusive ? "submitted" : "uncertain", serverObservedAt: input.observedAt, cpid: conclusive ? input.cpid.trim() : null, error: conclusive ? null : "Inviata + CPID non provati dopo il singolo submit; retry vietato." };
          if (conclusive) { target.submissionProof = proof; target.executionState = "completed"; next.runner.currentPracticeId = null; next.runner.status = "stopped"; next.runner.reason = "Pratica TEST conclusa con prova Inviata + CPID."; next.runner.nextAction = "Attendere la successiva pratica autorizzata; nessuna comunicazione."; }
          else { target.executionState = "operator_intervention"; target.practice.activeBlock = target.finalizationRun.error; next.runner.status = "stopped"; next.runner.reason = target.finalizationRun.error!; next.runner.nextAction = "Intervento operatore senza retry submit."; }
        },
      });
    });
  }

  resumeDraftAfterVerifiedFiscalCode(ownerId: string, practiceId: string, input: {
    formFiscalCode: string;
    resolvedFiscalCode: string;
    sourceDocumentIds: string[];
    identity: FiscalCodeIdentity;
  }, idempotencyKey: string, now = new Date()) {
    const sourceDocumentIds = [...new Set(input.sourceDocumentIds.map((value) => value.trim()).filter(Boolean))];
    const identityCoherent = fiscalCodeMatchesIdentity(input.resolvedFiscalCode, input.identity);
    const resolution = resolveBeneficiaryFiscalCode({
      formFiscalCode: input.formFiscalCode,
      originalDocumentFiscalCode: input.resolvedFiscalCode,
      documentCoherentWithIdentity: identityCoherent,
    });
    if (resolution.source !== "original_document" || sourceDocumentIds.length < 1) {
      throw new Error("Ripresa bozza vietata: il CF deve provenire da un documento originario ed essere formalmente valido e coerente con l'identità.");
    }
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.draftRun.status !== "failed" || !job.draftRun.draftId || !job.draftRun.portalUrl
        || !job.draftRun.error?.includes("Codice fiscale non valido")) {
        throw new Error("Checkpoint bozza CF non riprendibile.");
      }
      const draftId = job.draftRun.draftId;
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "draft_block_resolved",
        practiceId,
        appliedRuleIds: ["authorized-05-beneficiario-cf", USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, "system-atomic-checkpoint-resume"],
        reason: `Blocco CF risolto sulla stessa bozza ENEA ${draftId}: CF formalmente valido e coerente con i dati anagrafici, verificato nelle fonti originarie ${sourceDocumentIds.join(", ")}. Nessun PDF ENEA storico usato.`,
        nextAction: "Riprendere compilazione e salvataggio della stessa bozza; anteprima finale e submit restano vietati.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.executionState = "draft_in_progress";
          target.draftRun = { ...target.draftRun!, status: "created", error: null };
          target.practice.status = "preflight_ready";
          target.practice.activeBlock = null;
          target.practice.reason = "CF risolto da documento originario valido e coerente; bozza esistente ripresa.";
          target.practice.nextAction = "Compilare e salvare la bozza esistente senza anteprima né submit.";
          target.practice.sources = [
            ...target.practice.sources.filter((source) => !source.sourceId.startsWith("sara-cf-resolution:")),
            ...sourceDocumentIds.map((sourceId) => ({
              sourceId: `sara-cf-resolution:${sourceId}`,
              kind: "document" as const,
              verification: "verified" as const,
              note: `CF documentale valido e coerente con nome, cognome, data/sesso e codice comune di nascita; regola authorized-05-beneficiario-cf.`,
            })),
          ];
          next.runner.status = "stopped";
          next.runner.reason = `Blocco CF risolto; bozza ENEA ${draftId} riprendibile senza duplicazione.`;
          next.runner.nextAction = "Compilare e salvare la stessa bozza senza anteprima finale né submit.";
        },
      });
    });
  }

  resumeDraftAfterSingleUnitQualification(ownerId: string, practiceId: string, input: {
    draftId: string;
    totalUnits: number;
    floorDescription: string;
    explicitPrimaryContradiction: boolean;
  }, idempotencyKey: string, now = new Date()) {
    if (input.totalUnits !== 1 || input.explicitPrimaryContradiction || !input.floorDescription.trim()
      || !registryRule(USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification)) {
      throw new Error("Ripresa bozza vietata: serve unità unica esplicita, nessuna fonte primaria contraria e regola registrata.");
    }
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.draftRun.status !== "failed" || job.draftRun.draftId !== input.draftId
        || job.executionState !== "checkpoint_resumable" || !isCompleteReadyPreflight(job.preflightRun ?? undefined)) {
        throw new Error("Checkpoint bozza unità unica non riprendibile.");
      }
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "draft_block_resolved",
        practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, "authorized-12-intervento-unita-totali-edificio", "system-atomic-checkpoint-resume"],
        reason: `Blocco rimosso sulla stessa bozza ENEA ${input.draftId}: form con una unità totale; ${input.floorDescription} resta descrittivo e nessuna fonte primaria esplicita afferma più unità o condominio.`,
        nextAction: "Riprendere la stessa bozza come edificio costituito da una singola unità immobiliare; anteprima e submit vietati.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.executionState = "draft_in_progress";
          target.draftRun = { ...target.draftRun!, status: "created", error: null };
          target.practice.status = "preflight_ready";
          target.practice.activeBlock = null;
          target.practice.reason = "Qualificazione edificio risolta dal dato esplicito unità=1; numero piani solo descrittivo.";
          target.practice.nextAction = "Completare e salvare la stessa bozza senza anteprima né submit.";
          next.runner.status = "stopped";
          next.runner.reason = `Bozza ENEA ${input.draftId} ripresa senza duplicazione dopo applicazione della regola unità unica.`;
          next.runner.nextAction = "Completare e salvare la stessa bozza senza anteprima finale né submit.";
        },
      });
    });
  }

  reopenSavedDraftForCardinalityCorrection(ownerId: string, practiceId: string, input: {
    draftId: string;
    observedTechnicalRows: number;
    expectedTechnicalRows: number;
  }, idempotencyKey: string, now = new Date()) {
    if (!registryRule(USER_AUTHORIZED_RULE_IDS.technicalProductCardinality)
      || !Number.isInteger(input.observedTechnicalRows) || !Number.isInteger(input.expectedTechnicalRows)
      || input.observedTechnicalRows < 1 || input.expectedTechnicalRows <= input.observedTechnicalRows) {
      throw new Error("Correzione cardinalità non coerente o non supportata dal registro.");
    }
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.executionState !== "draft_saved" || job.draftRun.status !== "saved"
        || job.draftRun.draftId !== input.draftId || !job.workflowTiming?.endedAt) {
        throw new Error("Bozza salvata non riprendibile per correzione cardinalità.");
      }
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "draft_block_resolved",
        practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, "system-atomic-checkpoint-resume"],
        reason: `Stessa bozza ENEA ${input.draftId} riaperta per correggere cardinalità tecnica ${input.observedTechnicalRows}→${input.expectedTechnicalRows}; importo economico invariato.`,
        nextAction: "Sostituire le righe aggregate con una riga per prodotto, salvare la stessa bozza e fermarsi prima di anteprima e submit.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.executionState = "draft_in_progress";
          target.draftRun = { ...target.draftRun!, status: "created", savedAt: null, evidenceCount: 0, error: null };
          target.practice.status = "preflight_ready";
          target.practice.activeBlock = null;
          target.practice.reason = `Correzione cardinalità tecnica ${input.observedTechnicalRows}→${input.expectedTechnicalRows} in corso sulla stessa bozza.`;
          target.practice.nextAction = "Salvare la stessa bozza con una riga tecnica per prodotto; anteprima e submit vietati.";
          next.runner.status = "stopped";
          next.runner.reason = `Correzione cardinalità bozza ${input.draftId} in corso senza duplicazione.`;
          next.runner.nextAction = target.practice.nextAction;
        },
      });
    });
  }

  recordExcludedProductCardinalityAudit(ownerId: string, practiceId: string, input: {
    draftId: string;
    sourceId: string;
    product: string;
    expectedPhysicalProducts: number;
    observedLedgerRows: number;
    excludedGrossTotal: number;
    perPieceEvidence: string;
  }, idempotencyKey: string, now = new Date()) {
    if (!registryRule(USER_AUTHORIZED_RULE_IDS.technicalProductCardinality)
      || !registryRule(USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly)
      || !input.sourceId.trim() || !input.product.trim() || !input.perPieceEvidence.trim()
      || !Number.isInteger(input.expectedPhysicalProducts) || input.expectedPhysicalProducts < 1
      || input.observedLedgerRows !== input.expectedPhysicalProducts
      || !Number.isFinite(input.excludedGrossTotal) || input.excludedGrossTotal < 0) {
      throw new Error("Audit cardinalità prodotti esclusi incompleto o non riconciliato 1:1.");
    }
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.executionState !== "draft_saved" || job.draftRun.status !== "saved"
        || job.draftRun.draftId !== input.draftId) throw new Error("Bozza salvata non coerente con l'audit esclusi.");
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "excluded_product_cardinality_audited",
        practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.zenoMixedProductsScreeningsOnly, "system-atomic-checkpoint-resume"],
        reason: `${input.product}: ${input.observedLedgerRows}/${input.expectedPhysicalProducts} prodotti fisici distinti classificati 1:1 da ${input.sourceId}; esclusi dalla bozza ENEA ${input.draftId} e dal totale schermature (€${input.excludedGrossTotal.toFixed(2)}). ${input.perPieceEvidence}`,
        nextAction: "Nessuna modifica alla bozza salvata; mantenere gli esclusi separati nel ledger e fermarsi prima di anteprima/submit.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.practice.sources = [
            ...target.practice.sources.filter((source) => source.sourceId !== `${input.sourceId}:excluded-cardinality`),
            { sourceId: `${input.sourceId}:excluded-cardinality`, kind: "audit", verification: "verified", note: `${input.observedLedgerRows} ${input.product} distinte 1:1; ${input.perPieceEvidence}; escluse da bozza e totale schermature.` },
          ];
          next.runner.reason = `TEST concluso alla bozza ENEA ${input.draftId}; cardinalità inclusi ed esclusi auditata 1:1.`;
          next.runner.nextAction = "Nessuna anteprima, submit, email, ricevuta o comunicazione.";
        },
      });
    });
  }

  reopenSavedDraftForZanzariereInclusion(ownerId: string, practiceId: string, input: {
    draftId: string;
    existingTechnicalRows: number;
    zanzariereRows: number;
    previousQualifiedGross: number;
    reconciledQualifiedGross: number;
  }, idempotencyKey: string, now = new Date()) {
    if (!registryRule(USER_AUTHORIZED_RULE_IDS.zanzarieraScreening)
      || !registryRule(USER_AUTHORIZED_RULE_IDS.technicalProductCardinality)
      || !Number.isInteger(input.existingTechnicalRows) || input.existingTechnicalRows < 1
      || !Number.isInteger(input.zanzariereRows) || input.zanzariereRows < 1
      || !Number.isFinite(input.previousQualifiedGross) || !Number.isFinite(input.reconciledQualifiedGross)
      || input.reconciledQualifiedGross <= input.previousQualifiedGross) {
      throw new Error("Inclusione zanzariere non coerente con registro, cardinalità o riconciliazione.");
    }
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.executionState !== "draft_saved" || job.draftRun.status !== "saved"
        || job.draftRun.draftId !== input.draftId || !job.workflowTiming?.endedAt) {
        throw new Error("Bozza salvata non riprendibile per includere le zanzariere.");
      }
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "draft_block_resolved",
        practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.zanzarieraScreening, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, "system-atomic-checkpoint-resume"],
        reason: `Classificazione precedente superata: ${input.zanzariereRows} zanzariere ora ammissibili come Altra schermatura solare. Stessa bozza ENEA ${input.draftId} riaperta ${input.existingTechnicalRows}→${input.existingTechnicalRows + input.zanzariereRows} righe; totale qualificato €${input.previousQualifiedGross.toFixed(2)}→€${input.reconciledQualifiedGross.toFixed(2)}.`,
        nextAction: "Aggiungere una riga per ciascuna zanzariera, riconciliare spese/calcolo, salvare la stessa bozza e fermarsi prima di anteprima/submit.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.executionState = "draft_in_progress";
          target.draftRun = { ...target.draftRun!, status: "created", savedAt: null, evidenceCount: 0, error: null };
          target.practice.status = "preflight_ready";
          target.practice.activeBlock = null;
          target.practice.reason = "Esclusione zanzariere annullata dalla regola generale; inclusione 1:1 e riconciliazione in corso sulla stessa bozza.";
          target.practice.nextAction = "Salvare la bozza con 11 righe e totale riconciliato; anteprima e submit vietati.";
          next.runner.status = "stopped";
          next.runner.reason = `Correzione zanzariere in corso sulla bozza ${input.draftId} senza duplicazione.`;
          next.runner.nextAction = target.practice.nextAction;
        },
      });
    });
  }

  recordZanzariereDraftReconciled(ownerId: string, practiceId: string, input: {
    draftId: string;
    observedTechnicalRows: number;
    zanzariereRows: number;
    qualifiedGross: number;
    totalScreeningAreaM2: number;
    evidenceCount: number;
    portalUrl: string;
  }, idempotencyKey: string, now = new Date()) {
    if (!registryRule(USER_AUTHORIZED_RULE_IDS.zanzarieraScreening)
      || input.observedTechnicalRows !== 11 || input.zanzariereRows !== 6
      || Math.abs(input.qualifiedGross - 11730.40) > 0.01
      || Math.abs(input.totalScreeningAreaM2 - 54.887) > 0.001
      || !Number.isInteger(input.evidenceCount) || input.evidenceCount < 1 || !input.portalUrl.trim()) {
      throw new Error("Prova finale zanzariere/cardinalità/spese non riconciliata.");
    }
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.executionState !== "draft_in_progress" || job.draftRun.status !== "created"
        || job.draftRun.draftId !== input.draftId) throw new Error("Bozza in corso non coerente con la riconciliazione zanzariere.");
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "draft_saved",
        practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.zanzarieraScreening, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.greenPreflightDraft, USER_AUTHORIZED_RULE_IDS.testStopAtSavedDraft, "system-atomic-checkpoint-resume"],
        reason: `Bozza ENEA ${input.draftId} salvata e riconciliata: ${input.observedTechnicalRows} righe fisiche, incluse ${input.zanzariereRows} zanzariere 1:1; superficie schermature ${input.totalScreeningAreaM2.toFixed(3)} m²; spesa €${input.qualifiedGross.toFixed(2)}. Anteprima e submit non eseguiti.`,
        nextAction: "TEST concluso alla bozza completa e salvata; nessuna anteprima, submit o comunicazione.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.executionState = "draft_saved";
          target.draftRun = { ...target.draftRun!, status: "saved", savedAt: now.toISOString(), portalUrl: input.portalUrl, evidenceCount: input.evidenceCount, error: null };
          target.practice.reason = "Bozza completa con tende e zanzariere 1:1; totale schermature interamente riconciliato.";
          target.practice.nextAction = "Nessuna anteprima o submit: TEST concluso alla bozza salvata.";
          next.runner.status = "stopped";
          next.runner.reason = `TEST concluso alla bozza ENEA ${input.draftId} completa e salvata con zanzariere incluse 1:1.`;
          next.runner.nextAction = "Nessuna anteprima, submit, email, ricevuta o comunicazione.";
        },
      });
    });
  }

  recordReadOnlyComparisonCompleted(ownerId: string, practiceId: string, input: {
    draftId: string;
    startedAt: string;
    endedAt: string;
    comparedFieldCount: number;
    discrepancyCount: number;
    excludedFields: string;
    sources: string;
    testMode?: boolean;
  }, idempotencyKey: string, now = new Date()) {
    const started = Date.parse(input.startedAt); const ended = Date.parse(input.endedAt);
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started
      || !Number.isInteger(input.comparedFieldCount) || input.comparedFieldCount < 1
      || !Number.isInteger(input.discrepancyCount) || input.discrepancyCount < 0
      || !input.excludedFields.trim() || !input.sources.trim()) throw new Error("Confronto read-only privo di perimetro, fonti o tempi validi.");
    const normalizedExclusions = input.excludedFields.toLocaleLowerCase("it-IT");
    const requiredExclusions = requiredCrmManualComparisonExclusions(input.testMode ?? true);
    if (requiredExclusions.some((field) => !normalizedExclusions.includes(field))) throw new Error(`Confronto read-only incompleto: esclusioni obbligatorie ${requiredExclusions.join(", ")}.`);
    if (/pdf\s+enea|document[oi]\s+enea\s+storic/i.test(input.sources)) throw new Error("Documenti ENEA storici vietati come fonte del confronto.");
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      if (current.processedIdempotencyKeys.includes(idempotencyKey)) return current;
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job?.draftRun || job.executionState !== "draft_saved" || job.draftRun.status !== "saved"
        || job.draftRun.draftId !== input.draftId) throw new Error("Confronto non associabile alla bozza salvata.");
      const durationMs = ended - started;
      return this.commit(ownerId, {
        idempotencyKey,
        at: now,
        type: "readonly_comparison_completed",
        practiceId,
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.zanzarieraScreening, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification, "core-mapping-complete", "system-readonly-adapter-contract", "system-atomic-checkpoint-resume"],
        reason: `Confronto read-only bozza ENEA ${input.draftId} vs pratica CRM chiusa: ${input.comparedFieldCount} campi, ${input.discrepancyCount} incongruenze verificabili, durata ${durationMs} ms. Esclusi: ${input.excludedFields}. Fonti: ${input.sources}. Nessun documento ENEA storico consultato.`,
        nextAction: "Confronto concluso; nessuna modifica a CRM, ENEA, bozza o fonti.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          target.practice.sources = [
            ...target.practice.sources.filter((source) => source.sourceId !== `comparison:${input.draftId}:crm-closed`),
            { sourceId: `comparison:${input.draftId}:crm-closed`, kind: "audit", verification: "verified", note: `${input.comparedFieldCount} campi confrontati in ${durationMs} ms; incongruenze=${input.discrepancyCount}; esclusi ${input.excludedFields}; nessun PDF ENEA storico.` },
          ];
          next.runner.reason = `Confronto read-only bozza ${input.draftId}/CRM chiuso completato con ${input.discrepancyCount} incongruenze.`;
          next.runner.nextAction = "Nessuna azione mutativa; mantenere la bozza salvata senza anteprima/submit.";
        },
      });
    });
  }

  stop(ownerId: string, idempotencyKey: string, reason = "Stop locale richiesto.", now = new Date()) {
    return this.store.withProcessLock(ownerId, now, () => this.commit(ownerId, {
      idempotencyKey, at: now, type: "runner_stopped", practiceId: this.store.load().runner.currentPracticeId,
      appliedRuleIds: ["system-atomic-checkpoint-resume", "system-exclusive-runner-lease"],
      reason, nextAction: "Riprendere dallo stesso checkpoint con un nuovo comando idempotente.",
      mutate: (next) => { next.runner.status = "stopped"; next.runner.reason = reason; next.runner.nextAction = "Riprendere dallo stesso checkpoint."; },
    }));
  }

  recordSubmissionProof(ownerId: string, practiceId: string, proof: SubmissionProof, idempotencyKey: string, now = new Date()) {
    this.assertPracticeOperationsAllowed(now);
    return this.store.withProcessLock(ownerId, now, () => {
      const current = this.store.load();
      const job = current.queue.find((candidate) => candidate.practice.id === practiceId);
      if (!job) throw new Error(`Pratica ${practiceId} non presente nella coda persistente.`);
      const valid = proofIsConclusive(proof);
      return this.commit(ownerId, {
        idempotencyKey, at: now, type: valid ? "submission_proof_recorded" : "submission_proof_rejected", practiceId,
        appliedRuleIds: ["system-submission-proof-required", "core-single-submit-cpid", "system-atomic-checkpoint-resume"],
        reason: valid ? "Prova dashboard Inviata + CPID registrata." : "Prova rifiutata: servono fonte dashboard read-only, stato Inviata e CPID valido.",
        nextAction: valid ? "Proseguire con la prossima pratica." : "Acquisire la prova completa senza ritentare il submit.",
        mutate: (next) => {
          const target = next.queue.find((candidate) => candidate.practice.id === practiceId)!;
          if (valid) {
            target.submissionProof = { ...proof, cpid: proof.cpid.trim() };
            target.executionState = "completed";
            if (next.runner.currentPracticeId === practiceId) next.runner.currentPracticeId = null;
            next.runner.status = "running";
            next.runner.reason = "Pratica conclusa con prova server registrata.";
            next.runner.nextAction = "Selezionare la prossima pratica.";
          } else {
            target.executionState = "awaiting_submission_proof";
            next.runner.status = "stopped";
            next.runner.reason = "Prova di invio insufficiente.";
            next.runner.nextAction = "Acquisire dashboard Inviata + CPID; nessun retry.";
          }
        },
      });
    });
  }
}

export { RunnerBusyError };
