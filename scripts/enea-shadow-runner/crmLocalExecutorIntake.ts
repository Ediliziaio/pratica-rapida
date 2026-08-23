import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmLocalDraftHandoff } from "./crmLocalDraftHandoff";

export const APR_CRM_LOCAL_EXECUTOR_INTAKE_VERSION = "apr-crm-local-executor-intake-v1" as const;

const RULE_IDS = [
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
  "system-operator-block-fail-closed",
  "system-apr-crm-integration-boundary",
] as const;
const DEFAULT_LEASE_MS = 10_000;

type HandoffContract = Pick<PersistentAprCrmLocalDraftHandoff, "snapshot">;

export interface AprCrmLocalExecutorIntakeItem {
  handoffId: string;
  customerKey: string;
  displayName: string;
  practiceId: string;
  packageArtifactPath: string;
  packageArtifactSha256: string;
  packageFingerprint: string;
  state: "queued" | "claimed" | "released_local";
  checkpointPhase: "awaiting_claim" | "claimed" | "artifact_verified" | "released_local";
  lockOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  claimAttemptCount: number;
  recoveryCount: number;
  claimedAt: string | null;
  artifactVerifiedAt: string | null;
  releasedAt: string | null;
  lastProgressAt: string | null;
  reason: string;
  nextAction: string;
}

export interface AprCrmLocalExecutorIntakeState {
  version: typeof APR_CRM_LOCAL_EXECUTOR_INTAKE_VERSION;
  revision: number;
  status: "unprepared" | "queued" | "working" | "completed_local" | "technical_block";
  sourceSignature: string | null;
  executorIdentity: "apr_enea_draft_executor";
  runtimeIdentity: "apr_persistent_runtime";
  currentHandoffId: string | null;
  items: AprCrmLocalExecutorIntakeItem[];
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
    type: "initialized" | "queue_synchronized" | "item_claimed" | "artifact_checkpointed" | "lease_recovered" | "item_released_local" | "completed_local" | "technical_block";
    handoffId: string | null;
    reason: string;
    appliedRuleIds: string[];
  }>;
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fileSha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmLocalExecutorIntakeState {
  const reason = "Intake locale dell'esecutore non ancora sincronizzato.";
  return {
    version: APR_CRM_LOCAL_EXECUTOR_INTAKE_VERSION,
    revision: 0,
    status: "unprepared",
    sourceSignature: null,
    executorIdentity: "apr_enea_draft_executor",
    runtimeIdentity: "apr_persistent_runtime",
    currentHandoffId: null,
    items: [],
    externalActionAllowed: false,
    browserAllowed: false,
    crmMutationAllowed: false,
    eneaActionAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    receiptAllowed: false,
    communicationsAllowed: false,
    reason,
    nextAction: "Attendere una coda handoff locale valida e non armata.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", handoffId: null, reason, appliedRuleIds: [...RULE_IDS] }],
  };
}

function activeItems(state: AprCrmLocalExecutorIntakeState) {
  return state.items.filter((item) => item.state === "claimed");
}

