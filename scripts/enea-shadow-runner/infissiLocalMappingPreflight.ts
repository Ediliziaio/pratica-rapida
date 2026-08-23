import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION,
  buildInfissiArchivedCasePreflight,
  type InfissiArchivedCasePreflight,
  type InfissiArchivedCasePreflightInput,
} from "../../src/features/enea-shadow-crm/infissiOriginalDocumentParser";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_INFISSI_LOCAL_MAPPING_PREFLIGHT_VERSION = "apr-infissi-local-mapping-preflight-v2" as const;

const SYSTEM_RULE_IDS = ["system-single-active-practice", "system-atomic-checkpoint-resume"] as const;
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export interface AprInfissiLocalMappingState {
  version: typeof APR_INFISSI_LOCAL_MAPPING_PREFLIGHT_VERSION;
  parserVersion: typeof APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION;
  revision: number;
  status: "unprepared" | "ready_for_portal_mapping" | "operator_required";
  sourceSignature: string | null;
  currentCustomerKey: string | null;
  item: InfissiArchivedCasePreflight | null;
  externalActionAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  reason: string;
  nextAction: string;
  dryRun: null | {
    status: "completed" | "operator_required";
    generatedAt: string;
    payloadSha256: string | null;
    energySavingsWriteAllowed: false;
    portalManagedEnergySavings: true;
    technicalPreview: null | {
      physicalWindowCount: number;
      expenseGrossVatIncluded: number;
      rows: Array<{
        physicalRowId: string;
        dimensionsM: string;
        areaM2: number;
        newUwWm2K: number;
        oldUwWm2K: number;
        material: string;
        glass: string;
        shadingClosuresChecked: boolean;
      }>;
    };
    checkpoints: Array<{
      phase: "source_validation" | "rule_resolution" | "payload_generation" | "external_gate_closed";
      status: "completed" | "blocked";
      appliedRuleIds: string[];
    }>;
  };
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "case_ready" | "case_operator_required";
    customerKey: string | null;
    reason: string;
    appliedRuleIds: string[];
  }>;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); }
  finally { closeSync(directory); }
}

function initialState(now: Date): AprInfissiLocalMappingState {
  const reason = "Preflight locale Infissi non ancora eseguito; ogni azione esterna resta chiusa.";
  return {
    version: APR_INFISSI_LOCAL_MAPPING_PREFLIGHT_VERSION,
    parserVersion: APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION,
    revision: 0,
    status: "unprepared",
    sourceSignature: null,
    currentCustomerKey: null,
    item: null,
    externalActionAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    reason,
    nextAction: "Acquisire e verificare soltanto fonti originarie locali di una pratica Infissi archiviata.",
    dryRun: null,
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", customerKey: null, reason, appliedRuleIds: [...SYSTEM_RULE_IDS] }],
  };
}

function validState(value: AprInfissiLocalMappingState) {
  return value.version === APR_INFISSI_LOCAL_MAPPING_PREFLIGHT_VERSION
    && value.parserVersion === APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION
    && value.externalActionAllowed === false
    && value.previewAllowed === false
    && value.submitAllowed === false
    && value.communicationsAllowed === false
    && (value.dryRun === null || value.dryRun.energySavingsWriteAllowed === false)
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((id) => registryRule(id)));
}

export class PersistentAprInfissiLocalMappingPreflight {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "infissi-local-mapping");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprInfissiLocalMappingState;
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  private write(state: AprInfissiLocalMappingState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  run(input: InfissiArchivedCasePreflightInput, now = new Date()) {
    const result = buildInfissiArchivedCasePreflight(input);
    const sourceSignature = sha256({
      practiceId: result.practiceId,
      sourceFingerprints: result.report.sourceFingerprints,
      verifiedTechnicalPageDimensions: input.verifiedTechnicalPageDimensions,
      form: input.form,
    });
    const current = this.initialize(now);
    if (current.sourceSignature === sourceSignature && current.item?.caseTruth === result.caseTruth) return current;
    if (current.sourceSignature && current.sourceSignature !== sourceSignature) throw new Error("infissi_mapping_source_set_immutable");

    const ready = result.caseTruth === "READY";
    const reason = ready
      ? `${result.displayName}: nessun problema; ${result.report.physicalProductCount} infissi 1:1 e totale fatture verificati localmente.`
      : `${result.displayName}: ${result.report.blockers.length} blocker coerenti registrati dalle fonti originarie.`;
    const appliedRuleIds = [...new Set([...SYSTEM_RULE_IDS, ...result.report.appliedRuleIds])];
    const eneaPayload = result.report.eneaDraftPayload;
    const dryRun: NonNullable<AprInfissiLocalMappingState["dryRun"]> = {
      status: ready ? "completed" : "operator_required",
      generatedAt: now.toISOString(),
      payloadSha256: eneaPayload ? sha256(eneaPayload) : null,
      energySavingsWriteAllowed: false,
      portalManagedEnergySavings: true,
      technicalPreview: eneaPayload ? {
        physicalWindowCount: eneaPayload.physicalWindowCount,
        expenseGrossVatIncluded: eneaPayload.expenseGrossVatIncluded,
        rows: eneaPayload.windows.map((row) => ({
          physicalRowId: row.physicalRowId,
          dimensionsM: `${row.widthM}x${row.heightM}`,
          areaM2: row.areaM2,
          newUwWm2K: row.newWindowThermalTransmittanceWm2K,
          oldUwWm2K: row.oldWindowThermalTransmittanceWm2K,
          material: row.frameMaterial,
          glass: row.glassType,
          shadingClosuresChecked: row.shadingClosuresChecked,
        })),
      } : null,
      checkpoints: [
        { phase: "source_validation", status: result.report.sourceFingerprints.length > 0 ? "completed" : "blocked", appliedRuleIds },
        { phase: "rule_resolution", status: result.report.blockers.length === 0 ? "completed" : "blocked", appliedRuleIds },
        { phase: "payload_generation", status: eneaPayload ? "completed" : "blocked", appliedRuleIds },
        { phase: "external_gate_closed", status: "completed", appliedRuleIds: [...SYSTEM_RULE_IDS] },
      ],
    };
    const next: AprInfissiLocalMappingState = {
      ...current,
      revision: current.revision + 1,
      status: ready ? "ready_for_portal_mapping" : "operator_required",
      sourceSignature,
      currentCustomerKey: null,
      item: result,
      reason,
      nextAction: result.draftPlan.nextAction,
      dryRun,
      audit: [...current.audit, {
        revision: current.revision + 1,
        at: now.toISOString(),
        type: ready ? "case_ready" : "case_operator_required",
        customerKey: result.customerKey,
        reason,
        appliedRuleIds,
      }],
    };
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return { ...state, observedAt: now.toISOString(), lastEvent: state.audit.at(-1)! };
  }
}
