import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { expandClassifiedProductRows, technicalCardinalityMatches } from "../../src/features/enea-shadow-crm/productCardinalityPolicy";
import { applyRinaldiScopedFinancialRules, type RinaldiLineClassification } from "../../src/features/enea-shadow-crm/rinaldiFinancialPolicies";
import { ENEA_OPERATIONAL_REGISTRY_VERSION, USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const LOCAL_DOSSIER_VERSION = "crm-enea-local-dossier-v1" as const;
export const LOCAL_DOSSIER_PIPELINE_VERSION = "crm-enea-local-pipeline-v1" as const;

export interface LocalDossierProductLine {
  lineId: string;
  lineNumber: number;
  text: string;
  classification: "pergola" | "vepa" | "zanzariera" | "tenda" | "other" | "ambiguous";
  quantity: number;
  widthCm: number;
  heightCm: number;
  grossAmount: number;
  documentedGTot?: number | null;
  exposure?: string | null;
  material?: string | null;
  movement?: string | null;
}

export interface LocalDossierInvoice {
  sourceId: string;
  supplierId: string;
  supplierName: string;
  documentNumber: string;
  date: string;
  grossTotal: number;
  explicitDeductibleLines?: Array<{ lineId: string; lineNumber: number; text: string; amount: number | null; extractionConfidence: "certain" | "uncertain" }>;
  lines: LocalDossierProductLine[];
}

export interface LocalCrmDossier {
  version: typeof LOCAL_DOSSIER_VERSION;
  dossierId: string;
  displayName: string;
  mode: "test";
  scheme: "ecobonus";
  processingDate: string;
  form: {
    sourceId: string;
    taxCode: string;
    completionDate: string | null;
    declaredExpense: number | null;
    property: {
      address: string;
      cadastralSheet: string;
      cadastralParcel: string;
      buildingType: "single_house" | "condominium" | "other";
      units: number;
      floors: number;
    };
  };
  invoices: LocalDossierInvoice[];
}

export interface LocalNormalizedProduct {
  rowId: string;
  sourceId: string;
  sourceLineId: string;
  sourceLineNumber: number;
  pieceNumber: number;
  description: string;
  productType: "pergola" | "zanzariera" | "tenda";
  disposition: "enea_included" | "enea_excluded";
  exclusionReason: string | null;
  widthCm: number;
  heightCm: number;
  surfaceM2: number;
  exposure: string | null;
  material: string;
  movement: string;
  gTot: number;
  gTotSource: "invoice_explicit" | "authorized_fallback";
  allocatedGrossAmount: number;
  appliedRuleIds: string[];
}

export interface LocalDossierNormalization {
  completionDate: string;
  completionDateSourceId: string;
  daysFromCompletionToProcessing: number;
  buildingQualification: "single_unit" | "condominium" | "other";
  products: LocalNormalizedProduct[];
  excludedProducts: Array<{ rowId: string; sourceId: string; lineId: string; lineNumber: number; pieceNumber: number; text: string; grossAmount: number; reason: string; appliedRuleIds: string[] }>;
  deductibleExpense: number;
  invoiceGrossTotal: number;
  appliedRuleIds: string[];
  sourceNotes: string[];
}

export interface LocalDossierReview {
  outcome: "ready_local_plan" | "blocked";
  warnings: Array<{ code: string; message: string; blocking: boolean; sourceIds: string[]; appliedRuleIds: string[] }>;
  differences: Array<{ field: string; formValue: unknown; normalizedValue: unknown; chosenSource: string; reason: string }>;
  blockers: string[];
  sources: Array<{ sourceId: string; kind: "form" | "invoice"; detail: string }>;
}

export interface LocalEneaDraftPlan {
  status: "ready_before_external_action" | "blocked";
  stopPoint: "before_external_action";
  externalActionAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  globalGate: "blocked_adapters_unverified";
  fields: {
    taxCode: string;
    completionDate: string;
    buildingQualification: string;
    property: LocalCrmDossier["form"]["property"];
    deductibleExpense: number;
    productRows: LocalNormalizedProduct[];
  } | null;
  nextAction: string;
}

export type LocalDossierStage = "dossier_loaded" | "normalized" | "review_ready" | "draft_plan_ready";
export interface LocalDossierAuditEvent {
  id: string;
  revision: number;
  at: string;
  stage: LocalDossierStage;
  idempotencyKey: string;
  appliedRuleIds: string[];
  reason: string;
}

export interface LocalDossierCheckpoint {
  version: typeof LOCAL_DOSSIER_PIPELINE_VERSION;
  revision: number;
  runId: string;
  stage: LocalDossierStage;
  dossierId: string;
  displayName: string;
  inputFingerprint: string;
  sourcePath: string;
  dossier: LocalCrmDossier;
  normalization: LocalDossierNormalization | null;
  normalizationBlockers: string[];
  review: LocalDossierReview | null;
  draftPlan: LocalEneaDraftPlan | null;
  audit: LocalDossierAuditEvent[];
  updatedAt: string;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const area = (widthCm: number, heightCm: number) => Math.round((widthCm * heightCm / 10_000) * 1_000) / 1_000;
const parseDay = (value: string) => {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Data dossier non valida: ${value}`);
  return timestamp;
};
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function validDossier(value: LocalCrmDossier): boolean {
  return value.version === LOCAL_DOSSIER_VERSION && value.mode === "test" && value.scheme === "ecobonus"
    && Boolean(value.dossierId.trim()) && Boolean(value.displayName.trim()) && Boolean(value.form.sourceId.trim())
    && Number.isInteger(value.form.property.units) && value.form.property.units > 0
    && Number.isInteger(value.form.property.floors) && value.form.property.floors > 0
    && value.invoices.length > 0 && value.invoices.every((invoice) => Boolean(invoice.sourceId.trim()) && Boolean(invoice.documentNumber.trim())
      && Number.isFinite(invoice.grossTotal) && invoice.grossTotal >= 0 && invoice.lines.every((line) => Boolean(line.lineId.trim())
        && Number.isInteger(line.quantity) && line.quantity > 0 && line.widthCm > 0 && line.heightCm > 0 && line.grossAmount >= 0));
}

function classifyProduct(line: LocalDossierProductLine) {
  if (line.classification === "pergola") return { productType: "pergola" as const, gTot: line.documentedGTot ?? 0.08,
    gTotSource: line.documentedGTot == null ? "authorized_fallback" as const : "invoice_explicit" as const,
    material: line.material ?? "Misto", movement: line.movement ?? "Manuale", ruleId: USER_AUTHORIZED_RULE_IDS.pergolaScreening };
  if (line.classification === "zanzariera") return { productType: "zanzariera" as const, gTot: line.documentedGTot ?? 0.33,
    gTotSource: line.documentedGTot == null ? "authorized_fallback" as const : "invoice_explicit" as const,
    material: line.material ?? "Misto", movement: line.movement ?? "Manuale", ruleId: USER_AUTHORIZED_RULE_IDS.zanzarieraScreening };
  if (line.classification === "tenda") return { productType: "tenda" as const, gTot: line.documentedGTot ?? 0.33,
    gTotSource: line.documentedGTot == null ? "authorized_fallback" as const : "invoice_explicit" as const,
    material: line.material ?? "Tessuto", movement: line.movement ?? "Manuale", ruleId: USER_AUTHORIZED_RULE_IDS.genericAwningScreening };
  return null;
}

export function normalizeLocalDossier(dossier: LocalCrmDossier): { normalization: LocalDossierNormalization; blockers: string[] } {
  if (!validDossier(dossier)) throw new Error("Dossier CRM locale non valido o incompleto.");
  const blockers: string[] = [];
  const invoiceDates = dossier.invoices.map((invoice) => ({ sourceId: invoice.sourceId, date: invoice.date, timestamp: parseDay(invoice.date) }))
    .sort((a, b) => b.timestamp - a.timestamp);
  const completionDate = dossier.form.completionDate ?? invoiceDates[0].date;
  const completionDateSourceId = dossier.form.completionDate ? dossier.form.sourceId : invoiceDates[0].sourceId;
  const daysFromCompletionToProcessing = Math.floor((parseDay(dossier.processingDate) - parseDay(completionDate)) / 86_400_000);
  const buildingQualification = dossier.form.property.buildingType === "single_house" && dossier.form.property.units === 1
    ? "single_unit" as const : dossier.form.property.buildingType === "condominium" ? "condominium" as const : "other" as const;

  const rinaldi = applyRinaldiScopedFinancialRules(dossier.invoices.map((invoice) => ({
    sourceId: invoice.sourceId, supplierId: invoice.supplierId, supplierName: invoice.supplierName,
    documentNumber: invoice.documentNumber, grossTotal: invoice.grossTotal,
    explicitDeductibleLines: invoice.explicitDeductibleLines,
    lineItems: invoice.lines.map((line) => ({ lineId: line.lineId, lineNumber: line.lineNumber, text: line.text,
      grossAmount: line.grossAmount, classification: line.classification as RinaldiLineClassification, extractionConfidence: "certain" as const })),
  })), { mode: dossier.mode, scheme: dossier.scheme });
  blockers.push(...rinaldi.blockers);

  const products: LocalNormalizedProduct[] = [];
  const excludedProducts: LocalDossierNormalization["excludedProducts"] = [];
  const sourceNotes = [...rinaldi.auditNotes];
  const appliedRuleIds = new Set<string>(rinaldi.appliedRuleIds);
  for (const invoice of dossier.invoices) {
    for (const line of invoice.lines) {
      const rinaldiVepa = rinaldi.deferredVepaLineIds.includes(line.lineId);
      const classified = classifyProduct(line);
      if (rinaldiVepa || !classified) {
        const reason = rinaldiVepa ? "VEPA separata, Bonus Casa non ancora lavorato" : `Prodotto non qualificato per Ecobonus: ${line.classification}`;
        const ruleIds = rinaldiVepa ? [USER_AUTHORIZED_RULE_IDS.rinaldiPergolaVepaTestEcobonus, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality]
          : [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality];
        for (let pieceNumber = 1; pieceNumber <= line.quantity; pieceNumber += 1) excludedProducts.push({
          rowId: `${line.lineId}:piece-${pieceNumber}`, sourceId: invoice.sourceId, lineId: line.lineId,
          lineNumber: line.lineNumber, pieceNumber, text: line.text, grossAmount: money(line.grossAmount / line.quantity),
          reason, appliedRuleIds: ruleIds,
        });
        if (line.classification === "ambiguous") blockers.push(`ambiguous-product:${invoice.sourceId}:${line.lineId}`);
        ruleIds.forEach((ruleId) => appliedRuleIds.add(ruleId));
        continue;
      }
      appliedRuleIds.add(classified.ruleId);
      appliedRuleIds.add(USER_AUTHORIZED_RULE_IDS.technicalProductCardinality);
      const expanded = expandClassifiedProductRows({ sourceLineId: line.lineId, quantity: line.quantity,
        perPieceSurfaceM2: area(line.widthCm, line.heightCm), attributes: {} }, "enea_included", "Schermatura qualificata da fonte originaria e registro unico.");
      for (const row of expanded) products.push({
        rowId: row.rowId, sourceId: invoice.sourceId, sourceLineId: line.lineId, sourceLineNumber: line.lineNumber,
        pieceNumber: row.pieceNumber, description: line.text, productType: classified.productType,
        disposition: "enea_included", exclusionReason: null, widthCm: line.widthCm, heightCm: line.heightCm,
        surfaceM2: row.surfaceM2, exposure: line.exposure ?? null, material: classified.material, movement: classified.movement,
        gTot: classified.gTot, gTotSource: classified.gTotSource, allocatedGrossAmount: money(line.grossAmount / line.quantity),
        appliedRuleIds: [classified.ruleId, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
      });
    }
  }
  const expectedIncludedLines = dossier.invoices.flatMap((invoice) => invoice.lines).filter((line) => classifyProduct(line) && !rinaldi.deferredVepaLineIds.includes(line.lineId));
  if (!technicalCardinalityMatches(expectedIncludedLines.map((line) => ({ sourceLineId: line.lineId, quantity: line.quantity })), products)) {
    blockers.push("technical-cardinality-mismatch");
  }
  if (!dossier.form.completionDate) appliedRuleIds.add(USER_AUTHORIZED_RULE_IDS.missingCompletionDate);
  if (daysFromCompletionToProcessing > 90) appliedRuleIds.add(USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert);
  if (buildingQualification === "single_unit") appliedRuleIds.add(USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification);
  const invoiceGrossTotal = money(dossier.invoices.reduce((sum, invoice) => sum + invoice.grossTotal, 0));
  const deductibleExpense = money(dossier.invoices.reduce((sum, invoice) => sum + (rinaldi.effectiveEneaAmounts[invoice.sourceId] ?? invoice.grossTotal), 0));
  return { normalization: { completionDate, completionDateSourceId, daysFromCompletionToProcessing, buildingQualification,
    products, excludedProducts, deductibleExpense, invoiceGrossTotal, appliedRuleIds: [...appliedRuleIds], sourceNotes }, blockers: [...new Set(blockers)] };
}

export function reviewLocalDossier(dossier: LocalCrmDossier, normalization: LocalDossierNormalization, normalizationBlockers: string[]): LocalDossierReview {
  const warnings: LocalDossierReview["warnings"] = [];
  if (normalization.daysFromCompletionToProcessing > 90) warnings.push({ code: "completion_over_90_days_test_only",
    message: `${normalization.daysFromCompletionToProcessing} giorni tra fine lavori e lavorazione: alert TEST non bloccante.`, blocking: false,
    sourceIds: [normalization.completionDateSourceId], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.testOnlyOver90DaysAlert, USER_AUTHORIZED_RULE_IDS.missingCompletionDate] });
  if (dossier.form.property.buildingType === "single_house" && dossier.form.property.units === 1 && dossier.form.property.floors >= 3) warnings.push({
    code: "single_house_multifloor_confirmed", message: `${dossier.form.property.floors} piani descrittivi: edificio a unità unica confermato dal form.`, blocking: false,
    sourceIds: [dossier.form.sourceId], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification] });
  const differences: LocalDossierReview["differences"] = [];
  if (dossier.form.declaredExpense !== null && Math.abs(dossier.form.declaredExpense - normalization.deductibleExpense) > 0.01) differences.push({
    field: "spesa_detraibile", formValue: dossier.form.declaredExpense, normalizedValue: normalization.deductibleExpense,
    chosenSource: "fatture originarie + regole Rinaldi", reason: "La riconciliazione documentale prevale sul totale dichiarato nel form." });
  const sources: LocalDossierReview["sources"] = [
    { sourceId: dossier.form.sourceId, kind: "form", detail: "Form cliente locale originario." },
    ...dossier.invoices.map((invoice) => ({ sourceId: invoice.sourceId, kind: "invoice" as const, detail: `Fattura ${invoice.documentNumber} · ${invoice.supplierName} · ${invoice.date}` })),
  ];
  return { outcome: normalizationBlockers.length ? "blocked" : "ready_local_plan", warnings, differences,
    blockers: [...normalizationBlockers], sources };
}

export function buildLocalEneaDraftPlan(dossier: LocalCrmDossier, normalization: LocalDossierNormalization, review: LocalDossierReview): LocalEneaDraftPlan {
  const ready = review.outcome === "ready_local_plan";
  return { status: ready ? "ready_before_external_action" : "blocked", stopPoint: "before_external_action",
    externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false,
    globalGate: "blocked_adapters_unverified",
    fields: ready ? { taxCode: dossier.form.taxCode, completionDate: normalization.completionDate,
      buildingQualification: normalization.buildingQualification, property: structuredClone(dossier.form.property),
      deductibleExpense: normalization.deductibleExpense, productRows: structuredClone(normalization.products) } : null,
    nextAction: ready ? "Verificare gli adattatori in un gate separato; nessuna azione CRM/ENEA è consentita da questo piano locale."
      : "Risolvere i blocker usando fonti originarie; non contattare sistemi esterni." };
}

export class PersistentLocalDossierPipeline {
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string) { this.checkpointPath = path.join(path.resolve(rootDirectory), "local-dossier", "checkpoint.json"); }
  load(): LocalDossierCheckpoint | null {
    if (!existsSync(this.checkpointPath)) return null;
    try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as LocalDossierCheckpoint;
      return value.version === LOCAL_DOSSIER_PIPELINE_VERSION && Array.isArray(value.audit) ? value : null; } catch { return null; }
  }
  private write(checkpoint: LocalDossierCheckpoint) { atomicWrite(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`); }
  private transition(checkpoint: LocalDossierCheckpoint, stage: LocalDossierStage, idempotencyKey: string, ruleIds: string[], reason: string,
    mutate: (next: LocalDossierCheckpoint) => void, now: Date) {
    if (checkpoint.audit.some((event) => event.idempotencyKey === idempotencyKey)) return checkpoint;
    if (!ruleIds.length || ruleIds.some((ruleId) => !registryRule(ruleId))) throw new Error("Checkpoint dossier privo di ID validi del registro unico.");
    const next = structuredClone(checkpoint); mutate(next); next.revision += 1; next.stage = stage; next.updatedAt = now.toISOString();
    next.audit.push({ id: `local-dossier-event-${String(next.revision).padStart(8, "0")}-${stage}`, revision: next.revision,
      at: now.toISOString(), stage, idempotencyKey, appliedRuleIds: ruleIds, reason });
    this.write(next); return next;
  }
  runFromFile(sourcePath: string, runId: string, now = new Date(), stopAfterStage?: LocalDossierStage) {
    const resolved = path.resolve(sourcePath);
    const dossier = JSON.parse(readFileSync(resolved, "utf8")) as LocalCrmDossier;
    if (!validDossier(dossier)) throw new Error("Fixture dossier locale non valida.");
    const inputFingerprint = fingerprint(dossier);
    let checkpoint = this.load();
    if (!checkpoint) {
      checkpoint = { version: LOCAL_DOSSIER_PIPELINE_VERSION, revision: 0, runId, stage: "dossier_loaded", dossierId: dossier.dossierId,
        displayName: dossier.displayName, inputFingerprint, sourcePath: resolved, dossier: structuredClone(dossier), normalization: null,
        review: null, draftPlan: null, normalizationBlockers: [], updatedAt: now.toISOString(), audit: [{ id: "local-dossier-event-00000000-dossier_loaded", revision: 0,
          at: now.toISOString(), stage: "dossier_loaded", idempotencyKey: `${runId}:loaded`, appliedRuleIds: ["core-form-first", "system-atomic-checkpoint-resume"],
          reason: "Dossier CRM fixture acquisito esclusivamente da file locale e persistito." }] };
      this.write(checkpoint);
    } else if (checkpoint.runId !== runId || checkpoint.inputFingerprint !== inputFingerprint) {
      throw new Error("Checkpoint dossier attivo diverso: sovrascrittura vietata.");
    }
    if (stopAfterStage === "dossier_loaded") return checkpoint;
    if (checkpoint.stage === "dossier_loaded") {
      const result = normalizeLocalDossier(checkpoint.dossier);
      checkpoint = this.transition(checkpoint, "normalized", `${runId}:normalized`,
        [...new Set([...result.normalization.appliedRuleIds, "system-atomic-checkpoint-resume"])],
        `Dossier normalizzato con ${result.normalization.products.length} prodotti fisici inclusi e ${result.normalization.excludedProducts.length} righe prodotto escluse.`,
        (next) => { next.normalization = result.normalization; next.normalizationBlockers = result.blockers; }, now);
    }
    if (stopAfterStage === "normalized") return checkpoint;
    if (checkpoint.stage === "normalized") {
      const blockers = checkpoint.normalizationBlockers ?? [];
      const review = reviewLocalDossier(checkpoint.dossier, checkpoint.normalization!, blockers);
      checkpoint = this.transition(checkpoint, "review_ready", `${runId}:review`, ["core-mapping-complete", "system-atomic-checkpoint-resume"],
        `Revisione locale pronta: ${review.warnings.length} avvisi, ${review.differences.length} differenze, ${review.blockers.length} blocker.`,
        (next) => { next.review = review; }, now);
    }
    if (stopAfterStage === "review_ready") return checkpoint;
    if (checkpoint.stage === "review_ready") {
      const plan = buildLocalEneaDraftPlan(checkpoint.dossier, checkpoint.normalization!, checkpoint.review!);
      checkpoint = this.transition(checkpoint, "draft_plan_ready", `${runId}:draft-plan`,
        ["core-mapping-complete", "system-readonly-adapter-contract", "system-enea-lease-required", "system-atomic-checkpoint-resume"],
        `Piano bozza locale ${plan.status}; gate esterno ${plan.globalGate}.`, (next) => { next.draftPlan = plan; }, now);
    }
    return checkpoint;
  }
}

export function localDossierDashboardSnapshot(rootDirectory: string) {
  const checkpoint = new PersistentLocalDossierPipeline(rootDirectory).load();
  if (!checkpoint) return null;
  return { version: checkpoint.version, registryVersion: ENEA_OPERATIONAL_REGISTRY_VERSION, revision: checkpoint.revision,
    dossierId: checkpoint.dossierId, displayName: checkpoint.displayName, stage: checkpoint.stage,
    updatedAt: checkpoint.updatedAt, normalization: checkpoint.normalization, review: checkpoint.review,
    draftPlan: checkpoint.draftPlan, lastEvent: checkpoint.audit.at(-1)! };
}