function validState(value: AprCrmLocalExecutorIntakeState) {
  const active = activeItems(value);
  return value.version === APR_CRM_LOCAL_EXECUTOR_INTAKE_VERSION
    && value.executorIdentity === "apr_enea_draft_executor"
    && value.runtimeIdentity === "apr_persistent_runtime"
    && value.externalActionAllowed === false
    && value.browserAllowed === false
    && value.crmMutationAllowed === false
    && value.eneaActionAllowed === false
    && value.previewAllowed === false
    && value.submitAllowed === false
    && value.receiptAllowed === false
    && value.communicationsAllowed === false
    && active.length <= 1
    && (active[0]?.handoffId ?? null) === value.currentHandoffId
    && new Set(value.items.map((item) => item.handoffId)).size === value.items.length
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

export class PersistentAprCrmLocalExecutorIntake {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string, readonly handoff: HandoffContract, readonly leaseMs = DEFAULT_LEASE_MS) {
    if (!Number.isFinite(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) throw new Error("crm_local_executor_lease_invalid");
    this.directory = path.join(path.resolve(rootDirectory), "crm-local-executor-intake");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmLocalExecutorIntakeState;
      return validState(value) ? value : initialState(now);
    } catch {
      return initialState(now);
    }
  }

  private write(state: AprCrmLocalExecutorIntakeState) {
    if (!validState(state)) throw new Error("crm_local_executor_checkpoint_invalid");
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  synchronize(now = new Date()) {
    const handoff = this.handoff.snapshot(now);
    if (handoff.status !== "staged_fail_closed") return this.initialize(now);
    if (handoff.externalActionAllowed || handoff.eneaActionAllowed || handoff.items.some((item) => item.externalDispatchAllowed)) {
      return this.technicalBlock("handoff_not_fail_closed", now);
    }
    const sourceSignature = sha256(handoff.items.map(({ handoffId, packageArtifactSha256, packageFingerprint }) => ({ handoffId, packageArtifactSha256, packageFingerprint })));
    const current = this.initialize(now);
    if (current.sourceSignature === sourceSignature) return current;
    if (current.sourceSignature && current.items.some((item) => item.state !== "released_local")) return this.technicalBlock("handoff_changed_while_intake_active", now);
    const next = structuredClone(current);
    next.revision += 1;
    next.status = handoff.items.length ? "queued" : "completed_local";
    next.sourceSignature = sourceSignature;
    next.currentHandoffId = null;
    next.items = handoff.items.map((item) => ({
      handoffId: item.handoffId,
      customerKey: item.customerKey,
      displayName: item.displayName,
      practiceId: item.practiceId,
      packageArtifactPath: item.packageArtifactPath,
      packageArtifactSha256: item.packageArtifactSha256,
      packageFingerprint: item.packageFingerprint,
      state: "queued",
      checkpointPhase: "awaiting_claim",
      lockOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      claimAttemptCount: 0,
      recoveryCount: 0,
      claimedAt: null,
      artifactVerifiedAt: null,
      releasedAt: null,
      lastProgressAt: null,
      reason: "In coda per verifica locale dell'artefatto da parte dell'esecutore APR.",
      nextAction: "Registrare lock e lease prima di leggere l'artefatto.",
    }));
    next.reason = `${next.items.length} handoff sincronizzati nell'intake locale; nessuna capability esterna disponibile.`;
    next.nextAction = next.items.length ? "Reclamare una sola pratica con lock e lease persistenti." : "Nessun handoff da verificare.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "queue_synchronized", handoffId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  tick(now = new Date()) {
    const current = this.synchronize(now);
    if (current.status === "unprepared" || current.status === "technical_block" || current.status === "completed_local") return current;
    const active = activeItems(current)[0];
    if (active?.leaseExpiresAt && new Date(active.leaseExpiresAt).getTime() <= now.getTime()) {
      const next = structuredClone(current);
      const target = next.items.find((item) => item.handoffId === active.handoffId)!;
      next.revision += 1; next.status = "queued"; next.currentHandoffId = null;
      target.state = "queued"; target.lockOwner = null; target.leaseToken = null; target.leaseExpiresAt = null; target.recoveryCount += 1;
      target.reason = `Lease scaduta recuperata dal checkpoint ${target.checkpointPhase}; nessuna azione esterna era iniziata.`;
      target.nextAction = "Riaccodare lo stesso handoff e riprendere dal checkpoint persistente.";
      next.reason = `${target.displayName}: lock scaduto rilasciato e handoff riaccodato in sicurezza.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "lease_recovered", handoffId: target.handoffId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    }
    if (!active) {
      const queued = current.items.find((item) => item.state === "queued");
      if (!queued) return this.complete(now);
      const next = structuredClone(current);
      const target = next.items.find((item) => item.handoffId === queued.handoffId)!;
      next.revision += 1; next.status = "working"; next.currentHandoffId = target.handoffId;
      if (target.checkpointPhase === "awaiting_claim") target.checkpointPhase = "claimed";
      target.state = "claimed"; target.lockOwner = next.executorIdentity; target.leaseToken = randomUUID(); target.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString();
      target.claimAttemptCount += 1; target.claimedAt ??= now.toISOString(); target.lastProgressAt = now.toISOString();
      target.reason = target.checkpointPhase === "artifact_verified" ? "Handoff recuperato: artefatto gia verificato, pronto al solo rilascio locale." : "Handoff reclamato dall'esecutore APR locale; azioni esterne vietate.";
      target.nextAction = target.checkpointPhase === "artifact_verified" ? "Rilasciare il lock conservando il checkpoint verificato." : "Verificare hash e contenuto dell'artefatto, poi salvare il checkpoint.";
      next.reason = `${target.displayName}: lock e lease persistiti prima della lettura.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "item_claimed", handoffId: target.handoffId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    }
    if (active.checkpointPhase === "claimed") {
      if (!existsSync(active.packageArtifactPath) || fileSha256(active.packageArtifactPath) !== active.packageArtifactSha256) return this.technicalBlock(`artifact_integrity_failed:${active.handoffId}`, now);
      const next = structuredClone(current);
      const target = next.items.find((item) => item.handoffId === active.handoffId)!;
      next.revision += 1; target.checkpointPhase = "artifact_verified"; target.artifactVerifiedAt = now.toISOString(); target.lastProgressAt = now.toISOString();
      target.leaseExpiresAt = new Date(now.getTime() + this.leaseMs).toISOString(); target.reason = "Hash artefatto verificato localmente e checkpoint persistito; nessuna esecuzione esterna.";
      target.nextAction = "Rilasciare lock e lease con stato ready_for_future_external_gate."; next.reason = `${target.displayName}: artefatto verificato.`; next.nextAction = target.nextAction;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "artifact_checkpointed", handoffId: target.handoffId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    }
    if (active.checkpointPhase === "artifact_verified") {
      const next = structuredClone(current);
      const target = next.items.find((item) => item.handoffId === active.handoffId)!;
      next.revision += 1; next.currentHandoffId = null;
      target.state = "released_local"; target.checkpointPhase = "released_local"; target.lockOwner = null; target.leaseToken = null; target.leaseExpiresAt = null; target.releasedAt = now.toISOString(); target.lastProgressAt = now.toISOString();
      target.reason = "Verifica intake completata e lock rilasciato; fermo prima di browser/ENEA."; target.nextAction = "Attendere un futuro gate esterno separato.";
      next.status = next.items.some((item) => item.state === "queued") ? "queued" : "completed_local";
      next.reason = `${target.displayName}: intake locale rilasciato senza azioni esterne.`; next.nextAction = next.status === "queued" ? "Reclamare il prossimo handoff." : "Tutti gli handoff sono verificati; fermo prima del gate esterno.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "item_released_local", handoffId: target.handoffId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      if (next.status === "completed_local") next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed_local", handoffId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    }
    return this.technicalBlock(`unsupported_checkpoint_phase:${active.checkpointPhase}`, now);
  }

  private complete(now: Date) {
    const current = this.load(now);
    if (current.status === "completed_local") return current;
    const next = structuredClone(current); next.revision += 1; next.status = "completed_local"; next.currentHandoffId = null;
    next.reason = "Intake locale completato; tutti i lock sono rilasciati e nessuna azione esterna e' stata eseguita."; next.nextAction = "Attendere il futuro gate esterno.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed_local", handoffId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  private technicalBlock(code: string, now: Date) {
    const current = this.initialize(now);
    if (current.status === "technical_block" && current.reason.endsWith(code)) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "technical_block"; next.currentHandoffId = null;
    for (const item of next.items) if (item.state === "claimed") { item.state = "queued"; item.lockOwner = null; item.leaseToken = null; item.leaseExpiresAt = null; }
    next.reason = `Intake locale fail-closed: ${code}`; next.nextAction = "Correggere il checkpoint o l'artefatto; nessuna azione esterna e' consentita.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", handoffId: null, reason: next.reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return {
      ...state,
      progress: {
        total: state.items.length,
        queued: state.items.filter((item) => item.state === "queued").length,
        active: state.items.filter((item) => item.state === "claimed").length,
        released: state.items.filter((item) => item.state === "released_local").length,
        recovered: state.items.reduce((sum, item) => sum + item.recoveryCount, 0),
      },
      current: state.items.find((item) => item.handoffId === state.currentHandoffId) ?? null,
      lastEvent: state.audit.at(-1)!,
      observedAt: now.toISOString(),
    };
  }
}
