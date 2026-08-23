import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmLocalCohortExecutionPlan } from "./crmLocalCohortExecutionPlan";

export const APR_GATE_ORCHESTRATOR_VERSION = "apr-gate-orchestrator-v1" as const;

const RULE_IDS = ["system-single-active-practice", "system-atomic-checkpoint-resume", "system-apr-crm-integration-boundary"] as const;
const DEFAULT_LEASE_MS = 10_000;

type PlanContract = Pick<PersistentAprCrmLocalCohortExecutionPlan, "snapshot">;

export type AprGateId = "local_cohort_create_fill_save_plan" | "local_enea_browser_bridge_contract" | "external_enea_readiness_admission" | "operational_enea_readonly_discovery" | "real_enea_readonly_attach" | "real_enea_server_readonly_probe";
export type AprGateState = "completed" | "queued" | "active" | "waiting_safety_gate";

export interface AprGateCheckpoint {
  ordinal: number;
  gateId: AprGateId;
  scope: "local" | "external";
  state: AprGateState;
  attemptCount: number;
  recoveryCount: number;
  lockOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  evidenceFingerprint: string | null;
  reason: string;
  nextAction: string;
}

export interface AprGateOrchestratorState {
  version: typeof APR_GATE_ORCHESTRATOR_VERSION;
  revision: number;
  status: "unprepared" | "working_local" | "waiting_external_safety_gate" | "technical_block";
  cohortKey: string;
  orchestratorIdentity: "apr_persistent_gate_orchestrator";
  sourceSignature: string | null;
  activeGateId: AprGateId | null;
  gates: AprGateCheckpoint[];
  bridgeManifestPath: string | null;
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
    type: "initialized" | "gate_catalog_synchronized" | "gate_claimed" | "lease_recovered" | "gate_completed" | "next_gate_enqueued" | "technical_block";
    gateId: AprGateId | null;
    reason: string;
    appliedRuleIds: string[];
  }>;
}

interface BridgeManifest {
  version: "apr-local-enea-browser-bridge-manifest-v1";
  cohortKey: string;
  sourceSignature: string;
  executorIdentity: "apr_persistent_runtime";
  items: Array<{
    planItemId: string;
    customerKey: string;
    displayName: string;
    practiceId: string;
    packageArtifactPath: string;
    packageArtifactSha256: string;
    packageFingerprint: string;
    mappingFingerprint: string;
    workflowFingerprint: string;
    orderedPageIds: string[];
    createRequiresPersistentIntent: true;
    eachPageRequiresFillAndSaveCheckpoint: true;
    finalSaveRequiresAllPages: true;
  }>;
  safety: {
    dispatchAllowed: false;
    browserAllowed: false;
    eneaActionAllowed: false;
    previewAllowed: false;
    submitAllowed: false;
    receiptAllowed: false;
    communicationsAllowed: false;
  };
}

const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(cohortKey: string, now: Date): AprGateOrchestratorState {
  const reason = "Orchestratore dei gate APR non ancora sincronizzato.";
  return {
    version: APR_GATE_ORCHESTRATOR_VERSION, revision: 0, status: "unprepared", cohortKey,
    orchestratorIdentity: "apr_persistent_gate_orchestrator", sourceSignature: null, activeGateId: null, gates: [], bridgeManifestPath: null,
    externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false,
    previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false,
    reason, nextAction: "Attendere il completamento del gate locale create/fill/save.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", gateId: null, reason, appliedRuleIds: [...RULE_IDS] }],
  };
}

