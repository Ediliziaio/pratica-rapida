import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractAprInfissiAutomaticTechnicalEvidence } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";
import { buildAprInfissiEneaDraftPayload, type AprInfissiEneaDraftPayload } from "../../src/features/enea-shadow-crm/infissiEneaDraftPayload";
import { resolveAprInfissiShadingClosureAllocation, type AprInfissiShadingClosureAllocation } from "../../src/features/enea-shadow-crm/infissiShadingClosureAllocation";
import { resolveInfissiProductRules, type InfissiProductRulesResolution } from "../../src/features/enea-shadow-crm/infissiProductRules";
import { resolveAprInfissiOldWindowSources, type AprInfissiOldWindowSourceResolution } from "../../src/features/enea-shadow-crm/infissiOldWindowSourceResolution";
import { verifyAprInfissiInvoiceCertificateCardinality, type AprInfissiInvoiceCertificateCardinality } from "../../src/features/enea-shadow-crm/infissiInvoiceCertificateCardinality";
import { resolveInfissiTechnicalSources, type InfissiTechnicalEvidence, type InfissiTechnicalResolution } from "../../src/features/enea-shadow-crm/infissiTechnicalSources";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { verifyAprAuthoritativeEconomicDecision } from "../../src/features/enea-shadow-crm/authoritativeEconomicDecision";
import { buildAprInfissiDraftPackage } from "./infissiDraftPackage";
import { resolveAprDocumentedProductRouting, resolveFormDeclaredProductModule } from "../../src/features/enea-shadow-crm/documentedProductRouting";
import { applyOperatorResponseDossierOverrides, PersistentAprOperatorResponseLedger } from "./operatorResponseLedger";
import { readInfissiCertificateMeasures, type InfissiCertificateReading } from "./infissiCertificateMeasures";

export const APR_INFISSI_BATCH_PREFLIGHT_VERSION = "apr-infissi-batch-preflight-v1" as const;
export type AprInfissiCheckpointMode = "resume" | "migrate";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const bool = (value: unknown) => typeof value === "boolean" ? value : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

type InfissiCertificateTextSource = {
  sourceId: string;
  storageKind: string;
  kind: string;
  text: string;
};

function certificateReadingSignature(reading: InfissiCertificateReading): string {
  return reading.pieces.flatMap((piece) => Array.from({ length: piece.quantity }, () => [
    piece.widthMm ?? "area",
    piece.heightMm ?? piece.surfaceM2 / piece.quantity,
  ].join("x"))).sort().join("|");
}

function certificatePieceLine(textValue: string, piece: InfissiCertificateReading["pieces"][number]): number {
  const lines = textValue.split(/\r?\n/);
  const positionPatterns = [
    new RegExp(`\\bPos\\.?\\s*${piece.position}\\b`, "i"),
    new RegExp(`\\b${piece.position}\\s+[\\d,.]+\\s+Pezzi\\b`, "i"),
    new RegExp(`-\\s*${piece.position}\\b`),
    new RegExp(`^\\s*${piece.position}\\s+\\d+\\s+(?:Porta)?Finestra\\b`, "i"),
  ];
  const found = lines.findIndex((line) => positionPatterns.some((pattern) => pattern.test(line)));
  return found >= 0 ? found + 1 : 1;
}

/**
 * Fallback fail-closed per certificati produttore gia associati alla pratica.
 * Accetta soltanto allegati nello slot additional che siano gia classificati
 * come certificati terzi, oppure che espongano una intestazione dichiarativa
 * formale. Piu letture discordanti non vengono arbitrate per ordine o nome.
 */
export function infissiCertificateMeasureFallback(
  sources: readonly InfissiCertificateTextSource[],
): { evidence: InfissiTechnicalEvidence; sourceId: string; reading: InfissiCertificateReading } | null {
  const readings = sources.flatMap((source) => {
    // Conta cosa il documento E', non lo slot del CRM in cui e' stato
    // caricato. Massimo Cappello (13/09/2026): la "Dichiarazione del
    // produttore" Rotondi/Internorm, dodici serramenti con quote, era nello
    // slot fattura del CRM (storageKind "invoice") e l'analisi la
    // classificava correttamente come "additional"; guardando solo lo slot
    // veniva saltata e la pratica si fermava su misure mancanti con le
    // misure nel fascicolo.
    if (source.storageKind !== "additional" && source.kind !== "additional") return [];
    const formallyDeclared = /\bDICHIARAZIONE\s+(?:DI\s+PRESTAZIONE|DEL\s+PRODUTTORE|DI\s+CERTIFICAZIONE\s+ENERGETICA\s+DI\s+PRODOTTO)\b/i.test(source.text);
    if (source.kind !== "third_party_certificate" && !formallyDeclared) return [];
    const reading = readInfissiCertificateMeasures(source.text);
    return reading ? [{ source, reading }] : [];
  });
  if (readings.length === 0) return null;
  const signatures = new Set(readings.map(({ reading }) => certificateReadingSignature(reading)));
  if (signatures.size !== 1) return null;
  const selected = [...readings].sort((left, right) => left.source.sourceId.localeCompare(right.source.sourceId))[0];
  const rows = selected.reading.pieces.flatMap((piece) => Array.from({ length: piece.quantity }, (_, pieceIndex) => {
    const line = certificatePieceLine(selected.source.text, piece);
    return {
      lineId: `${selected.source.sourceId}:line:${line}:position:${piece.position}:piece:${pieceIndex + 1}`,
      quantity: 1,
      ...(piece.widthMm !== null ? { widthM: piece.widthMm / 1_000 } : {}),
      ...(piece.heightMm !== null ? { heightM: piece.heightMm / 1_000 } : {}),
      surfaceM2: piece.surfaceM2 / piece.quantity,
      measurementKind: "documented_unspecified" as const,
    };
  }));
  return {
    sourceId: selected.source.sourceId,
    reading: selected.reading,
    evidence: { kind: "technical_document", sourceIds: [selected.source.sourceId], rows },
  };
}

