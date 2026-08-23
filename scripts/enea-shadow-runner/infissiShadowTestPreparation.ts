import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { AprInfissiLocalMappingState } from "./infissiLocalMappingPreflight";

export const APR_INFISSI_SHADOW_TEST_PREPARATION_VERSION = "apr-infissi-shadow-test-preparation-v1" as const;

const SYSTEM_RULE_IDS = ["system-single-active-practice", "system-atomic-checkpoint-resume", "system-operator-block-fail-closed"] as const;
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export interface AprInfissiShadowTestPreparationState {
  version: typeof APR_INFISSI_SHADOW_TEST_PREPARATION_VERSION;
  revision: number;
  status: "unprepared" | "ready_for_external_authorization" | "technical_block";
  mappingSignature: string | null;
  selectedCase: null | {
    practiceId: string;
    customerKey: string;
    displayName: string;
    mode: "TEST";
  };
  expectedValues: null | {
    physicalWindowCount: number;
    invoiceGrossTotal: number;
    oldWindowThermalTransmittanceWm2K: number;
    frameMaterial: string;
    glassType: string;
    shadingClosuresChecked: boolean;
    energySavings: "portal_computed_leave_unset";
    payloadSha256: string;
  };
  checklist: Array<{
    id: string;
    status: "PASS" | "FAIL";
    evidence: string;
  }>;
  passCriteria: string[];
  failCriteria: string[];
  residualBlocker: null | { code: string; reason: string; nextAction: string };
  externalInteractionAuthorized: false;
  browserAllowed: false;
  crmReadAllowed: false;
  eneaReadAllowed: false;
  eneaWriteAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "shadow_test_prepared" | "shadow_test_technical_block";
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

function initialState(now: Date): AprInfissiShadowTestPreparationState {
  const reason = "Nessun caso Infissi shadow ancora preparato; ogni interazione esterna resta chiusa.";
  return {
    version: APR_INFISSI_SHADOW_TEST_PREPARATION_VERSION,
    revision: 0,
    status: "unprepared",
    mappingSignature: null,
    selectedCase: null,
    expectedValues: null,
    checklist: [],
    passCriteria: [],
    failCriteria: [],
    residualBlocker: null,
    externalInteractionAuthorized: false,
    browserAllowed: false,
    crmReadAllowed: false,
    eneaReadAllowed: false,
    eneaWriteAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason, appliedRuleIds: [...SYSTEM_RULE_IDS] }],
  };
}

