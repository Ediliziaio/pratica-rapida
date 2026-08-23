import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprEneaReadinessAdmission } from "./aprEneaReadinessAdmission";
import type { PersistentAprGateOrchestrator } from "./aprGateOrchestrator";

export const APR_ENEA_READONLY_DISCOVERY_VERSION = "apr-enea-readonly-discovery-v1" as const;
const RULE_IDS = ["system-readonly-adapter-contract", "system-enea-lease-required", "system-atomic-checkpoint-resume", "system-apr-crm-integration-boundary", "system-operator-block-fail-closed"] as const;
const DEFAULT_LEASE_MS = 10_000;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type AdmissionContract = Pick<PersistentAprEneaReadinessAdmission, "snapshot">;
type OrchestratorContract = Pick<PersistentAprGateOrchestrator, "snapshot" | "recordReadOnlyDiscoveryCompleted">;
export type AprEneaReadOnlyDiscoveryPhase = "unprepared" | "admission_verified" | "identity_plan_verified" | "surface_plan_verified" | "keepalive_plan_verified" | "completed";

export interface AprEneaReadOnlyDiscoveryState {
  version: typeof APR_ENEA_READONLY_DISCOVERY_VERSION; revision: number;
  status: "unprepared" | "working_local" | "completed_local_discovery" | "technical_block"; phase: AprEneaReadOnlyDiscoveryPhase;
  controllerIdentity: "apr_persistent_enea_readonly_discovery"; sourceSignature: string | null; planPath: string | null; planSha256: string | null;
  lockOwner: string | null; leaseToken: string | null; leaseExpiresAt: string | null; attemptCount: number; recoveryCount: number;
  nextGateId: "real_enea_readonly_attach" | null;
  externalActionAllowed: false; browserAllowed: false; createTabsAllowed: false; navigationAllowed: false; crmMutationAllowed: false; eneaActionAllowed: false;
  previewAllowed: false; submitAllowed: false; receiptAllowed: false; communicationsAllowed: false;
  reason: string; nextAction: string;
  audit: Array<{ revision: number; at: string; type: "initialized" | "discovery_started" | "phase_checkpointed" | "lease_recovered" | "discovery_completed" | "technical_block"; phase: AprEneaReadOnlyDiscoveryPhase; reason: string; appliedRuleIds: string[] }>;
}

interface DiscoveryPlan {
  version: "apr-enea-readonly-discovery-plan-v1"; sourceSignature: string; executorIdentity: "apr_persistent_runtime";
  identity: { reuseExistingBrowserProfile: true; requirePersistentIdentityMatch: true; createWindow: false; createTabs: false; privateProfile: false };
  authentication: { crmEvidence: readonly ["server_2xx", "authenticated_dom_marker"]; eneaEvidence: readonly ["server_2xx", "authenticated_dom_marker"]; loginRequiredOnlyOnServerLogoutEvidence: true };
  allowlist: { strategy: "exact_origin_from_verified_admission"; redirectOriginChangeAllowed: false };
  surfaces: Array<{ id: string; role: "crm" | "enea"; method: "GET" | "HEAD"; purpose: "identity" | "document_capability" | "authentication" | "keepalive"; bodyAllowed: false; mutationAllowed: false }>;
  failureRouting: { identityMismatch: "technical_block_global"; verifiedServerLogout: "login_required_global"; missingCaseAttachment: "operator_required_case_only" };
  safety: { dispatchAllowed: false; browserAllowed: false; navigationAllowed: false; crmMutationAllowed: false; eneaActionAllowed: false; previewAllowed: false; submitAllowed: false; receiptAllowed: false; communicationsAllowed: false };
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); } renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprEneaReadOnlyDiscoveryState {
  const reason = "Discovery operativo read-only inizializzato e fail-closed.";
  return { version: APR_ENEA_READONLY_DISCOVERY_VERSION, revision: 0, status: "unprepared", phase: "unprepared", controllerIdentity: "apr_persistent_enea_readonly_discovery",
    sourceSignature: null, planPath: null, planSha256: null, lockOwner: null, leaseToken: null, leaseExpiresAt: null, attemptCount: 0, recoveryCount: 0, nextGateId: null,
    externalActionAllowed: false, browserAllowed: false, createTabsAllowed: false, navigationAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false,
    reason, nextAction: "Verificare l'admission completata e costruire il piano di discovery soltanto in locale.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", phase: "unprepared", reason, appliedRuleIds: [...RULE_IDS] }] };
}

