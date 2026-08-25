import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractAprInfissiAutomaticTechnicalEvidence } from "../../src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence";
import { buildAprInfissiEneaDraftPayload, type AprInfissiEneaDraftPayload } from "../../src/features/enea-shadow-crm/infissiEneaDraftPayload";
import { resolveAprInfissiShadingClosureAllocation, type AprInfissiShadingClosureAllocation } from "../../src/features/enea-shadow-crm/infissiShadingClosureAllocation";
import { resolveInfissiProductRules, type InfissiProductRulesResolution } from "../../src/features/enea-shadow-crm/infissiProductRules";
import { resolveAprInfissiOldWindowSources, type AprInfissiOldWindowSourceResolution } from "../../src/features/enea-shadow-crm/infissiOldWindowSourceResolution";
import { verifyAprInfissiInvoiceCertificateCardinality, type AprInfissiInvoiceCertificateCardinality } from "../../src/features/enea-shadow-crm/infissiInvoiceCertificateCardinality";
import { resolveInfissiTechnicalSources, type InfissiTechnicalResolution } from "../../src/features/enea-shadow-crm/infissiTechnicalSources";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { buildAprInfissiDraftPackage } from "./infissiDraftPackage";
import { resolveAprDocumentedProductRouting } from "../../src/features/enea-shadow-crm/documentedProductRouting";

export const APR_INFISSI_BATCH_PREFLIGHT_VERSION = "apr-infissi-batch-preflight-v1" as const;
export type AprInfissiCheckpointMode = "resume" | "migrate";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const bool = (value: unknown) => typeof value === "boolean" ? value : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const SYSTEM_RULE_IDS = Object.freeze(["system-single-active-practice", "system-atomic-checkpoint-resume"] as const);

export interface AprInfissiBatchBlocker {
  code: string;
  field: string;
  sourceIds: string[];
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
  audit: Array<{
    revision: number;
    at: string;
    type: "initialized" | "batch_prepared" | "case_claimed" | "case_ready" | "case_blocked" | "batch_completed" | "validation_requeued" | "routing_reconciled";
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

  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "infissi-batch-preflight");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load(now = new Date()): AprInfissiBatchPreflightState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprInfissiBatchPreflightState;
      value.validationRevisionsApplied ??= [];
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
    const common = JSON.parse(readFileSync(commonPath, "utf8")) as { items?: Array<{ customerKey?: string; report?: { startDate?: string | null; completionDate?: string | null; resolvedTaxCode?: string | null; coBeneficiaryResolution?: { present?: boolean; identity?: { name?: string; surname?: string; taxCode?: string } | null } } }> };
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