const SYSTEM_RULE_IDS = Object.freeze(["system-single-active-practice", "system-atomic-checkpoint-resume"] as const);

function permanentlyExcludedCustomerKeys(common: { items?: Array<Record<string, unknown>> }) {
  return new Set((common.items ?? []).flatMap((item) => {
    const report = object(item.report);
    const blockers = Array.isArray(report?.blockers) ? report.blockers.map(object).filter((value): value is JsonObject => Boolean(value)) : [];
    return blockers.some((blocker) => {
      const code = text(blocker.code);
      return code === "permanent_supplier_automation_exclusion" || code === "permanent_customer_automation_exclusion";
    }) ? [text(item.customerKey)] : [];
  }).filter(Boolean));
}

export interface AprInfissiBatchBlocker {
  code: string;
  field: string;
  sourceIds: string[];
  classification?: "operator_required" | "technical_block";
  exactCause?: string;
  missingDocumentType?: string | null;
  operatorQuestion?: string;
  onboardingGap?: string | null;
}

export interface AprInfissiBatchItem {
  customerKey: string;
  displayName: string;
  practiceId: string;
  dossierPath: string;
  productModule?: "infissi" | "mixed";
  state: "queued" | "ready_local_plan" | "blocked_case";
  startedAt: string | null;
  endedAt: string | null;
  reason: string;
  report: null | {
    outcome: "ready_local_plan" | "blocked_case";
    blockers: AprInfissiBatchBlocker[];
    physicalProductCount: number;
    invoiceGrossTotal: number | null;
    automaticTechnicalEvidenceAudit: ReturnType<typeof extractAprInfissiAutomaticTechnicalEvidence>["audit"];
    technical: InfissiTechnicalResolution;
    productRules: InfissiProductRulesResolution;
    shadingClosureAllocation: AprInfissiShadingClosureAllocation | null;
    oldWindowSourceResolution: AprInfissiOldWindowSourceResolution;
    invoiceCertificateCardinality: AprInfissiInvoiceCertificateCardinality;
    eneaDraftPayload: AprInfissiEneaDraftPayload | null;
    sourceIds: string[];
    sourceFingerprints: Array<{ sourceId: string; sha256: string }>;
    appliedRuleIds: string[];
  };
}

export interface AprInfissiBatchPreflightState {
  version: typeof APR_INFISSI_BATCH_PREFLIGHT_VERSION;
  revision: number;
  status: "unprepared" | "working" | "completed";
  sourceFingerprint: string | null;
  currentCustomerKey: string | null;
  items: AprInfissiBatchItem[];
  progress: { total: number; processed: number; ready: number; blocked: number };
  externalActionAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  reason: string;
  nextAction: string;
  validationRevisionsApplied: string[];
  operatorPracticeBindingResolutions: Array<{
    practiceId: string;
    customerKey: string;
    sourceId: string;
    sourceSha256: string;
    evidenceId: string;
    operatorId: string;
    commandId: string;
    answeredAt: string;
    note: string;
  }>;
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "batch_prepared" | "case_claimed" | "case_ready" | "case_blocked" | "batch_completed" | "validation_requeued" | "routing_reconciled" | "operator_resolution_requeued";
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

function initialState(now: Date): AprInfissiBatchPreflightState {
  const reason = "Preflight batch Infissi non ancora preparato; azioni esterne chiuse.";
  return {
    version: APR_INFISSI_BATCH_PREFLIGHT_VERSION,
    revision: 0,
    status: "unprepared",
    sourceFingerprint: null,
    currentCustomerKey: null,
    items: [],
    progress: { total: 0, processed: 0, ready: 0, blocked: 0 },
    externalActionAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    reason,
    nextAction: "Attendere acquisizione e analisi locale delle fonti originarie CRM.",
    validationRevisionsApplied: [],
    operatorPracticeBindingResolutions: [],
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", customerKey: null, reason, appliedRuleIds: [...SYSTEM_RULE_IDS] }],
  };
}

function progress(items: readonly AprInfissiBatchItem[]) {
  return {
    total: items.length,
    processed: items.filter((item) => item.state !== "queued").length,
    ready: items.filter((item) => item.state === "ready_local_plan").length,
    blocked: items.filter((item) => item.state === "blocked_case").length,
  };
}

function validState(value: AprInfissiBatchPreflightState) {
  return value.version === APR_INFISSI_BATCH_PREFLIGHT_VERSION
    && value.externalActionAllowed === false
    && value.previewAllowed === false
    && value.submitAllowed === false
    && value.communicationsAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((id) => registryRule(id)));
}

function formDeclaredModuleFromDossierPath(dossierPath: string) {
  const row = object(object(JSON.parse(readFileSync(dossierPath, "utf8")))?.row);
  const prodotto = object(object(row?.dati_form)?.prodotto);
  return resolveFormDeclaredProductModule(prodotto);
}

function formFromDossier(value: unknown) {
  const row = object(object(value)?.row);
  const dataForm = object(row?.dati_form);
  const product = object(dataForm?.prodotto);
  return {
    explicitNewFrameMaterial: text(product?.materiale_nuovi) || undefined,
    explicitGlassType: text(product?.vetro_nuovi) || undefined,
    oldFrameMaterial: text(product?.materiale_vecchi) || undefined,
    oldGlazingType: text(product?.vetro_vecchi) || undefined,
    alsoInstalledClosures: bool(product?.zanzariere_tapparelle_persiane),
  };
}

