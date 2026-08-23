import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { SessionReadinessInput } from "../../src/features/enea-shadow-crm/sessionReadiness";
import type { PersistentAprGateOrchestrator } from "./aprGateOrchestrator";
import { VERIFIED_LOCAL_READ_ONLY_FIXTURE } from "./fixtures/readOnlyAdapterFixture";
import { PersistentReadinessLease, READINESS_LEASE_MS } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";

export const APR_ENEA_READINESS_ADMISSION_VERSION = "apr-enea-readiness-admission-v1" as const;
const RULE_IDS = ["system-readonly-adapter-contract", "system-enea-lease-required", "system-exclusive-runner-lease", "system-atomic-checkpoint-resume", "system-apr-crm-integration-boundary"] as const;
const CONTROLLER_LEASE_MS = 10_000;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

type OrchestratorContract = Pick<PersistentAprGateOrchestrator, "snapshot" | "recordReadinessAdmissionCompleted">;
export type AprEneaReadinessAdmissionPhase = "unprepared" | "manifest_verified" | "adapter_verified" | "readiness_acquired" | "keepalive_verified" | "expiry_verified" | "recovery_verified" | "completed";

export interface AprEneaReadinessAdmissionState {
  version: typeof APR_ENEA_READINESS_ADMISSION_VERSION;
  revision: number;
  status: "unprepared" | "working_local" | "completed_local_admission" | "technical_block";
  phase: AprEneaReadinessAdmissionPhase;
  controllerIdentity: "apr_persistent_enea_readiness_admission";
  sourceSignature: string | null;
  manifestPath: string | null;
  manifestSha256: string | null;
  lockOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  recoveryCount: number;
  adapterEvidenceFingerprint: string | null;
  readinessEvidenceFingerprint: string | null;
  nextGateId: "operational_enea_readonly_discovery" | null;
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
  audit: Array<{ revision: number; at: string; type: "initialized" | "admission_started" | "phase_checkpointed" | "lease_recovered" | "admission_completed" | "technical_block"; phase: AprEneaReadinessAdmissionPhase; reason: string; appliedRuleIds: string[] }>;
}

const greenReadiness: SessionReadinessInput = {
  authorizedChromeVisible: true, crmDedicatedSessionVisible: true, crmAuthenticated: true, crmReadOnlyPageReachable: true,
  eneaSessionVisible: true, eneaAuthenticated: true, crmOriginAllowlisted: true, attachmentReadCapabilityVerified: true,
  eneaLeaseActive: true, persistentBrowserIdentityVerified: true,
};

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprEneaReadinessAdmissionState {
  const reason = "Admission readiness ENEA inizializzata e fail-closed.";
  return { version: APR_ENEA_READINESS_ADMISSION_VERSION, revision: 0, status: "unprepared", phase: "unprepared", controllerIdentity: "apr_persistent_enea_readiness_admission",
    sourceSignature: null, manifestPath: null, manifestSha256: null, lockOwner: null, leaseToken: null, leaseExpiresAt: null, attemptCount: 0, recoveryCount: 0,
    adapterEvidenceFingerprint: null, readinessEvidenceFingerprint: null, nextGateId: null,
    externalActionAllowed: false, browserAllowed: false, crmMutationAllowed: false, eneaActionAllowed: false, previewAllowed: false, submitAllowed: false, receiptAllowed: false, communicationsAllowed: false,
    reason, nextAction: "Consumare il manifest bridge e verificare il contratto soltanto con fixture locale.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", phase: "unprepared", reason, appliedRuleIds: [...RULE_IDS] }] };
}