function validState(value: AprEneaReadOnlyDiscoveryState) {
  return value.version === APR_ENEA_READONLY_DISCOVERY_VERSION && value.controllerIdentity === "apr_persistent_enea_readonly_discovery" && value.attemptCount <= 1
    && value.externalActionAllowed === false && value.browserAllowed === false && value.createTabsAllowed === false && value.navigationAllowed === false && value.crmMutationAllowed === false && value.eneaActionAllowed === false
    && value.previewAllowed === false && value.submitAllowed === false && value.receiptAllowed === false && value.communicationsAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

const surfaces: DiscoveryPlan["surfaces"] = [
  { id: "crm_practice_index", role: "crm", method: "GET", purpose: "identity", bodyAllowed: false, mutationAllowed: false },
  { id: "crm_attachment_metadata", role: "crm", method: "HEAD", purpose: "document_capability", bodyAllowed: false, mutationAllowed: false },
  { id: "crm_attachment_body", role: "crm", method: "GET", purpose: "document_capability", bodyAllowed: false, mutationAllowed: false },
  { id: "enea_authenticated_dom", role: "enea", method: "GET", purpose: "authentication", bodyAllowed: false, mutationAllowed: false },
  { id: "enea_keepalive", role: "enea", method: "HEAD", purpose: "keepalive", bodyAllowed: false, mutationAllowed: false },
];

export class PersistentAprEneaReadOnlyDiscovery {
  readonly directory: string; readonly checkpointPath: string; readonly planPath: string;
  constructor(readonly rootDirectory: string, readonly orchestrator: OrchestratorContract, readonly admission: AdmissionContract, readonly leaseMs = DEFAULT_LEASE_MS) {
    if (!Number.isFinite(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) throw new Error("readonly_discovery_lease_invalid");
    this.directory = path.join(path.resolve(rootDirectory), "apr-enea-readonly-discovery"); this.checkpointPath = path.join(this.directory, "checkpoint.json"); this.planPath = path.join(this.directory, "plan", "discovery-plan.json");
  }
  load(now = new Date()) { if (!existsSync(this.checkpointPath)) return initialState(now); try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprEneaReadOnlyDiscoveryState; return validState(value) ? value : initialState(now); } catch { return initialState(now); } }
  private write(state: AprEneaReadOnlyDiscoveryState) { if (!validState(state)) throw new Error("readonly_discovery_checkpoint_invalid"); atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  private transition(state: AprEneaReadOnlyDiscoveryState, phase: AprEneaReadOnlyDiscoveryPhase, reason: string, nextAction: string, type: AprEneaReadOnlyDiscoveryState["audit"][number]["type"], now: Date) {
    const next = structuredClone(state); next.revision += 1; next.phase = phase; next.reason = reason; next.nextAction = nextAction; next.leaseExpiresAt = phase === "completed" ? null : new Date(now.getTime() + this.leaseMs).toISOString();
    if (phase === "completed") { next.status = "completed_local_discovery"; next.lockOwner = null; next.leaseToken = null; next.nextGateId = "real_enea_readonly_attach"; }
    next.audit.push({ revision: next.revision, at: now.toISOString(), type, phase, reason, appliedRuleIds: [...RULE_IDS] }); return this.write(next);
  }
  private technicalBlock(reason: string, now: Date) { const current = this.load(now); if (current.status === "technical_block" && current.reason === reason) return current; const next = structuredClone(current); next.revision += 1; next.status = "technical_block"; next.lockOwner = null; next.leaseToken = null; next.leaseExpiresAt = null; next.reason = reason; next.nextAction = "Correggere il contratto locale e riprendere dal checkpoint; nessun attach reale."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", phase: next.phase, reason, appliedRuleIds: [...RULE_IDS] }); return this.write(next); }
  tick(now = new Date()) {
    let current = this.initialize(now); if (current.status === "completed_local_discovery" || current.status === "technical_block") return current;
    const orchestrator = this.orchestrator.snapshot(now); const gate = orchestrator.gates.find((item) => item.gateId === "operational_enea_readonly_discovery"); const admission = this.admission.snapshot(now);
    if (!gate || gate.state !== "waiting_safety_gate") return current;
    if (admission.status !== "completed_local_admission" || admission.phase !== "completed" || !admission.adapterEvidenceFingerprint || !admission.readinessEvidenceFingerprint || admission.progress.completedPhases !== admission.progress.totalPhases) return this.technicalBlock("readonly_discovery_admission_invalid", now);
    const sourceSignature = sha256(JSON.stringify({ admissionVersion: admission.version, admissionRevision: admission.revision, admissionSource: admission.sourceSignature, adapter: admission.adapterEvidenceFingerprint, readiness: admission.readinessEvidenceFingerprint }));
    if (current.phase === "unprepared") { const next = structuredClone(current); next.status = "working_local"; next.sourceSignature = sourceSignature; next.lockOwner = next.controllerIdentity; next.leaseToken = randomUUID(); next.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString(); next.attemptCount = 1;
      return this.transition(next, "admission_verified", "Admission locale verificata come unica fonte del piano discovery.", "Definire i vincoli dell'identità browser esistente senza collegarla.", "discovery_started", now); }
    if (current.sourceSignature !== sourceSignature) return this.technicalBlock("readonly_discovery_source_changed", now);
    if (current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) <= now.getTime()) { const next = structuredClone(current); next.revision += 1; next.recoveryCount += 1; next.lockOwner = next.controllerIdentity; next.leaseToken = randomUUID(); next.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString(); next.reason = "Lease discovery scaduta: ripresa dalla fase checkpointata senza ripetere fasi completate."; next.nextAction = "Continuare dalla prima fase incompleta."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "lease_recovered", phase: next.phase, reason: next.reason, appliedRuleIds: [...RULE_IDS] }); return this.write(next); }
    if (current.phase === "admission_verified") return this.transition(current, "identity_plan_verified", "Vincoli identità verificati: solo profilo e schede esistenti, nessuna finestra, scheda o profilo alternativo.", "Verificare le sole superfici GET/HEAD pianificate.", "phase_checkpointed", now);
    if (current.phase === "identity_plan_verified") {
      if (surfaces.length !== 5 || surfaces.some((item) => !["GET", "HEAD"].includes(item.method) || item.bodyAllowed || item.mutationAllowed) || surfaces.filter((item) => item.purpose === "keepalive").length !== 1) return this.technicalBlock("readonly_discovery_surface_contract_invalid", now);
      return this.transition(current, "surface_plan_verified", "Cinque superfici di osservazione verificate: solo GET/HEAD, senza corpo o intento mutativo.", "Verificare autenticazione server+DOM, keepalive unico e routing dei blocchi.", "phase_checkpointed", now);
    }
    if (current.phase === "surface_plan_verified") return this.transition(current, "keepalive_plan_verified", "Keepalive HEAD unico e classificazioni fail-closed verificate; login_required richiede prova server di logout.", "Persistire il piano e accodare l'attach reale dietro safety gate.", "phase_checkpointed", now);
    if (current.phase === "keepalive_plan_verified") {
      const plan: DiscoveryPlan = { version: "apr-enea-readonly-discovery-plan-v1", sourceSignature, executorIdentity: "apr_persistent_runtime",
        identity: { reuseExistingBrowserProfile: true, requirePersistentIdentityMatch: true, createWindow: false, createTabs: false, privateProfile: false },
        authentication: { crmEvidence: ["server_2xx", "authenticated_dom_marker"], eneaEvidence: ["server_2xx", "authenticated_dom_marker"], loginRequiredOnlyOnServerLogoutEvidence: true },
        allowlist: { strategy: "exact_origin_from_verified_admission", redirectOriginChangeAllowed: false }, surfaces,
        failureRouting: { identityMismatch: "technical_block_global", verifiedServerLogout: "login_required_global", missingCaseAttachment: "operator_required_case_only" },
        safety: { dispatchAllowed: false, browserAllowed: false, navigationAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false } };
      const contents = `${JSON.stringify(plan, null, 2)}\n`; const fingerprint = sha256(contents); if (!existsSync(this.planPath) || sha256(readFileSync(this.planPath)) !== fingerprint) atomicWrite(this.planPath, contents);
      const next = structuredClone(current); next.planPath = this.planPath; next.planSha256 = fingerprint; const completed = this.transition(next, "completed", "Piano discovery read-only locale completato e immutabile; nessun browser collegato.", "Attach reale read-only accodato ma ancora fail-closed.", "discovery_completed", now);
      this.orchestrator.recordReadOnlyDiscoveryCompleted(fingerprint, now); return completed;
    }
    return current;
  }
  snapshot(now = new Date()) { const state = this.load(now); return { ...state, progress: { completedPhases: ["admission_verified", "identity_plan_verified", "surface_plan_verified", "keepalive_plan_verified", "completed"].indexOf(state.phase) + 1, totalPhases: 5 }, plannedSurfaces: surfaces, lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() }; }
}