export class PersistentAprInfissiBatchPreflight {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly operatorResponses: PersistentAprOperatorResponseLedger;

  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "infissi-batch-preflight");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.operatorResponses = new PersistentAprOperatorResponseLedger(rootDirectory);
  }

  load(now = new Date()): AprInfissiBatchPreflightState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprInfissiBatchPreflightState;
      value.validationRevisionsApplied ??= [];
      value.operatorPracticeBindingResolutions ??= [];
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  private write(state: AprInfissiBatchPreflightState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  buildDraftExecutionPackage(customerKey: string) {
    const state = this.initialize();
    const item = state.items.find((candidate) => candidate.customerKey === customerKey);
    if (!state.sourceFingerprint || !item || item.state !== "ready_local_plan" || !item.report?.eneaDraftPayload || item.report.blockers.length > 0) {
      throw new Error(`infissi_draft_package_not_ready:${customerKey}`);
    }
    const commonPath = path.join(this.rootDirectory, "crm-local-preflight", "checkpoint.json");
    if (!existsSync(commonPath)) throw new Error("infissi_common_preflight_missing");
    const common = JSON.parse(readFileSync(commonPath, "utf8")) as { items?: Array<{ customerKey?: string; report?: { startDate?: string | null; completionDate?: string | null; resolvedTaxCode?: string | null; primaryBeneficiaryResolution?: { status?: string; identity?: { name?: string; surname?: string; taxCode?: string; birthDate?: string | null; sex?: "M" | "F" } | null }; worksMunicipalityResolution?: { status?: string; value?: { comune?: string; provincia?: string } | null }; coBeneficiaryResolution?: { present?: boolean; identity?: { name?: string; surname?: string; taxCode?: string } | null } } }> };
    const commonItem = common.items?.find((candidate) => candidate.customerKey === customerKey);
    const startDate = text(commonItem?.report?.startDate);
    const completionDate = text(commonItem?.report?.completionDate);
    const resolvedTaxCode = text(commonItem?.report?.resolvedTaxCode);
    if (!startDate || !completionDate || !resolvedTaxCode) throw new Error(`infissi_shared_mapping_not_ready:${customerKey}`);
    return buildAprInfissiDraftPackage({
      customerKey: item.customerKey,
      displayName: item.displayName,
      practiceId: item.practiceId,
      dossierPath: item.dossierPath,
      startDate,
      completionDate,
      resolvedTaxCode,
      resolvedPrimaryBeneficiary: commonItem?.report?.primaryBeneficiaryResolution?.status === "verified_document"
        && commonItem.report.primaryBeneficiaryResolution.identity
        && text(commonItem.report.primaryBeneficiaryResolution.identity.name)
        && text(commonItem.report.primaryBeneficiaryResolution.identity.surname)
        ? { name: text(commonItem.report.primaryBeneficiaryResolution.identity.name), surname: text(commonItem.report.primaryBeneficiaryResolution.identity.surname), taxCode: resolvedTaxCode, birthDate: text(commonItem.report.primaryBeneficiaryResolution.identity.birthDate) || null, sex: commonItem.report.primaryBeneficiaryResolution.identity.sex }
        : null,
      resolvedWorksMunicipality: commonItem?.report?.worksMunicipalityResolution?.status === "verified_document"
        && commonItem.report.worksMunicipalityResolution.value
        && text(commonItem.report.worksMunicipalityResolution.value.comune)
        && text(commonItem.report.worksMunicipalityResolution.value.provincia)
        ? { comune: text(commonItem.report.worksMunicipalityResolution.value.comune), provincia: text(commonItem.report.worksMunicipalityResolution.value.provincia) }
        : null,
      resolvedCoBeneficiaryPresent: commonItem?.report?.coBeneficiaryResolution?.present,
      resolvedCoBeneficiary: commonItem?.report?.coBeneficiaryResolution?.identity && text(commonItem.report.coBeneficiaryResolution.identity.name) && text(commonItem.report.coBeneficiaryResolution.identity.surname) && text(commonItem.report.coBeneficiaryResolution.identity.taxCode)
        ? { name: text(commonItem.report.coBeneficiaryResolution.identity.name), surname: text(commonItem.report.coBeneficiaryResolution.identity.surname), taxCode: text(commonItem.report.coBeneficiaryResolution.identity.taxCode) }
        : null,
      infissiPayload: item.report.eneaDraftPayload,
      oldFrameMaterial: item.report.productRules.audit.oldWindowThermalTransmittance.material,
      oldGlazingType: item.report.productRules.audit.oldWindowThermalTransmittance.glazing,
      sourceFingerprint: state.sourceFingerprint,
    });
  }

  applyValidationRevision(validationRevision: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.validationRevisionsApplied.includes(validationRevision) || current.status !== "completed") return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(validationRevision)) throw new Error("infissi_batch_validation_revision_invalid");
    const previous = current.items.map((item) => `${item.customerKey}:${item.state}`).join("|");
    const items = current.items.map((item) => ({
      ...item,
      state: "queued" as const,
      startedAt: null,
      endedAt: null,
      reason: `Riaccodata per validazione locale ${validationRevision}; fonti e fingerprint immutati.`,
      report: null,
    }));
    const revision = current.revision + 1;
    const reason = `Validazione ${validationRevision} riarmata in modo idempotente sui medesimi dossier; esiti precedenti conservati nell'audit: ${previous}.`;
    const validationRuleIds = validationRevision === "infissi-transmittance-131-to-13-v1"
      ? [USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittance131To13]
      : [USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded, USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum];
    return this.write({
      ...current,
      revision,
      status: "working",
      currentCustomerKey: null,
      items,
      progress: progress(items),
      reason,
      nextAction: "Ricalcolare una pratica Infissi alla volta con parser revisionato.",
      validationRevisionsApplied: [...current.validationRevisionsApplied, validationRevision],
      audit: [...current.audit, {
        revision,
        at: now.toISOString(),
        type: "validation_requeued",
        customerKey: null,
        reason,
        appliedRuleIds: [...SYSTEM_RULE_IDS, ...validationRuleIds],
      }],
    });
  }

  applyOperatorPracticeBindingResolution(input: { practiceId: string; customerKey: string; operatorId: string; commandId: string; answeredAt: string; note: string }, now = new Date()) {
    if (!input.practiceId.trim() || !input.customerKey.trim() || !input.operatorId.trim() || !input.commandId.trim() || !Number.isFinite(Date.parse(input.answeredAt)) || !input.note.trim()) {
      throw new Error("infissi_practice_binding_operator_resolution_invalid");
    }
    const current = this.initialize(now);
    if (current.operatorPracticeBindingResolutions.some((entry) => entry.commandId === input.commandId)) return current;
    const existing = current.items.find((item) => item.practiceId === input.practiceId && item.customerKey === input.customerKey);
    const bindingBlocker = existing?.report?.blockers.find((blocker) => blocker.code === "infissi_technical_document_practice_binding_unverified");
    const selectedSourceId = existing?.report?.automaticTechnicalEvidenceAudit.selectedSourceId;
    const sourceFingerprint = existing?.report?.sourceFingerprints.find((entry) => entry.sourceId === selectedSourceId);
    if (!existing || existing.state !== "blocked_case" || !bindingBlocker || !selectedSourceId || !sourceFingerprint) {
      throw new Error("infissi_practice_binding_operator_resolution_scope_invalid");
    }
    const evidenceId = `operator-practice-binding:${sha256({ practiceId: input.practiceId, customerKey: input.customerKey, sourceId: selectedSourceId, sourceSha256: sourceFingerprint.sha256, operatorId: input.operatorId, commandId: input.commandId, answeredAt: input.answeredAt, note: input.note.trim() })}`;
    const resolution = { ...input, practiceId: input.practiceId.trim(), customerKey: input.customerKey.trim(), sourceId: selectedSourceId, sourceSha256: sourceFingerprint.sha256, evidenceId, operatorId: input.operatorId.trim(), commandId: input.commandId.trim(), note: input.note.replace(/\s+/g, " ").trim().slice(0, 500) };
    const target = { ...existing, state: "queued" as const, startedAt: null, endedAt: null, reason: "Conferma operatore caso-specifica persistita; pratica riaccodata sullo stesso fingerprint documentale.", report: null };
    const items = current.items.map((item) => item.customerKey === target.customerKey ? target : item);
    const revision = current.revision + 1;
    return this.write({ ...current, revision, status: "working", currentCustomerKey: null, items, progress: progress(items), operatorPracticeBindingResolutions: [...current.operatorPracticeBindingResolutions, resolution], reason: target.reason, nextAction: "Rieseguire il preflight sulla stessa fonte; la conferma non si propaga ad altre pratiche o documenti.", audit: [...current.audit, { revision, at: now.toISOString(), type: "operator_resolution_requeued", customerKey: target.customerKey, reason: `${target.reason} evidenceId=${evidenceId}`, appliedRuleIds: [...SYSTEM_RULE_IDS, USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume, USER_AUTHORIZED_RULE_IDS.technicalDocumentPracticeBinding] }] });
  }

  reconcileDocumentedProductRouting(checkpointMode: AprInfissiCheckpointMode = "resume", now = new Date()) {
    const current = this.initialize(now);
    if (checkpointMode !== "migrate" || !current.sourceFingerprint) return current;
    const acquisitionPath = path.join(this.rootDirectory, "crm-acquisition", "checkpoint.json");
    const analysisPath = path.join(this.rootDirectory, "crm-document-analysis", "checkpoint.json");
    const commonPreflightPath = path.join(this.rootDirectory, "crm-local-preflight", "checkpoint.json");
    if (![acquisitionPath, analysisPath, commonPreflightPath].every(existsSync)) return current;
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const common = JSON.parse(readFileSync(commonPreflightPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    if (acquisition.status !== "completed" || analysis.status !== "completed" || common.status !== "completed") return current;
    const excludedCustomerKeys = permanentlyExcludedCustomerKeys(common);

    const routingByKey = new Map<string, { declaredModule: "screening" | "infissi" | null; resolvedModule: "screening" | "infissi" | "mixed" | "unresolved" }>();
    const acquired = (acquisition.items ?? []).filter((item) => {
      if (item.state !== "acquired") return false;
      if (excludedCustomerKeys.has(text(item.customerKey))) return false;
      const sources = (analysis.items ?? []).filter((source) => source.customerKey === item.customerKey && source.state === "analyzed" && text(source.textPath))
        .map((source) => ({ sourceId: text(source.documentKey), text: readFileSync(text(source.textPath), "utf8") }));
      const declaredModule = item.productModule === "screening" || item.productModule === "infissi" ? item.productModule : null;
      const formDeclaredModule = formDeclaredModuleFromDossierPath(text(item.dossierPath));
      const resolvedModule = resolveAprDocumentedProductRouting({ declaredModule, formDeclaredModule, sources }).module;
      routingByKey.set(text(item.customerKey), { declaredModule, resolvedModule });
      return resolvedModule !== "screening";
    });
    const fingerprint = sha256(acquired.map((item) => [item.customerKey, item.practiceId, item.responseSha256]));
    const previousByKey = new Map(current.items.map((item) => [item.customerKey, item]));
    if (current.sourceFingerprint !== fingerprint) {
      const previousKeys = new Set(current.items.map((item) => item.customerKey));
      const previousSourceProjection = (acquisition.items ?? []).filter((item) => previousKeys.has(text(item.customerKey)) && item.state === "acquired");
      const previousFingerprint = sha256(previousSourceProjection.map((item) => [item.customerKey, item.practiceId, item.responseSha256]));
      if (previousFingerprint !== current.sourceFingerprint) throw new Error("infissi_batch_source_set_immutable");
    }

    const items: AprInfissiBatchItem[] = acquired.map((item) => {
      const customerKey = text(item.customerKey);
      const productModule = routingByKey.get(customerKey)?.resolvedModule === "mixed" ? "mixed" as const : "infissi" as const;
      const previous = previousByKey.get(customerKey);
      return previous ? { ...previous, productModule } : {
        customerKey,
        displayName: text(item.displayName),
        practiceId: text(item.practiceId),
        dossierPath: text(item.dossierPath),
        productModule,
        state: "queued",
        startedAt: null,
        endedAt: null,
        reason: "In coda per preflight Infissi dopo riconciliazione esplicita del routing documentale.",
        report: null,
      };
    });
    const changedKeys = [
      ...items.filter((item) => !previousByKey.has(item.customerKey)).map((item) => item.customerKey),
      ...current.items.filter((item) => !items.some((candidate) => candidate.customerKey === item.customerKey)).map((item) => item.customerKey),
    ];
    if (changedKeys.length > 0 && !changedKeys.every((customerKey) => {
      const routing = routingByKey.get(customerKey);
      return routing?.declaredModule != null && routing.declaredModule !== routing.resolvedModule;
    })) throw new Error("infissi_batch_source_set_immutable");
    const routingChanged = current.sourceFingerprint !== fingerprint
      || items.length !== current.items.length
      || items.some((item, index) => item.customerKey !== current.items[index]?.customerKey || item.productModule !== current.items[index]?.productModule);
    if (!routingChanged) return current;

    const revision = current.revision + 1;
    const added = items.filter((item) => !previousByKey.has(item.customerKey)).length;
    const removed = current.items.filter((item) => !items.some((candidate) => candidate.customerKey === item.customerKey)).length;
    const reason = `Migrazione routing documentale esplicita: ${added} aggiunte, ${removed} rimosse; fonti ed esiti esistenti conservati.`;
    return this.write({
      ...current,
      revision,
      status: items.some((item) => item.state === "queued") ? "working" : "completed",
      sourceFingerprint: fingerprint,
      currentCustomerKey: null,
      items,
      progress: progress(items),
      reason,
      nextAction: items.some((item) => item.state === "queued") ? "Elaborare i soli dossier ammessi dalla migrazione esplicita." : "Routing documentale migrato; nessun caso da rielaborare.",
      audit: [...current.audit, {
        revision,
        at: now.toISOString(),
        type: "routing_reconciled",
        customerKey: null,
        reason,
        appliedRuleIds: [...SYSTEM_RULE_IDS, USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel],
      }],
    });
  }

  tick(now = new Date()) {
    const acquisitionPath = path.join(this.rootDirectory, "crm-acquisition", "checkpoint.json");
    const originalDocumentsPath = path.join(this.rootDirectory, "crm-original-documents", "checkpoint.json");
    const analysisPath = path.join(this.rootDirectory, "crm-document-analysis", "checkpoint.json");
    const commonPreflightPath = path.join(this.rootDirectory, "crm-local-preflight", "checkpoint.json");
    if (![acquisitionPath, originalDocumentsPath, analysisPath, commonPreflightPath].every(existsSync)) return this.initialize(now);
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const originalDocuments = JSON.parse(readFileSync(originalDocumentsPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const common = JSON.parse(readFileSync(commonPreflightPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    if (acquisition.status !== "completed" || originalDocuments.status !== "completed" || analysis.status !== "completed" || common.status !== "completed") return this.initialize(now);
    const excludedCustomerKeys = permanentlyExcludedCustomerKeys(common);

    // Le coorti Infissi storiche non avevano ancora il discriminante esplicito.
    // Nelle coorti miste, invece, il routing persistito e' vincolante: una
    // Schermatura non deve mai entrare nel parser/gate Infissi.
    const routingByKey = new Map<string, { declaredModule: "screening" | "infissi" | null; resolvedModule: "screening" | "infissi" | "mixed" | "unresolved" }>();
    const acquired = (acquisition.items ?? []).filter((item) => {
      if (item.state !== "acquired") return false;
      if (excludedCustomerKeys.has(text(item.customerKey))) return false;
      const sources = (analysis.items ?? []).filter((source) => source.customerKey === item.customerKey && source.state === "analyzed" && text(source.textPath))
        .map((source) => ({ sourceId: text(source.documentKey), text: readFileSync(text(source.textPath), "utf8") }));
      const declaredModule = item.productModule === "screening" || item.productModule === "infissi" ? item.productModule : null;
      const formDeclaredModule = formDeclaredModuleFromDossierPath(text(item.dossierPath));
      const resolvedModule = resolveAprDocumentedProductRouting({ declaredModule, formDeclaredModule, sources }).module;
      routingByKey.set(text(item.customerKey), { declaredModule, resolvedModule });
      return resolvedModule !== "screening";
    });
    const fingerprint = sha256(acquired.map((item) => [item.customerKey, item.practiceId, item.responseSha256]));
    let state = this.initialize(now);
    if (!state.sourceFingerprint) {
      const items: AprInfissiBatchItem[] = acquired.map((item) => ({
        customerKey: text(item.customerKey),
        displayName: text(item.displayName),
        practiceId: text(item.practiceId),
        dossierPath: text(item.dossierPath),
        productModule: routingByKey.get(text(item.customerKey))?.resolvedModule === "mixed" ? "mixed" : "infissi",
        state: "queued",
        startedAt: null,
        endedAt: null,
        reason: "In coda per preflight Infissi da fonti originarie.",
        report: null,
      }));
      const reason = `${items.length} pratiche Infissi acquisite; elaborazione sequenziale persistente avviata.`;
      state = this.write({
        ...state,
        revision: state.revision + 1,
        status: "working",
        sourceFingerprint: fingerprint,
        items,
        progress: progress(items),
        reason,
        nextAction: items[0] ? `Reclamare ${items[0].displayName} e verificare form, fatture e documenti tecnici.` : "Coda vuota.",
        audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "batch_prepared", customerKey: null, reason, appliedRuleIds: [...SYSTEM_RULE_IDS] }],
      });
    }
    const nextIndex = state.items.findIndex((item) => item.state === "queued");
    if (nextIndex < 0) {
      if (state.status === "completed") return state;
      const reason = `${state.progress.ready} piani locali Infissi pronti; ${state.progress.blocked} casi isolati con blocker.`;
      return this.write({ ...state, revision: state.revision + 1, status: "completed", currentCustomerKey: null, reason, nextAction: state.progress.ready ? "Attendere gate portale Infissi autenticato e mappato; nessuna anteprima o invio." : "Risolvere i blocker documentati senza inventare valori.", audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "batch_completed", customerKey: null, reason, appliedRuleIds: [...SYSTEM_RULE_IDS] }] });
    }

    const queued = state.items[nextIndex];
    const claimedAt = queued.startedAt ?? now.toISOString();
    const claimReason = `${queued.displayName}: lock preflight Infissi acquisito; nessuna azione esterna.`;
    const claimedItems = state.items.map((item, index) => index === nextIndex ? { ...item, startedAt: claimedAt, reason: claimReason } : item);
    state = this.write({ ...state, revision: state.revision + 1, currentCustomerKey: queued.customerKey, items: claimedItems, reason: claimReason, nextAction: "Estrarre cardinalita, misure, Uw, dati form e totale IVA incluso.", audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "case_claimed", customerKey: queued.customerKey, reason: claimReason, appliedRuleIds: [...SYSTEM_RULE_IDS] }] });

    const dossierValue = JSON.parse(readFileSync(queued.dossierPath, "utf8"));
    const operatorProjection = this.operatorResponses.projection(queued.customerKey, queued.practiceId, now);
    const operatorPrepared = applyOperatorResponseDossierOverrides(dossierValue, operatorProjection);
    const form = formFromDossier(operatorPrepared.dossier);
    const analysisItems = (analysis.items ?? []).filter((item) => item.customerKey === queued.customerKey && item.state === "analyzed" && text(item.textPath));
    const sources = analysisItems.map((item) => {
      const classification = object(item.documentClassification);
      const scope = text(classification?.certificateScope);
      const certificateScope: "installed_windows" | "removed_windows" | null = scope === "installed_windows" || scope === "removed_windows" ? scope : null;
      return {
        sourceId: text(item.documentKey),
        storageKind: text(item.kind),
        kind: text(item.semanticKind ?? item.kind),
        certificateScope,
        practiceCustomerName: queued.displayName,
        text: readFileSync(text(item.textPath), "utf8"),
      };
    });
    const bindingResolution = state.operatorPracticeBindingResolutions.find((entry) => entry.practiceId === queued.practiceId && entry.customerKey === queued.customerKey);
    const bindingResolutionMatches = bindingResolution && sources.some((source) => source.sourceId === bindingResolution.sourceId && sha256(source.text) === bindingResolution.sourceSha256)
      ? bindingResolution
      : undefined;
    const initialAutomatic = extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true, ...(bindingResolutionMatches ? { confirmedPracticeBinding: { sourceId: bindingResolutionMatches.sourceId, evidenceId: bindingResolutionMatches.evidenceId } } : {}) });
    const operatorSurfaceEvidence: InfissiTechnicalEvidence | null = operatorPrepared.infissiSurfaceRows.length > 0 ? {
      kind: "technical_document",
      sourceIds: [...new Set(operatorPrepared.infissiSurfaceRows.map((row) => `operator-response:${row.sourceResponseId}`))],
      rows: operatorPrepared.infissiSurfaceRows.map((row) => ({
        lineId: `operator-response:${row.sourceResponseId}:piece:${row.pieceNumber}`,
        quantity: 1,
        surfaceM2: row.surfaceM2,
        measurementKind: "documented_unspecified" as const,
      })),
    } : null;
    const certificateFallback = !operatorSurfaceEvidence && initialAutomatic.blockers.length === 1
      && initialAutomatic.blockers[0] === "infissi_dimensions_and_cardinality_missing"
      ? infissiCertificateMeasureFallback(sources)
      : null;
    const automatic = certificateFallback ? {
      ...initialAutomatic,
      status: "ready" as const,
      evidence: certificateFallback.evidence,
      blockers: [] as readonly string[],
      audit: {
        ...initialAutomatic.audit,
        selectedSourceId: certificateFallback.sourceId,
        selectedParser: `certificate-measures:${certificateFallback.reading.format}`,
        candidateCounts: [{
          sourceId: certificateFallback.sourceId,
          parser: `certificate-measures:${certificateFallback.reading.format}`,
          rowCount: certificateFallback.evidence.rows.length,
        }],
        selectedSourceBinding: {
          status: "verified" as const,
          customerMatched: true,
          orderOrJobReferencesPresent: true,
          productSignatureMatched: true,
          matchedInvoiceSourceIds: [] as string[],
          technicalReferences: [] as string[],
          invoiceReferences: [] as string[],
        },
      },
    } : initialAutomatic;
    const technical = resolveInfissiTechnicalSources({
      practiceId: queued.practiceId,
      invoice: operatorSurfaceEvidence ? undefined : automatic.evidence?.kind === "invoice" ? automatic.evidence : undefined,
      technicalDocuments: operatorSurfaceEvidence ?? (automatic.evidence?.kind === "technical_document" ? automatic.evidence : undefined),
    });
    const observedInvoiceCertificateCardinality = verifyAprInfissiInvoiceCertificateCardinality(sources, technical.rows.length);
    const invoiceCertificateCardinality: AprInfissiInvoiceCertificateCardinality = operatorSurfaceEvidence ? {
      ...observedInvoiceCertificateCardinality,
      status: "not_applicable",
      certificateCount: technical.rows.length,
      certificateSourceIds: operatorSurfaceEvidence.sourceIds,
      blocker: null,
      audit: { appliedRuleIds: [...observedInvoiceCertificateCardinality.audit.appliedRuleIds, USER_AUTHORIZED_RULE_IDS.operatorResponseRuntimeConsumption] },
    } : observedInvoiceCertificateCardinality;
    const formSourceId = `${queued.practiceId}:crm-form`;
    const oldWindowSourceResolution = resolveAprInfissiOldWindowSources({
      formMaterial: form.oldFrameMaterial,
      formGlazing: form.oldGlazingType,
      formSourceId,
      sources,
    });
    const selectedTechnicalEvidenceSourceIds = new Set(automatic.evidence?.sourceIds ?? []);
    const commonItem = (common.items ?? []).find((item) => item.customerKey === queued.customerKey);
    const commonReport = object(commonItem?.report);
    const financial = object(commonReport?.financial);
    // Infissi non ricalcola e non reinterpreta il totale: consuma soltanto la
    // decisione economica canonica, firmata dal preflight comune.
    const authoritativeEconomicDecision = financial?.authoritativeDecision;
    const financialVerified = verifyAprAuthoritativeEconomicDecision(authoritativeEconomicDecision)
      && authoritativeEconomicDecision.status === "resolved";
    const invoiceGrossTotal = financialVerified ? authoritativeEconomicDecision.eligibleExpense : null;
    const rawCommonBlockers = (Array.isArray(commonReport?.blockers) ? commonReport.blockers : [])
      .map(object)
      .filter((blocker): blocker is JsonObject => Boolean(blocker));
    const commonFinancialBlockers = rawCommonBlockers.filter((blocker) => {
      const code = text(blocker.code);
      return code === "invoice_final_printed_total_not_verified"
        || code === "original_invoice_missing_or_unavailable";
    });
    // La completezza del fascicolo fatture e una proprieta di acquisizione,
    // non di riconciliazione economica. `semanticKind` puo legittimamente
    // diventare advance/balance e la confidenza del totale puo essere incerta:
    // nessuna delle due cose rende assente il PDF originario ne impedisce di
    // osservare se contiene una chiusura oscurante. Lo slot CRM `invoice`
    // conserva quindi l'inventario autorevole dei documenti da leggere.
    const invoiceSources = sources
      .filter((source) => source.storageKind === "invoice")
      .map((source) => ({ sourceId: source.sourceId, text: source.text }));
    const originalInvoiceItems = (originalDocuments.items ?? [])
      .filter((item) => text(item.customerKey) === queued.customerKey && text(item.kind) === "invoice");
    const analyzedDocumentKeys = new Set(analysisItems.map((item) => text(item.documentKey)));
    // Il silenzio dell'intero fascicolo vale come NO soltanto se tutti gli slot
    // fattura inventariati sono stati realmente scaricati e analizzati. Il
    // totale, imponibile, IVA e confidence OCR non partecipano a questo gate.
    const invoiceEvidenceComplete = originalInvoiceItems.length > 0
      && originalInvoiceItems.every((item) => item.state === "downloaded" && analyzedDocumentKeys.has(text(item.documentKey)))
      && invoiceSources.length === originalInvoiceItems.length
      && !rawCommonBlockers.some((blocker) => text(blocker.code) === "original_invoice_missing_or_unavailable");
    const shadingClosureAllocation = technical.status === "ready" ? resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: technical.rows.length,
      invoiceSources,
      technicalEvidenceSources: sources
        .filter((source) => selectedTechnicalEvidenceSourceIds.has(source.sourceId))
        .map((source) => ({ sourceId: source.sourceId, text: source.text })),
      technicalRowSourceKind: technical.audit.selectedDimensionSource,
      formAlsoInstalledClosures: form.alsoInstalledClosures,
      invoiceEvidenceComplete,
    }) : null;
    const documentedClosureAllocationResolved = shadingClosureAllocation !== null
      && shadingClosureAllocation.blocker === null
      && shadingClosureAllocation.flags.length === technical.rows.length;
    const documentedClosureAllocationUniformValue = documentedClosureAllocationResolved
      && shadingClosureAllocation!.flags.every((flag) => flag === shadingClosureAllocation!.flags[0])
      ? shadingClosureAllocation!.flags[0]
      : undefined;
    const documentedNoAdditionalClosures = shadingClosureAllocation?.mode === "technical_explicit_none"
      || shadingClosureAllocation?.mode === "invoice_none";
    const productRules = resolveInfissiProductRules({
      practiceId: queued.practiceId,
      explicitNewFrameMaterial: form.explicitNewFrameMaterial,
      explicitGlassType: form.explicitGlassType,
      formOldFrameMaterial: oldWindowSourceResolution.material,
      formOldGlazingType: oldWindowSourceResolution.glazing,
      oldWindowDataHasDoubt: oldWindowSourceResolution.hasDoubt,
      oldWindowSourceIds: oldWindowSourceResolution.sourceIds,
      oldWindowSourceKind: oldWindowSourceResolution.sourceKind,
      formAlsoInstalledClosures: form.alsoInstalledClosures,
      formSourceId,
      documentedNoAdditionalClosures,
      documentedClosureAllocationResolved,
      documentedClosureAllocationUniformValue,
      documentedClosureAllocationSourceIds: shadingClosureAllocation?.sourceIds,
      documentedNoAdditionalClosureSourceIds: documentedNoAdditionalClosures
        ? shadingClosureAllocation.mode === "technical_explicit_none"
          ? shadingClosureAllocation.audit.explicitNoScreenSourceIds
          : shadingClosureAllocation.sourceIds
        : [],
    });
    const blockers: AprInfissiBatchBlocker[] = [
      ...(!operatorSurfaceEvidence ? automatic.blockers : []).map((code) => code === "infissi_technical_document_practice_binding_unverified" ? {
        code,
        field: "technical_dimensions",
        sourceIds: sources.map((source) => source.sourceId),
        classification: "operator_required" as const,
        exactCause: "Il documento tecnico non possiede un collegamento univoco e concordante di cliente/cantiere, ordine/commessa e firma prodotti con le fatture della pratica.",
        missingDocumentType: null,
        operatorQuestion: `Confermi che il documento tecnico con riferimento ${automatic.audit.selectedSourceBinding?.technicalReferences.join(", ") || "non leggibile"} appartiene agli ordini fatturati ${automatic.audit.selectedSourceBinding?.invoiceReferences.join(", ") || "non leggibili"} della pratica di ${queued.displayName} e descrive esattamente gli stessi infissi?`,
        onboardingGap: "Richiedere nel caricamento iniziale un riferimento esplicito che colleghi commessa tecnica, ordine fatturato e cliente/cantiere.",
      } : { code, field: "technical_dimensions", sourceIds: sources.map((source) => source.sourceId) }),
      ...technical.blockers.map((code) => ({ code, field: "technical_rows", sourceIds: automatic.evidence ? [...automatic.evidence.sourceIds] : [] })),
      ...productRules.blockers.map((code) => ({ code, field: "shading_closures", sourceIds: [formSourceId] })),
      ...(shadingClosureAllocation?.blocker ? [{ code: shadingClosureAllocation.blocker, field: "shading_closures", sourceIds: [...shadingClosureAllocation.sourceIds] }] : []),
      ...(invoiceCertificateCardinality.blocker ? [{
        code: invoiceCertificateCardinality.blocker.code,
        field: invoiceCertificateCardinality.blocker.field,
        sourceIds: [...invoiceCertificateCardinality.blocker.sourceIds],
      }] : []),
      ...(!financialVerified ? [{ code: "infissi_authoritative_economic_decision_required", field: "invoice_total", sourceIds: (Array.isArray(financial?.evidence) ? financial.evidence : []).map((evidence) => text(object(evidence)?.sourceId)).filter(Boolean) }] : []),
      ...commonFinancialBlockers.map((blocker) => ({
        code: text(blocker.code),
        field: text(blocker.field) || "economic_sources",
        sourceIds: (Array.isArray(blocker.sourceIds) ? blocker.sourceIds : []).map(text).filter(Boolean),
      })),
    ];
    const ready = blockers.length === 0 && (operatorSurfaceEvidence !== null || automatic.status === "ready") && technical.status === "ready" && productRules.status === "ready" && invoiceGrossTotal !== null;
    const eneaDraftPayload = ready ? buildAprInfissiEneaDraftPayload({ practiceId: queued.practiceId, technical, productRules, shadingClosureAllocation: shadingClosureAllocation!, invoiceGrossTotal }) : null;
    const sourceFingerprints = sources.map((source) => ({ sourceId: source.sourceId, sha256: sha256(source.text) }));
    const appliedRuleIds = [...new Set([
      ...SYSTEM_RULE_IDS,
      ...automatic.audit.appliedRuleIds,
      ...(operatorSurfaceEvidence ? [USER_AUTHORIZED_RULE_IDS.operatorResponseRuntimeConsumption, USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume] : []),
      ...(bindingResolutionMatches ? [USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume] : []),
      ...technical.audit.appliedRuleIds,
      ...productRules.audit.appliedRuleIds,
      ...(shadingClosureAllocation?.audit.appliedRuleIds ?? []),
      ...oldWindowSourceResolution.audit.appliedRuleIds,
      ...invoiceCertificateCardinality.audit.appliedRuleIds,
      USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority,
      USER_AUTHORIZED_RULE_IDS.authoritativeEconomicDecisionSingleSource,
      USER_AUTHORIZED_RULE_IDS.advanceBalanceFiscalInvoiceEquivalence,
      USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum,
      ...commonFinancialBlockers.flatMap((blocker) => (Array.isArray(blocker.appliedRuleIds) ? blocker.appliedRuleIds : []).map(text).filter(Boolean)),
    ])];
    const reason = ready
      ? `${queued.displayName}: nessun problema; ${technical.rows.length} infissi 1:1 e totale finale fatture verificato localmente.`
      : `${queued.displayName}: ${blockers.length} blocker Infissi coerenti registrati; la coda prosegue.`;
    const completedItem: AprInfissiBatchItem = {
      ...queued,
      state: ready ? "ready_local_plan" : "blocked_case",
      startedAt: claimedAt,
      endedAt: now.toISOString(),
      reason,
      report: {
        outcome: ready ? "ready_local_plan" : "blocked_case",
        blockers,
        physicalProductCount: technical.rows.length,
        invoiceGrossTotal,
        automaticTechnicalEvidenceAudit: automatic.audit,
        technical,
        productRules,
        shadingClosureAllocation,
        oldWindowSourceResolution,
        invoiceCertificateCardinality,
        eneaDraftPayload,
        sourceIds: [formSourceId, ...sources.map((source) => source.sourceId)],
        sourceFingerprints,
        appliedRuleIds,
      },
    };
    const operatorApplications = operatorProjection.entries.flatMap((entry) => {
      let outcome: "applied" | "verified_general_rule" | null = null;
      let evidence = "";
      if (operatorPrepared.appliedResponseIds.includes(entry.responseId)) {
        outcome = "applied";
        evidence = `dossier_override:${entry.payload.kind}`;
      } else if (entry.payload.kind === "physical_product_count" && technical.rows.length === entry.payload.count) {
        outcome = "applied";
        evidence = `physicalProductCount=${technical.rows.length}`;
      } else if (entry.payload.kind === "general_rule_confirmation" && entry.payload.ruleIds.every((ruleId) => appliedRuleIds.includes(ruleId))) {
        outcome = "verified_general_rule";
        evidence = `runtimeRuleIds=${entry.payload.ruleIds.join(",")}`;
      }
      return outcome ? [{
        responseId: entry.responseId,
        customerKey: queued.customerKey,
        practiceId: queued.practiceId,
        runRoot: this.rootDirectory,
        sourceFingerprint: state.sourceFingerprint!,
        outcome,
        evidence,
        appliedAt: now.toISOString(),
      }] : [];
    });
    if (operatorApplications.length) this.operatorResponses.recordApplications(operatorApplications, now);
    const completedItems = state.items.map((item, index) => index === nextIndex ? completedItem : item);
    const nextProgress = progress(completedItems);
    const eventType = ready ? "case_ready" : "case_blocked";
    return this.write({
      ...state,
      revision: state.revision + 1,
      currentCustomerKey: null,
      items: completedItems,
      progress: nextProgress,
      reason,
      nextAction: completedItems.find((item) => item.state === "queued") ? "Passare automaticamente alla pratica Infissi successiva." : "Chiudere il batch e verificare il gate portale.",
      audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: eventType, customerKey: queued.customerKey, reason, appliedRuleIds }],
    });
  }

  snapshot(now = new Date()) {
    const state = this.load(now);
    return { ...state, observedAt: now.toISOString(), lastEvent: state.audit.at(-1)! };
  }
}