function validState(value: AprEneaReadinessAdmissionState) {
  return value.version === APR_ENEA_READINESS_ADMISSION_VERSION && value.controllerIdentity === "apr_persistent_enea_readiness_admission"
    && value.externalActionAllowed === false && value.browserAllowed === false && value.crmMutationAllowed === false && value.eneaActionAllowed === false
    && value.previewAllowed === false && value.submitAllowed === false && value.receiptAllowed === false && value.communicationsAllowed === false
    && value.attemptCount <= 1 && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

export class PersistentAprEneaReadinessAdmission {
  readonly directory: string; readonly checkpointPath: string; readonly fixtureRuntimeRoot: string;
  readonly adapter: PersistentReadOnlyAdapter; readonly readiness: PersistentReadinessLease;
  constructor(readonly rootDirectory: string, readonly orchestrator: OrchestratorContract, readonly controllerLeaseMs = CONTROLLER_LEASE_MS) {
    if (!Number.isFinite(controllerLeaseMs) || controllerLeaseMs < 1_000 || controllerLeaseMs > 300_000) throw new Error("readiness_admission_lease_invalid");
    this.directory = path.join(path.resolve(rootDirectory), "apr-enea-readiness-admission"); this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.fixtureRuntimeRoot = path.join(this.directory, "local-fixture-runtime"); this.adapter = new PersistentReadOnlyAdapter(this.fixtureRuntimeRoot); this.readiness = new PersistentReadinessLease(this.fixtureRuntimeRoot);
  }
  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprEneaReadinessAdmissionState; return validState(value) ? value : initialState(now); } catch { return initialState(now); }
  }
  private write(state: AprEneaReadinessAdmissionState) { if (!validState(state)) throw new Error("readiness_admission_checkpoint_invalid"); atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  private transition(state: AprEneaReadinessAdmissionState, phase: AprEneaReadinessAdmissionPhase, reason: string, nextAction: string, type: AprEneaReadinessAdmissionState["audit"][number]["type"], now: Date) {
    const next = structuredClone(state); next.revision += 1; next.phase = phase; next.reason = reason; next.nextAction = nextAction;
    next.leaseExpiresAt = phase === "completed" ? null : new Date(now.getTime() + this.controllerLeaseMs).toISOString();
    if (phase === "completed") { next.status = "completed_local_admission"; next.lockOwner = null; next.leaseToken = null; next.nextGateId = "operational_enea_readonly_discovery"; }
    next.audit.push({ revision: next.revision, at: now.toISOString(), type, phase, reason, appliedRuleIds: [...RULE_IDS] }); return this.write(next);
  }
  private technicalBlock(reason: string, now: Date) {
    const current = this.load(now); if (current.status === "technical_block" && current.reason === reason) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "technical_block"; next.lockOwner = null; next.leaseToken = null; next.leaseExpiresAt = null; next.reason = reason;
    next.nextAction = "Correggere il contratto locale e riprendere dal checkpoint; nessuna azione esterna è consentita.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", phase: next.phase, reason, appliedRuleIds: [...RULE_IDS] }); return this.write(next);
  }
  tick(now = new Date()) {
    let current = this.initialize(now); if (current.status === "completed_local_admission" || current.status === "technical_block") return current;
    const orchestrator = this.orchestrator.snapshot(now); const gate = orchestrator.gates.find((item) => item.gateId === "external_enea_readiness_admission");
    if (!gate || gate.state !== "waiting_safety_gate" || !orchestrator.bridgeManifestPath) return current;
    if (!existsSync(orchestrator.bridgeManifestPath)) return this.technicalBlock("readiness_admission_manifest_missing", now);
    const contents = readFileSync(orchestrator.bridgeManifestPath); const manifestSha256 = sha256(contents);
    if (orchestrator.gates.find((item) => item.gateId === "local_enea_browser_bridge_contract")?.evidenceFingerprint !== manifestSha256) return this.technicalBlock("readiness_admission_manifest_hash_mismatch", now);
    let manifest: { version?: string; cohortKey?: string; sourceSignature?: string; items?: unknown[]; safety?: Record<string, unknown> };
    try { manifest = JSON.parse(contents.toString("utf8")); } catch { return this.technicalBlock("readiness_admission_manifest_json_invalid", now); }
    if (manifest.version !== "apr-local-enea-browser-bridge-manifest-v1" || manifest.cohortKey !== orchestrator.cohortKey || manifest.sourceSignature !== orchestrator.sourceSignature || !manifest.items?.length || !manifest.safety || Object.values(manifest.safety).some((value) => value !== false)) return this.technicalBlock("readiness_admission_manifest_contract_invalid", now);
    const sourceSignature = sha256(Buffer.concat([contents, Buffer.from(VERIFIED_LOCAL_READ_ONLY_FIXTURE.id)]));
    if (current.phase === "unprepared") {
      const next = structuredClone(current); next.status = "working_local"; next.sourceSignature = sourceSignature; next.manifestPath = orchestrator.bridgeManifestPath; next.manifestSha256 = manifestSha256;
      next.lockOwner = next.controllerIdentity; next.leaseToken = randomUUID(); next.leaseExpiresAt = new Date(now.getTime() + this.controllerLeaseMs).toISOString(); next.attemptCount = 1;
      return this.transition(next, "manifest_verified", `Manifest bridge verificato (${manifest.items.length} pratiche); tutte le capability esterne restano false.`, "Verificare identità, allowlist e prove GET/HEAD tramite fixture locale.", "admission_started", now);
    }
    if (current.sourceSignature !== sourceSignature || current.manifestSha256 !== manifestSha256) return this.technicalBlock("readiness_admission_source_changed", now);
    if (current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) <= now.getTime()) {
      const next = structuredClone(current); next.revision += 1; next.recoveryCount += 1; next.lockOwner = next.controllerIdentity; next.leaseToken = randomUUID(); next.leaseExpiresAt = new Date(now.getTime() + this.controllerLeaseMs).toISOString();
      next.reason = "Lease admission scaduta: ripresa sicura dalla fase già checkpointata senza ripetere le prove completate."; next.nextAction = "Continuare dalla prima fase incompleta.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "lease_recovered", phase: next.phase, reason: next.reason, appliedRuleIds: [...RULE_IDS] }); return this.write(next);
    }
    try {
      if (current.phase === "manifest_verified") {
        const adapter = this.adapter.runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, `admission:${sourceSignature}:adapter`, now);
        if (adapter.status !== "fixture_verified" || adapter.identityOutcome !== "verified_fixture" || adapter.evidence.length !== 5 || adapter.keepaliveCount !== 1) return this.technicalBlock("readiness_admission_adapter_fixture_failed", now);
        const next = structuredClone(current); next.adapterEvidenceFingerprint = sha256(JSON.stringify({ identity: adapter.identityFingerprint, origins: adapter.allowlistedOrigins, evidence: adapter.evidence.map((item) => item.sha256) }));
        return this.transition(next, "adapter_verified", "Identità persistente, allowlist, allegato e singolo keepalive GET/HEAD verificati in fixture locale.", "Acquisire una lease readiness simulata completa.", "phase_checkpointed", now);
      }
      if (current.phase === "adapter_verified") {
        const lease = this.readiness.acquireSimulation("admission-owner-a", greenReadiness, `admission:${sourceSignature}:lease-acquire`, now);
        if (lease.status !== "simulation_ready" || lease.checks.length !== 10 || lease.checks.some((check) => !check.ok)) return this.technicalBlock("readiness_admission_lease_acquire_failed", now);
        return this.transition(current, "readiness_acquired", "Lease readiness locale acquisita con dieci controlli verdi; coda operativa ancora chiusa.", "Verificare il rinnovo idempotente con un solo keepalive innocuo.", "phase_checkpointed", now);
      }
      if (current.phase === "readiness_acquired") {
        const key = `admission:${sourceSignature}:lease-keepalive`; const input = { ok: true, serverVerified: true, method: "HEAD", surface: "dashboard" as const, action: "verify existing dashboard" };
        const lease = this.readiness.keepaliveSimulation("admission-owner-a", input, key, now); const replay = this.readiness.keepaliveSimulation("admission-owner-a", input, key, new Date(now.getTime() + 1));
        if (lease.status !== "simulation_ready" || lease.safeKeepaliveCount !== 1 || replay.revision !== lease.revision) return this.technicalBlock("readiness_admission_keepalive_idempotency_failed", now);
        return this.transition(current, "keepalive_verified", "Keepalive HEAD innocuo verificato e replay idempotente; nessuna richiesta esterna emessa.", "Simulare la scadenza della lease e provare il fail-closed.", "phase_checkpointed", now);
      }
      if (current.phase === "keepalive_verified") {
        const before = this.readiness.load(); if (!before.leaseUntil) return this.technicalBlock("readiness_admission_lease_until_missing", now);
        const expired = this.readiness.expireIfNeeded(new Date(Date.parse(before.leaseUntil) + 1));
        if (expired.status !== "expired" || expired.audit.at(-1)?.type !== "readiness_expired") return this.technicalBlock("readiness_admission_expiry_failed", now);
        return this.transition(current, "expiry_verified", "Scadenza lease simulata rilevata e classificata fail-closed senza inferire logout.", "Recuperare la lease con nuova verifica completa e nuovo owner.", "phase_checkpointed", now);
      }
      if (current.phase === "expiry_verified") {
        const recoveredAt = new Date(Math.max(now.getTime(), Date.parse(this.readiness.load().leaseUntil ?? now.toISOString()) + 1));
        const recovered = this.readiness.acquireSimulation("admission-owner-b", greenReadiness, `admission:${sourceSignature}:lease-recover`, recoveredAt);
        if (recovered.status !== "simulation_ready" || recovered.ownerId !== "admission-owner-b" || recovered.audit.at(-1)?.type !== "readiness_simulation_recovered") return this.technicalBlock("readiness_admission_recovery_failed", now);
        const next = structuredClone(current); next.readinessEvidenceFingerprint = sha256(JSON.stringify({ checks: recovered.checks, safeKeepaliveCount: recovered.safeKeepaliveCount, recovery: recovered.audit.at(-1)?.type }));
        return this.transition(next, "recovery_verified", "Lease recuperata dopo scadenza senza perdita delle prove e senza sbloccare la coda reale.", "Chiudere il collaudo locale e accodare il gate operativo read-only.", "lease_recovered", now);
      }
      if (current.phase === "recovery_verified") {
        if (!current.adapterEvidenceFingerprint || !current.readinessEvidenceFingerprint) return this.technicalBlock("readiness_admission_evidence_incomplete", now);
        const fingerprint = sha256(JSON.stringify({ sourceSignature, adapter: current.adapterEvidenceFingerprint, readiness: current.readinessEvidenceFingerprint }));
        const completed = this.transition(current, "completed", "Admission controller locale completato: crash/restart, keepalive, scadenza, recupero e idempotenza verificati.", "Gate operativo read-only accodato automaticamente ma ancora fail-closed.", "admission_completed", now);
        this.orchestrator.recordReadinessAdmissionCompleted(fingerprint, now); return completed;
      }
      return current;
    } catch (error) { return this.technicalBlock(error instanceof Error ? error.message : String(error), now); }
  }
  snapshot(now = new Date()) {
    const state = this.load(now); return { ...state, adapter: this.adapter.snapshot(now), readiness: this.readiness.snapshot(now),
      progress: { completedPhases: ["manifest_verified", "adapter_verified", "readiness_acquired", "keepalive_verified", "expiry_verified", "recovery_verified", "completed"].indexOf(state.phase) + 1, totalPhases: 7 },
      lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() };
  }
}
