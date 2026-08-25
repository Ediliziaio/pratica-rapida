import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isValidCodiceFiscale } from "../../src/components/form-cliente/validation-utils";
import { combineDocumentResults, parseScreeningTechnicalSourceText, PERSIANA_MEASURE_LIMITS_MM, stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";
import { fingerprintPreparedPractice } from "../../src/features/enea-lab/preparation";
import { reconcileFinancialEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { birthNationFromProvince, fiscalCodeMatchesPartialIdentity, repairFiscalCodeSingleOcrConfusable, resolveBeneficiaryFiscalCode, resolveForeignBirthCountryFromFiscalCode } from "../../src/features/enea-shadow-crm/operationalRules";
import type { AprCrmAcquisitionItem } from "./crmAuthenticatedReadOnly";
import type { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { buildCrmEneaDraftPackage, buildCrmEneaPayloadAudit, type CrmEneaPayloadAuditResult } from "./crmEneaPayloadAudit";
import { extractBankTransferEvidences, reconcileBankTransfers } from "./bankTransferEvidence";
import { extractLocalInvoiceFinancialEvidence } from "./localInvoiceFinancialEvidence";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";
import { isLineaSolePotitoPaperForm, lineaSolePotitoSupplierEvidence, PAPER_FORM_BIRTH_DATE_OCR_REPAIR_RULE_ID, parseLineaSolePotitoPaperForm, resolveLineaSolePotitoExposure, resolveLineaSolePotitoProtectedWindowSurface } from "./lineaSolePotitoPolicy";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";

export const APR_CRM_LOCAL_PREFLIGHT_VERSION = "apr-crm-local-preflight-v1" as const;
const BASE_RULE_IDS = ["core-form-first", "core-economic-classification", "core-gross-triple-reconciliation", "core-mapping-complete", "system-single-active-practice", "system-atomic-checkpoint-resume", USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart];
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type PreflightBlocker = { code: string; field: string; reason: string; sourceIds: string[]; appliedRuleIds: string[] };

export function asScreeningDraftPackage<T extends Omit<AprEneaDraftPackage, "module">>(draftPackage: T): T & { module: "screening" } {
  return { ...draftPackage, module: "screening" };
}

export function assessEnea2026SubmissionDeadline(startDate: string | null, completionDate: string, now: Date) {
  const specialWindowApplied = Boolean(startDate
    && startDate >= "2026-02-04"
    && completionDate >= "2026-01-01"
    && completionDate < "2026-06-25");
  const calculationStartDate = specialWindowApplied ? "2026-06-25" : completionDate;
  const elapsedDays = dayDiff(calculationStartDate, now);
  return {
    specialWindowApplied,
    calculationStartDate,
    deadlineDate: specialWindowApplied ? "2026-09-23" : new Date(Date.parse(`${completionDate}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10),
    elapsedDays,
    withinDeadline: elapsedDays <= 90,
    appliedRuleIds: specialWindowApplied ? [USER_AUTHORIZED_RULE_IDS.enea2026June25NinetyDayWindow] : [],
  };
}

export function completionDateOperatorBlockers(completionDate: string, completionDateSource: string | null, explicitCompletion: boolean, now: Date, startDate: string | null = null, startDateSource: string | null = null): PreflightBlocker[] {
  const sourceIds = [...new Set([completionDateSource, startDateSource].filter((value): value is string => Boolean(value)))];
  const deadline = assessEnea2026SubmissionDeadline(startDate, completionDate, now);
  const elapsedDays = deadline.elapsedDays;
  const portalYear = now.getUTCFullYear();
  const completionYear = Number(completionDate.slice(0, 4));
  const fallbackRuleIds = explicitCompletion ? [] : [USER_AUTHORIZED_RULE_IDS.missingCompletionDate];
  const blockers: PreflightBlocker[] = [];
  if (completionYear !== portalYear) blockers.push({
    code: "completion_date_portal_year_mismatch",
    field: "dates.completion",
    reason: `Fine lavori ${completionDate}: anno ${completionYear} incompatibile con il portale ENEA ${portalYear}. Selezionare il portale annuale corretto senza modificare la data.`,
    sourceIds,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.completionPortalYearOperatorGate, ...fallbackRuleIds],
  });
  if (elapsedDays > 90) blockers.push({
    code: "completion_over_90_days_operator_required",
    field: "dates.completion",
    reason: deadline.specialWindowApplied
      ? `Finestra ENEA 2026 applicata: decorrenza 25/06/2026 e termine 23/09/2026; lavorazione oltre il termine. Verificare la procedibilità.`
      : `Fine lavori ${completionDate}: ${elapsedDays} giorni prima della lavorazione, oltre il limite di 90 giorni. Verificare la procedibilità e il portale annuale corretto.`,
    sourceIds,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.completionOver90OperatorGate, ...deadline.appliedRuleIds, ...fallbackRuleIds],
  });
  return blockers;
}

type JsonObject = Record<string, unknown>;
type ProductPlanRow = {
  rowId: string; sourceDocumentKey: string; description: string; pieceNumber: number;
  widthMm: number; heightMm: number; surfaceM2: number; exposure: string | null; declaredType: string | null;
  exposureSource: "paper_form_explicit" | "linea_sole_potito_fallback" | null;
  protectedWindowSurfaceM2: number | null;
  protectedWindowSurfaceSource: "paper_form_explicit" | "linea_sole_potito_fallback" | "derived_product_surface" | null;
  supplementaryThermalResistance: number | null;
  formMappingSource: "one_to_one" | "group_inheritance" | "group_invoice_type_override" | null;
  gTot: number; gTotSource: "invoice_explicit" | "authorized_fallback";
  material: string; materialSource: "invoice_explicit" | "authorized_fallback";
  movement: string; movementSource: "invoice_explicit" | "authorized_fallback";
  appliedRuleIds: string[];
};
export interface AprCrmLocalPreflightReport {
  outcome: "ready_local_plan" | "blocked_case";
  formAvailable: boolean;
  startDate: string | null;
  startDateSource: string | null;
  completionDate: string | null;
  completionDateSource: string | null;
  buildingQualification: "single_unit" | "multi_unit" | null;
  buildingUnitCount: number | null;
  deductionRate: 36 | null;
  taxCodeStatus: "verified_form" | "verified_original_document" | "missing_or_invalid" | "conflict";
  resolvedTaxCode: string | null;
  taxCodeSourceIds: string[];
  primaryBeneficiaryResolution: {
    status: "verified_invoice" | "not_found" | "conflict";
    identity: { name: string; surname: string; taxCode: string } | null;
    sourceIds: string[];
  };
  coBeneficiaryResolution: {
    status: "not_declared" | "excluded_by_invoice" | "confirmed_by_invoice" | "unresolved";
    present: boolean;
    identity: { name: string; surname: string; taxCode: string } | null;
    sourceIds: string[];
  };
  products: ProductPlanRow[];
  financial: {
    invoiceTotal: number | null; eligibleExpense: number | null; tripleReconciliationVerified: boolean; reconciledTotal: number | null;
    evidence: Array<{ sourceId: string; kind: string; taxableAmount: number | null; vatAmount: number | null; grossTotal: number | null; interventionGrossAmount: number | null; extractionConfidence: string }>;
    bankTransfers: Array<{ sourceId: string; principalAmount: number | null; fees: number | null; debitedTotal: number | null; invoiceReference: string | null; taxReliefType: "energy_saving" | "building_renovation" | null; appliedRuleIds: string[] }>;
    bankTransferReconciliation: { status: "not_provided" | "unverified" | "reconciled" | "principal_exceeds_invoices" | "principal_below_invoices"; principalTotal: number | null; feesTotal: number | null; debitedTotal: number | null; difference: number | null; referenceStatus: "not_provided" | "not_checked" | "incomplete" | "verified"; missingInvoiceReferences: string[]; taxReliefTypes: Array<"energy_saving" | "building_renovation"> };
    methods: Array<{ method: string; ok: boolean; total: number | null; sources: readonly string[]; reason: string }>;
    discardedDuplicateSourceIds: string[];
    supersededTechnicalSourceIds: string[];
    appliedRuleIds: string[];
  };
  warnings: Array<{ code: string; reason: string; appliedRuleIds: string[] }>;
  blockers: Array<{ code: string; field: string; reason: string; sourceIds: string[]; appliedRuleIds: string[] }>;
  sourceIds: string[];
  eneaPayloadAudit: CrmEneaPayloadAuditResult;
  draftPlan: { status: "ready_before_external_action" | "blocked"; externalActionAllowed: false; previewAllowed: false; submitAllowed: false; communicationsAllowed: false; nextAction: string };
}
export interface AprCrmLocalPreflightItem {
  customerKey: string; displayName: string; practiceId: string; dossierPath: string;
  state: "queued" | "processing" | "ready_local_plan" | "blocked_case" | "deferred_operator"; attemptCount: number;
  startedAt: string | null; endedAt: string | null; report: AprCrmLocalPreflightReport | null; reason: string;
  disposition?: { kind: "user_deferred"; commandId: string; at: string; reason: string } | null;
}
export interface AprCrmLocalPreflightState {
  version: typeof APR_CRM_LOCAL_PREFLIGHT_VERSION; revision: number; status: "unprepared" | "queued" | "running" | "completed";
  sourceFingerprint: string | null; currentCustomerKey: string | null; items: AprCrmLocalPreflightItem[];
  externalActionAllowed: false; reason: string; nextAction: string;
  validationRevisionsApplied: string[];
  sourceRevisionsApplied: string[];
  operatorMeasurementResolutions: Array<{ questionId: string; customerKey: string; sourceId: string; description: string; rawWidth: number; rawHeight: number; unit: "millimeters" | "centimeters"; note: string; operatorId: string; commandId: string; answeredAt: string }>;
  audit: Array<{ revision: number; at: string; type: "initialized" | "prepared" | "claimed" | "case_ready" | "case_blocked" | "case_deferred" | "source_revision_applied" | "validation_recomputed" | "operator_resolution_requeued" | "completed"; customerKey: string | null; reason: string; appliedRuleIds: string[] }>;
}

type AprCrmLocalPreflightBlocker = AprCrmLocalPreflightReport["blockers"][number];

function isScreeningComponentBlocker(blocker: AprCrmLocalPreflightBlocker) {
  return blocker.field === "screenings" || blocker.field.startsWith("screenings.");
}

export function invalidateCrmEneaPayloadAuditForScreeningBlockers(
  audit: CrmEneaPayloadAuditResult,
  blockers: readonly AprCrmLocalPreflightBlocker[],
): CrmEneaPayloadAuditResult {
  const screeningBlockers = blockers.filter(isScreeningComponentBlocker);
  if (screeningBlockers.length === 0) return audit;
  const auditBlockers = [...audit.blockers];
  for (const blocker of screeningBlockers) {
    if (auditBlockers.some((item) => item.code === blocker.code)) continue;
    auditBlockers.push({ code: blocker.code, fieldId: blocker.field, message: blocker.reason });
  }
  return {
    ...audit,
    status: "payload_incomplete",
    blockerCount: auditBlockers.length,
    blockers: auditBlockers,
    draftReady: false,
    portalGate: {
      ...audit.portalGate,
      status: "blocked",
      reason: "screening-component-blocked",
      workflowFingerprint: null,
      supportedPages: [],
    },
    reason: `${screeningBlockers.length} blocker della componente Schermature invalidano il payload della bozza TEST.`,
  };
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const normalizeCf = (value: unknown) => text(value).replace(/\s+/g, "").toUpperCase();
const dayDiff = (from: string, to: Date) => Math.floor((to.getTime() - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface CaseSpecificFinancialResolution {
  practiceId: string;
  customerKey: string;
  grossInvoiceTotal: number;
  eligibleTechnicalExpense: number;
  excludedUnclassifiedExpense: number;
  reason: string;
  operatorId: string;
  answeredAt: string;
  appliedRuleIds: string[];
}

/** Risoluzioni dell'operatore non propagabili: non sono fallback business. */
export const CASE_SPECIFIC_FINANCIAL_RESOLUTIONS: readonly CaseSpecificFinancialResolution[] = Object.freeze([{
  practiceId: "d7aedc6e-d886-44b7-8925-25202ca90877",
  customerKey: "elisa-moro",
  grossInvoiceTotal: 1250,
  eligibleTechnicalExpense: 1250,
  excludedUnclassifiedExpense: 0,
  reason: "Correzione utente 2026-08-18: per Elisa Moro la spesa tecnica schermature coincide con l'intero lordo documentato e pagato di €1.250; nessun importo deve essere escluso.",
  operatorId: "user-giuliano",
  answeredAt: "2026-08-18T18:20:00+02:00",
  appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation, USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume, "system-atomic-checkpoint-resume"],
}]);

export function resolveBundledProfessionalExpense(
  invoiceTexts: readonly { sourceId: string; text: string; grossTotal?: number | null }[],
  grossInvoiceTotal: number | null,
  resolution?: CaseSpecificFinancialResolution,
) {
  const markers = invoiceTexts.flatMap(({ sourceId, text: sourceText }) => sourceText.split(/\r?\n/)
    .filter((line) => /\b(?:pratica|servizio)\s+enea\s+compres[ao]\b/i.test(line))
    .map((line) => ({ sourceId, text: line.trim().replace(/\s+/g, " ") })));
  const dedicatedProfessionalInvoices = invoiceTexts.flatMap(({ sourceId, text: sourceText, grossTotal }) => {
    const dedicated = !/\bcompres[ao]\b/i.test(sourceText)
      && /\bPratica\s+ENEA(?:\s+Ecobonus)?\b/i.test(sourceText)
      && /\b(?:assistenza\s+alla\s+raccolta\s+documentale|invio\s+pratica|trasmissione\s+pratica)\b/i.test(sourceText);
    return dedicated ? [{ sourceId, text: "Fattura separata per servizio professionale Pratica ENEA", amount: grossTotal ?? null }] : [];
  });
  if (dedicatedProfessionalInvoices.length) {
    const documentedTotal = dedicatedProfessionalInvoices.every((item) => item.amount !== null)
      ? Math.round((dedicatedProfessionalInvoices.reduce((sum, item) => sum + (item.amount ?? 0), 0) + Number.EPSILON) * 100) / 100
      : null;
    if (grossInvoiceTotal === null || documentedTotal === null || documentedTotal > grossInvoiceTotal) {
      return { status: "operator_required" as const, eligibleTechnicalExpense: null, excludedUnclassifiedExpense: null, markers: [...markers, ...dedicatedProfessionalInvoices] };
    }
    return {
      status: "resolved_documented_separation" as const,
      eligibleTechnicalExpense: Math.round((grossInvoiceTotal - documentedTotal + Number.EPSILON) * 100) / 100,
      excludedUnclassifiedExpense: documentedTotal,
      markers: [...markers, ...dedicatedProfessionalInvoices],
      documentedProfessionalInvoices: dedicatedProfessionalInvoices,
    };
  }
  if (!markers.length) return { status: "not_applicable" as const, eligibleTechnicalExpense: grossInvoiceTotal, excludedUnclassifiedExpense: 0, markers };
  const validResolution = Boolean(resolution && grossInvoiceTotal !== null
    && resolution.grossInvoiceTotal === grossInvoiceTotal
    && Math.abs((resolution.eligibleTechnicalExpense + resolution.excludedUnclassifiedExpense) - grossInvoiceTotal) < 0.01
    && resolution.eligibleTechnicalExpense >= 0 && resolution.excludedUnclassifiedExpense >= 0);
  if (!validResolution) return { status: "operator_required" as const, eligibleTechnicalExpense: null, excludedUnclassifiedExpense: null, markers };
  return { status: "resolved_case_specific" as const, eligibleTechnicalExpense: resolution!.eligibleTechnicalExpense, excludedUnclassifiedExpense: resolution!.excludedUnclassifiedExpense, markers, resolution: resolution! };
}

const LABELED_FISCAL_CODE = /(?:c\s*\.?\s*f\s*\.?|c\.?\s*fisc\.?|codice\s+fiscale)\s*[:\-]?\s*([A-Z0-9]{16})\b/gi;

const normalizedIdentityText = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

function fiscalLetters(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/gi, "").toUpperCase();
}

function surnameFiscalPrefix(value: string) {
  const letters = fiscalLetters(value); const consonants = letters.replace(/[AEIOU]/g, ""); const vowels = letters.replace(/[^AEIOU]/g, "");
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

function nameFiscalPrefix(value: string) {
  const letters = fiscalLetters(value); const consonants = letters.replace(/[AEIOU]/g, ""); const vowels = letters.replace(/[^AEIOU]/g, "");
  return consonants.length >= 4 ? `${consonants[0]}${consonants[2]}${consonants[3]}` : `${consonants}${vowels}XXX`.slice(0, 3);
}

function personNameCase(value: string) {
  return value.toLocaleLowerCase("it-IT").replace(/(^|[\s'’-])([a-zà-öø-ÿ])/giu, (_match, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("it-IT")}`);
}

function splitInvoicePersonName(fullName: string, taxCode: string) {
  const words = fullName.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const candidates: Array<{ name: string; surname: string; taxCode: string }> = [];
  for (let index = 1; index < words.length; index += 1) {
    for (const order of ["surname_first", "name_first"] as const) {
      const first = words.slice(0, index).join(" "); const second = words.slice(index).join(" ");
      const surname = order === "surname_first" ? first : second; const name = order === "surname_first" ? second : first;
      if (surnameFiscalPrefix(surname) === taxCode.slice(0, 3) && nameFiscalPrefix(name) === taxCode.slice(3, 6)) candidates.push({ name: personNameCase(name), surname: personNameCase(surname), taxCode });
    }
  }
  const unique = [...new Map(candidates.map((candidate) => [`${candidate.name}|${candidate.surname}|${candidate.taxCode}`, candidate])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function explicitInvoiceCoBeneficiaries(textValue: string) {
  const results: Array<{ name: string; surname: string; taxCode: string }> = [];
  const lines = stripHistoricalEneaAppendix(textValue).split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
  // L'OCR dei PDF multipagina puo' spezzare la stessa riga descrittiva fra
  // etichetta, nominativo e codice fiscale. Analizza anche finestre corte di
  // righe contigue, senza attraversare intere pagine o dedurre identita.
  const candidates = [...new Set(lines.flatMap((line, index) => [
    line,
    lines.slice(index, index + 2).join(" "),
    lines.slice(index, index + 3).join(" "),
  ]).filter((value) => value.length <= 480))];
  for (const candidateText of candidates) {
    if (!/(?:cointestatari[oa]|altro beneficiario|fornitura.{0,240}\bcon\b)/i.test(candidateText)) continue;
    const cfMatch = candidateText.match(/(?:c\s*\.?\s*f\s*\.?|codice\s+fiscale)\s*[:\-]?\s*([A-Z0-9]{16})\b/i);
    if (!cfMatch) continue;
    const taxCode = normalizeCf(cfMatch[1]); if (!isValidCodiceFiscale(taxCode)) continue;
    const prefix = candidateText.slice(0, cfMatch.index).replace(/^.*?(?:cointestatari[oa]|altro beneficiario(?:\s+persona\s+fisica)?|\bcon\b)\s*[:\-]?\s*/i, "").trim();
    const identity = splitInvoicePersonName(prefix, taxCode);
    if (identity) results.push(identity);
  }
  return [...new Map(results.map((candidate) => [candidate.taxCode, candidate])).values()];
}

function explicitInvoicePrimaryBeneficiaries(textValue: string) {
  const results: Array<{ name: string; surname: string; taxCode: string }> = [];
  const lines = stripHistoricalEneaAppendix(textValue).split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const label = lines[index].match(/^(?:cliente|intestatario|destinatario)\b\s*[:\-]?\s*(.*)$/i);
    if (!label) continue;
    const window = [label[1], ...lines.slice(index + 1, index + 5)].filter(Boolean).join(" ");
    const cfMatch = window.match(/(?:c\s*\.?\s*f\s*\.?|codice\s+fiscale)\s*[:\-]?\s*([A-Z0-9]{16})\b/i);
    if (!cfMatch) continue;
    const taxCode = normalizeCf(cfMatch[1]);
    if (!isValidCodiceFiscale(taxCode)) continue;
    const fullName = window.slice(0, cfMatch.index).replace(/\b(?:p\.?\s*iva|partita\s+iva)\b.*$/i, "").trim();
    const identity = splitInvoicePersonName(fullName, taxCode);
    if (identity) results.push(identity);
  }
  return [...new Map(results.map((candidate) => [`${candidate.name}|${candidate.surname}|${candidate.taxCode}`, candidate])).values()];
}

export function resolvePrimaryBeneficiaryFromOriginalInvoices(input: {
  customerKey: string;
  taxCode: string | null;
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>;
}) {
  if (!input.taxCode) return { status: "not_found" as const, identity: null, sourceIds: [] as string[] };
  const candidates = new Map<string, { identity: { name: string; surname: string; taxCode: string }; sourceIds: string[] }>();
  for (const item of input.analysis.items) {
    if (item.customerKey !== input.customerKey || item.kind !== "invoice" || item.state !== "analyzed" || !item.textPath || !existsSync(item.textPath)) continue;
    for (const identity of explicitInvoicePrimaryBeneficiaries(readFileSync(item.textPath, "utf8"))) {
      if (identity.taxCode !== input.taxCode) continue;
      const key = `${normalizedIdentityText(identity.name)}|${normalizedIdentityText(identity.surname)}|${identity.taxCode}`;
      const candidate = candidates.get(key) ?? { identity, sourceIds: [] };
      candidate.sourceIds.push(item.documentKey); candidates.set(key, candidate);
    }
  }
  if (candidates.size === 0) return { status: "not_found" as const, identity: null, sourceIds: [] as string[] };
  if (candidates.size > 1) return { status: "conflict" as const, identity: null, sourceIds: [...new Set([...candidates.values()].flatMap((candidate) => candidate.sourceIds))].sort() };
  const candidate = [...candidates.values()][0];
  return { status: "verified_invoice" as const, identity: candidate.identity, sourceIds: [...new Set(candidate.sourceIds)].sort() };
}

export function resolveCoBeneficiaryFromOriginalInvoices(input: {
  customerKey: string;
  coOwnership: JsonObject | null;
  mainDocumentFiscalCode: ReturnType<typeof resolveOriginalDocumentFiscalCode>;
  primaryFiscalCodes?: string[];
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>;
}) {
  const coName = text(input.coOwnership?.nome); const coSurname = text(input.coOwnership?.cognome); const coCf = normalizeCf(input.coOwnership?.cf);
  const invoiceSources = input.analysis.items.filter((item) => item.customerKey === input.customerKey && item.kind === "invoice" && item.state === "analyzed" && item.textPath && existsSync(item.textPath));
  const primaryFiscalCodes = new Set([
    normalizeCf(input.mainDocumentFiscalCode.value),
    ...(input.primaryFiscalCodes ?? []).map(normalizeCf),
  ].filter(Boolean));
  // Un cointestatario deve essere una seconda persona. Alcuni form ripetono
  // per errore anagrafica e CF del beneficiario principale nella sezione
  // cointestazione: non creare in ENEA una seconda riga per la stessa identita.
  // La decisione resta documentale: conserviamo come fonti le fatture che
  // contengono quel CF e applichiamo la precedenza fattura > form gia registrata.
  if (input.coOwnership?.presente === true && coCf && primaryFiscalCodes.has(coCf)) {
    const matchingSources = invoiceSources.flatMap((item) => stripHistoricalEneaAppendix(readFileSync(item.textPath!, "utf8")).replace(/\s+/g, "").toUpperCase().includes(coCf) ? [item.documentKey] : []);
    return { status: "excluded_by_invoice" as const, present: false, identity: null, sourceIds: [...new Set(matchingSources.length ? matchingSources : invoiceSources.map((item) => item.documentKey))].sort() };
  }
  const explicitCandidates = new Map<string, { identity: { name: string; surname: string; taxCode: string }; sourceIds: string[] }>();
  for (const item of invoiceSources) for (const identity of explicitInvoiceCoBeneficiaries(readFileSync(item.textPath!, "utf8"))) {
    if (primaryFiscalCodes.has(identity.taxCode)) continue;
    const candidate = explicitCandidates.get(identity.taxCode) ?? { identity, sourceIds: [] };
    candidate.sourceIds.push(item.documentKey); explicitCandidates.set(identity.taxCode, candidate);
  }
  if (explicitCandidates.size === 1) {
    const candidate = [...explicitCandidates.values()][0];
    return { status: "confirmed_by_invoice" as const, present: true, identity: candidate.identity, sourceIds: [...new Set(candidate.sourceIds)].sort() };
  }
  if (explicitCandidates.size > 1) return { status: "unresolved" as const, present: true, identity: null, sourceIds: invoiceSources.map((item) => item.documentKey).sort() };
  if (input.coOwnership?.presente !== true) return { status: "not_declared" as const, present: false, identity: null, sourceIds: [] as string[] };
  const coFullName = normalizedIdentityText(`${coName} ${coSurname}`);
  const matchingSources = invoiceSources.flatMap((item) => {
    const originalOnly = stripHistoricalEneaAppendix(readFileSync(item.textPath!, "utf8"));
    const compact = originalOnly.replace(/\s+/g, "").toUpperCase();
    const normalized = normalizedIdentityText(originalOnly);
    return (coCf && compact.includes(coCf)) || (coFullName && normalized.includes(coFullName)) ? [item.documentKey] : [];
  });
  if (matchingSources.length && coName && coSurname && isValidCodiceFiscale(coCf)) return { status: "confirmed_by_invoice" as const, present: true, identity: { name: coName, surname: coSurname, taxCode: coCf }, sourceIds: [...new Set(matchingSources)].sort() };
  if (input.mainDocumentFiscalCode.status === "verified" && input.mainDocumentFiscalCode.sourceIds.length) {
    return { status: "excluded_by_invoice" as const, present: false, identity: null, sourceIds: input.mainDocumentFiscalCode.sourceIds };
  }
  return { status: "unresolved" as const, present: true, identity: null, sourceIds: invoiceSources.map((item) => item.documentKey).sort() };
}

export function resolveOriginalDocumentFiscalCode(input: {
  customerKey: string;
  requester: JsonObject | null;
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>;
}) {
  const name = text(input.requester?.nome);
  const surname = text(input.requester?.cognome);
  const birthDate = text(input.requester?.data_nascita).slice(0, 10);
  if (!name || !surname || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return { status: "missing_identity" as const, value: null, sourceIds: [] as string[], candidates: [] as string[] };
  }
  const evidence = new Map<string, Set<string>>();
  for (const item of input.analysis.items) {
    if (item.customerKey !== input.customerKey || item.kind !== "invoice" || item.state !== "analyzed" || !item.textPath || !existsSync(item.textPath)) continue;
    const originalOnly = stripHistoricalEneaAppendix(readFileSync(item.textPath, "utf8"));
    for (const match of originalOnly.matchAll(LABELED_FISCAL_CODE)) {
      const candidate = match[1].toUpperCase();
      if (!isValidCodiceFiscale(candidate)) continue;
      const encodedDay = Number(candidate.slice(9, 11));
      const sex = encodedDay > 40 ? "F" as const : "M" as const;
      if (!fiscalCodeMatchesPartialIdentity(candidate, { name, surname, birthDate, sex })) continue;
      const sources = evidence.get(candidate) ?? new Set<string>();
      sources.add(item.documentKey); evidence.set(candidate, sources);
    }
  }
  const candidates = [...evidence.keys()].sort();
  if (candidates.length !== 1) return { status: candidates.length > 1 ? "conflict" as const : "not_found" as const, value: null, sourceIds: [...new Set([...evidence.values()].flatMap((sources) => [...sources]))], candidates };
  return { status: "verified" as const, value: candidates[0], sourceIds: [...evidence.get(candidates[0])!].sort(), candidates };
}

export function resolveProductTechnicalAttributes(description: string, sourceContext: string, documentedGTot: number | null) {
  const normalizedDescription = description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalized = `${description}\n${sourceContext}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const explicit = documentedGTot !== null && documentedGTot > 0 && documentedGTot <= 0.35;
  const persiana = /\bpersian[ae]\b/.test(normalizedDescription);
  const avvolgibile = /\b(?:avvolgibil[ei]|tapparell[ae])\b/.test(normalizedDescription);
  const supportMaterialPattern = /(?:struttur[ae]|profil[io]|guid[ae]|cassonett[oi]|montant[ei]|bracc(?:io|i))(?:(?:\s+|\s*[-:]\s*)\w+){0,8}\s+(?:in\s+)?(?:allumini\w*|acciaio|ferro|metall\w*|legno|ligne\w*)|(?:allumini\w*|acciaio|ferro|metall\w*|legno|ligne\w*)(?:(?:\s+|\s*[-:]\s*)\w+){0,8}\s+(?:della?\s+|dei\s+|delle\s+)?(?:struttur[ae]|profil[io]|guid[ae]|cassonett[oi]|montant[ei]|bracc(?:io|i))/g;
  const supportMaterialMentions = normalized.match(supportMaterialPattern) ?? [];
  const screeningMaterialContext = normalized.replace(supportMaterialPattern, " ");
  // Persiane e avvolgibili sono gia stati isolati in una riga fisica dal
  // parser. Una fattura mista non deve attribuire loro il materiale degli
  // infissi adiacenti.
  const productMaterialContext = persiana || avvolgibile ? normalizedDescription : screeningMaterialContext;
  const materialFamilies = new Set<string>();
  if (/allumini|acciaio|\bferro\b|\bmetal|lamell[ae].{0,40}(?:allumini|acciaio|metal)/.test(productMaterialContext)) materialFamilies.add("metal");
  if (/tessut|\btelo\b|\bpvc\b|cristal|poliestere|acrilic|polimer|tempotest|soltis|dickson/.test(productMaterialContext)) materialFamilies.add("textile_polymer");
  if (/\blegno\b|ligneo/.test(productMaterialContext)) materialFamilies.add("wood");
  const supportMaterialIgnored = supportMaterialMentions.length > 0 && materialFamilies.size > 0;
  const material = materialFamilies.size > 1 ? "Misto"
    : materialFamilies.has("metal") ? "Metallo"
      : materialFamilies.has("textile_polymer") ? "Tessuto"
        : materialFamilies.has("wood") ? "Legno"
          : /zanzarier/.test(normalizedDescription) ? "Misto" : "Tessuto";
  const materialSource = materialFamilies.size ? "invoice_explicit" as const : "authorized_fallback" as const;
  const explicitlyAutomatic = /\bmotore\b|motorizzat|automatic/.test(normalized);
  const explicitlyManual = /\bmanual[ei]\b|arganell|\bmolla\b/.test(normalized);
  const movement = explicitlyAutomatic ? "Automatico" : "Manuale";
  const movementSource = explicitlyAutomatic || explicitlyManual ? "invoice_explicit" as const : "authorized_fallback" as const;
  const common = {
    material, materialSource, movement, movementSource,
    attributeRuleIds: [
      ...(supportMaterialIgnored ? [USER_AUTHORIZED_RULE_IDS.screeningSurfaceMaterialOverSupportStructure] : []),
      ...(materialFamilies.size > 1 ? [USER_AUTHORIZED_RULE_IDS.explicitCompositeScreeningMaterial] : []),
      ...(movementSource === "invoice_explicit" ? [USER_AUTHORIZED_RULE_IDS.explicitMotorizedScreeningMovement] : []),
    ],
    materialAudit: {
      supportMaterialMentions,
      screeningMaterialFamilies: [...materialFamilies].sort(),
      supportMaterialIgnored,
    },
  };
  if (persiana) {
    const contradictoryMaterial = materialFamilies.has("textile_polymer") || materialFamilies.has("wood");
    return {
      ...common,
      material: contradictoryMaterial ? "" : "Metallo",
      materialSource: materialFamilies.has("metal") ? "invoice_explicit" as const : "authorized_fallback" as const,
      supplementaryThermalResistance: 0.17,
      gTot: explicit ? documentedGTot : 0.08,
      source: explicit ? "invoice_explicit" as const : "authorized_fallback" as const,
      ruleId: USER_AUTHORIZED_RULE_IDS.persianaScreening,
    };
  }
  if (avvolgibile) {
    const contradictoryMaterial = materialFamilies.has("textile_polymer") || materialFamilies.has("wood");
    return {
      ...common,
      material: contradictoryMaterial ? "" : "Metallo",
      materialSource: materialFamilies.has("metal") ? "invoice_explicit" as const : "authorized_fallback" as const,
      supplementaryThermalResistance: 0.17,
      gTot: explicit ? documentedGTot : 0.08,
      source: explicit ? "invoice_explicit" as const : "authorized_fallback" as const,
      ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening,
    };
  }
  if (/pergola|pergotenda/.test(normalizedDescription)) return { ...common, gTot: explicit ? documentedGTot : 0.08, source: explicit ? "invoice_explicit" as const : "authorized_fallback" as const, ruleId: USER_AUTHORIZED_RULE_IDS.pergolaScreening };
  if (/zanzarier/.test(normalizedDescription)) return { ...common, gTot: explicit ? documentedGTot : 0.33, source: explicit ? "invoice_explicit" as const : "authorized_fallback" as const, ruleId: USER_AUTHORIZED_RULE_IDS.zanzarieraScreening };
  if (/tenda|venezian|schermatura/.test(normalizedDescription)) return { ...common, gTot: explicit ? documentedGTot : 0.33, source: explicit ? "invoice_explicit" as const : "authorized_fallback" as const, ruleId: USER_AUTHORIZED_RULE_IDS.genericAwningScreening };
  return null;
}

export function resolveInvoiceWorkDates(segments: Array<{ documentDate?: string | null; sourceId: string }>) {
  const dated = segments.filter((segment): segment is { documentDate: string; sourceId: string } => Boolean(segment.documentDate))
    .sort((left, right) => left.documentDate.localeCompare(right.documentDate) || left.sourceId.localeCompare(right.sourceId));
  return {
    startDate: dated[0]?.documentDate ?? null,
    startDateSource: dated[0]?.sourceId ?? null,
    completionDate: dated.at(-1)?.documentDate ?? null,
    completionDateSource: dated.at(-1)?.sourceId ?? null,
  };
}

export function missingExplicitAdvanceInvoiceReferences(segments: Array<{ sourceId: string; documentNumber?: string | null; referencedInvoiceNumbers: string[]; text: string }>) {
  const normalizeNumber = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
  const observed = new Set(segments.map((segment) => normalizeNumber(segment.documentNumber ?? "")).filter(Boolean));
  return segments.flatMap((segment) => {
    if (!/\b(?:fatt(?:ura)?\.?\s*(?:di\s+)?acconto|acconto\s+(?:ricevuto\s+)?(?:rif\.?\s*)?(?:ns\.?\s*)?fatt)/i.test(segment.text)) return [];
    return segment.referencedInvoiceNumbers.filter((reference) => !observed.has(normalizeNumber(reference))).map((reference) => ({ sourceId: segment.sourceId, reference }));
  });
}

export function screeningProductMeasurementEvidenceStatus(invoiceTexts: readonly string[], paperFormTexts: readonly string[] = []) {
  const invoiceCorpus = invoiceTexts.join("\n");
  const productPresent = /\b(?:tend[ae]|pergol[ae]|zanzarier[ae]|persian[ae]|avvolgibil[ei]|tapparell[ae]|schermatur[ae])\b/i.test(invoiceCorpus);
  const paperProductOnly = paperFormTexts.join("\n")
    .replace(/Dimensioni\s+finestra\s+protetta[^\n]*(?:\n\s*[0-9]+\s*[x/×]\s*[0-9]+[^\n]*)?/gi, " ");
  const corpus = `${invoiceCorpus}\n${paperProductOnly}`;
  const explicitDimensions = /\b\d{2,4}\s*[x×]\s*\d{2,4}\s*(?:mm|cm|m)?\b/i.test(corpus)
    || /\b\d{2,4}\s*\/\s*\d{2,4}\s*(?:mm|cm|m)\b/i.test(corpus)
    || /\b(?:L|larghezza)\s*[:=]?\s*\d{2,4}[\s\S]{0,100}?\b(?:H|altezza|SP|sporgenza)\s*[:=]?\s*\d{2,4}\b/i.test(corpus);
  return explicitDimensions ? "present" as const : productPresent ? "missing" as const : "not_applicable" as const;
}

export function isPersianaDimensionPlausible(widthMm: number, heightMm: number): boolean {
  return Number.isFinite(widthMm) && Number.isFinite(heightMm)
    && widthMm >= PERSIANA_MEASURE_LIMITS_MM.width.minimum
    && widthMm <= PERSIANA_MEASURE_LIMITS_MM.width.maximum
    && heightMm >= PERSIANA_MEASURE_LIMITS_MM.height.minimum
    && heightMm <= PERSIANA_MEASURE_LIMITS_MM.height.maximum;
}

type FormScreeningMapping = { declared: JsonObject | null; source: "one_to_one" | "group_inheritance" | "group_invoice_type_override" | null };
export type FormScreeningMappingResult = {
  status: "mapped" | "cardinality_mismatch";
  mappings: FormScreeningMapping[];
  conflictingProductIndexes: number[];
};

const normalizedFamily = (value: string) => {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/zanzarier/.test(normalized) || /^(?:altro|altra_schermatura_solare)$/.test(normalized)) return "zanzariera";
  if (/persian/.test(normalized)) return "persiana";
  if (/avvolgibil|tapparell/.test(normalized)) return "avvolgibile";
  if (/pergola|pergotenda/.test(normalized)) return "pergola";
  if (/cristal|venezian|tend[ae]/.test(normalized)) return "tenda";
  return null;
};

export function resolveFormScreeningMappings(declaredValues: unknown[], productDescriptions: string[]): FormScreeningMappingResult {
  const declared = declaredValues.map(object);
  if (declared.length === productDescriptions.length) return { status: "mapped", mappings: declared.map((value) => ({ declared: value, source: "one_to_one" })), conflictingProductIndexes: [] };
  if (!declared.length || productDescriptions.length < 2 || declared.some((value) => !value)) return { status: "cardinality_mismatch", mappings: productDescriptions.map(() => ({ declared: null, source: null })), conflictingProductIndexes: [] };
  if (declared.length > 1) {
    const mappings: FormScreeningMapping[] = [];
    const conflictingProductIndexes: number[] = [];
    for (const [index, description] of productDescriptions.entries()) {
      const productFamily = normalizedFamily(description);
      const compatible = declared.flatMap((value, declaredIndex) => normalizedFamily(text(value?.tipo_prodotto)) === productFamily ? [declaredIndex] : []);
      if (compatible.length !== 1) {
        mappings.push({ declared: null, source: null });
        conflictingProductIndexes.push(index);
        continue;
      }
      mappings.push({ declared: declared[compatible[0]], source: "group_inheritance" });
    }
    return conflictingProductIndexes.length
      ? { status: "cardinality_mismatch", mappings, conflictingProductIndexes }
      : { status: "mapped", mappings, conflictingProductIndexes: [] };
  }
  const declaredType = text(declared[0]?.tipo_prodotto); const declaredFamily = normalizedFamily(declaredType);
  const conflictingProductIndexes = productDescriptions.flatMap((description, index) => {
    const productFamily = normalizedFamily(description);
    return declaredFamily && productFamily && declaredFamily !== productFamily ? [index] : [];
  });
  return {
    status: "mapped",
    mappings: productDescriptions.map((_, index) => ({
      declared: declared[0],
      source: conflictingProductIndexes.includes(index) ? "group_invoice_type_override" : "group_inheritance",
    })),
    conflictingProductIndexes,
  };
}

export function buildCrmLocalPreflightReport(dossierValue: unknown, customerKey: string, analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>, now: Date, operatorMeasurementResolution?: AprCrmLocalPreflightState["operatorMeasurementResolutions"][number]): AprCrmLocalPreflightReport {
  const dossier = object(dossierValue); const row = object(dossier?.row); const inlineForm = object(row?.dati_form);
  const supplierEvidence = lineaSolePotitoSupplierEvidence(row);
  const paperFormDocuments = analysis.items.filter((item) => item.customerKey === customerKey && item.kind === "additional" && item.state === "analyzed" && item.textPath && existsSync(item.textPath) && isLineaSolePotitoPaperForm(readFileSync(item.textPath, "utf8")));
  const lineaSolePaperForm = supplierEvidence.matched && paperFormDocuments.length > 0;
  const crmTaxCodeCandidate = normalizeCf(row?.cliente_cf);
  const invoiceConfirmsCrmTaxCode = isValidCodiceFiscale(crmTaxCodeCandidate) && analysis.items.some((item) => item.customerKey === customerKey && item.kind === "invoice" && item.state === "analyzed" && item.textPath && existsSync(item.textPath)
    && readFileSync(item.textPath, "utf8").replace(/\s+/g, "").toUpperCase().includes(crmTaxCodeCandidate));
  const parsedPaperForm = lineaSolePaperForm ? parseLineaSolePotitoPaperForm(readFileSync(paperFormDocuments[0].textPath!, "utf8"), {
    name: text(row?.cliente_nome), surname: text(row?.cliente_cognome), taxCode: invoiceConfirmsCrmTaxCode ? crmTaxCodeCandidate : null,
  }) : null;
  const form = inlineForm && Object.keys(inlineForm).length ? inlineForm : object(parsedPaperForm);
  const paperMetadata = object(object(parsedPaperForm)?._lineaSolePotito);
  const paperBirthDateResolution = object(paperMetadata?.birthDateResolution);
  const paperWrappedBirthOcrRepair = paperMetadata?.wrappedBirthOcrRepair === true;
  const paperExplicitScreenings = Array.isArray(paperMetadata?.explicitScreenings) ? paperMetadata.explicitScreenings.map(object) : [];
  const formAvailable = Boolean(form && Object.keys(form).length);
  const blockers: AprCrmLocalPreflightReport["blockers"] = []; const warnings: AprCrmLocalPreflightReport["warnings"] = [];
  const sourceIds: string[] = [];
  const customerDocuments = analysis.items.filter((item) => item.customerKey === customerKey && item.kind === "invoice" && !item.nonFiscalImageExcluded && item.invoiceResult);
  const documentTexts = customerDocuments.map((item) => ({ item, text: item.textPath && existsSync(item.textPath) ? readFileSync(item.textPath, "utf8") : "" }));
  const bankTransferEvidenceKeys = new Set<string>();
  const bankTransfers = documentTexts.flatMap(({ item, text: documentText }) => {
    const evidence = extractBankTransferEvidences(item.documentKey, documentText);
    return evidence.filter((entry) => {
      const identity = entry.transactionReference
        ? `transaction:${entry.transactionReference}`
        : `economic:${entry.principalAmount ?? "unknown"}:${entry.invoiceReference ?? "unknown"}:${entry.taxReliefType ?? "unknown"}`;
      if (bankTransferEvidenceKeys.has(identity)) return false;
      bankTransferEvidenceKeys.add(identity);
      return true;
    });
  });
  // Un allegato CRM puo' contenere nello stesso PDF fatture e bonifici. La
  // presenza di una prova bancaria non rende non fiscale l'intero allegato:
  // segmentiamo sempre il documento e lasciamo passare soltanto i segmenti
  // riconosciuti come fattura/nota di credito. Copie byte-identiche vengono
  // deduplicate prima della segmentazione per non moltiplicare i totali.
  const seenInvoiceFingerprints = new Set<string>();
  const invoiceDocuments = documentTexts.filter(({ item, text: documentText }) => {
    const fingerprint = text(item.textSha256) || sha256(documentText);
    if (seenInvoiceFingerprints.has(fingerprint)) return false;
    seenInvoiceFingerprints.add(fingerprint);
    return true;
  });
  const invoiceSegments = invoiceDocuments.flatMap(({ item, text: documentText }) => splitLocalInvoiceText({
    documentKey: item.documentKey,
    text: documentText,
    extractionMode: item.extractionMode ?? "macos_vision_ocr",
  })).filter((segment) => {
    if (segment.result.documentType !== "invoice" && segment.result.documentType !== "credit_note") return false;
    const bankEvidence = extractBankTransferEvidences(segment.sourceId, segment.text);
    if (!bankEvidence.length) return true;
    // I bonifici spesso citano il numero fattura e il parser documentale puo'
    // quindi etichettarli come invoice. Servono anche marcatori fiscali propri
    // del documento; "Totale operazione" del bonifico non e' sufficiente.
    return /\b(?:totale\s+(?:documento|fattura|imponibile|iva)|riepilogo\s+iva|calcolo\s+fattura|imponibile\s+(?:iva|aliquota))\b/i.test(segment.text);
  });
  const segmentReconciliation = reconcileLocalInvoiceSegments(invoiceSegments);
  const missingAdvanceInvoices = missingExplicitAdvanceInvoiceReferences(invoiceSegments);
  if (missingAdvanceInvoices.length) blockers.push({
    code: "original_invoice_missing_or_unavailable",
    field: "economic_sources",
    reason: `La fattura presente detrae o richiama una fattura di acconto non acquisita (${missingAdvanceInvoices.map((item) => item.reference).join(", ")}); APR non puo ricostruire il totale documentale completo senza la fonte fiscale originaria.`,
    sourceIds: [...new Set(missingAdvanceInvoices.map((item) => item.sourceId))],
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue, USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum, "core-economic-classification", "system-apr-operator-intervention-routing"],
  });
  if (segmentReconciliation.replacedFinancialSourceIds.length) warnings.push({
    code: "explicit_replacement_invoice_superseded",
    reason: `Fatture sostituite integralmente escluse da totale e righe tecniche: ${segmentReconciliation.replacedFinancialSourceIds.join(", ")}; sostituzione esplicita conservata in audit.`,
    appliedRuleIds: ["system-explicit-replacement-invoice-supersession"],
  });
  const combinedTechnical = segmentReconciliation.technicalSegments.length ? combineDocumentResults(segmentReconciliation.technicalSegments.map((segment) => ({ result: segment.result, items: segment.items }))) : null;
  const combinedFinancial = segmentReconciliation.uniqueFinancialSegments.length ? combineDocumentResults(segmentReconciliation.uniqueFinancialSegments.map((segment) => ({ result: segment.result, items: segment.items }))) : null;
  const technicalItems = [...(combinedTechnical?.items ?? [])];
  const existingTechnicalSignatureCounts = new Map<string, number>();
  for (const item of technicalItems) {
    const signature = [item.description, item.widthMm, item.heightMm, item.gTot].join("|");
    existingTechnicalSignatureCounts.set(signature, (existingTechnicalSignatureCounts.get(signature) ?? 0) + 1);
  }
  const supplementalTechnicalItems = analysis.items
    .filter((item) => item.customerKey === customerKey
      && item.state === "analyzed"
      && item.textPath
      && existsSync(item.textPath)
      && item.screeningItems.length === 0
      && item.invoiceResult?.documentType !== "invoice"
      && item.invoiceResult?.documentType !== "credit_note")
    .flatMap((item) => parseScreeningTechnicalSourceText(readFileSync(item.textPath!, "utf8"), item.documentKey))
    .filter((item) => {
      const signature = [item.description, item.widthMm, item.heightMm, item.gTot].join("|");
      const existing = existingTechnicalSignatureCounts.get(signature) ?? 0;
      if (existing > 0) {
        existingTechnicalSignatureCounts.set(signature, existing - 1);
        return false;
      }
      return true;
    });
  if (supplementalTechnicalItems.length) {
    technicalItems.push(...supplementalTechnicalItems);
    warnings.push({
      code: "original_non_fiscal_technical_source_applied",
      reason: `${supplementalTechnicalItems.length} prodotti fisici ricavati da scheda tecnica/preventivo originario; nessun importo della fonte non fiscale e stato usato.`,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality],
    });
  }
  const screeningMeasurementEvidence = screeningProductMeasurementEvidenceStatus(
    invoiceSegments.map((segment) => segment.text),
    paperFormDocuments.map((item) => readFileSync(item.textPath!, "utf8")),
  );
  if (operatorMeasurementResolution && technicalItems.length === 0) {
    const multiplier = operatorMeasurementResolution.unit === "centimeters" ? 10 : 1;
    const widthMm = operatorMeasurementResolution.rawWidth * multiplier;
    const heightMm = operatorMeasurementResolution.rawHeight * multiplier;
    technicalItems.push({ widthMm, heightMm, surfaceM2: Math.round((widthMm * heightMm / 1_000_000) * 1_000) / 1_000, gTot: null, description: operatorMeasurementResolution.description, sourcePath: operatorMeasurementResolution.sourceId });
    warnings.push({ code: "operator_measurement_unit_applied", reason: `Unita' ${operatorMeasurementResolution.unit} applicata solo a questa pratica dalla risposta operatore ${operatorMeasurementResolution.questionId}.`, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume] });
  }
  const financialEvidence = segmentReconciliation.uniqueFinancialSegments.map((segment) => extractLocalInvoiceFinancialEvidence({
    sourceId: segment.sourceId,
    text: segment.text,
    extractionMode: segment.extractionMode,
    documentNumber: segment.documentNumber,
    documentDate: segment.documentDate,
    grossTotal: segment.total,
  }));
  const financialReconciliation = reconcileFinancialEvidence(financialEvidence, { mode: "test", scheme: "ecobonus" });
  const invoiceGrossValues = financialEvidence.map((item) => item.grossTotal);
  const invoiceGrossTotal = invoiceGrossValues.length > 0 && invoiceGrossValues.every((value) => value !== null)
    ? Math.round((invoiceGrossValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) + Number.EPSILON) * 100) / 100 : null;
  const practiceId = text(row?.id);
  const bundledProfessionalExpense = resolveBundledProfessionalExpense(
    segmentReconciliation.uniqueFinancialSegments.map((segment) => ({ sourceId: segment.sourceId, text: segment.text, grossTotal: segment.total })),
    financialReconciliation.usable ? financialReconciliation.total : invoiceGrossTotal,
    CASE_SPECIFIC_FINANCIAL_RESOLUTIONS.find((item) => item.practiceId === practiceId && item.customerKey === customerKey),
  );
  const bankTransferReconciliation = reconcileBankTransfers(invoiceGrossTotal, bankTransfers, financialEvidence.map((item) => item.documentNumber));
  sourceIds.push(...customerDocuments.map((item) => item.documentKey), ...paperFormDocuments.map((item) => item.documentKey));
  if (!formAvailable) blockers.push({ code: "customer_form_missing", field: "customer_form", reason: "Il dossier CRM non contiene un form cliente originario utilizzabile; documenti ENEA storici esclusi.", sourceIds, appliedRuleIds: ["core-form-first"] });
  if (lineaSolePaperForm) warnings.push({ code: "linea_sole_potito_paper_form_accepted", reason: `Modulo cartaceo Linea Sole Potito riconosciuto come form originario da ${paperFormDocuments.map((item) => item.documentKey).join(", ")}.`, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm, "core-form-first"] });
  if (paperBirthDateResolution?.repaired === true) warnings.push({
    code: "paper_form_birth_date_leading_digit_ocr_repaired",
    reason: `Data di nascita OCR ${text(paperBirthDateResolution.observed)} ricostruita come ${text(object(parsedPaperForm)?.richiedente && object(object(parsedPaperForm)?.richiedente)?.data_nascita)}: unica cifra iniziale 1 persa e segmenti data del CF valido concordanti; valore osservato e valore usato conservati in audit.`,
    appliedRuleIds: [PAPER_FORM_BIRTH_DATE_OCR_REPAIR_RULE_ID, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  if (paperWrappedBirthOcrRepair) warnings.push({
    code: "paper_form_birth_date_separator_ocr_repaired",
    reason: `Separatore OCR della data di nascita ricomposto come ${text(object(parsedPaperForm)?.richiedente && object(object(parsedPaperForm)?.richiedente)?.data_nascita)} soltanto dopo concordanza completa col CF valido della fattura; testo originario e valore usato restano auditabili.`,
    appliedRuleIds: [PAPER_FORM_BIRTH_DATE_OCR_REPAIR_RULE_ID, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });

  const requester = object(form?.richiedente); const rawFormCf = normalizeCf(requester?.cf); const rawCrmCf = normalizeCf(row?.cliente_cf);
  const fiscalCodeRepair = repairFiscalCodeSingleOcrConfusable({
    fiscalCode: rawFormCf || rawCrmCf,
    name: text(requester?.nome),
    surname: text(requester?.cognome),
    birthDate: text(requester?.data_nascita).slice(0, 10),
  });
  const formCf = fiscalCodeRepair?.corrected ?? rawFormCf;
  const crmCf = fiscalCodeRepair?.corrected ?? rawCrmCf;
  const documentCf = resolveOriginalDocumentFiscalCode({ customerKey, requester, analysis });
  const coBeneficiaryResolution = resolveCoBeneficiaryFromOriginalInvoices({ customerKey, coOwnership: object(form?.cointestazione), mainDocumentFiscalCode: documentCf, primaryFiscalCodes: [formCf, crmCf], analysis });
  let taxCodeStatus: AprCrmLocalPreflightReport["taxCodeStatus"] = "missing_or_invalid";
  let resolvedTaxCode: string | null = null;
  const resolution = resolveBeneficiaryFiscalCode({ formFiscalCode: formCf, originalDocumentFiscalCode: documentCf.value, documentCoherentWithIdentity: documentCf.status === "verified" });
  if (resolution.source === "form") {
    taxCodeStatus = crmCf && isValidCodiceFiscale(crmCf) && crmCf !== resolution.value ? "conflict" : "verified_form";
    resolvedTaxCode = taxCodeStatus === "verified_form" ? resolution.value : null;
  } else if (resolution.source === "original_document") {
    taxCodeStatus = "verified_original_document";
    resolvedTaxCode = resolution.value;
  } else if (documentCf.status === "conflict") taxCodeStatus = "conflict";
  if (fiscalCodeRepair && resolvedTaxCode === fiscalCodeRepair.corrected) warnings.push({
    code: "fiscal_code_single_ocr_confusable_repaired",
    reason: `CF originario ${fiscalCodeRepair.original} corretto in ${fiscalCodeRepair.corrected}: unica sostituzione OCR confondibile, checksum valido e anagrafica form concordante; entrambi conservati in audit.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  const primaryBeneficiaryResolution = resolvePrimaryBeneficiaryFromOriginalInvoices({ customerKey, taxCode: resolvedTaxCode, analysis });
  if (!resolvedTaxCode) blockers.push({
    code: taxCodeStatus === "conflict" ? "tax_code_conflict" : "tax_code_missing_or_invalid",
    field: "beneficiary.taxCode",
    reason: taxCodeStatus === "conflict" ? "CF validi divergenti tra le fonti originarie o tra form e CRM." : "CF valido e coerente non disponibile nel form o nelle fatture originarie.",
    sourceIds: [customerKey, ...documentCf.sourceIds],
    appliedRuleIds: ["core-form-first", USER_AUTHORIZED_RULE_IDS.validOriginalDocumentFiscalCode, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  if (primaryBeneficiaryResolution.status === "conflict") blockers.push({
    code: "primary_beneficiary_invoice_identity_conflict",
    field: "beneficiary.identity",
    reason: "Le fatture originarie riportano identita anagrafiche diverse per lo stesso CF; la precedenza fattura non e applicabile senza intervento operatore.",
    sourceIds: primaryBeneficiaryResolution.sourceIds,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, "system-apr-operator-intervention-routing"],
  });
  if (primaryBeneficiaryResolution.status === "verified_invoice" && primaryBeneficiaryResolution.identity
    && (normalizedIdentityText(text(requester?.nome)) !== normalizedIdentityText(primaryBeneficiaryResolution.identity.name)
      || normalizedIdentityText(text(requester?.cognome)) !== normalizedIdentityText(primaryBeneficiaryResolution.identity.surname))) warnings.push({
    code: "primary_beneficiary_identity_overridden_by_invoice",
    reason: `Identita principale ricavata dalla fattura per il CF verificato: ${primaryBeneficiaryResolution.identity.name} ${primaryBeneficiaryResolution.identity.surname}; prevale sul form cliente.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  const normalizedBirthPlace = text(requester?.comune_nascita)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("it");
  const birthProvinceNation = birthNationFromProvince(text(requester?.provincia_nascita)).value;
  const birthPlaceExplicitlyForeign = /^(?:estero|stato estero|nato(?:\/a)? all['’]?estero)$/.test(normalizedBirthPlace);
  const fiscalCodeBirthPlaceIsForeign = resolvedTaxCode?.slice(11, 12) === "Z";
  const verifiedForeignBirthCountry = resolveForeignBirthCountryFromFiscalCode(resolvedTaxCode);
  if (verifiedForeignBirthCountry) warnings.push({
    code: "birth_country_resolved_from_reliable_belfiore_registry",
    reason: `${verifiedForeignBirthCountry.country} risolta dal codice catastale ${verifiedForeignBirthCountry.placeCode} del CF tramite ${verifiedForeignBirthCountry.sourceAuthority} (${verifiedForeignBirthCountry.sourceId}); la provincia italiana incompatibile del form non prevale.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, USER_AUTHORIZED_RULE_IDS.foreignBirthAnprRegistry, "core-form-first"],
  });
  if (!verifiedForeignBirthCountry && birthProvinceNation === "Italia" && (birthPlaceExplicitlyForeign || fiscalCodeBirthPlaceIsForeign)) blockers.push({
    code: "birth_country_conflict_foreign_place_italian_province",
    field: "beneficiary.birthCountry",
    reason: "Il luogo o il codice fiscale indicano nascita all'estero, ma il form riporta una provincia italiana. APR non imposta Italia: indicare la nazione estera corretta e rimettere la pratica in Pronte da fare.",
    sourceIds: [customerKey, ...documentCf.sourceIds],
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, "core-form-first", "system-apr-operator-intervention-routing"],
  });
  if (coBeneficiaryResolution.status === "excluded_by_invoice") warnings.push({
    code: "co_beneficiary_form_overridden_by_invoice",
    reason: "Il cointestatario dichiarato nel form non compare nelle fatture originarie, che identificano un solo beneficiario: escluso dalla bozza per precedenza della fattura.",
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm],
  });
  if (coBeneficiaryResolution.status === "confirmed_by_invoice") warnings.push({
    code: "co_beneficiary_confirmed_by_invoice",
    reason: "Cointestatario persona fisica confermato dalla fattura originaria: pianificato nel riquadro ENEA Altri beneficiari con verifica idempotente del CF.",
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm, USER_AUTHORIZED_RULE_IDS.invoiceCoBeneficiaryPortalFlow],
  });
  if (coBeneficiaryResolution.status === "unresolved") blockers.push({
    code: "co_beneficiary_invoice_identity_unresolved",
    field: "beneficiary.coBeneficiary",
    reason: "Le fatture non consentono di identificare in modo univoco un solo cointestatario persona fisica con nome, cognome e CF valido; intervento operatore richiesto.",
    sourceIds: coBeneficiaryResolution.sourceIds,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, "system-apr-operator-intervention-routing"],
  });

  const building = object(form?.edificio); const rawUnits = number(building?.numero_appartamenti);
  const declaredBuildingType = text(building?.tipologia);
  const buildingUnitCount = formAvailable ? (rawUnits !== null && rawUnits > 0 ? rawUnits : 1) : null;
  const floorBandBuildingType = declaredBuildingType === "edificio_fino_3_piani" || declaredBuildingType === "edificio_oltre_3_piani";
  const explicitlySingleUnitBuilding = declaredBuildingType === "casa_singola_o_plurifamiliare";
  const buildingQualification = explicitlySingleUnitBuilding || buildingUnitCount === 1
      ? "single_unit" as const
      : buildingUnitCount !== null && buildingUnitCount > 1
        ? "multi_unit" as const
        : null;
  if (formAvailable && (rawUnits === null || rawUnits <= 0)) warnings.push({ code: "building_units_defaulted_to_one", reason: "Numero appartamenti non specificato o zero: impostata una unita immobiliare.", appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.defaultSingleUnitWhenUnspecified, USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification] });
  if (floorBandBuildingType && buildingUnitCount === 1) warnings.push({
    code: "single_unit_over_floor_band",
    reason: "Il form dichiara una sola unita: la fascia fino/oltre tre piani resta descrittiva e non prova condominio o pluralita.",
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification],
  });

  const principalHome = requester?.abitazione_principale;
  const deductionRate = principalHome === false ? 36 as const : null;
  if (principalHome === false) warnings.push({
    code: "secondary_home_36_percent_allocation_planned",
    reason: "Abitazione principale = NO: APR assegnera' l'intero totale congruo 2025-2026 alla colonna 36%, verifichera' 50%=0 e totale invariato dopo l'unico Salva.",
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.secondaryHome36PercentAllocation, "system-atomic-checkpoint-resume"],
  });

  const declaredScreenings = object(form?.prodotto) && Array.isArray(object(form?.prodotto)?.schermature) ? object(form?.prodotto)!.schermature as unknown[] : [];
  const formMappings = resolveFormScreeningMappings(declaredScreenings, technicalItems.map((item) => item.description));
  if (declaredScreenings.length > 0 && formMappings.status === "cardinality_mismatch") blockers.push({ code: "product_cardinality_form_invoice_mismatch", field: "screenings.quantity", reason: `Controllo incrociato ripetuto: il form descrive ${declaredScreenings.length} righe e le fatture ${technicalItems.length} prodotti fisici non riconciliabili in modo univoco per famiglia. Richiesto intervento operatore: confermare la cardinalita fisica e l'assegnazione degli attributi form.`, sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.formGroupProductInheritance, "system-apr-operator-intervention-routing"] });
  if (declaredScreenings.length > 0 && declaredScreenings.length !== technicalItems.length && formMappings.status === "mapped") warnings.push({
    code: "product_cardinality_form_invoice_difference_resolved",
    reason: `Controllo incrociato ripetuto: form ${declaredScreenings.length} righe/gruppi, fatture ${technicalItems.length} prodotti fisici. La differenza e risolta in modo univoco dalla quantita esplicita di fattura e dall'eredita del solo gruppo form compatibile; piano APR richiesto: ${technicalItems.length} righe distinte.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.formGroupProductInheritance],
  });
  const products: ProductPlanRow[] = [];
  for (const [index, item] of technicalItems.entries()) {
    const sourceContext = segmentReconciliation.technicalSegments.find((segment) => segment.sourceId === item.sourcePath)?.text ?? "";
    // Nei saldi LM possono convivere gruppi motorizzati, manuali e zanzariere.
    // Il parser ha gia associato il movimento al singolo gruppo: passare qui
    // l'intera fattura contaminerebbe ogni riga con il motore di un'altra.
    const attributeContext = /\bLM\s+TENDE\s+DA\s+SOLE\s+E\s+ZANZARIERE\b/i.test(sourceContext)
      ? item.description
      : sourceContext;
    const persianaDescription = /\bpersian[ae]\b/i.test(item.description);
    const avvolgibileDescription = /\b(?:avvolgibil[ei]|tapparell[ae])\b/i.test(item.description);
    const shutterContractDescription = persianaDescription || avvolgibileDescription;
    const shutterRuleId = avvolgibileDescription ? USER_AUTHORIZED_RULE_IDS.avvolgibileScreening : USER_AUTHORIZED_RULE_IDS.persianaScreening;
    const shutterLabel = avvolgibileDescription ? "avvolgibile" : "persiana";
    if (shutterContractDescription && !isPersianaDimensionPlausible(item.widthMm, item.heightMm)) {
      blockers.push({ code: `${shutterLabel}_measurement_ambiguous_${index + 1}`, field: `screenings.${index + 1}.dimensions`, reason: `Misura ${shutterLabel} ${item.widthMm}×${item.heightMm} mm fuori dai limiti ampi di plausibilita refuso (larghezza 500-4000 mm, altezza 450-3200 mm). Richiesto intervento operatore senza inventare conversioni.`, sourceIds: [item.sourcePath], appliedRuleIds: [shutterRuleId, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, "system-apr-operator-intervention-routing"] });
      continue;
    }
    const rule = resolveProductTechnicalAttributes(item.description, attributeContext, item.gTot); const mapping = formMappings.mappings[index] ?? { declared: null, source: null }; const declared = mapping.declared;
    if (!rule) {
      if (/\b(?:vepa|vetrat[ae]\s+scorrevol[ei])\b/i.test(item.description)) blockers.push({ code: `vepa_module_not_enabled_${index + 1}`, field: `screenings.${index + 1}.type`, reason: "Vetrata scorrevole/VEPA riconosciuta e conservata 1:1, ma il modulo APR VEPA non è ancora abilitato: pratica parcheggiata senza classificazione ENEA.", sourceIds: [item.sourcePath], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.vepaDeferredCurrentPhase, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, "system-apr-operator-intervention-routing"] });
      else blockers.push({ code: `product_unclassified_${index + 1}`, field: `screenings.${index + 1}.type`, reason: "Prodotto non qualificabile senza inventare una classificazione.", sourceIds: [item.sourcePath], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality] });
      continue;
    }
    if (shutterContractDescription && !rule.material) {
      blockers.push({ code: `${shutterLabel}_material_contradiction_${index + 1}`, field: `screenings.${index + 1}.material`, reason: `La fonte originaria attribuisce all${avvolgibileDescription ? "'avvolgibile" : "a persiana"} un materiale contrario al contratto autorizzato alluminio/Metallo. Richiesto intervento operatore.`, sourceIds: [item.sourcePath], appliedRuleIds: [shutterRuleId, "system-apr-operator-intervention-routing"] });
      continue;
    }
    const productRowId = `${item.sourcePath}:piece-${index + 1}`;
    const lineaSoleExposure = lineaSolePaperForm ? resolveLineaSolePotitoExposure(text(declared?.direzione) || null) : null;
    const explicitPaperWindow = number(paperExplicitScreenings[index]?.protectedWindowSurfaceM2);
    const lineaSoleWindow = lineaSolePaperForm ? resolveLineaSolePotitoProtectedWindowSurface({ practiceId: text(row?.id) || customerKey, rowId: productRowId, explicitValue: explicitPaperWindow }) : null;
    products.push({ rowId: productRowId, sourceDocumentKey: item.sourcePath, description: item.description, pieceNumber: index + 1,
      widthMm: item.widthMm, heightMm: item.heightMm, surfaceM2: item.surfaceM2, exposure: lineaSoleExposure?.value ?? (text(declared?.direzione) || null), exposureSource: lineaSoleExposure?.source ?? null,
      protectedWindowSurfaceM2: shutterContractDescription ? item.surfaceM2 : lineaSoleWindow?.value ?? null,
      protectedWindowSurfaceSource: shutterContractDescription ? "derived_product_surface" : lineaSoleWindow?.source ?? null,
      supplementaryThermalResistance: shutterContractDescription ? 0.17 : null,
      declaredType: avvolgibileDescription ? "avvolgibile" : persianaDescription ? "persiana" : text(declared?.tipo_prodotto) || null, formMappingSource: mapping.source,
      gTot: rule.gTot, gTotSource: rule.source, material: rule.material, materialSource: rule.materialSource, movement: rule.movement, movementSource: rule.movementSource,
      appliedRuleIds: [rule.ruleId, ...rule.attributeRuleIds, "authorized-22-schermature-materiale", "authorized-16-schermature-meccanismo", USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.formInvoicePortalCardinalityCrossCheck,
        USER_AUTHORIZED_RULE_IDS.explicitTechnicalSurfacePrecision,
        ...(lineaSolePaperForm ? [USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm] : []),
        ...(/^(?:Pergotenda|Tenda Cristal|Tenda da sole|Tenda perimetrale) - /.test(item.description) ? [USER_AUTHORIZED_RULE_IDS.narrativeInvoiceProductExtraction] : []),
        ...(mapping.source === "group_inheritance" || mapping.source === "group_invoice_type_override" ? [USER_AUTHORIZED_RULE_IDS.formGroupProductInheritance] : [])] });
  }
  if (!products.length && !blockers.some((item) => /^vepa_module_not_enabled_/.test(item.code))) blockers.push({ code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato dalle fatture originarie.", sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality] });

  const declaredInvoiceSources = Array.isArray(row?.fatture_urls) ? row.fatture_urls.filter((value) => text(value)).map((value) => text(value)) : [];
  if (invoiceDocuments.length === 0) blockers.push({
    code: "original_invoice_missing_or_unavailable",
    field: "economic_sources.invoice",
    reason: declaredInvoiceSources.length
      ? "La fattura originaria dichiarata non e' acquisibile come documento valido: Richiesto intervento operatore. Dopo il nuovo allegato e il ritorno in Pronte da fare APR rieseguira' la pratica."
      : "Fattura originaria mancante: Richiesto intervento operatore. Dopo il caricamento e il ritorno in Pronte da fare APR rieseguira' la pratica.",
    sourceIds: declaredInvoiceSources,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue, "system-apr-operator-intervention-routing", "system-atomic-checkpoint-resume"],
  });

  if (bankTransferReconciliation.status === "principal_exceeds_invoices") blockers.push({
    code: "bank_transfer_principal_exceeds_invoices",
    field: "economic_sources.bankTransfers",
    reason: `Il capitale bonificato supera le fatture di € ${bankTransferReconciliation.difference?.toFixed(2)}: intervento operatore richiesto.`,
    sourceIds: bankTransfers.map((item) => item.sourceId),
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers, "system-apr-operator-intervention-routing"],
  });
  if (bankTransferReconciliation.status === "unverified") blockers.push({
    code: "bank_transfer_invoice_cross_check_failed",
    field: "economic_sources.bankTransfers",
    reason: `Controllo incrociato bonifici/fatture non conclusivo: capitale non leggibile, lordo fatture € ${invoiceGrossTotal?.toFixed(2) ?? "non verificato"}, riferimenti mancanti ${bankTransferReconciliation.missingInvoiceReferences.join(", ") || "nessuno"}. Richiesto intervento operatore; nessun totale viene inventato.`,
    sourceIds: bankTransfers.map((item) => item.sourceId),
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck, USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers, "system-apr-operator-intervention-routing"],
  });
  if ((["principal_below_invoices", "reconciled"].includes(bankTransferReconciliation.status)
    && bankTransferReconciliation.referenceStatus === "incomplete")
    || bankTransferReconciliation.status === "principal_below_invoices") warnings.push({
    code: "bank_transfer_below_invoice_total_audited_nonblocking",
    reason: `Capitale bonificato € ${bankTransferReconciliation.principalTotal?.toFixed(2) ?? "non leggibile"} non superiore al totale fatture € ${invoiceGrossTotal?.toFixed(2) ?? "non verificato"}; riferimenti mancanti ${bankTransferReconciliation.missingInvoiceReferences.join(", ") || "nessuno"}. Il totale fatture IVA incluso resta autorevole e la differenza e auditata senza bloccare.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers, USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck],
  });
  if (bankTransferReconciliation.taxReliefTypes.includes("building_renovation")) warnings.push({
    code: "bank_transfer_tax_relief_label_audited_nonblocking",
    reason: "La dicitura Ristrutturazione edilizia/Art. 16-bis e conservata nell'audit ma, da sola, non blocca la pratica Ecobonus e non modifica gli importi. Restano obbligatori tutti gli altri controlli del bonifico.",
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.bankTransferTaxReliefLabelNonBlocking, USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck],
  });
  if (bankTransferReconciliation.status === "reconciled" && (bankTransferReconciliation.feesTotal ?? 0) > 0) warnings.push({
    code: "bank_fees_excluded_invoice_total_authoritative",
    reason: `Commissioni bancarie € ${bankTransferReconciliation.feesTotal?.toFixed(2)} escluse; il totale fatture resta l'importo ENEA autorevole.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers, "core-economic-classification"],
  });
  if (bundledProfessionalExpense.status === "operator_required") blockers.push({
    code: "bundled_professional_expense_unitemized",
    field: "economic_sources.eligibleTechnicalExpense",
    reason: `Le fatture includono «${bundledProfessionalExpense.markers.map((item) => item.text).join(" · ")}» ma non quantificano separatamente il servizio. Lordo € ${invoiceGrossTotal?.toFixed(2) ?? "non verificato"}: indicare la sola spesa tecnica; APR non usera il lordo alla cieca.`,
    sourceIds: bundledProfessionalExpense.markers.map((item) => item.sourceId),
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation, "system-apr-operator-intervention-routing", "system-atomic-checkpoint-resume"],
  });
  if (bundledProfessionalExpense.status === "resolved_case_specific") warnings.push({
    code: "bundled_professional_expense_case_specific_resolution",
    reason: `Risoluzione caso-specifica auditata: lordo € ${bundledProfessionalExpense.resolution.grossInvoiceTotal.toFixed(2)}, spesa tecnica € ${bundledProfessionalExpense.eligibleTechnicalExpense.toFixed(2)}, differenza esclusa ma non classificata dalle fonti € ${bundledProfessionalExpense.excludedUnclassifiedExpense.toFixed(2)}. Non propagabile ad altre pratiche.`,
    appliedRuleIds: bundledProfessionalExpense.resolution.appliedRuleIds,
  });
  if (bundledProfessionalExpense.status === "resolved_documented_separation") warnings.push({
    code: "professional_expense_separate_invoice_excluded",
    reason: `Servizio professionale documentato da fattura separata: € ${bundledProfessionalExpense.excludedUnclassifiedExpense.toFixed(2)} esclusi; spesa tecnica IVA inclusa € ${bundledProfessionalExpense.eligibleTechnicalExpense.toFixed(2)}.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation, USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded],
  });

  const invoiceWorkDates = resolveInvoiceWorkDates(segmentReconciliation.uniqueFinancialSegments);
  const startDate = invoiceWorkDates.startDate ?? combinedFinancial?.firstInvoiceDate ?? null;
  const startDateSource = invoiceWorkDates.startDateSource
    ?? combinedFinancial?.documents.find((document) => document.documentDate === combinedFinancial.firstInvoiceDate)?.path ?? null;
  const explicitCompletion = text(row?.data_fine_lavori) || text(form?.fine_lavori);
  const completionDate = explicitCompletion || invoiceWorkDates.completionDate || combinedFinancial?.lastInvoiceDate || null;
  const completionDateSource = explicitCompletion ? customerKey : invoiceWorkDates.completionDateSource
    ?? combinedFinancial?.documents.filter((document) => document.documentDate === combinedFinancial.lastInvoiceDate).at(-1)?.path ?? null;
  if (!completionDate) blockers.push({ code: "completion_date_missing", field: "dates.completion", reason: "Fine lavori assente e data fattura non ricavabile.", sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.missingCompletionDate] });
  else {
    const deadline = assessEnea2026SubmissionDeadline(startDate, completionDate, now);
    blockers.push(...completionDateOperatorBlockers(completionDate, completionDateSource, Boolean(explicitCompletion), now, startDate, startDateSource));
    if (deadline.specialWindowApplied) warnings.push({
      code: "enea_2026_june_25_ninety_day_window_applied",
      reason: `Avviso ENEA 25/06/2026 applicato: inizio lavori ${startDate}, fine lavori ${completionDate}; i 90 giorni decorrono dal 25/06/2026 e terminano il 23/09/2026.`,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.enea2026June25NinetyDayWindow],
    });
  }

  for (const message of combinedFinancial?.blockers ?? []) {
    if (technicalItems.length > 0 && /Nessuna riga di schermatura con dimensioni/i.test(message)) continue;
    blockers.push(screeningMeasurementEvidence === "missing" && /Nessuna riga di schermatura con dimensioni/i.test(message)
      ? { code: "screening_primary_measurements_missing", field: "screenings.dimensions", reason: "La fattura descrive la schermatura ma nessuna fonte primaria riporta le misure fisiche del prodotto. APR non usa le misure della finestra protetta come misure del prodotto: acquisire o confermare le misure e rimettere la pratica in Pronte da fare.", sourceIds, appliedRuleIds: ["system-screening-primary-measurements-operator-routing", USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, "system-apr-operator-intervention-routing"] }
      : { code: `invoice_${sha256(message).slice(0, 8)}`, field: "economic_sources", reason: message, sourceIds, appliedRuleIds: ["core-economic-classification"] });
  }
  if (!financialReconciliation.usable) blockers.push({ code: "gross_triple_reconciliation_failed", field: "economic_sources.total", reason: `Tripla riconciliazione non dimostrata: ${financialReconciliation.blockers.length ? financialReconciliation.blockers.join(", ") : financialReconciliation.methods.filter((method) => !method.ok).map((method) => method.reason).join(", ")}.`, sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded, "core-gross-triple-reconciliation", ...financialReconciliation.appliedRuleIds] });
  const uniqueBlockers = blockers.filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code) === index);
  const financialEligibleForEnea = financialReconciliation.usable && bundledProfessionalExpense.status !== "operator_required";
  // Conservare la ripartizione economica auditata anche quando un controllo
  // indipendente (per esempio il tipo fiscale del bonifico) blocca la pratica.
  // Il gate resta chiuso tramite tripleReconciliationVerified/blockers, ma la
  // dashboard non deve perdere il valore tecnico verificato e tornare al lordo.
  const eligibleTechnicalExpense = bundledProfessionalExpense.status !== "operator_required"
    ? bundledProfessionalExpense.eligibleTechnicalExpense : null;
  const baseEneaPayloadAudit = buildCrmEneaPayloadAudit({
    customerKey,
    dossierValue: dossier && row && form ? { ...dossier, row: { ...row, dati_form: form } } : dossierValue,
    resolvedTaxCode,
    resolvedPrimaryBeneficiary: primaryBeneficiaryResolution.status === "verified_invoice" ? primaryBeneficiaryResolution.identity : null,
    resolvedPrimaryBeneficiarySourceIds: primaryBeneficiaryResolution.sourceIds,
    startDate,
    startDateSource,
    completionDate,
    products,
    financialVerified: financialEligibleForEnea,
    reconciledTotal: eligibleTechnicalExpense,
    resolvedBuildingUnitCount: buildingUnitCount,
    resolvedBuildingQualification: buildingQualification,
    resolvedCoBeneficiaryPresent: coBeneficiaryResolution.present,
    resolvedCoBeneficiary: coBeneficiaryResolution.identity ? { ...coBeneficiaryResolution.identity, sourceIds: coBeneficiaryResolution.sourceIds } : null,
    analysis,
  });
  const eneaPayloadAudit = invalidateCrmEneaPayloadAuditForScreeningBlockers(baseEneaPayloadAudit, uniqueBlockers);
  const finalBlockers = [...uniqueBlockers];
  if (finalBlockers.length === 0 && !eneaPayloadAudit.draftReady) finalBlockers.push({
    code: "draft_payload_mapping_incomplete",
    field: "enea_payload",
    reason: `Il preflight delle fonti non presenta conflitti, ma il payload ENEA non e completo: ${eneaPayloadAudit.blockers.map((item) => item.message).join("; ") || eneaPayloadAudit.portalGate.reason}. Correggere il mapping locale prima di accodare la pratica; nessuna azione esterna consentita.`,
    sourceIds,
    appliedRuleIds: ["system-draft-payload-mapping-completeness", "system-apr-technical-repair-queue", "core-mapping-complete"],
  });
  const ready = finalBlockers.length === 0;
  return { outcome: ready ? "ready_local_plan" : "blocked_case", formAvailable, startDate, startDateSource, completionDate, completionDateSource, buildingQualification, buildingUnitCount, deductionRate, taxCodeStatus, resolvedTaxCode, taxCodeSourceIds: taxCodeStatus === "verified_original_document" ? documentCf.sourceIds : [customerKey], primaryBeneficiaryResolution, coBeneficiaryResolution, products,
    financial: {
      // I prodotti tecnici possono essere superseduti tra acconto e saldo,
      // mentre gli importi fiscali restano tutte le fatture uniche. Non usare
      // quindi il sottoinsieme tecnico per il totale economico.
      invoiceTotal: invoiceGrossTotal, eligibleExpense: eligibleTechnicalExpense,
      tripleReconciliationVerified: financialEligibleForEnea, reconciledTotal: eligibleTechnicalExpense,
      evidence: financialEvidence.map(({ sourceId, kind, taxableAmount, vatAmount, grossTotal, interventionGrossAmount, extractionConfidence }) => ({ sourceId, kind, taxableAmount, vatAmount, grossTotal, interventionGrossAmount, extractionConfidence })),
      bankTransfers,
      bankTransferReconciliation,
      methods: financialReconciliation.methods.map((method) => ({ ...method })),
      discardedDuplicateSourceIds: [...new Set([...segmentReconciliation.discardedDuplicateSourceIds, ...financialReconciliation.discardedDuplicateSourceIds])],
      supersededTechnicalSourceIds: segmentReconciliation.supersededTechnicalSourceIds,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded, USER_AUTHORIZED_RULE_IDS.bundledProfessionalExpenseSeparation, USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck, "core-gross-triple-reconciliation", USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, ...(segmentReconciliation.discardedDuplicateSourceIds.length ? ["system-invoice-header-identity-over-body-reference"] : []), ...(segmentReconciliation.replacedFinancialSourceIds.length ? ["system-explicit-replacement-invoice-supersession"] : []), ...financialReconciliation.appliedRuleIds],
    }, warnings, blockers: finalBlockers, sourceIds, eneaPayloadAudit,
    draftPlan: { status: ready ? "ready_before_external_action" : "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false,
      nextAction: ready ? "Piano locale pronto; fermo prima di ENEA." : uniqueBlockers.some((item) => item.code === "original_invoice_missing_or_unavailable") ? "Richiesto intervento operatore: acquisire la fattura; al ritorno in Pronte da fare APR riprende dal nuovo fingerprint." : "Risolvere i blocker con sole fonti originarie; la coda prosegue sugli altri casi." } };
}

function initialState(now: Date): AprCrmLocalPreflightState { const reason = "Preflight CRM locale non preparato."; return { version: APR_CRM_LOCAL_PREFLIGHT_VERSION, revision: 0, status: "unprepared", sourceFingerprint: null, currentCustomerKey: null, items: [], externalActionAllowed: false, reason, nextAction: "Attendere dossier e analisi documenti completi.", validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [{ revision: 0, at: now.toISOString(), type: "initialized", customerKey: null, reason, appliedRuleIds: BASE_RULE_IDS }] }; }

export class PersistentAprCrmLocalPreflight {
  readonly directory: string; readonly checkpointPath: string;
  constructor(readonly rootDirectory: string, readonly documentAnalysis: PersistentAprCrmDocumentAnalysis) { this.directory = path.join(path.resolve(rootDirectory), "crm-local-preflight"); this.checkpointPath = path.join(this.directory, "checkpoint.json"); }
  load(now = new Date()) { if (!existsSync(this.checkpointPath)) return initialState(now); try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmLocalPreflightState; value.validationRevisionsApplied ??= []; value.sourceRevisionsApplied ??= []; value.operatorMeasurementResolutions ??= []; return value.version === APR_CRM_LOCAL_PREFLIGHT_VERSION && value.externalActionAllowed === false && value.audit.every((event) => event.appliedRuleIds.every((id) => registryRule(id)) ) ? value : initialState(now); } catch { return initialState(now); } }
  private write(state: AprCrmLocalPreflightState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  prepare(acquired: AprCrmAcquisitionItem[], sourceFingerprint: string, now = new Date()) {
    const current = this.initialize(now); if (current.sourceFingerprint === sourceFingerprint) return current; if (current.sourceFingerprint) throw new Error("crm_local_preflight_source_immutable");
    if (acquired.length < 1 || acquired.length > 40 || acquired.some((item) => item.state !== "acquired" || !item.practiceId || !item.dossierPath || !existsSync(item.dossierPath))) throw new Error("crm_local_preflight_source_invalid");
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.sourceFingerprint = sourceFingerprint;
    next.items = acquired.map((item) => ({ customerKey: item.customerKey, displayName: item.displayName, practiceId: item.practiceId!, dossierPath: item.dossierPath!, state: "queued", attemptCount: 0, startedAt: null, endedAt: null, report: null, reason: "In coda per preflight esclusivamente locale.", disposition: null }));
    next.reason = `${acquired.length} dossier acquisiti preparati per preflight locale sequenziale; i casi bloccati a monte non fermano la coda.`; next.nextAction = "Elaborare una pratica alla volta; nessuna azione CRM o ENEA."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "prepared", customerKey: null, reason: next.reason, appliedRuleIds: BASE_RULE_IDS }); return this.write(next);
  }
  applySourceRevision(acquired: AprCrmAcquisitionItem[], sourceFingerprint: string, sourceRevision: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.sourceFingerprint === sourceFingerprint) return current;
    if (current.sourceRevisionsApplied.includes(sourceRevision)) throw new Error("crm_local_preflight_source_revision_mismatch");
    if (!/^[a-f0-9]{64}$/.test(sourceFingerprint) || !/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(sourceRevision)) throw new Error("crm_local_preflight_source_revision_invalid");
    if (current.status !== "completed" || current.items.some((item) => item.state === "queued" || item.state === "processing")) throw new Error("crm_local_preflight_source_revision_not_terminal");
    const acquiredByKey = new Map(acquired.filter((item) => item.state === "acquired" && item.practiceId && item.dossierPath && existsSync(item.dossierPath)).map((item) => [item.customerKey, item]));
    if (acquiredByKey.size < current.items.length || current.items.some((item) => !acquiredByKey.has(item.customerKey))) throw new Error("crm_local_preflight_source_revision_set_mismatch");
    const next = structuredClone(current); next.revision += 1; next.sourceFingerprint = sourceFingerprint; next.sourceRevisionsApplied.push(sourceRevision);
    for (const item of next.items) {
      if (item.state === "deferred_operator") continue;
      const acquiredItem = acquiredByKey.get(item.customerKey)!;
      const report = buildCrmLocalPreflightReport(JSON.parse(readFileSync(acquiredItem.dossierPath!, "utf8")), item.customerKey, this.documentAnalysis.snapshot(now), now, next.operatorMeasurementResolutions.find((entry) => entry.customerKey === item.customerKey));
      item.report = report; item.state = report.outcome; item.reason = report.outcome === "ready_local_plan" ? "Piano bozza locale pronto dopo revisione fonti; azioni esterne ancora bloccate." : `${report.blockers.length} blocker per-pratica dopo revisione fonti; coda conservata.`;
    }
    const existingKeys = new Set(next.items.map((item) => item.customerKey));
    for (const acquiredItem of acquiredByKey.values()) if (!existingKeys.has(acquiredItem.customerKey)) {
      next.items.push({ customerKey: acquiredItem.customerKey, displayName: acquiredItem.displayName, practiceId: acquiredItem.practiceId!, dossierPath: acquiredItem.dossierPath!, state: "queued", attemptCount: 0, startedAt: null, endedAt: null, report: null, reason: "In coda dopo correzione identita operatore.", disposition: null });
    }
    if (next.items.some((item) => item.state === "queued" || item.state === "processing")) next.status = "queued";
    const ready = next.items.filter((item) => item.state === "ready_local_plan").length; const blocked = next.items.filter((item) => item.state === "blocked_case").length; const deferred = next.items.filter((item) => item.state === "deferred_operator").length;
    next.reason = `Revisione fonti ${sourceRevision} applicata localmente: ${ready} pronti, ${blocked} bloccati, ${deferred} accantonati, ${next.items.filter((item) => item.state === "queued").length} nuovi casi in coda; nessuna azione esterna.`;
    next.nextAction = "Usare esclusivamente i nuovi fingerprint e report; non riusare checkpoint operativi precedenti.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "source_revision_applied", customerKey: null, reason: next.reason, appliedRuleIds: BASE_RULE_IDS });
    return this.write(next);
  }
  tick(now = new Date()) {
    let current = this.load(now); if (current.status === "unprepared" || current.status === "completed") return current;
    let item = current.items.find((candidate) => candidate.state === "processing");
    if (!item) { const index = current.items.findIndex((candidate) => candidate.state === "queued"); if (index < 0) return this.complete(now); const next = structuredClone(current); item = next.items[index]; next.revision += 1; next.status = "running"; next.currentCustomerKey = item.customerKey; item.state = "processing"; item.attemptCount += 1; item.startedAt ??= now.toISOString(); item.reason = "Preflight locale reclamato; ripresa idempotente dopo riavvio."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "claimed", customerKey: item.customerKey, reason: item.reason, appliedRuleIds: BASE_RULE_IDS }); this.write(next); current = next; }
    const report = buildCrmLocalPreflightReport(JSON.parse(readFileSync(item.dossierPath, "utf8")), item.customerKey, this.documentAnalysis.snapshot(now), now, current.operatorMeasurementResolutions.find((entry) => entry.customerKey === item!.customerKey));
    const next = structuredClone(this.load(now)); const target = next.items.find((candidate) => candidate.customerKey === item!.customerKey)!; next.revision += 1; target.state = report.outcome; target.report = report; target.endedAt = now.toISOString(); target.reason = report.outcome === "ready_local_plan" ? "Piano bozza locale pronto; azioni esterne bloccate." : `${report.blockers.length} blocker per-pratica registrati; coda prosegue.`; next.currentCustomerKey = null; next.reason = `${target.displayName}: ${target.reason}`; next.nextAction = "Proseguire con il caso successivo senza aprire ENEA."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: report.outcome === "ready_local_plan" ? "case_ready" : "case_blocked", customerKey: target.customerKey, reason: target.reason, appliedRuleIds: [...new Set([...BASE_RULE_IDS, ...report.financial.appliedRuleIds, ...report.products.flatMap((product) => product.appliedRuleIds), ...report.blockers.flatMap((blocker) => blocker.appliedRuleIds), ...report.warnings.flatMap((warning) => warning.appliedRuleIds)])] }); this.write(next);
    return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "processing") ? next : this.complete(now);
  }
  runToCompletion(now = new Date(), maximumTicks = 256) {
    let state = this.load(now);
    for (let tick = 0; tick < maximumTicks && state.status !== "completed"; tick += 1) {
      state = this.tick(new Date(now.getTime() + (tick + 1) * 1_000));
    }
    if (state.status !== "completed") throw new Error("crm_local_preflight_did_not_complete");
    return state;
  }
  applyValidationRevision(validationRevision: string, now = new Date()) {
    const current = this.initialize(now); if (current.validationRevisionsApplied.includes(validationRevision) || current.status !== "completed") return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(validationRevision)) throw new Error("crm_local_preflight_validation_revision_invalid");
    const analysis = this.documentAnalysis.snapshot(now); const next = structuredClone(current); next.revision += 1;
    for (const item of next.items) {
      if (item.state === "deferred_operator") continue;
      const report = buildCrmLocalPreflightReport(JSON.parse(readFileSync(item.dossierPath, "utf8")), item.customerKey, analysis, now, next.operatorMeasurementResolutions.find((entry) => entry.customerKey === item.customerKey));
      item.report = report; item.state = report.outcome; item.reason = report.outcome === "ready_local_plan" ? "Piano bozza locale pronto; azioni esterne bloccate." : `${report.blockers.length} blocker per-pratica registrati; coda conclusa senza perdita.`;
    }
    next.validationRevisionsApplied.push(validationRevision); const ready = next.items.filter((item) => item.state === "ready_local_plan").length; const blocked = next.items.filter((item) => item.state === "blocked_case").length; const deferred = next.items.filter((item) => item.state === "deferred_operator").length;
    next.reason = `Validazione ${validationRevision} applicata: ${ready} piani locali pronti, ${blocked} casi bloccati, ${deferred} accantonati; nessuna azione esterna.`;
    next.nextAction = "Mostrare riconciliazione e blocker residui in dashboard; ENEA resta chiusa.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "validation_recomputed", customerKey: null, reason: next.reason, appliedRuleIds: [...new Set([
      ...BASE_RULE_IDS,
      ...next.items.flatMap((item) => item.report?.financial.appliedRuleIds ?? []),
      ...next.items.flatMap((item) => item.report?.products.flatMap((product) => product.appliedRuleIds) ?? []),
      ...next.items.flatMap((item) => item.report?.blockers.flatMap((blocker) => blocker.appliedRuleIds) ?? []),
      ...next.items.flatMap((item) => item.report?.warnings.flatMap((warning) => warning.appliedRuleIds) ?? []),
    ])] });
    return this.write(next);
  }
  deferCiottaForPilot(commandId: string, reason: string, now = new Date()) {
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(commandId)) throw new Error("crm_local_preflight_defer_command_invalid");
    const current = this.initialize(now); const existing = current.items.find((item) => item.customerKey === "beatrice-ciotta");
    if (!existing) throw new Error("crm_local_preflight_ciotta_not_found");
    if (existing.disposition?.commandId === commandId && existing.state === "deferred_operator") return current;
    if (existing.state === "queued" || existing.state === "processing") throw new Error("crm_local_preflight_ciotta_not_terminal");
    const next = structuredClone(current); const target = next.items.find((item) => item.customerKey === "beatrice-ciotta")!; const previousState = target.state; next.revision += 1;
    target.state = "deferred_operator"; target.disposition = { kind: "user_deferred", commandId, at: now.toISOString(), reason }; target.reason = reason;
    next.reason = `Beatrice Ciotta accantonata dal pilot su istruzione utente; ${next.items.filter((item) => item.state === "ready_local_plan").length} piani locali pronti, nessun caso operativo bloccato.`;
    next.nextAction = "Conservare Beatrice in audit e fermarsi prima di qualunque azione esterna.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "case_deferred", customerKey: target.customerKey, reason: `${previousState}→deferred_operator: ${reason}`, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.ciottaPilotLeaveAside, "system-atomic-checkpoint-resume"] });
    return this.write(next);
  }
  applyOperatorMeasurementResolution(input: { questionId: string; customerKey: string; sourceId: string; description: string; rawWidth: number; rawHeight: number; unit: "millimeters" | "centimeters"; note: string; operatorId: string; commandId: string; answeredAt: string }, now = new Date()) {
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(input.questionId) || !input.sourceId || !input.description.trim() || input.rawWidth <= 0 || input.rawHeight <= 0 || !input.operatorId.trim() || !input.commandId) throw new Error("crm_local_preflight_operator_resolution_invalid");
    const current = this.initialize(now);
    if (current.operatorMeasurementResolutions.some((entry) => entry.commandId === input.commandId)) return current;
    const existing = current.items.find((item) => item.customerKey === input.customerKey);
    if (!existing || existing.state !== "blocked_case") throw new Error("crm_local_preflight_operator_resolution_case_not_blocked");
    const next = structuredClone(current); next.revision += 1;
    next.operatorMeasurementResolutions.push({ ...input, note: input.note.replace(/\s+/g, " ").trim().slice(0, 500), operatorId: input.operatorId.trim().slice(0, 120) });
    const target = next.items.find((item) => item.customerKey === input.customerKey)!;
    target.state = "queued"; target.report = null; target.endedAt = null; target.reason = `Risposta operatore ${input.questionId} applicata al solo campo unita'; pratica riaccodata dal checkpoint.`;
    next.status = "queued"; next.currentCustomerKey = null; next.reason = `${target.displayName}: risposta caso-specifica persistita e pratica riaccodata.`; next.nextAction = "Rieseguire il preflight della stessa pratica; le altre pratiche restano indipendenti.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "operator_resolution_requeued", customerKey: input.customerKey, reason: target.reason, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume, "system-apr-operator-intervention-routing", "system-atomic-checkpoint-resume"] });
    return this.write(next);
  }
  private complete(now: Date) { const current = this.load(now); if (current.status === "completed") return current; const next = structuredClone(current); next.revision += 1; next.status = "completed"; next.currentCustomerKey = null; const ready = next.items.filter((item) => item.state === "ready_local_plan").length; const blocked = next.items.filter((item) => item.state === "blocked_case").length; const deferred = next.items.filter((item) => item.state === "deferred_operator").length; next.reason = `Preflight locale concluso: ${ready} piani pronti, ${blocked} casi bloccati, ${deferred} accantonati; nessuna azione esterna.`; next.nextAction = "Mostrare fonti e blocker in dashboard; ENEA resta chiusa."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed", customerKey: null, reason: next.reason, appliedRuleIds: BASE_RULE_IDS }); return this.write(next); }
  buildDraftExecutionPackage(customerKey: string, now = new Date()) {
    const state = this.load(now);
    const item = state.items.find((candidate) => candidate.customerKey === customerKey);
    if (!item || item.state !== "ready_local_plan" || !item.report || !item.report.eneaPayloadAudit?.draftReady || item.report.eneaPayloadAudit.portalGate.status !== "ready") {
      throw new Error("crm_enea_draft_package_not_ready");
    }
    const dossierValue = JSON.parse(readFileSync(item.dossierPath, "utf8")) as unknown;
    const packageResult = buildCrmEneaDraftPackage({
      customerKey,
      dossierValue,
      resolvedTaxCode: item.report.resolvedTaxCode,
      startDate: item.report.startDate,
      startDateSource: item.report.startDateSource,
      completionDate: item.report.completionDate,
      products: item.report.products,
      financialVerified: item.report.financial.tripleReconciliationVerified,
      reconciledTotal: item.report.financial.reconciledTotal,
      // The executable package must be rebuilt with the same resolved values
      // used by the audited preflight.  Omitting the authorized single-unit
      // default made an already-green case fail only at execution time.
      resolvedBuildingUnitCount: item.report.buildingUnitCount,
      resolvedBuildingQualification: item.report.buildingQualification,
      resolvedCoBeneficiaryPresent: item.report.coBeneficiaryResolution.present,
      resolvedCoBeneficiary: item.report.coBeneficiaryResolution.identity ? { ...item.report.coBeneficiaryResolution.identity, sourceIds: item.report.coBeneficiaryResolution.sourceIds } : null,
      analysis: this.documentAnalysis.snapshot(now),
    });
    if (packageResult.status !== "built" || packageResult.portalGate.status !== "ready") throw new Error("crm_enea_draft_package_rebuild_blocked");
    const mappingFingerprint = fingerprintPreparedPractice(packageResult.mapped, packageResult.issues);
    const controlledCalculationExtension = mappingFingerprint === item.report.eneaPayloadAudit.mappingFingerprint
      && packageResult.portalGate.fingerprint === `${mappingFingerprint}:${item.report.eneaPayloadAudit.requiredPortalFieldCount + 1}:${item.report.eneaPayloadAudit.portalGate.screeningItemCount}`
      && packageResult.portalGate.workflow.preparedFieldIds.includes("schermature.risparmio_energia")
      && packageResult.portalGate.workflow.steps.some(({ id }) => id === "calculation");
    if (mappingFingerprint !== item.report.eneaPayloadAudit.mappingFingerprint
      || (packageResult.portalGate.fingerprint !== item.report.eneaPayloadAudit.portalGate.workflowFingerprint && !controlledCalculationExtension)) {
      throw new Error("crm_enea_draft_package_fingerprint_mismatch");
    }
    const stablePackage = {
      mode: packageResult.payload.mode,
      practiceCode: packageResult.payload.practiceCode,
      fields: packageResult.payload.fields,
      portalFields: packageResult.payload.portalFields,
      workflowFingerprint: packageResult.portalGate.fingerprint,
      workflowScript: packageResult.portalGate.workflow.script,
    };
    const draftPackage = asScreeningDraftPackage({
      version: "apr-crm-enea-draft-package-v1" as const,
      customerKey,
      displayName: item.displayName,
      practiceId: item.practiceId,
      sourceFingerprint: state.sourceFingerprint,
      mappingFingerprint,
      workflowFingerprint: packageResult.portalGate.fingerprint,
      packageFingerprint: sha256(stablePackage),
      payload: packageResult.payload,
      workflow: packageResult.portalGate.workflow,
      safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } as const,
    });
    return draftPackage;
  }
  snapshot(now = new Date()) { const state = this.load(now); return { ...state, progress: { total: state.items.length, queued: state.items.filter((item) => item.state === "queued" || item.state === "processing").length, ready: state.items.filter((item) => item.state === "ready_local_plan").length, blocked: state.items.filter((item) => item.state === "blocked_case").length, deferred: state.items.filter((item) => item.state === "deferred_operator").length }, lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() }; }
}