function validState(value: AprGateOrchestratorState) {
  const active = value.gates.filter((gate) => gate.state === "active");
  return value.version === APR_GATE_ORCHESTRATOR_VERSION && value.orchestratorIdentity === "apr_persistent_gate_orchestrator"
    && value.externalActionAllowed === false && value.browserAllowed === false && value.crmMutationAllowed === false && value.eneaActionAllowed === false
    && value.previewAllowed === false && value.submitAllowed === false && value.receiptAllowed === false && value.communicationsAllowed === false
    && active.length <= 1 && (active[0]?.gateId ?? null) === value.activeGateId
    && value.gates.every((gate, index) => gate.ordinal === index + 1 && gate.attemptCount <= 1)
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function catalog(): AprGateCheckpoint[] {
  return [
    { ordinal: 1, gateId: "local_cohort_create_fill_save_plan", scope: "local", state: "completed", attemptCount: 1, recoveryCount: 0, lockOwner: null, leaseToken: null, leaseExpiresAt: null,
      startedAt: null, completedAt: null, evidenceFingerprint: null, reason: "Piano locale create/fill/save completato e verificato.", nextAction: "Avanzare automaticamente al contratto bridge locale." },
    { ordinal: 2, gateId: "local_enea_browser_bridge_contract", scope: "local", state: "queued", attemptCount: 0, recoveryCount: 0, lockOwner: null, leaseToken: null, leaseExpiresAt: null,
      startedAt: null, completedAt: null, evidenceFingerprint: null, reason: "Gate locale accodato automaticamente.", nextAction: "Validare il contratto piano→worker senza aprire il browser." },
    { ordinal: 3, gateId: "external_enea_readiness_admission", scope: "external", state: "waiting_safety_gate", attemptCount: 0, recoveryCount: 0, lockOwner: null, leaseToken: null, leaseExpiresAt: null,
      startedAt: null, completedAt: null, evidenceFingerprint: null, reason: "Gate esterno pre-registrato ma non eseguibile finché il bridge locale non è verificato.", nextAction: "Attendere il completamento automatico del gate bridge locale." },
  ];
}

export class PersistentAprGateOrchestrator {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly bridgeManifestPath: string;
  constructor(readonly rootDirectory: string, readonly plan: PlanContract, readonly leaseMs = DEFAULT_LEASE_MS) {
    if (!Number.isFinite(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) throw new Error("apr_gate_orchestrator_lease_invalid");
    this.directory = path.join(path.resolve(rootDirectory), "apr-gate-orchestrator");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.bridgeManifestPath = path.join(this.directory, "bridge", "manifest.json");
  }

  load(now = new Date()) {
    const plan = this.plan.snapshot(now);
    if (!existsSync(this.checkpointPath)) return initialState(plan.cohortKey, now);
    try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprGateOrchestratorState; return validState(value) ? value : initialState(plan.cohortKey, now); }
    catch { return initialState(plan.cohortKey, now); }
  }

  private write(state: AprGateOrchestratorState) {
    if (!validState(state)) throw new Error("apr_gate_orchestrator_checkpoint_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state;
  }

  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }

  synchronize(now = new Date()) {
    const plan = this.plan.snapshot(now); const current = this.initialize(now);
    if (plan.status !== "completed_local_simulation" || plan.items.length === 0 || plan.currentPlanItemId || plan.progress.active !== 0 || plan.items.some((item) => item.state !== "simulated_saved_local")) return current;
    const sourceSignature = sha256({ version: plan.version, cohortKey: plan.cohortKey, revision: plan.revision,
      items: plan.items.map((item) => ({ planItemId: item.planItemId, executionFingerprint: item.executionFingerprint, completedAt: item.completedAt })) });
    if (current.sourceSignature === sourceSignature) return current;
    if (current.sourceSignature && current.gates.some((gate) => gate.state === "active" || gate.state === "queued")) return this.technicalBlock("upstream_plan_changed_while_gate_active", now);
    const next = structuredClone(current); next.revision += 1; next.cohortKey = plan.cohortKey; next.sourceSignature = sourceSignature; next.gates = catalog(); next.activeGateId = null; next.status = "working_local";
    const first = next.gates[0]!; first.startedAt = plan.items[0]?.startedAt ?? now.toISOString(); first.completedAt = plan.items.at(-1)?.completedAt ?? now.toISOString(); first.evidenceFingerprint = sourceSignature;
    next.reason = "Gate locale concluso rilevato: il gate bridge successivo è stato accodato automaticamente, senza dipendere dalla chat.";
    next.nextAction = "Reclamare il gate local_enea_browser_bridge_contract con lock persistente.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_catalog_synchronized", gateId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "next_gate_enqueued", gateId: "local_enea_browser_bridge_contract", reason: next.nextAction, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  tick(now = new Date()) {
    const current = this.synchronize(now);
    if (["unprepared", "technical_block", "waiting_external_safety_gate"].includes(current.status)) return current;
    const active = current.gates.find((gate) => gate.state === "active");
    if (active?.leaseExpiresAt && new Date(active.leaseExpiresAt).getTime() <= now.getTime()) return this.recover(active.gateId, now);
    if (!active) return this.claim(now);
    if (active.gateId === "local_enea_browser_bridge_contract") return this.completeBridge(now);
    return this.technicalBlock(`unsupported_active_gate:${active.gateId}`, now);
  }

  private claim(now: Date) {
    const current = this.load(now); const queued = current.gates.find((gate) => gate.state === "queued");
    if (!queued) return current;
    const next = structuredClone(current); const target = next.gates.find((gate) => gate.gateId === queued.gateId)!; next.revision += 1;
    next.status = "working_local"; next.activeGateId = target.gateId; target.state = "active"; target.attemptCount = 1; target.lockOwner = next.orchestratorIdentity;
    target.leaseToken = randomUUID(); target.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString(); target.startedAt ??= now.toISOString();
    target.reason = "Gate locale reclamato con lock e lease prima della validazione."; target.nextAction = "Costruire e verificare il manifest bridge fail-closed.";
    next.reason = `${target.gateId}: gate locale attivo.`; next.nextAction = target.nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_claimed", gateId: target.gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  private completeBridge(now: Date) {
    const current = this.load(now); const active = current.gates.find((gate) => gate.state === "active"); const plan = this.plan.snapshot(now);
    if (!active || active.gateId !== "local_enea_browser_bridge_contract" || plan.status !== "completed_local_simulation") return this.technicalBlock("bridge_gate_input_invalid", now);
    try {
      const manifest: BridgeManifest = {
        version: "apr-local-enea-browser-bridge-manifest-v1", cohortKey: plan.cohortKey, sourceSignature: current.sourceSignature!, executorIdentity: "apr_persistent_runtime",
        items: plan.items.map((item) => {
          if (!existsSync(item.packageArtifactPath) || sha256(readFileSync(item.packageArtifactPath)) !== item.packageArtifactSha256) throw new Error(`bridge_package_integrity_failed:${item.planItemId}`);
          if (!item.pages.length || item.pages.some((page, index) => page.order !== index + 1 || page.state !== "save_checkpointed" || page.fillCheckpointCount !== 1 || page.saveAttemptCount !== 1)) throw new Error(`bridge_page_checkpoint_invalid:${item.planItemId}`);
          return {
            planItemId: item.planItemId, customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId,
            packageArtifactPath: item.packageArtifactPath, packageArtifactSha256: item.packageArtifactSha256, packageFingerprint: item.packageFingerprint,
            mappingFingerprint: item.mappingFingerprint, workflowFingerprint: item.workflowFingerprint, orderedPageIds: item.pages.map((page) => page.pageId),
            createRequiresPersistentIntent: true as const, eachPageRequiresFillAndSaveCheckpoint: true as const, finalSaveRequiresAllPages: true as const,
          };
        }),
        safety: { dispatchAllowed: false, browserAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false },
      };
      const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`; const evidenceFingerprint = sha256(manifestContents);
      if (!existsSync(this.bridgeManifestPath) || sha256(readFileSync(this.bridgeManifestPath)) !== evidenceFingerprint) atomicWrite(this.bridgeManifestPath, manifestContents);
      const next = structuredClone(current); const target = next.gates.find((gate) => gate.gateId === active.gateId)!; const external = next.gates.find((gate) => gate.gateId === "external_enea_readiness_admission")!; next.revision += 1;
      target.state = "completed"; target.lockOwner = null; target.leaseToken = null; target.leaseExpiresAt = null; target.completedAt = now.toISOString(); target.evidenceFingerprint = evidenceFingerprint;
      target.reason = `Manifest bridge verificato per ${manifest.items.length} pratiche; dispatch esterno disabilitato.`; target.nextAction = "Avanzare automaticamente al gate readiness ENEA esterno.";
      external.reason = "Gate readiness ENEA accodato automaticamente ma bloccato dal safety gate: browser ed ENEA restano disabilitati.";
      external.nextAction = "Verificare tecnicamente l'admission read-only prima di consentire qualunque azione esterna.";
      next.activeGateId = null; next.status = "waiting_external_safety_gate"; next.bridgeManifestPath = this.bridgeManifestPath;
      next.reason = "Contratto bridge locale completato; il prossimo gate esterno è registrato e visibile, non perso né affidato alla chat."; next.nextAction = external.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_completed", gateId: target.gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "next_gate_enqueued", gateId: external.gateId, reason: external.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    } catch (error) { return this.technicalBlock(error instanceof Error ? error.message : String(error), now); }
  }

  private recover(gateId: AprGateId, now: Date) {
    const current = this.load(now); const next = structuredClone(current); const target = next.gates.find((gate) => gate.gateId === gateId);
    if (!target || target.state !== "active") return this.technicalBlock(`gate_recovery_invalid:${gateId}`, now);
    next.revision += 1; next.activeGateId = null; next.status = "working_local"; target.state = "queued"; target.lockOwner = null; target.leaseToken = null; target.leaseExpiresAt = null; target.recoveryCount += 1;
    target.reason = "Lease gate scaduta: lock rilasciato e gate riaccodato dal checkpoint."; target.nextAction = "Reclamare nuovamente il gate senza duplicare il manifest.";
    next.reason = `${gateId}: ripresa sicura dal checkpoint.`; next.nextAction = target.nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "lease_recovered", gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  recordReadinessAdmissionCompleted(evidenceFingerprint: string, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(evidenceFingerprint)) throw new Error("readiness_admission_evidence_invalid");
    const current = this.load(now);
    const admission = current.gates.find((gate) => gate.gateId === "external_enea_readiness_admission");
    if (!admission) return this.technicalBlock("readiness_admission_gate_missing", now);
    if (admission.state === "completed") {
      if (admission.evidenceFingerprint !== evidenceFingerprint) return this.technicalBlock("readiness_admission_evidence_changed", now);
      return current;
    }
    if (current.status !== "waiting_external_safety_gate" || admission.state !== "waiting_safety_gate") {
      return this.technicalBlock("readiness_admission_transition_invalid", now);
    }
    const next = structuredClone(current); next.revision += 1;
    const target = next.gates.find((gate) => gate.gateId === "external_enea_readiness_admission")!;
    target.state = "completed"; target.attemptCount = 1; target.startedAt ??= now.toISOString(); target.completedAt = now.toISOString();
    target.evidenceFingerprint = evidenceFingerprint; target.reason = "Contratto di admission readiness verificato esclusivamente con fixture e runtime locali; nessuna connessione esterna eseguita.";
    target.nextAction = "Accodare il discovery operativo ENEA esclusivamente read-only dietro un nuovo safety gate.";
    if (!next.gates.some((gate) => gate.gateId === "operational_enea_readonly_discovery")) {
      next.gates.push({ ordinal: next.gates.length + 1, gateId: "operational_enea_readonly_discovery", scope: "external", state: "waiting_safety_gate", attemptCount: 0, recoveryCount: 0,
        lockOwner: null, leaseToken: null, leaseExpiresAt: null, startedAt: null, completedAt: null, evidenceFingerprint: null,
        reason: "Discovery operativo read-only accodato automaticamente; browser ed ENEA restano disabilitati.",
        nextAction: "Verificare il gate operativo read-only prima di collegare qualunque sessione reale." });
    }
    next.status = "waiting_external_safety_gate"; next.activeGateId = null;
    next.reason = "Admission readiness locale completata; il discovery operativo read-only è registrato e resta fail-closed.";
    next.nextAction = "Verificare il gate operativo read-only prima di collegare qualunque sessione reale.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_completed", gateId: target.gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "next_gate_enqueued", gateId: "operational_enea_readonly_discovery", reason: next.nextAction, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  recordReadOnlyDiscoveryCompleted(evidenceFingerprint: string, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(evidenceFingerprint)) throw new Error("readonly_discovery_evidence_invalid");
    const current = this.load(now); const discovery = current.gates.find((gate) => gate.gateId === "operational_enea_readonly_discovery");
    if (!discovery) return this.technicalBlock("readonly_discovery_gate_missing", now);
    if (discovery.state === "completed") {
      if (discovery.evidenceFingerprint !== evidenceFingerprint) return this.technicalBlock("readonly_discovery_evidence_changed", now);
      return current;
    }
    if (current.status !== "waiting_external_safety_gate" || discovery.state !== "waiting_safety_gate") return this.technicalBlock("readonly_discovery_transition_invalid", now);
    const next = structuredClone(current); next.revision += 1; const target = next.gates.find((gate) => gate.gateId === "operational_enea_readonly_discovery")!;
    target.state = "completed"; target.attemptCount = 1; target.startedAt ??= now.toISOString(); target.completedAt = now.toISOString(); target.evidenceFingerprint = evidenceFingerprint;
    target.reason = "Piano di discovery read-only verificato esclusivamente in locale; nessuna sessione reale osservata."; target.nextAction = "Accodare l'attach reale read-only dietro un safety gate separato.";
    if (!next.gates.some((gate) => gate.gateId === "real_enea_readonly_attach")) next.gates.push({ ordinal: next.gates.length + 1, gateId: "real_enea_readonly_attach", scope: "external", state: "waiting_safety_gate", attemptCount: 0, recoveryCount: 0,
      lockOwner: null, leaseToken: null, leaseExpiresAt: null, startedAt: null, completedAt: null, evidenceFingerprint: null,
      reason: "Attach reale read-only accodato automaticamente; nessun browser o sistema esterno è stato collegato.", nextAction: "Eseguire un safety check esplicito prima del solo attach read-only alla sessione esistente." });
    next.status = "waiting_external_safety_gate"; next.activeGateId = null; next.reason = "Discovery read-only locale completato; attach reale registrato e fail-closed.";
    next.nextAction = "Eseguire un safety check esplicito prima del solo attach read-only alla sessione esistente.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_completed", gateId: target.gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "next_gate_enqueued", gateId: "real_enea_readonly_attach", reason: next.nextAction, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  recordReadOnlyAttachBlocked(evidenceFingerprint: string, reason: string, nextAction: string, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(evidenceFingerprint) || !reason.trim() || !nextAction.trim()) throw new Error("readonly_attach_block_evidence_invalid");
    const current = this.load(now); const attach = current.gates.find((gate) => gate.gateId === "real_enea_readonly_attach");
    if (!attach) return this.technicalBlock("readonly_attach_gate_missing", now);
    if (current.status === "technical_block" && attach.evidenceFingerprint === evidenceFingerprint && attach.reason === reason) return current;
    if (attach.state !== "waiting_safety_gate") return this.technicalBlock("readonly_attach_block_transition_invalid", now);
    const next = structuredClone(current); next.revision += 1; const target = next.gates.find((gate) => gate.gateId === "real_enea_readonly_attach")!;
    target.attemptCount = 1; target.startedAt ??= now.toISOString(); target.evidenceFingerprint = evidenceFingerprint; target.reason = reason; target.nextAction = nextAction;
    next.status = "technical_block"; next.activeGateId = null; next.reason = reason; next.nextAction = nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", gateId: target.gateId, reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  recordReadOnlyAttachCompleted(evidenceFingerprint: string, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(evidenceFingerprint)) throw new Error("readonly_attach_evidence_invalid");
    const current = this.load(now); const attach = current.gates.find((gate) => gate.gateId === "real_enea_readonly_attach");
    if (!attach) return this.technicalBlock("readonly_attach_gate_missing", now);
    if (attach.state === "completed") {
      if (attach.evidenceFingerprint !== evidenceFingerprint) return this.technicalBlock("readonly_attach_evidence_changed", now);
      if (current.gates.some((gate) => gate.gateId === "real_enea_server_readonly_probe")) return current;
      const migrated = structuredClone(current); migrated.revision += 1;
      migrated.gates.push({ ordinal: migrated.gates.length + 1, gateId: "real_enea_server_readonly_probe", scope: "external", state: "waiting_safety_gate", attemptCount: 0, recoveryCount: 0,
        lockOwner: null, leaseToken: null, leaseExpiresAt: null, startedAt: null, completedAt: null, evidenceFingerprint: null,
        reason: "Prova server GET/HEAD read-only accodata dopo l'attach DOM reale.", nextAction: "Validare una prova server fresca del worker APR senza selezionare pratiche." });
      migrated.status = "waiting_external_safety_gate"; migrated.reason = migrated.gates.at(-1)!.reason; migrated.nextAction = migrated.gates.at(-1)!.nextAction;
      migrated.audit.push({ revision: migrated.revision, at: now.toISOString(), type: "next_gate_enqueued", gateId: "real_enea_server_readonly_probe", reason: migrated.nextAction, appliedRuleIds: [...RULE_IDS] });
      return this.write(migrated);
    }
    if (attach.state !== "waiting_safety_gate" || !["waiting_external_safety_gate", "technical_block"].includes(current.status)) return this.technicalBlock("readonly_attach_transition_invalid", now);
    const next = structuredClone(current); next.revision += 1; const target = next.gates.find((gate) => gate.gateId === "real_enea_readonly_attach")!;
    target.state = "completed"; target.attemptCount = 1; target.startedAt ??= now.toISOString(); target.completedAt = now.toISOString(); target.evidenceFingerprint = evidenceFingerprint;
    target.reason = "Attach Chrome Default e DOM CRM/ENEA verificati read-only senza nuove schede, navigazione o richieste.";
    target.nextAction = "Validare una prova server GET/HEAD fresca del worker APR.";
    if (!next.gates.some((gate) => gate.gateId === "real_enea_server_readonly_probe")) next.gates.push({ ordinal: next.gates.length + 1, gateId: "real_enea_server_readonly_probe", scope: "external", state: "waiting_safety_gate", attemptCount: 0, recoveryCount: 0,
      lockOwner: null, leaseToken: null, leaseExpiresAt: null, startedAt: null, completedAt: null, evidenceFingerprint: null,
      reason: "Prova server GET/HEAD read-only accodata dopo l'attach DOM reale.", nextAction: "Validare una prova server fresca del worker APR senza selezionare pratiche." });
    next.status = "waiting_external_safety_gate"; next.activeGateId = null; next.reason = next.gates.at(-1)!.reason; next.nextAction = next.gates.at(-1)!.nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_completed", gateId: target.gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "next_gate_enqueued", gateId: "real_enea_server_readonly_probe", reason: next.nextAction, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  recordServerReadOnlyProbeCompleted(evidenceFingerprint: string, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(evidenceFingerprint)) throw new Error("server_readonly_probe_evidence_invalid");
    const current = this.load(now); const probe = current.gates.find((gate) => gate.gateId === "real_enea_server_readonly_probe");
    if (!probe) return this.technicalBlock("server_readonly_probe_gate_missing", now);
    if (probe.state === "completed") {
      if (probe.evidenceFingerprint !== evidenceFingerprint) return this.technicalBlock("server_readonly_probe_evidence_changed", now);
      return current;
    }
    if (probe.state !== "waiting_safety_gate" || current.status !== "waiting_external_safety_gate") return this.technicalBlock("server_readonly_probe_transition_invalid", now);
    const next = structuredClone(current); next.revision += 1; const target = next.gates.find((gate) => gate.gateId === "real_enea_server_readonly_probe")!;
    target.state = "completed"; target.attemptCount = 1; target.startedAt ??= now.toISOString(); target.completedAt = now.toISOString(); target.evidenceFingerprint = evidenceFingerprint;
    target.reason = "Sessione ENEA e contratto dashboard verificati dal worker APR con GET read-only fresco e contatori mutativi a zero.";
    target.nextAction = "Mantenere il worker in setup-only finché non esiste una coda minima eseguibile; nessuna pratica viene selezionata.";
    next.status = "waiting_external_safety_gate"; next.activeGateId = null; next.reason = target.reason; next.nextAction = target.nextAction;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "gate_completed", gateId: target.gateId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  private technicalBlock(reason: string, now: Date) {
    const current = this.load(now); if (current.status === "technical_block" && current.reason === reason) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "technical_block"; next.activeGateId = null;
    for (const gate of next.gates) if (gate.state === "active") { gate.state = "queued"; gate.lockOwner = null; gate.leaseToken = null; gate.leaseExpiresAt = null; }
    next.reason = reason; next.nextAction = "Correggere il contratto locale e lasciare al supervisore la ripresa dal checkpoint; nessuna azione esterna.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", gateId: null, reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now); const active = state.gates.find((gate) => gate.gateId === state.activeGateId) ?? null;
    return { ...state, active, progress: { total: state.gates.length, completed: state.gates.filter((gate) => gate.state === "completed").length,
      queued: state.gates.filter((gate) => gate.state === "queued").length, active: state.gates.filter((gate) => gate.state === "active").length,
      waitingSafety: state.gates.filter((gate) => gate.state === "waiting_safety_gate").length, recoveries: state.gates.reduce((total, gate) => total + gate.recoveryCount, 0) },
      lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() };
  }
}