function validState(value: AprInfissiShadowTestPreparationState) {
  return value.version === APR_INFISSI_SHADOW_TEST_PREPARATION_VERSION
    && value.externalInteractionAuthorized === false
    && value.browserAllowed === false
    && value.crmReadAllowed === false
    && value.eneaReadAllowed === false
    && value.eneaWriteAllowed === false
    && value.previewAllowed === false
    && value.submitAllowed === false
    && value.communicationsAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function technicalBlock(mapping: AprInfissiLocalMappingState) {
  if (mapping.status !== "ready_for_portal_mapping" || mapping.item?.caseTruth !== "READY") {
    return { code: "infissi_mapping_not_ready", reason: "Il mapping locale non e READY.", nextAction: "Correggere i blocker locali e rieseguire lo stesso dossier." };
  }
  if (mapping.dryRun?.status !== "completed" || !mapping.dryRun.payloadSha256) {
    return { code: "infissi_dry_run_not_completed", reason: "Il dry-run persistente non e completo.", nextAction: "Riprendere il dry-run dal checkpoint locale." };
  }
  if (!mapping.item.report.eneaDraftPayload) {
    return { code: "infissi_payload_missing", reason: "Il payload tecnico locale verificato e assente.", nextAction: "Rigenerare il payload senza azioni esterne." };
  }
  return null;
}

export class PersistentAprInfissiShadowTestPreparation {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "infissi-shadow-test");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprInfissiShadowTestPreparationState;
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  private write(state: AprInfissiShadowTestPreparationState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  prepare(mapping: AprInfissiLocalMappingState, now = new Date()) {
    const mappingSignature = sha256({ sourceSignature: mapping.sourceSignature, dryRun: mapping.dryRun, item: mapping.item });
    const current = this.load(now);
    if (current.mappingSignature === mappingSignature) return current;
    if (current.mappingSignature && current.mappingSignature !== mappingSignature) throw new Error("infissi_shadow_test_mapping_immutable");

    const blocker = technicalBlock(mapping);
    const payload = blocker ? null : mapping.item!.report.eneaDraftPayload!;
    const appliedRuleIds = [...new Set([
      ...SYSTEM_RULE_IDS,
      USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
      USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
      USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
      USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix,
      USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks,
      USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm,
      USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings,
    ])];
    const checklist = [
      { id: "sources_fingerprinted", status: mapping.item?.report.sourceFingerprints.length ? "PASS" as const : "FAIL" as const, evidence: `${mapping.item?.report.sourceFingerprints.length ?? 0} fingerprint` },
      { id: "mapping_ready", status: mapping.item?.caseTruth === "READY" ? "PASS" as const : "FAIL" as const, evidence: mapping.item?.caseTruth ?? "assenza mapping" },
      { id: "dry_run_checkpointed", status: mapping.dryRun?.status === "completed" ? "PASS" as const : "FAIL" as const, evidence: mapping.dryRun?.payloadSha256 ?? "assenza payload" },
      { id: "energy_savings_left_unset", status: mapping.dryRun?.energySavingsWriteAllowed === false ? "PASS" as const : "FAIL" as const, evidence: "portal_computed_leave_unset" },
      { id: "external_gate_closed", status: !mapping.externalActionAllowed && !mapping.previewAllowed && !mapping.submitAllowed && !mapping.communicationsAllowed ? "PASS" as const : "FAIL" as const, evidence: "external=false preview=false submit=false communications=false" },
    ];
    const reason = blocker
      ? `${mapping.item?.displayName ?? "Caso Infissi"}: preparazione shadow non pronta — ${blocker.reason}`
      : `${mapping.item!.displayName}: caso TEST Infissi preparato localmente; attende soltanto una futura autorizzazione esterna esplicita.`;
    const next: AprInfissiShadowTestPreparationState = {
      ...current,
      revision: current.revision + 1,
      status: blocker ? "technical_block" : "ready_for_external_authorization",
      mappingSignature,
      selectedCase: mapping.item ? { practiceId: mapping.item.practiceId, customerKey: mapping.item.customerKey, displayName: mapping.item.displayName, mode: "TEST" } : null,
      expectedValues: payload ? {
        physicalWindowCount: payload.physicalWindowCount,
        invoiceGrossTotal: payload.expenseGrossVatIncluded,
        oldWindowThermalTransmittanceWm2K: payload.windows[0].oldWindowThermalTransmittanceWm2K,
        frameMaterial: payload.windows[0].frameMaterial,
        glassType: payload.windows[0].glassType,
        shadingClosuresChecked: payload.windows[0].shadingClosuresChecked,
        energySavings: "portal_computed_leave_unset",
        payloadSha256: mapping.dryRun!.payloadSha256!,
      } : null,
      checklist,
      passCriteria: [
        "Ogni campo previsto coincide col payload locale e conserva la cardinalita fisica 1:1.",
        "Il risparmio energetico resta non valorizzato da APR ed e calcolato dal portale.",
        "Nessuna anteprima, submit, ricevuta o comunicazione viene eseguita.",
        "Ogni futura lettura server e collegata a evidenceId e ID regola.",
      ],
      failCriteria: [
        "Qualunque differenza di cardinalita, misure, superficie, Uw nuovo/vecchio, materiale, vetro, chiusure o totale.",
        "Qualunque tentativo APR di valorizzare il risparmio energetico.",
        "Perdita del checkpoint, duplicazione o fingerprint sorgenti diverso.",
        "Qualunque azione esterna non coperta da autorizzazione esplicita.",
      ],
      residualBlocker: blocker,
      audit: [...current.audit, {
        revision: current.revision + 1,
        at: now.toISOString(),
        type: blocker ? "shadow_test_technical_block" : "shadow_test_prepared",
        reason,
        appliedRuleIds,
      }],
    };
    return this.write(next);
  }
}
