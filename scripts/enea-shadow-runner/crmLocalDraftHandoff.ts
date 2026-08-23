import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmLocalDraftPackages } from "./crmLocalDraftPackages";

export const APR_CRM_LOCAL_DRAFT_HANDOFF_VERSION = "apr-crm-local-draft-handoff-v1" as const;

const RULE_IDS = [
  "system-apr-crm-integration-boundary",
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
  "system-operator-block-fail-closed",
] as const;

type PackageStoreContract = Pick<PersistentAprCrmLocalDraftPackages, "snapshot">;

export interface AprCrmLocalDraftHandoffItem {
  handoffId: string;
  customerKey: string;
  displayName: string;
  practiceId: string;
  state: "staged_fail_closed";
  targetExecutor: "apr_enea_draft_executor";
  packageArtifactPath: string;
  packageArtifactSha256: string;
  packageFingerprint: string;
  sourceFingerprint: string | null;
  mappingFingerprint: string;
  workflowFingerprint: string;
  lockOwner: null;
  leaseExpiresAt: null;
  dispatchAttemptCount: 0;
  externalDispatchAllowed: false;
  reason: string;
  nextAction: string;
}

export interface AprCrmLocalDraftHandoffState {
  version: typeof APR_CRM_LOCAL_DRAFT_HANDOFF_VERSION;
  revision: number;
  status: "unprepared" | "staged_fail_closed" | "technical_block";
  sourceSignature: string | null;
  queueScope: "crm_live_processing_runtime";
  historicalCheckpointImported: false;
  executorIdentity: "apr_persistent_runtime";
  items: AprCrmLocalDraftHandoffItem[];
  externalActionAllowed: false;
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
    type: "initialized" | "handoff_staged" | "technical_block";
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

function initialState(now: Date): AprCrmLocalDraftHandoffState {
  const reason = "Coda handoff locale non ancora preparata.";
  return {
    version: APR_CRM_LOCAL_DRAFT_HANDOFF_VERSION,
    revision: 0,
    status: "unprepared",
    sourceSignature: null,
    queueScope: "crm_live_processing_runtime",
    historicalCheckpointImported: false,
    executorIdentity: "apr_persistent_runtime",
    items: [],
    externalActionAllowed: false,
    crmMutationAllowed: false,
    eneaActionAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    receiptAllowed: false,
    communicationsAllowed: false,
    reason,
    nextAction: "Attendere pacchetti locali verificati; non importare checkpoint esecutivi storici.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason, appliedRuleIds: [...RULE_IDS] }],
  };
}

function validState(value: AprCrmLocalDraftHandoffState) {
  return value.version === APR_CRM_LOCAL_DRAFT_HANDOFF_VERSION
    && value.queueScope === "crm_live_processing_runtime"
    && value.historicalCheckpointImported === false
    && value.executorIdentity === "apr_persistent_runtime"
    && value.externalActionAllowed === false
    && value.crmMutationAllowed === false
    && value.eneaActionAllowed === false
    && value.previewAllowed === false
    && value.submitAllowed === false
    && value.receiptAllowed === false
    && value.communicationsAllowed === false
    && value.items.every((item) => item.state === "staged_fail_closed" && item.externalDispatchAllowed === false && item.dispatchAttemptCount === 0 && item.lockOwner === null && item.leaseExpiresAt === null)
    && new Set(value.items.map((item) => item.handoffId)).size === value.items.length
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

export class PersistentAprCrmLocalDraftHandoff {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string, readonly packages: PackageStoreContract) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-local-draft-handoff");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmLocalDraftHandoffState;
      return validState(value) ? value : initialState(now);
    } catch {
      return initialState(now);
    }
  }

  private write(state: AprCrmLocalDraftHandoffState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  synchronize(now = new Date()) {
    const packages = this.packages.snapshot(now);
    if (packages.status !== "completed") return this.initialize(now);
    try {
      const items = packages.packages.map<AprCrmLocalDraftHandoffItem>((item) => {
        if (!path.isAbsolute(item.packageArtifactPath) || !existsSync(item.packageArtifactPath) || fileSha256(item.packageArtifactPath) !== item.packageArtifactSha256) {
          throw new Error(`package_artifact_invalid:${item.customerKey}`);
        }
        return {
          handoffId: `apr-local-handoff:${item.practiceId}:${item.packageFingerprint}`,
          customerKey: item.customerKey,
          displayName: item.displayName,
          practiceId: item.practiceId,
          state: "staged_fail_closed",
          targetExecutor: "apr_enea_draft_executor",
          packageArtifactPath: item.packageArtifactPath,
          packageArtifactSha256: item.packageArtifactSha256,
          packageFingerprint: item.packageFingerprint,
          sourceFingerprint: item.sourceFingerprint,
          mappingFingerprint: item.mappingFingerprint,
          workflowFingerprint: item.workflowFingerprint,
          lockOwner: null,
          leaseExpiresAt: null,
          dispatchAttemptCount: 0,
          externalDispatchAllowed: false,
          reason: "Pacchetto locale verificato e staged; nessuna capability esterna e' armata.",
          nextAction: "Attendere un futuro gate esecutivo esplicito e verificato; non usare il checkpoint storico.",
        };
      }).sort((left, right) => left.customerKey.localeCompare(right.customerKey));
      const sourceSignature = sha256(items.map(({ handoffId, packageArtifactSha256, packageFingerprint }) => ({ handoffId, packageArtifactSha256, packageFingerprint })));
      const current = this.initialize(now);
      if (current.status === "staged_fail_closed" && current.sourceSignature === sourceSignature) return current;
      const next = structuredClone(current);
      next.revision += 1; next.status = "staged_fail_closed"; next.sourceSignature = sourceSignature; next.items = items;
      next.reason = `${items.length} pacchetti locali staged per handoff APR; checkpoint storici esclusi e dispatch esterno disabilitato.`;
      next.nextAction = "Mostrare la coda in dashboard; nessun elemento puo essere reclamato finche' il gate esterno resta chiuso.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "handoff_staged", reason: next.reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    } catch (error) {
      const current = this.initialize(now);
      const reason = `Coda handoff bloccata: ${error instanceof Error ? error.message : String(error)}`;
      const sourceSignature = sha256({ packageRevision: packages.revision, reason });
      if (current.status === "technical_block" && current.sourceSignature === sourceSignature) return current;
      const next = structuredClone(current);
      next.revision += 1; next.status = "technical_block"; next.sourceSignature = sourceSignature; next.items = [];
      next.reason = reason; next.nextAction = "Ripristinare l'artefatto locale dal pacchetto verificato; non eseguire alcun dispatch.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "technical_block", reason, appliedRuleIds: [...RULE_IDS] });
      return this.write(next);
    }
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return {
      ...state,
      progress: {
        total: state.items.length,
        staged: state.items.filter((item) => item.state === "staged_fail_closed").length,
        dispatched: 0,
        active: 0,
      },
      lastEvent: state.audit.at(-1)!,
      observedAt: now.toISOString(),
    };
  }
}
