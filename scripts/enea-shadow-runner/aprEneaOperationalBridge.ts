import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EneaPortalWorkflowStep } from "../../src/features/enea-lab/portalScript";
import { canonicalSha256, verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import {
  APR_ENEA_PURE_MAPPER_VERSION,
  type AprEneaMappingArtifact,
} from "./aprEneaPureMapper";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";

export const APR_ENEA_OPERATIONAL_BRIDGE_VERSION = "apr-enea-operational-bridge-v1" as const;

export interface AprEneaOperationalBridgeCheckpoint {
  version: typeof APR_ENEA_OPERATIONAL_BRIDGE_VERSION;
  status: "armed";
  customerKey: string;
  practiceId: string;
  authorizationId: string;
  authorizationScope: "real_portal_draft_only";
  mappingArtifact: AprEneaMappingArtifact;
  sourceLegacyPackageFingerprint: string;
  bridgedPackageFingerprint: string;
  armedAt: string;
}

export interface AprEneaBridgedDraftPackage extends AprEneaDraftPackage {
  verifiedMapping: {
    bridgeVersion: typeof APR_ENEA_OPERATIONAL_BRIDGE_VERSION;
    mappingArtifactId: string;
    sourceDecisionArtifactId: string;
    sourceLegacyPackageFingerprint: string;
    authorizationId: string;
    authorizationScope: "real_portal_draft_only";
  };
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

function moneyPortalValue(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("apr_enea_bridge_expense_invalid");
  return value.toFixed(2).replace(".", ",");
}

function mappingExpense(mappingArtifact: AprEneaMappingArtifact) {
  if (!verifyImmutableArtifactEnvelope(mappingArtifact)
    || mappingArtifact.payload.schemaVersion !== APR_ENEA_PURE_MAPPER_VERSION
    || mappingArtifact.payload.mode !== "parallel_observation_only"
    || mappingArtifact.payload.operationalAuthority !== false
    || mappingArtifact.payload.status !== "mapped"
    || mappingArtifact.payload.blockers.length > 0) {
    throw new Error("apr_enea_bridge_mapping_artifact_invalid");
  }
  const unsupported = mappingArtifact.payload.portalFields.filter((field) => field.fieldId !== "calcolo.spesa_ammissibile_lorda_iva_inclusa");
  if (unsupported.length > 0) throw new Error(`apr_enea_bridge_mapping_field_unsupported:${unsupported[0].fieldId}`);
  const expenses = mappingArtifact.payload.portalFields.filter((field) => field.fieldId === "calcolo.spesa_ammissibile_lorda_iva_inclusa");
  if (expenses.length !== 1 || typeof expenses[0].value !== "number") throw new Error("apr_enea_bridge_expense_mapping_missing");
  return { expense: expenses[0].value, sourceDecisionId: expenses[0].sourceDecisionId };
}

function replaceVerifiedExpense(steps: readonly EneaPortalWorkflowStep[], expense: number) {
  let replacements = 0;
  const value = moneyPortalValue(expense);
  const next = steps.map((step) => ({
    ...step,
    fields: step.fields.map((field) => {
      if (field.portalId !== "id-costo") return { ...field };
      replacements += 1;
      return { ...field, value };
    }),
    markerIds: [...step.markerIds],
    ...(step.expenseAllocation ? { expenseAllocation: { ...step.expenseAllocation, appliedRuleIds: [...step.expenseAllocation.appliedRuleIds] } } : {}),
    ...(step.coBeneficiary ? { coBeneficiary: { ...step.coBeneficiary, sourceIds: [...step.coBeneficiary.sourceIds], appliedRuleIds: [...step.coBeneficiary.appliedRuleIds] } } : {}),
  }));
  if (replacements !== 1) throw new Error(`apr_enea_bridge_cost_target_cardinality_invalid:${replacements}`);
  return next;
}

/**
 * Unico collegamento autorizzato fra L4 e il worker legacy. Il mapper decide
 * esclusivamente la spesa; il pacchetto legacy conserva tutti gli altri campi.
 * Nessun default o fallback viene introdotto qui.
 */
export function bridgeVerifiedMappingToLegacyDraftPackage(input: {
  legacyPackage: AprEneaDraftPackage;
  mappingArtifact: AprEneaMappingArtifact;
  authorizationId: string;
}): AprEneaBridgedDraftPackage {
  const { legacyPackage, mappingArtifact } = input;
  if (!input.authorizationId.trim()) throw new Error("apr_enea_bridge_authorization_missing");
  if (mappingArtifact.payload.customerKey !== legacyPackage.customerKey
    || mappingArtifact.payload.practiceId !== legacyPackage.practiceId) {
    throw new Error("apr_enea_bridge_case_identity_mismatch");
  }
  const { expense } = mappingExpense(mappingArtifact);
  const workflow = {
    ...legacyPackage.workflow,
    supportedPages: [...legacyPackage.workflow.supportedPages],
    steps: replaceVerifiedExpense(legacyPackage.workflow.steps, expense),
    screeningSteps: legacyPackage.workflow.screeningSteps.map((step) => ({
      ...step,
      markerIds: [...step.markerIds],
      fields: step.fields.map((field) => ({ ...field })),
    })),
  };
  const workflowFingerprint = canonicalSha256({
    bridgeVersion: APR_ENEA_OPERATIONAL_BRIDGE_VERSION,
    sourceWorkflowFingerprint: legacyPackage.workflowFingerprint,
    mappingArtifactId: mappingArtifact.artifactId,
    workflow,
  });
  const verifiedMapping: AprEneaBridgedDraftPackage["verifiedMapping"] = {
    bridgeVersion: APR_ENEA_OPERATIONAL_BRIDGE_VERSION,
    mappingArtifactId: mappingArtifact.artifactId,
    sourceDecisionArtifactId: mappingArtifact.payload.sourceDecisionArtifactId,
    sourceLegacyPackageFingerprint: legacyPackage.packageFingerprint,
    authorizationId: input.authorizationId,
    authorizationScope: "real_portal_draft_only",
  };
  const bridged = {
    ...legacyPackage,
    workflow,
    workflowFingerprint,
    verifiedMapping,
    safety: { ...legacyPackage.safety },
  };
  // The legacy package fingerprint deliberately excludes observation-only
  // metadata. Rebuilding the same package can therefore change those fields
  // without changing its executable meaning. Bind the bridge identity only to
  // the stable legacy fingerprint, mapped artifact and resulting workflow.
  const bridgedPackageFingerprint = canonicalSha256({
    bridgeVersion: APR_ENEA_OPERATIONAL_BRIDGE_VERSION,
    sourceLegacyPackageFingerprint: legacyPackage.packageFingerprint,
    mappingArtifactId: mappingArtifact.artifactId,
    authorizationId: input.authorizationId,
    authorizationScope: "real_portal_draft_only",
    workflowFingerprint,
  });
  return Object.freeze({
    ...bridged,
    packageFingerprint: bridgedPackageFingerprint,
  });
}

export class PersistentAprEneaOperationalBridge {
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string) {
    this.checkpointPath = path.join(path.resolve(rootDirectory), "enea-operational-bridge", "checkpoint.json");
  }

  snapshot(): AprEneaOperationalBridgeCheckpoint | null {
    if (!existsSync(this.checkpointPath)) return null;
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprEneaOperationalBridgeCheckpoint;
    if (value.version !== APR_ENEA_OPERATIONAL_BRIDGE_VERSION
      || value.status !== "armed"
      || value.authorizationScope !== "real_portal_draft_only"
      || !value.authorizationId.trim()) throw new Error("apr_enea_bridge_checkpoint_invalid");
    return value;
  }

  arm(input: {
    legacyPackage: AprEneaDraftPackage;
    mappingArtifact: AprEneaMappingArtifact;
    authorizationId: string;
    now?: Date;
  }) {
    if (this.snapshot()) throw new Error("apr_enea_bridge_already_armed");
    const bridged = bridgeVerifiedMappingToLegacyDraftPackage(input);
    const checkpoint: AprEneaOperationalBridgeCheckpoint = {
      version: APR_ENEA_OPERATIONAL_BRIDGE_VERSION,
      status: "armed",
      customerKey: input.legacyPackage.customerKey,
      practiceId: input.legacyPackage.practiceId,
      authorizationId: input.authorizationId,
      authorizationScope: "real_portal_draft_only",
      mappingArtifact: input.mappingArtifact,
      sourceLegacyPackageFingerprint: input.legacyPackage.packageFingerprint,
      bridgedPackageFingerprint: bridged.packageFingerprint,
      armedAt: (input.now ?? new Date()).toISOString(),
    };
    atomicWrite(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }

  apply(legacyPackage: AprEneaDraftPackage): AprEneaDraftPackage {
    const checkpoint = this.snapshot();
    if (!checkpoint) return legacyPackage;
    if (legacyPackage.customerKey !== checkpoint.customerKey) return legacyPackage;
    if (legacyPackage.practiceId !== checkpoint.practiceId
      || legacyPackage.packageFingerprint !== checkpoint.sourceLegacyPackageFingerprint) {
      throw new Error("apr_enea_bridge_legacy_package_changed");
    }
    const bridged = bridgeVerifiedMappingToLegacyDraftPackage({
      legacyPackage,
      mappingArtifact: checkpoint.mappingArtifact,
      authorizationId: checkpoint.authorizationId,
    });
    if (bridged.packageFingerprint !== checkpoint.bridgedPackageFingerprint) throw new Error("apr_enea_bridge_replay_not_deterministic");
    return bridged;
  }
}