  reconcileDocumentedProductRouting(checkpointMode: AprInfissiCheckpointMode = "resume", now = new Date()) {
    const current = this.initialize(now);
    if (checkpointMode !== "migrate" || !current.sourceFingerprint) return current;
    const acquisitionPath = path.join(this.rootDirectory, "crm-acquisition", "checkpoint.json");
    const analysisPath = path.join(this.rootDirectory, "crm-document-analysis", "checkpoint.json");
    if (![acquisitionPath, analysisPath].every(existsSync)) return current;
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    if (acquisition.status !== "completed" || analysis.status !== "completed") return current;

    const routingByKey = new Map<string, { declaredModule: "screening" | "infissi" | null; resolvedModule: "screening" | "infissi" | "mixed" | "unresolved" }>();
    const acquired = (acquisition.items ?? []).filter((item) => {
      if (item.state !== "acquired") return false;
      const sources = (analysis.items ?? []).filter((source) => source.customerKey === item.customerKey && source.state === "analyzed" && text(source.textPath))
        .map((source) => ({ sourceId: text(source.documentKey), text: readFileSync(text(source.textPath), "utf8") }));
      const declaredModule = item.productModule === "screening" || item.productModule === "infissi" ? item.productModule : null;
      const resolvedModule = resolveAprDocumentedProductRouting({ declaredModule, sources }).module;
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
    const analysisPath = path.join(this.rootDirectory, "crm-document-analysis", "checkpoint.json");
    const commonPreflightPath = path.join(this.rootDirectory, "crm-local-preflight", "checkpoint.json");
    if (![acquisitionPath, analysisPath, commonPreflightPath].every(existsSync)) return this.initialize(now);
    const acquisition = JSON.parse(readFileSync(acquisitionPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    const common = JSON.parse(readFileSync(commonPreflightPath, "utf8")) as { status?: string; items?: Array<Record<string, unknown>> };
    if (acquisition.status !== "completed" || analysis.status !== "completed" || common.status !== "completed") return this.initialize(now);

    // Le coorti Infissi storiche non avevano ancora il discriminante esplicito.
    // Nelle coorti miste, invece, il routing persistito e' vincolante: una
    // Schermatura non deve mai entrare nel parser/gate Infissi.
    const routingByKey = new Map<string, { declaredModule: "screening" | "infissi" | null; resolvedModule: "screening" | "infissi" | "mixed" | "unresolved" }>();
    const acquired = (acquisition.items ?? []).filter((item) => {
      if (item.state !== "acquired") return false;
      const sources = (analysis.items ?? []).filter((source) => source.customerKey === item.customerKey && source.state === "analyzed" && text(source.textPath))
        .map((source) => ({ sourceId: text(source.documentKey), text: readFileSync(text(source.textPath), "utf8") }));
      const declaredModule = item.productModule === "screening" || item.productModule === "infissi" ? item.productModule : null;
      const resolvedModule = resolveAprDocumentedProductRouting({ declaredModule, sources }).module;
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
    const form = formFromDossier(dossierValue);
    const analysisItems = (analysis.items ?? []).filter((item) => item.customerKey === queued.customerKey && item.state === "analyzed" && text(item.textPath));
    const sources = analysisItems.map((item) => ({ sourceId: text(item.documentKey), kind: text(item.kind), text: readFileSync(text(item.textPath), "utf8") }));
    const automatic = extractAprInfissiAutomaticTechnicalEvidence(sources);
    const technical = resolveInfissiTechnicalSources({
      practiceId: queued.practiceId,
      invoice: automatic.evidence?.kind === "invoice" ? automatic.evidence : undefined,
      technicalDocuments: automatic.evidence?.kind === "technical_document" ? automatic.evidence : undefined,
    });
    const invoiceCertificateCardinality = verifyAprInfissiInvoiceCertificateCardinality(sources, technical.rows.length);
    const formSourceId = `${queued.practiceId}:crm-form`;
    const oldWindowSourceResolution = resolveAprInfissiOldWindowSources({
      formMaterial: form.oldFrameMaterial,
      formGlazing: form.oldGlazingType,
      formSourceId,
      sources,
    });
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
    });
    const shadingClosureAllocation = technical.status === "ready" ? resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: technical.rows.length,
      invoiceSources: sources.filter((source) => source.kind === "invoice").map((source) => ({ sourceId: source.sourceId, text: source.text })),
      formAlsoInstalledClosures: form.alsoInstalledClosures,
    }) : null;
    const commonItem = (common.items ?? []).find((item) => item.customerKey === queued.customerKey);
    const commonReport = object(commonItem?.report);
    const financial = object(commonReport?.financial);
    // Il payload ENEA usa la spesa tecnica IVA inclusa gia' riconciliata.
    // Una fattura professionale separata resta nel lordo contabile, ma non
    // deve rientrare nell'importo tecnico della pratica Infissi.
    const invoiceGrossTotal = financial && Object.prototype.hasOwnProperty.call(financial, "eligibleExpense")
      ? number(financial.eligibleExpense)
      : number(financial?.invoiceTotal);
    const financialVerified = financial?.tripleReconciliationVerified === true && invoiceGrossTotal !== null;
    const commonFinancialBlockers = (Array.isArray(commonReport?.blockers) ? commonReport.blockers : [])
      .map(object)
      .filter((blocker): blocker is JsonObject => Boolean(blocker))
      .filter((blocker) => {
        const code = text(blocker.code);
        return code.startsWith("bank_transfer_")
          || code === "gross_triple_reconciliation_failed"
          || code === "bundled_professional_expense_unitemized"
          || code === "original_invoice_missing_or_unavailable";
      });
    const blockers: AprInfissiBatchBlocker[] = [
      ...automatic.blockers.map((code) => ({ code, field: "technical_dimensions", sourceIds: sources.map((source) => source.sourceId) })),
      ...technical.blockers.map((code) => ({ code, field: "technical_rows", sourceIds: automatic.evidence ? [...automatic.evidence.sourceIds] : [] })),
      ...productRules.blockers.map((code) => ({ code, field: "shading_closures", sourceIds: [formSourceId] })),
      ...(invoiceCertificateCardinality.blocker ? [{
        code: invoiceCertificateCardinality.blocker.code,
        field: invoiceCertificateCardinality.blocker.field,
        sourceIds: [...invoiceCertificateCardinality.blocker.sourceIds],
      }] : []),
      ...(!financialVerified ? [{ code: "infissi_financial_triple_reconciliation_required", field: "invoice_total", sourceIds: (Array.isArray(financial?.evidence) ? financial.evidence : []).map((evidence) => text(object(evidence)?.sourceId)).filter(Boolean) }] : []),
      ...commonFinancialBlockers.map((blocker) => ({
        code: text(blocker.code),
        field: text(blocker.field) || "economic_sources",
        sourceIds: (Array.isArray(blocker.sourceIds) ? blocker.sourceIds : []).map(text).filter(Boolean),
      })),
    ];
    const ready = blockers.length === 0 && automatic.status === "ready" && technical.status === "ready" && productRules.status === "ready" && invoiceGrossTotal !== null;
    const eneaDraftPayload = ready ? buildAprInfissiEneaDraftPayload({ practiceId: queued.practiceId, technical, productRules, shadingClosureAllocation: shadingClosureAllocation!, invoiceGrossTotal }) : null;
    const sourceFingerprints = sources.map((source) => ({ sourceId: source.sourceId, sha256: sha256(source.text) }));
    const appliedRuleIds = [...new Set([
      ...SYSTEM_RULE_IDS,
      ...automatic.audit.appliedRuleIds,
      ...technical.audit.appliedRuleIds,
      ...productRules.audit.appliedRuleIds,
      ...(shadingClosureAllocation?.audit.appliedRuleIds ?? []),
      ...oldWindowSourceResolution.audit.appliedRuleIds,
      ...invoiceCertificateCardinality.audit.appliedRuleIds,
      USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded,
      USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum,
      ...commonFinancialBlockers.flatMap((blocker) => (Array.isArray(blocker.appliedRuleIds) ? blocker.appliedRuleIds : []).map(text).filter(Boolean)),
    ])];
    const reason = ready
      ? `${queued.displayName}: nessun problema; ${technical.rows.length} infissi 1:1 e totale IVA incluso verificati localmente.`
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
