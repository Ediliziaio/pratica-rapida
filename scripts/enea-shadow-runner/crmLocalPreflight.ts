import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isValidCodiceFiscale } from "../../src/components/form-cliente/validation-utils";
import { combineDocumentResults, parseScreeningInvoiceText, parseScreeningTechnicalSourceText, PERSIANA_MEASURE_LIMITS_MM, stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";
import { fingerprintPreparedPractice } from "../../src/features/enea-lab/preparation";
import { reconcileFinancialEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { structureAprResidualBlocker } from "../../src/features/enea-shadow-crm/technicalAutonomyMetric";
import { birthNationFromProvince, fiscalCodeMatchesPartialIdentity, repairFiscalCodeSingleOcrConfusable, resolveBeneficiaryFiscalCode, resolveForeignBirthCountryFromFiscalCode } from "../../src/features/enea-shadow-crm/operationalRules";
import { classifyScreeningProduct, resolveScreeningGTot } from "../../src/features/enea-shadow-crm/productClassifier";
import { resolveOfficialMunicipalityCanonicalIdentity } from "../../src/features/enea-shadow-crm/officialMunicipalities";
import type { AprCrmAcquisitionItem } from "./crmAuthenticatedReadOnly";
import type { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { buildCrmEneaDraftPackage, buildCrmEneaPayloadAudit, type CrmEneaPayloadAuditResult } from "./crmEneaPayloadAudit";
import { extractBankTransferEvidences, firstBankTransferHeaderIndex, reconcileBankTransfers } from "./bankTransferEvidence";
import { extractLocalInvoiceFinancialEvidence, hasInternalAdvanceCreditLine } from "./localInvoiceFinancialEvidence";
import { EXPLICIT_ADVANCE_INVOICE_REFERENCE_MARKER_RULE_ID, EXPLICIT_PERCENTAGE_CAUSAL_TECHNICAL_SUPERSESSION_RULE_ID, NATIVE_OCR_FISCAL_DUPLICATE_AUTHORITY_RULE_ID, reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";
import { isLineaSolePotitoPaperForm, lineaSolePotitoSupplierEvidence, ORIGINAL_PRACTICA_RAPIDA_PAPER_FORM_RULE_ID, PAPER_FORM_BIRTH_DATE_OCR_REPAIR_RULE_ID, parseLineaSolePotitoPaperForm, resolveLineaSolePotitoExposure, resolveLineaSolePotitoProtectedWindowSurface } from "./lineaSolePotitoPolicy";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { isScreeningOnlyCommonBlocker } from "./commonBlockerApplicability";
import { APR_FUTURE_TEST_EXCLUSION_RULE_ID, aprAutomationExclusion } from "./aprFutureTestExclusions";

export const APR_CRM_LOCAL_PREFLIGHT_VERSION = "apr-crm-local-preflight-v1" as const;
export const RESOLVED_NON_ECONOMIC_TOTAL_BLOCKER_RETIREMENT_RULE_ID = "system-resolved-non-economic-total-blocker-retirement-v1" as const;
export const EXPLICIT_ORIGINAL_COMPLETION_DATE_RULE_ID = "system-explicit-original-completion-date-v1" as const;
export const SPECIFIC_INCOMPLETE_SCREENING_BLOCKER_RULE_ID = "system-specific-incomplete-screening-blocker-v1" as const;
// Decisione di Giuliano (2026-09-07, USER_AUTHORIZED_RULE_IDS.bankTransferReconciliationGateSuspended):
// sospensione temporanea del controllo bonifici, da rivalutare entro dicembre
// 2026 per un eventuale requisito di separazione pagamenti 2026/2027
// richiesto da ENEA. Vedi il commento sopra invoiceSegments e i due blocker
// bank_transfer_* per i due punti in cui questo flag e' applicato.
const BANK_TRANSFER_RECONCILIATION_GATE_SUSPENDED = true;
const BASE_RULE_IDS = ["core-form-first", "core-economic-classification", "core-gross-triple-reconciliation", "core-mapping-complete", "system-single-active-practice", "system-atomic-checkpoint-resume", USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart];
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type PreflightBlocker = { code: string; field: string; reason: string; sourceIds: string[]; appliedRuleIds: string[] };

export function isResolvedNonEconomicTotalBlocker(
  message: string,
  documents: readonly { path: string; total: number | null }[],
  reconciliation: { usable: boolean; nonEconomicSourceIds: readonly string[] },
): boolean {
  if (message !== "Il totale di almeno un documento fiscale non è stato riconosciuto.") return false;
  if (!reconciliation.usable || reconciliation.nonEconomicSourceIds.length === 0) return false;
  const verifiedNonEconomicSources = new Set(reconciliation.nonEconomicSourceIds);
  const documentsWithoutParserTotal = documents.filter((document) => document.total === null);
  return documentsWithoutParserTotal.length > 0
    && documentsWithoutParserTotal.every((document) => verifiedNonEconomicSources.has(document.path));
}

export function asScreeningDraftPackage<T extends Omit<AprEneaDraftPackage, "module">>(draftPackage: T): T & { module: "screening" } {
  return { ...draftPackage, module: "screening" };
}

export function assessEnea2026SubmissionDeadline(completionDate: string, now: Date) {
  // Seconda correzione di Giuliano (2026-09-07): la correzione precedente
  // (enea2026June30NinetyDayWindowStartDateOnly) controllava erroneamente
  // la data di INIZIO lavori. La condizione corretta, confermata
  // esplicitamente, guarda la data di FINE lavori: per il 2026, e solo per
  // il 2026, se la fine lavori e' dal 04/02/2026 in poi il conteggio dei 90
  // giorni parte sempre dal 30/06/2026, non dalla fine lavori reale.
  // L'inizio lavori non conta e va ignorato per questa regola.
  const specialWindowApplied = completionDate >= "2026-02-04";
  const calculationStartDate = specialWindowApplied ? "2026-06-30" : completionDate;
  const elapsedDays = dayDiff(calculationStartDate, now);
  return {
    specialWindowApplied,
    calculationStartDate,
    deadlineDate: specialWindowApplied ? "2026-09-28" : new Date(Date.parse(`${completionDate}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10),
    elapsedDays,
    withinDeadline: elapsedDays <= 90,
    appliedRuleIds: specialWindowApplied ? [USER_AUTHORIZED_RULE_IDS.enea2026June30NinetyDayWindowCompletionDateOnly] : [],
  };
}

export function completionDateOperatorBlockers(completionDate: string, completionDateSource: string | null, explicitCompletion: boolean, now: Date): PreflightBlocker[] {
  const sourceIds = [...new Set([completionDateSource].filter((value): value is string => Boolean(value)))];
  const deadline = assessEnea2026SubmissionDeadline(completionDate, now);
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
      ? `Finestra ENEA 2026 applicata: decorrenza 30/06/2026 e termine 28/09/2026; lavorazione oltre il termine. Verificare la procedibilità.`
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
  formMappingSource: "one_to_one" | "group_inheritance" | "group_invoice_type_override" | "group_inheritance_uniform_family" | null;
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
    status: "verified_document" | "not_found" | "conflict";
    identity: { name: string; surname: string; taxCode: string; birthDate: string | null; sex: "M" | "F" } | null;
    sourceIds: string[];
    authority: "official_identity_document" | "fiscal_document" | null;
  };
  worksMunicipalityResolution: {
    status: "verified_document" | "not_found" | "conflict";
    value: { comune: string; provincia: string } | null;
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
    evidence: Array<{ sourceId: string; kind: string; taxableAmount: number | null; vatAmount: number | null; grossTotal: number | null; interventionGrossAmount: number | null; extractionConfidence: string; extractionIssues: Array<{ code: string; reason: string }> }>;
    bankTransfers: Array<{ sourceId: string; principalAmount: number | null; fees: number | null; debitedTotal: number | null; invoiceReference: string | null; taxReliefType: "energy_saving" | "building_renovation" | null; appliedRuleIds: string[] }>;
    bankTransferReconciliation: { status: "not_provided" | "unverified" | "reconciled" | "principal_exceeds_invoices" | "principal_below_invoices"; principalTotal: number | null; feesTotal: number | null; debitedTotal: number | null; difference: number | null; referenceStatus: "not_provided" | "not_checked" | "incomplete" | "verified"; missingInvoiceReferences: string[]; taxReliefTypes: Array<"energy_saving" | "building_renovation"> };
    methods: Array<{ method: string; ok: boolean; total: number | null; sources: readonly string[]; reason: string }>;
    discardedDuplicateSourceIds: string[];
    supersededTechnicalSourceIds: string[];
    appliedRuleIds: string[];
  };
  warnings: Array<{ code: string; reason: string; appliedRuleIds: string[] }>;
  blockers: Array<{ code: string; field: string; reason: string; sourceIds: string[]; appliedRuleIds: string[]; exactCause?: string; operatorQuestion?: string; missingDocumentType?: string | null; onboardingGap?: string | null }>;
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

export function reconcileCommonReportWithAuthoritativeInfissiGate(
  report: AprCrmLocalPreflightReport,
): AprCrmLocalPreflightReport {
  const blockers = report.blockers.filter((blocker) => !isScreeningOnlyCommonBlocker(blocker));
  const payloadBlockers = report.eneaPayloadAudit?.blockers.filter((blocker) => !isScreeningOnlyCommonBlocker(blocker)) ?? [];
  const removed = report.blockers.length - blockers.length
    + ((report.eneaPayloadAudit?.blockers.length ?? 0) - payloadBlockers.length);
  if (removed === 0) return report;
  const ready = blockers.length === 0 && payloadBlockers.length === 0;
  const warning = {
    code: "screening_validation_not_applicable_to_infissi",
    reason: `${removed} esiti del parser Schermature esclusi perché il gate documentale autorevole ha classificato la pratica come Infissi.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel],
  };
  return {
    ...report,
    outcome: ready ? "ready_local_plan" : "blocked_case",
    blockers,
    ...(report.eneaPayloadAudit ? {
      eneaPayloadAudit: {
        ...report.eneaPayloadAudit,
        status: ready ? "payload_complete" as const : "payload_incomplete" as const,
        blockerCount: payloadBlockers.length,
        blockers: payloadBlockers,
        draftReady: ready,
        portalGate: {
          ...report.eneaPayloadAudit.portalGate,
          status: ready ? "ready" as const : "blocked" as const,
          reason: ready ? null : "common-infissi-applicable-blockers-remain",
        },
        reason: ready
          ? "I controlli comuni applicabili agli Infissi sono completi; i soli blocker Schermature sono esclusi."
          : "Restano blocker comuni applicabili anche agli Infissi.",
      },
    } : {}),
    warnings: report.warnings.some((item) => item.code === warning.code) ? report.warnings : [...report.warnings, warning],
    draftPlan: {
      ...report.draftPlan,
      status: ready ? "ready_before_external_action" : "blocked",
      nextAction: ready
        ? "Dati comuni pronti; il solo gate Infissi autorevole decide il pacchetto ENEA."
        : "Risolvere i blocker comuni residui; i falsi blocker Schermature sono esclusi.",
    },
  };
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

/**
 * Regola generale 2026-09-06 (user-2026-09-06-gross-invoice-sum-supersedes-service-separation-v1,
 * supersede user-2026-08-18-bundled-professional-expense-separation): il totale economico e' sempre e
 * solo la somma dei lordi IVA inclusa delle fatture originarie uniche. La dicitura "pratica/servizio ENEA
 * compreso" o una fattura professionale dedicata restano evidenza auditabile nei warning, ma non
 * scompongono piu' il lordo e non fermano piu' la pratica in Richiesto intervento operatore.
 * L'unica eccezione e' una risoluzione operatore caso-specifica storica gia' registrata (non propagabile
 * ad altre pratiche), conservata solo per continuita' di audit.
 */
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
  const allMarkers = [...markers, ...dedicatedProfessionalInvoices];
  if (!allMarkers.length) return { status: "not_applicable" as const, eligibleTechnicalExpense: grossInvoiceTotal, excludedUnclassifiedExpense: 0, markers: allMarkers };
  const validResolution = Boolean(resolution && grossInvoiceTotal !== null
    && resolution.grossInvoiceTotal === grossInvoiceTotal
    && Math.abs((resolution.eligibleTechnicalExpense + resolution.excludedUnclassifiedExpense) - grossInvoiceTotal) < 0.01
    && resolution.eligibleTechnicalExpense >= 0 && resolution.excludedUnclassifiedExpense >= 0);
  if (validResolution) return { status: "resolved_case_specific" as const, eligibleTechnicalExpense: resolution!.eligibleTechnicalExpense, excludedUnclassifiedExpense: resolution!.excludedUnclassifiedExpense, markers: allMarkers, resolution: resolution! };
  return { status: "gross_used_marker_present" as const, eligibleTechnicalExpense: grossInvoiceTotal, excludedUnclassifiedExpense: 0, markers: allMarkers };
}

const LABELED_FISCAL_CODE = /(?:c\s*\.?\s*f\s*\.?|c\.?\s*fisc\.?|codice\s+fiscale)\s*[:\-]?\s*([A-Z0-9]{16})\b/gi;
export const INVOICE_CUSTOMER_BLOCK_CRM_CF_RULE_ID = "system-invoice-customer-block-crm-cf-v1" as const;
export const RESELLER_ADDRESSEE_MULTI_LINE_BENEFICIARY_LOOKUP_RULE_ID = "user-2026-09-08-reseller-addressee-multi-line-beneficiary-lookup-v1" as const;

const normalizedIdentityText = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

// Regola generale definitiva di Giuliano (2026-09-08, regressione Calvacchi,
// RESELLER_INSTALLER_INVOICE_EXCLUDED_FROM_ECONOMIC_TOTAL_RULE_ID): quando il
// produttore vende al rivenditore/installatore e non al cliente finale (es.
// SIDEL vende a IKONA, che rivende a Calvacchi), quella fattura non va mai
// sommata al totale economico della pratica: serve solo come fonte tecnica
// (misure, caratteristiche prodotto). Il destinatario di una fattura reale
// verso il cliente e' sempre il nome/cognome del beneficiario; un
// destinatario con forma societaria esplicita (Srl/SpA/Snc/Sas) che non
// contiene affatto il nome del beneficiario e' quasi certamente il
// rivenditore/installatore. Fail-closed: senza un destinatario riconoscibile
// o senza forma societaria esplicita, il documento resta economico come
// prima (nessuna esclusione senza prova).
export function invoiceAddressedToDifferentCompanyThanBeneficiary(text: string, beneficiaryName: string, beneficiarySurname: string): boolean {
  const normalizedName = normalizedIdentityText(beneficiaryName);
  const normalizedSurname = normalizedIdentityText(beneficiarySurname);
  if (!normalizedName || !normalizedSurname) return false;
  const lines = text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const labelIndex = lines.findIndex((line) => /^(?:Destinatario|Spett\.?\s*le)\b/i.test(line));
  if (labelIndex < 0) return false;
  // Regressione Biagioni/Riviera: il fornitore "Finestra Italia S.r.l."
  // stampa "SPETT.LE" seguito dalla PROPRIA ragione sociale sulla prima
  // riga, e solo sulla riga successiva il nome del cliente reale
  // ("SPETT.LE\nFINESTRA ITALIA S.R.L. A SOCIO UNICO\nNICLA BIAGIONI"): la
  // vecchia lettura di una sola riga dopo l'etichetta non trovava mai il
  // beneficiario in questi casi, scambiando una fattura verso il cliente
  // stesso per una fattura verso un rivenditore/installatore. Si controllano
  // percio' alcune righe dopo l'etichetta, non solo la prima; il blocco resta
  // comunque limitato (mai l'intero documento) per non raggiungere per
  // errore un destinatario societario genuino altrove nel testo.
  const block = lines.slice(labelIndex, labelIndex + 6).join(" ");
  const normalizedBlock = normalizedIdentityText(block);
  const beneficiaryNamePresent = normalizedBlock.includes(`${normalizedName} ${normalizedSurname}`) || normalizedBlock.includes(`${normalizedSurname} ${normalizedName}`);
  if (beneficiaryNamePresent) return false;
  return /\bS\.?\s*R\.?\s*L\.?\b|\bS\.?\s*P\.?\s*A\.?\b|\bS\.?\s*N\.?\s*C\.?\b|\bS\.?\s*A\.?\s*S\.?\b|\bSOCIET[A\u00c0]\b/i.test(block);
}

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

function splitInvoicePersonName(fullName: string, taxCode: string, preferShortest = false) {
  const words = fullName.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const candidates: Array<{ name: string; surname: string; taxCode: string; wordCount: number }> = [];
  // OCR/layout text often places address or invoice headings on the same line
  // as the customer. Search bounded contiguous spans and retain the shortest
  // uniquely CF-coherent identity, instead of absorbing trailing address text.
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 2; end <= Math.min(words.length, start + 7); end += 1) {
      const span = words.slice(start, end);
      for (let index = 1; index < span.length; index += 1) {
        for (const order of ["surname_first", "name_first"] as const) {
          const first = span.slice(0, index).join(" "); const second = span.slice(index).join(" ");
          const surname = order === "surname_first" ? first : second; const name = order === "surname_first" ? second : first;
          if (surnameFiscalPrefix(surname) === taxCode.slice(0, 3) && nameFiscalPrefix(name) === taxCode.slice(3, 6)) candidates.push({ name: personNameCase(name), surname: personNameCase(surname), taxCode, wordCount: span.length });
        }
      }
    }
  }
  const minimum = Math.min(...candidates.map((candidate) => candidate.wordCount));
  const eligible = preferShortest ? candidates.filter((candidate) => candidate.wordCount === minimum) : candidates.filter((candidate) => candidate.wordCount === words.length);
  const unique = [...new Map(eligible.map(({ wordCount: _wordCount, ...candidate }) => [`${candidate.name}|${candidate.surname}|${candidate.taxCode}`, candidate])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function explicitOfficialIdentityBeneficiaries(textValue: string) {
  const original = stripHistoricalEneaAppendix(textValue);
  if (!/(?:CARTA\s+DI\s+IDENTIT|IDENTITY\s+CARD|TESSERA\s+(?:EUROPEA|SANITARIA)|CODICE\s+FISCALE)/i.test(original)) return [];
  const taxCodes = [...new Set([...original.toUpperCase().matchAll(/\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/g)].map((match) => normalizeCf(match[0])).filter(isValidCodiceFiscale))];
  const results: Array<{ name: string; surname: string; taxCode: string }> = [];
  for (const taxCode of taxCodes) {
    const labeledResults: Array<{ name: string; surname: string; taxCode: string }> = [];
    // Prefer explicit printed labels over MRZ: the latter can contain optional
    // given-name initials that are not part of the civil name (for example
    // GREGORIO<S). Evaluate every label occurrence because front/back scans
    // commonly contain both a value-before-label card face and a normal
    // label-before-value health-card face.
    const labeledPattern = /(?:^|\n)\s*(?:COGNOME|SURNAME)(?:\s*\/\s*SURNAME)?\s*\n\s*([A-ZÀ-ÖØ-Ý' -]{2,80})\s*\n\s*(?:NOME|NAME)(?:\s*\/\s*NAME)?\s*\n\s*([A-ZÀ-ÖØ-Ý' -]{2,80})(?=\s*\n|$)/gim;
    for (const match of original.matchAll(labeledPattern)) {
      const surname = match[1].trim(); const name = match[2].trim();
      if (surnameFiscalPrefix(surname) === taxCode.slice(0, 3) && nameFiscalPrefix(name) === taxCode.slice(3, 6)) labeledResults.push({ name: personNameCase(name), surname: personNameCase(surname), taxCode });
    }
    if (labeledResults.length) {
      results.push(...labeledResults);
      continue;
    }
    for (const match of original.toUpperCase().matchAll(/\b([A-ZÀ-ÖØ-Ý' -]{2,60})<<([A-ZÀ-ÖØ-Ý'< -]{2,80})/g)) {
      const surname = match[1].replace(/<+/g, " ").trim(); const name = match[2].replace(/<+/g, " ").trim();
      if (surnameFiscalPrefix(surname) === taxCode.slice(0, 3) && nameFiscalPrefix(name) === taxCode.slice(3, 6)) results.push({ name: personNameCase(name), surname: personNameCase(surname), taxCode });
    }
    const lines = original.split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
    const labelValue = (label: RegExp) => {
      const index = lines.findIndex((line) => label.test(line));
      if (index < 0) return "";
      for (const candidate of lines.slice(index + 1, index + 5)) {
        if (/^(?:\d+\s*)?(?:cognome|surname|nome|name|data|date|luogo|place|sesso|sex)\b/i.test(candidate)) continue;
        if (/^[A-ZÀ-ÖØ-Ý' -]{2,80}$/i.test(candidate) && !/^(?:REPUBBLICA|ITALIANA|MINISTERO)$/i.test(candidate)) return candidate;
      }
      return "";
    };
    const surname = labelValue(/^(?:\d+\s*)?COGNOME(?:\s*\/\s*SURNAME)?$/i);
    const name = labelValue(/^(?:\d+\s*)?NOME(?:\s*\/\s*NAME)?$/i);
    if (surname && name && surnameFiscalPrefix(surname) === taxCode.slice(0, 3) && nameFiscalPrefix(name) === taxCode.slice(3, 6)) results.push({ name: personNameCase(name), surname: personNameCase(surname), taxCode });
  }
  return [...new Map(results.map((candidate) => [`${normalizedIdentityText(candidate.name)}|${normalizedIdentityText(candidate.surname)}|${candidate.taxCode}`, candidate])).values()];
}

// Un cointestatario va riconosciuto solo da un'etichetta esplicita del
// documento (dicitura di cointestazione/secondo beneficiario, o la dicitura
// fiscale standard di detrazione condivisa "in detrazione al N% con"), mai
// dalla semplice vicinanza di due nomi nel testo libero. "fornitura...con"
// da solo produceva falsi positivi su qualunque descrizione tecnica che
// contenesse la preposizione "con" (es. "struttura in alluminio con bracci"),
// senza che nel documento comparisse davvero un secondo beneficiario.
const EXPLICIT_CO_BENEFICIARY_LABEL = "(?:cointestatari[oa]|secondo\\s+beneficiario|altro\\s+beneficiario(?:\\s+persona\\s+fisica)?|in\\s+detrazione\\s+al\\s+\\d{1,3}\\s*%\\s+con)";

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
  const labelPattern = new RegExp(EXPLICIT_CO_BENEFICIARY_LABEL, "i");
  const prefixPattern = new RegExp(`^.*?${EXPLICIT_CO_BENEFICIARY_LABEL}\\s*[:\\-]?\\s*`, "i");
  for (const candidateText of candidates) {
    if (!labelPattern.test(candidateText)) continue;
    const cfMatch = candidateText.match(/(?:c\s*\.?\s*f\s*\.?|codice\s+fiscale)\s*[:\-]?\s*([A-Z0-9]{16})\b/i);
    if (!cfMatch) continue;
    const taxCode = normalizeCf(cfMatch[1]); if (!isValidCodiceFiscale(taxCode)) continue;
    const prefix = candidateText.slice(0, cfMatch.index).replace(prefixPattern, "").trim();
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
    const identity = splitInvoicePersonName(fullName, taxCode, true);
    if (identity) results.push(identity);
  }
  return [...new Map(results.map((candidate) => [`${candidate.name}|${candidate.surname}|${candidate.taxCode}`, candidate])).values()];
}

const ITALIAN_PROVINCE_SIGLAS = new Set([
  "AG", "AL", "AN", "AO", "AP", "AQ", "AR", "AT", "AV", "BA", "BG", "BI", "BL", "BN", "BO", "BR", "BS", "BT", "BZ",
  "CA", "CB", "CE", "CH", "CL", "CN", "CO", "CR", "CS", "CT", "CZ", "EN", "FC", "FE", "FG", "FI", "FM", "FR",
  "GE", "GO", "GR", "IM", "IS", "KR", "LC", "LE", "LI", "LO", "LT", "LU", "MB", "MC", "ME", "MI", "MN", "MO",
  "MS", "MT", "NA", "NO", "NU", "OR", "PA", "PC", "PD", "PE", "PG", "PI", "PN", "PO", "PR", "PT", "PU", "PV",
  "PZ", "RA", "RC", "RE", "RG", "RI", "RM", "RN", "RO", "SA", "SI", "SO", "SP", "SR", "SS", "SU", "SV", "TA",
  "TE", "TN", "TO", "TP", "TR", "TS", "TV", "UD", "VA", "VB", "VC", "VE", "VI", "VR", "VT", "VV",
]);

const DELIVERY_DESTINATION_MARKER = /\b(?:luogo\s+di\s+destinazione|luogo\s+di\s+consegna|destinazione\s+(?:merce|lavori|beni)|sede\s+(?:lavori|intervento)|cantiere)\b/i;
// Un'intestazione "Cliente"/"Spett.le" puo' introdurre prima i propri dati
// aziendali (mittente/fornitore) e solo dopo l'indirizzo del cliente reale:
// scartare righe con marcatori tipici di un'azienda fornitrice (partita IVA,
// sito web, email, ragione sociale) per non scambiare la sede del fornitore
// con il Comune del cliente.
const SUPPLIER_BLOCK_MARKER = /\bp\s*\.?\s*iva\b|\bwww\.|@|\bs\s*\.?\s*r\s*\.?\s*l\s*\.?\b|\bs\s*\.?\s*p\s*\.?\s*a\s*\.?\b|\bsnc\b|\bsas\b|\btel\s*\.?\s*\d|\bfax\b/i;
export const SUPPLIER_BLOCK_MARKER_FULL_ADDRESS_BLOCK_WINDOW_RULE_ID = "user-2026-09-08-supplier-block-marker-full-address-block-window-v1" as const;

// Le fatture originarie riportano il Comune di destinazione/consegna lavori nel
// blocco intestatario/destinatario, nel formato CAP Comune (Provincia). Quando
// il CRM dichiara che residenza e indirizzo lavori NON coincidono, quel blocco
// e' pero' quasi sempre l'indirizzo di fatturazione/residenza del cliente, non
// il cantiere: in quel caso e' attendibile solo se accompagnato da un'etichetta
// esplicita di destinazione/consegna/cantiere. Quando invece residenza e lavori
// coincidono per dichiarazione CRM, il blocco intestatario da solo e' sufficiente.
function explicitInvoiceWorksMunicipality(textValue: string, options: { requireDeliveryDestinationMarker: boolean }): { comune: string; provincia: string } | null {
  const original = stripHistoricalEneaAppendix(textValue);
  const lines = original.split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
  const addressLabelPattern = /^(?:spett\.?\s*le|cliente|intestatario|destinatario)\b/i;
  const addressLabelIndex = lines.findIndex((line) => addressLabelPattern.test(line));
  if (addressLabelIndex < 0) return null;
  const window = lines.slice(addressLabelIndex, addressLabelIndex + 14);
  for (const [offset, line] of window.entries()) {
    const match = line.match(/\b\d{5}\s+([A-ZÀ-Ý' -]{2,50}?)\s*\(\s*([A-Z]{2})\s*\)/i);
    if (!match) continue;
    const provincia = match[2].toUpperCase();
    if (!ITALIAN_PROVINCE_SIGLAS.has(provincia)) continue;
    const comune = personNameCase(match[1].trim());
    if (!comune) continue;
    // Regressione Tiraboschi: in una dichiarazione IVA agevolata autoprodotta
    // dal cliente, il blocco "Spett.le" apre con l'intestazione del
    // fornitore destinatario della lettera (ragione sociale, indirizzo,
    // P.IVA), che puo' estendersi su piu' righe prima del CAP+Comune. Una
    // finestra di soli +-1 riga attorno al match perdeva marcatori societari
    // ("snc") presenti 2 righe piu' sopra, scambiando il comune del
    // fornitore (Villongo) per quello del cantiere. Si controlla percio'
    // l'intero blocco dalla PIU' VICINA etichetta di apertura precedente
    // (non necessariamente la prima del documento: un secondo blocco
    // "CLIENTE" piu' avanti apre una propria finestra indipendente, cosi'
    // un fornitore citato molto prima non contamina mai un cliente reale
    // successivo) fino al match, non solo il suo immediato dintorno.
    let nearestLabelOffset = 0;
    for (let index = offset; index >= 0; index -= 1) {
      if (addressLabelPattern.test(window[index])) { nearestLabelOffset = index; break; }
    }
    if (SUPPLIER_BLOCK_MARKER.test(window.slice(nearestLabelOffset, offset + 2).join(" "))) continue;
    if (options.requireDeliveryDestinationMarker && !DELIVERY_DESTINATION_MARKER.test(window.slice(offset, offset + 3).join(" "))) continue;
    return { comune, provincia };
  }
  return null;
}

export function resolveWorksMunicipalityFromOriginalInvoices(input: {
  customerKey: string;
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>;
  requireDeliveryDestinationMarker: boolean;
}) {
  const candidates = new Map<string, { value: { comune: string; provincia: string }; sourceIds: string[] }>();
  for (const item of input.analysis.items) {
    if (item.customerKey !== input.customerKey || item.kind !== "invoice" || item.state !== "analyzed" || !item.textPath || !existsSync(item.textPath)) continue;
    const found = explicitInvoiceWorksMunicipality(readFileSync(item.textPath, "utf8"), { requireDeliveryDestinationMarker: input.requireDeliveryDestinationMarker });
    if (!found) continue;
    const key = `${normalizedIdentityText(found.comune)}|${found.provincia}`;
    const candidate = candidates.get(key) ?? { value: found, sourceIds: [] };
    candidate.sourceIds.push(item.documentKey);
    candidates.set(key, candidate);
  }
  if (candidates.size === 0) return { status: "not_found" as const, value: null, sourceIds: [] as string[] };
  if (candidates.size > 1) return { status: "conflict" as const, value: null, sourceIds: [...new Set([...candidates.values()].flatMap((candidate) => candidate.sourceIds))].sort() };
  const candidate = [...candidates.values()][0];
  return { status: "verified_document" as const, value: candidate.value, sourceIds: [...new Set(candidate.sourceIds)].sort() };
}

export function resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock(input: {
  customerKey: string;
  name: string;
  surname: string;
  taxCode: string;
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>;
}) {
  const taxCode = normalizeCf(input.taxCode);
  const normalizedName = normalizedIdentityText(input.name);
  const normalizedSurname = normalizedIdentityText(input.surname);
  if (!normalizedName || !normalizedSurname) {
    return { status: "not_found" as const, value: null, sourceIds: [] as string[] };
  }
  // Un CF CRM gia' valido e coerente con nome/cognome viene soltanto
  // confermato dalla fattura, mai sostituito: un valore diverso ma anch'esso
  // valido nel blocco CLIENTE resta un conflitto per l'operatore, non una
  // sostituzione automatica (stessa precedenza documentale gia' applicata a
  // Comune lavori/immobile: la fonte originale vince solo quando il dato
  // CRM manca o non e' utilizzabile, non quando e' semplicemente diverso).
  const crmTaxCodeUsable = isValidCodiceFiscale(taxCode)
    && surnameFiscalPrefix(input.surname) === taxCode.slice(0, 3)
    && nameFiscalPrefix(input.name) === taxCode.slice(3, 6);
  const sourceIds: string[] = [];
  const discoveredCodes = new Set<string>();
  let usedCfDestinatarioAnchor = false;
  for (const item of input.analysis.items) {
    if (item.customerKey !== input.customerKey || item.kind !== "invoice" || item.state !== "analyzed" || !item.textPath || !existsSync(item.textPath)) continue;
    const pages = stripHistoricalEneaAppendix(readFileSync(item.textPath, "utf8")).split(/\f/);
    for (const page of pages) {
      const lines = page.split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
      for (let index = 0; index < lines.length; index += 1) {
        // Regressione Eustomi/Coreggioli: alcuni fornitori (es. S.A.
        // Montaggi SRLS) non usano affatto un'etichetta "CLIENTE": il CF del
        // cliente compare sulla stessa riga di "DESTINATARIO" ("CF <cf>
        // DESTINATARIO"), col nome sulla riga successiva. Senza questo
        // secondo ancoraggio il blocco cliente non veniva mai trovato, pur
        // avendo il CF scritto in chiaro accanto al nome del cliente.
        const isClienteLabel = /^cliente\b/i.test(lines[index]);
        const isCfDestinatarioLabel = /^CF\s+[A-Z0-9]{16}\s+DESTINATARIO\b/i.test(lines[index]);
        if (!isClienteLabel && !isCfDestinatarioLabel) continue;
        const customerBlock = lines.slice(index, index + 8).join(" ");
        const normalizedBlock = ` ${normalizedIdentityText(customerBlock)} `;
        const hasExpectedName = normalizedBlock.includes(` ${normalizedName} ${normalizedSurname} `)
          || normalizedBlock.includes(` ${normalizedSurname} ${normalizedName} `);
        if (!hasExpectedName) continue;
        const codes = [...customerBlock.matchAll(LABELED_FISCAL_CODE)].map((match) => normalizeCf(match[1])).filter(isValidCodiceFiscale);
        if (crmTaxCodeUsable) {
          if (codes.includes(taxCode)) {
            sourceIds.push(item.documentKey);
            if (isCfDestinatarioLabel) usedCfDestinatarioAnchor = true;
          }
          continue;
        }
        // Il CF CRM non e' utilizzabile (assente o checksum invalido): un CF
        // valido nel blocco CLIENTE con prefissi fiscali coerenti col
        // nome/cognome e' l'unica fonte disponibile e prevale sul dato CRM
        // errato, come per Comune lavori/immobile. Piu' CF diversi trovati
        // restano fail-closed: nessuna scelta per posizione o ordine.
        for (const code of codes) {
          if (surnameFiscalPrefix(input.surname) === code.slice(0, 3) && nameFiscalPrefix(input.name) === code.slice(3, 6)) {
            discoveredCodes.add(code);
            sourceIds.push(item.documentKey);
            if (isCfDestinatarioLabel) usedCfDestinatarioAnchor = true;
          }
        }
      }
    }
  }
  if (crmTaxCodeUsable) {
    return sourceIds.length
      ? { status: "verified_invoice_customer_block" as const, value: taxCode, sourceIds: [...new Set(sourceIds)].sort(), usedCfDestinatarioAnchor }
      : { status: "not_found" as const, value: null, sourceIds: [] as string[], usedCfDestinatarioAnchor: false };
  }
  return discoveredCodes.size === 1
    ? { status: "verified_invoice_customer_block" as const, value: [...discoveredCodes][0], sourceIds: [...new Set(sourceIds)].sort(), usedCfDestinatarioAnchor }
    : { status: "not_found" as const, value: null, sourceIds: [] as string[], usedCfDestinatarioAnchor: false };
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

export function resolvePrimaryBeneficiaryFromOfficialDocuments(input: {
  customerKey: string;
  taxCode: string | null;
  requesterBirthDate?: string | null;
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>;
}) {
  if (!input.taxCode) return { status: "not_found" as const, identity: null, sourceIds: [] as string[], authority: null };
  const officialCandidates = new Map<string, { identity: { name: string; surname: string; taxCode: string }; sourceIds: string[] }>();
  const fiscalCandidates = new Map<string, { identity: { name: string; surname: string; taxCode: string }; sourceIds: string[] }>();
  for (const item of input.analysis.items) {
    if (item.customerKey !== input.customerKey || item.state !== "analyzed" || !item.textPath || !existsSync(item.textPath)) continue;
    const originalText = readFileSync(item.textPath, "utf8");
    const official = explicitOfficialIdentityBeneficiaries(originalText).filter((identity) => identity.taxCode === input.taxCode);
    const fiscal = item.kind === "invoice" ? explicitInvoicePrimaryBeneficiaries(originalText).filter((identity) => identity.taxCode === input.taxCode) : [];
    for (const [authorityCandidates, identities] of [[officialCandidates, official], [fiscalCandidates, fiscal]] as const) for (const identity of identities) {
      const key = `${normalizedIdentityText(identity.name)}|${normalizedIdentityText(identity.surname)}|${identity.taxCode}`;
      const candidate = authorityCandidates.get(key) ?? { identity, sourceIds: [] };
      candidate.sourceIds.push(item.documentKey);
      authorityCandidates.set(key, candidate);
    }
  }
  // Explicit identity documents are more authoritative than fiscal documents;
  // fiscal documents are considered only when no official identity is present.
  const candidates = officialCandidates.size ? officialCandidates : fiscalCandidates;
  const authority = officialCandidates.size ? "official_identity_document" as const : "fiscal_document" as const;
  if (candidates.size === 0) return { status: "not_found" as const, identity: null, sourceIds: [] as string[], authority: null };
  if (candidates.size > 1) return { status: "conflict" as const, identity: null, sourceIds: [...new Set([...candidates.values()].flatMap((candidate) => candidate.sourceIds))].sort(), authority: null };
  const candidate = [...candidates.values()][0];
  const encodedYear = Number(candidate.identity.taxCode.slice(6, 8));
  const encodedMonth = "ABCDEHLMPRST".indexOf(candidate.identity.taxCode[8]) + 1;
  const encodedSexDay = Number(candidate.identity.taxCode.slice(9, 11));
  const encodedDay = encodedSexDay > 40 ? encodedSexDay - 40 : encodedSexDay;
  const sex = encodedSexDay > 40 ? "F" as const : "M" as const;
  const requesterBirthDate = text(input.requesterBirthDate).slice(0, 10);
  const requesterDateMatch = requesterBirthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  // Il CF documentale prova giorno, mese, sesso e le ultime due cifre
  // dell'anno, ma non il secolo. Il solo dato CRM ammesso e' quindi il secolo,
  // e soltanto quando le ultime due cifre concordano. Altrimenti il caso resta
  // fail-closed: non inventiamo 19xx/20xx.
  if (requesterDateMatch && Number(requesterDateMatch[1].slice(-2)) !== encodedYear) return {
    status: "conflict" as const,
    identity: null,
    sourceIds: [...new Set(candidate.sourceIds)].sort(),
    authority: null,
  };
  const birthDate = requesterDateMatch && encodedMonth > 0 && encodedDay >= 1 && encodedDay <= 31
    ? `${requesterDateMatch[1]}-${String(encodedMonth).padStart(2, "0")}-${String(encodedDay).padStart(2, "0")}`
    : null;
  return {
    status: "verified_document" as const,
    identity: { ...candidate.identity, birthDate, sex },
    sourceIds: [...new Set(candidate.sourceIds)].sort(),
    authority,
  };
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
  // La pipeline "gestionale" (import Excel) puo' scrivere cointestazione.presente=true
  // senza mai valorizzare nome/cognome/cf: non e' una dichiarazione reale di
  // cointestatario, e' un campo vuoto/di default. Trattarla come "presente" produceva
  // un blocco fail-closed fittizio (nessuna fonte da confrontare, nessun cointestatario
  // esiste davvero). Serve almeno un dato identificativo perche' la dichiarazione conti.
  if (input.coOwnership?.presente !== true || (!coName && !coSurname && !coCf)) return { status: "not_declared" as const, present: false, identity: null, sourceIds: [] as string[] };
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

export function resolveProductTechnicalAttributes(description: string, sourceContext: string, documentedGTot: number | null, declaredType: string | null = null) {
  const normalizedDescription = description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalized = `${description}\n${sourceContext}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const classification = classifyScreeningProduct(description);
  const gTotResolution = resolveScreeningGTot(description, declaredType, documentedGTot);
  const persiana = classification.family === "persiana";
  const avvolgibile = classification.family === "avvolgibile" || classification.family === "tapparella";
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
      ...(persiana ? [USER_AUTHORIZED_RULE_IDS.persianaScreening] : []),
      ...(avvolgibile ? [USER_AUTHORIZED_RULE_IDS.avvolgibileScreening] : []),
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
      gTot: gTotResolution.value,
      source: gTotResolution.source,
      ruleId: gTotResolution.ruleId,
      classification,
    };
  }
  if (avvolgibile) {
    const contradictoryMaterial = materialFamilies.has("textile_polymer") || materialFamilies.has("wood");
    return {
      ...common,
      material: contradictoryMaterial ? "" : "Metallo",
      materialSource: materialFamilies.has("metal") ? "invoice_explicit" as const : "authorized_fallback" as const,
      supplementaryThermalResistance: 0.17,
      gTot: gTotResolution.value,
      source: gTotResolution.source,
      ruleId: gTotResolution.ruleId,
      classification,
    };
  }
  if (gTotResolution.source === "invoice_explicit" || gTotResolution.source === "authorized_fallback") return { ...common, gTot: gTotResolution.value, source: gTotResolution.source, ruleId: gTotResolution.ruleId, classification };
  return null;
}

const ORDER_REFERENCE_PATTERN = /\bordine\s+cliente\s+((?:\d\s*)+)\b/i;

function orderReferenceToken(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.match(ORDER_REFERENCE_PATTERN);
  return match ? match[1].replace(/\s+/g, "") : null;
}

/**
 * La fine lavori resta la fattura più recente del dossier (user-2026-08-18-invoice-work-date-chronology).
 * L'inizio lavori invece deve appartenere allo stesso ordine/intervento della fine lavori quando le
 * fatture citano esplicitamente un riferimento "Ordine Cliente N": un acconto di un ordine precedente
 * già saldato non può retrodatare l'inizio lavori di un intervento successivo e distinto per lo stesso
 * cliente (user-2026-09-06-invoice-work-date-chronology-order-scoped). Senza un riferimento ordine
 * esplicito su qualunque fattura, il comportamento resta quello storico: prima fattura dell'intero dossier.
 */
export function resolveInvoiceWorkDates(segments: Array<{ documentDate?: string | null; sourceId: string; text?: string }>) {
  const dated = segments.filter((segment): segment is { documentDate: string; sourceId: string; text?: string } => Boolean(segment.documentDate))
    .sort((left, right) => left.documentDate.localeCompare(right.documentDate) || left.sourceId.localeCompare(right.sourceId));
  const completion = dated.at(-1) ?? null;
  const completionOrderToken = orderReferenceToken(completion?.text);
  const startCandidates = completionOrderToken
    ? dated.filter((segment) => orderReferenceToken(segment.text) === completionOrderToken)
    : dated;
  const start = startCandidates[0] ?? null;
  return {
    startDate: start?.documentDate ?? null,
    startDateSource: start?.sourceId ?? null,
    completionDate: completion?.documentDate ?? null,
    completionDateSource: completion?.sourceId ?? null,
  };
}

type ExplicitOriginalCompletionDateResolution = {
  status: "verified" | "not_found" | "conflict";
  value: string | null;
  sourceIds: string[];
  evidenceKinds: Array<"completion_declaration" | "final_installation_commissioning">;
};

function normalizeItalianCalendarDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function resolveExplicitOriginalCompletionDate(
  analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>,
  customerKey: string,
): ExplicitOriginalCompletionDateResolution {
  const candidates: Array<{ value: string; sourceId: string; evidenceKind: "completion_declaration" | "final_installation_commissioning" }> = [];
  const explicitCompletionPatterns = [
    /\b(?:i\s+)?lavori\s+(?:di\s+)?(?:installazione|posa(?:\s+in\s+opera)?)\s+sono\s+(?:stati\s+)?(?:terminati|ultimati|completati)\s+(?:in\s+)?data\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/gi,
    /\b(?:i\s+)?lavori\s+sono\s+(?:stati\s+)?(?:terminati|ultimati|completati)\s+(?:in\s+)?data\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/gi,
  ];
  const finalCommissioningPattern = /\bdichiarazione\s+di\s+collaudo\s+finale\s+della\s+posa\s+in\s+opera[\s\S]{0,800}?\bin\s+data\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+si\s+[eè]\s+verificat[oa]\s+(?:il\s+)?collaudo\s+della\s+posa\s+in\s+opera\b/gi;
  for (const item of analysis.items) {
    if (item.customerKey !== customerKey || item.state !== "analyzed" || !item.textPath || !existsSync(item.textPath)) continue;
    const originalOnly = stripHistoricalEneaAppendix(readFileSync(item.textPath, "utf8"));
    for (const page of originalOnly.split(/\f/)) {
      for (const pattern of explicitCompletionPatterns) for (const match of page.matchAll(pattern)) {
        const value = normalizeItalianCalendarDate(match[1]);
        if (value) candidates.push({ value, sourceId: item.documentKey, evidenceKind: "completion_declaration" });
      }
      for (const match of page.matchAll(finalCommissioningPattern)) {
        const value = normalizeItalianCalendarDate(match[1]);
        if (value) candidates.push({ value, sourceId: item.documentKey, evidenceKind: "final_installation_commissioning" });
      }
    }
  }
  const values = [...new Set(candidates.map((candidate) => candidate.value))].sort();
  const sourceIds = [...new Set(candidates.map((candidate) => candidate.sourceId))].sort();
  const evidenceKinds = [...new Set(candidates.map((candidate) => candidate.evidenceKind))].sort() as ExplicitOriginalCompletionDateResolution["evidenceKinds"];
  if (values.length === 0) return { status: "not_found", value: null, sourceIds: [], evidenceKinds: [] };
  if (values.length > 1) return { status: "conflict", value: null, sourceIds, evidenceKinds };
  return { status: "verified", value: values[0], sourceIds, evidenceKinds };
}

type InvoiceReferenceSegment = { sourceId: string; documentNumber?: string | null; referencedInvoiceNumbers: string[]; text: string };

const canonicalInvoiceNumber = (value: string) => value.toUpperCase().replace(/[^A-Z0-9/.-]/g, "").replace(/^0+(?=\d)/, "");
const numericInvoiceBase = (value: string) => canonicalInvoiceNumber(value).match(/^(\d+)(?:[\/.-].*)?$/)?.[1].replace(/^0+(?=\d)/, "") ?? null;

export function resolveExplicitAdvanceInvoiceReferences(segments: InvoiceReferenceSegment[]) {
  const observed = [...new Set(segments.map((segment) => canonicalInvoiceNumber(segment.documentNumber ?? "")).filter(Boolean))];
  const missing: Array<{ sourceId: string; reference: string }> = [];
  const uniqueBaseMatches: Array<{ sourceId: string; reference: string; matchedDocumentNumber: string }> = [];
  for (const segment of segments) {
    if (!/\b(?:fatt(?:ura)?\.?\s*(?:di\s+)?acconto|acconto\s+(?:ricevuto\s+)?(?:rif\.?\s*)?(?:ns\.?\s*)?fatt)/i.test(segment.text)) continue;
    for (const reference of segment.referencedInvoiceNumbers) {
      const canonicalReference = canonicalInvoiceNumber(reference);
      const referencingDocumentNumber = canonicalInvoiceNumber(segment.documentNumber ?? "");
      if (canonicalReference !== referencingDocumentNumber && observed.includes(canonicalReference)) continue;
      const base = numericInvoiceBase(reference);
      const candidates = base === null ? [] : observed.filter((documentNumber) => documentNumber !== referencingDocumentNumber && numericInvoiceBase(documentNumber) === base);
      if (candidates.length === 1) uniqueBaseMatches.push({ sourceId: segment.sourceId, reference, matchedDocumentNumber: candidates[0] });
      else missing.push({ sourceId: segment.sourceId, reference });
    }
  }
  return { missing, uniqueBaseMatches };
}

export function missingExplicitAdvanceInvoiceReferences(segments: InvoiceReferenceSegment[]) {
  return resolveExplicitAdvanceInvoiceReferences(segments).missing;
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

type FormScreeningMapping = { declared: JsonObject | null; source: "one_to_one" | "group_inheritance" | "group_invoice_type_override" | "group_inheritance_uniform_family" | null };
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

export function screeningFallbackMaterialCategoryBlocker(input: {
  index: number;
  description: string;
  declaredType: string | null;
  material: string;
  materialSource: "invoice_explicit" | "authorized_fallback";
  sourceId: string;
}): PreflightBlocker | null {
  const sourceFamily = normalizedFamily(input.description);
  const declaredFamily = normalizedFamily(input.declaredType ?? "");
  const resolvedFamily = sourceFamily ?? declaredFamily;
  if (resolvedFamily !== "zanzariera" || input.materialSource !== "authorized_fallback") return null;
  if (input.material.trim().toLocaleLowerCase("it-IT") === "misto") return null;
  return {
    code: `screening_fallback_material_category_conflict_${input.index + 1}`,
    field: `screenings.${input.index + 1}.material`,
    reason: `La riga e classificata come zanzariera ma il resolver ha prodotto il materiale fallback ${input.material || "vuoto"}; il solo fallback autorizzato per la categoria e Misto. Payload invalidato: nessuna bozza puo essere dichiarata pronta finche il mapping non e coerente.`,
    sourceIds: [input.sourceId],
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.screeningFallbackMaterialCategoryGuard, USER_AUTHORIZED_RULE_IDS.zanzarieraScreening, "system-apr-technical-repair-queue"],
  };
}

export function resolveFormScreeningMappings(declaredValues: unknown[], productDescriptions: string[]): FormScreeningMappingResult {
  const declared = declaredValues.map(object);
  if (declared.length === productDescriptions.length) return { status: "mapped", mappings: declared.map((value) => ({ declared: value, source: "one_to_one" })), conflictingProductIndexes: [] };
  if (!declared.length || productDescriptions.length < 2 || declared.some((value) => !value)) return { status: "cardinality_mismatch", mappings: productDescriptions.map(() => ({ declared: null, source: null })), conflictingProductIndexes: [] };
  if (declared.length > 1) {
    const declaredFamilies = declared.map((value) => normalizedFamily(text(value?.tipo_prodotto)));
    const uniformDeclaredFamily = new Set(declaredFamilies).size === 1 ? declaredFamilies[0] : null;
    const mappings: FormScreeningMapping[] = [];
    const conflictingProductIndexes: number[] = [];
    for (const [index, description] of productDescriptions.entries()) {
      const productFamily = normalizedFamily(description);
      const compatible = declared.flatMap((value, declaredIndex) => normalizedFamily(text(value?.tipo_prodotto)) === productFamily ? [declaredIndex] : []);
      if (compatible.length === 1) {
        mappings.push({ declared: declared[compatible[0]], source: "group_inheritance" });
        continue;
      }
      // Regola generale di Giuliano (De Filippo): la fattura prevale sempre
      // sul form. Quando la sua descrizione non specifica un sottotipo
      // riconosciuto (es. "Schermatura solare mobile", generica) ma il form
      // dichiara un'unica famiglia di prodotto per tutte le righe, la riga
      // fattura eredita comunque quella famiglia invece di essere trattata
      // come incompatibile con tutto. Resta un vero conflitto soltanto
      // quando il form dichiara piu' famiglie diverse tra cui scegliere.
      if (!productFamily && uniformDeclaredFamily) {
        mappings.push({ declared: declared[0], source: "group_inheritance_uniform_family" });
        continue;
      }
      mappings.push({ declared: null, source: null });
      conflictingProductIndexes.push(index);
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
  const automationExclusion = aprAutomationExclusion({ customerKey, displayName: `${text(row?.cliente_nome)} ${text(row?.cliente_cognome)}`, fornitore: row?.fornitore, companies: row?.companies });
  if (automationExclusion) {
    const sourceId = `${automationExclusion.sourceField}:${automationExclusion.sourceValue}`;
    const supplierExclusion = automationExclusion.kind === "supplier";
    const blocker = {
      code: supplierExclusion ? "permanent_supplier_automation_exclusion" : "permanent_customer_automation_exclusion",
      field: supplierExclusion ? "supplier" : "practice",
      reason: `${automationExclusion.displayName}: ${automationExclusion.reason} Nessun allegato viene elaborato e nessuna azione ENEA viene tentata.`,
      sourceIds: [sourceId], appliedRuleIds: [APR_FUTURE_TEST_EXCLUSION_RULE_ID, "system-apr-operator-intervention-routing"],
      operatorQuestion: supplierExclusion
        ? `Confermi che la pratica collegata a ${automationExclusion.displayName} deve restare esclusa dall'automazione APR?`
        : `Confermi che ${automationExclusion.displayName} deve restare una pratica interna esclusa dall'automazione APR?`,
      exactCause: `${automationExclusion.displayName}: ${automationExclusion.reason}`,
      missingDocumentType: null, onboardingGap: "Applicare l'esclusione anagrafica prima dell'acquisizione documentale.",
    };
    return {
      outcome: "blocked_case", formAvailable: Boolean(inlineForm && Object.keys(inlineForm).length), startDate: null, startDateSource: null,
      completionDate: null, completionDateSource: null, buildingQualification: null, buildingUnitCount: null, deductionRate: null,
      taxCodeStatus: "missing_or_invalid", resolvedTaxCode: null, taxCodeSourceIds: [],
      primaryBeneficiaryResolution: { status: "not_found", identity: null, sourceIds: [], authority: null },
      worksMunicipalityResolution: { status: "not_found", value: null, sourceIds: [] },
      coBeneficiaryResolution: { status: "not_declared", present: false, identity: null, sourceIds: [] },
      products: [], financial: { invoiceTotal: null, eligibleExpense: null, tripleReconciliationVerified: false, reconciledTotal: null, evidence: [], bankTransfers: [], bankTransferReconciliation: { status: "not_provided", principalTotal: null, feesTotal: null, debitedTotal: null, difference: null, referenceStatus: "not_provided", missingInvoiceReferences: [], taxReliefTypes: [] }, methods: [], discardedDuplicateSourceIds: [], supersededTechnicalSourceIds: [], appliedRuleIds: [APR_FUTURE_TEST_EXCLUSION_RULE_ID] },
      warnings: [], blockers: [blocker], sourceIds: [sourceId],
      eneaPayloadAudit: { status: "payload_incomplete", mappingFingerprint: null, fieldSummary: { ready: 0, review: 0, missing: 0 }, requiredPortalFieldCount: 0, blockerCount: 1, blockers: [{ code: blocker.code, fieldId: blocker.field, message: blocker.reason }], excludedUnverifiedFields: [], draftReady: false, officialSubmissionAllowed: false, portalGate: { status: "blocked", reason: supplierExclusion ? "permanent-supplier-automation-exclusion" : "permanent-customer-automation-exclusion", workflowFingerprint: null, supportedPages: [], screeningItemCount: 0, saveAllowedOnlyBySeparateCapability: true, previewAllowed: false, submitAllowed: false }, externalActionAllowed: false, reason: blocker.reason },
      draftPlan: { status: "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, nextAction: `Richiesto intervento operatore: pratica esclusa per ${supplierExclusion ? "fornitore" : "decisione permanente"}; proseguire con la pratica successiva.` },
    };
  }
  const supplierEvidence = lineaSolePotitoSupplierEvidence(row);
  const paperFormDocuments = analysis.items.filter((item) => item.customerKey === customerKey && item.state === "analyzed" && item.textPath && existsSync(item.textPath) && isLineaSolePotitoPaperForm(readFileSync(item.textPath, "utf8")));
  const lineaSolePaperForm = supplierEvidence.matched && paperFormDocuments.length > 0;
  const crmTaxCodeCandidate = normalizeCf(row?.cliente_cf);
  const invoiceConfirmsCrmTaxCode = isValidCodiceFiscale(crmTaxCodeCandidate) && analysis.items.some((item) => item.customerKey === customerKey && item.kind === "invoice" && item.state === "analyzed" && item.textPath && existsSync(item.textPath)
    && readFileSync(item.textPath, "utf8").replace(/\s+/g, "").toUpperCase().includes(crmTaxCodeCandidate));
  const invoicePaperTaxCodes = [...new Set(analysis.items
    .filter((item) => item.customerKey === customerKey && item.kind === "invoice" && item.state === "analyzed" && item.textPath && existsSync(item.textPath))
    .flatMap((item) => [...readFileSync(item.textPath!, "utf8").matchAll(LABELED_FISCAL_CODE)].map((match) => normalizeCf(match[1])))
    .filter(isValidCodiceFiscale))];
  const paperTaxCodeCandidates = invoicePaperTaxCodes.length
    ? invoicePaperTaxCodes
    : [invoiceConfirmsCrmTaxCode ? crmTaxCodeCandidate : null];
  const parsedPaperFormCandidates = paperFormDocuments.flatMap((item) => paperTaxCodeCandidates.map((taxCode) => parseLineaSolePotitoPaperForm(readFileSync(item.textPath!, "utf8"), {
    name: text(row?.cliente_nome), surname: text(row?.cliente_cognome), taxCode,
  }))).filter((value): value is NonNullable<typeof value> => {
    const requester = object(value?.richiedente);
    return Boolean(value && (supplierEvidence.matched
      || (text(requester?.nome) && text(requester?.cognome) && isValidCodiceFiscale(normalizeCf(requester?.cf)))));
  });
  const paperFormSignatures = new Map(parsedPaperFormCandidates.map((value) => {
    const metadata = object(value._lineaSolePotito);
    return [JSON.stringify({ richiedente: value.richiedente, residenza: value.residenza, appartamento_lavori: value.appartamento_lavori, catastali: value.catastali, edificio: value.edificio, explicitScreenings: metadata?.explicitScreenings ?? [] }), value] as const;
  }));
  const paperFormConflict = paperFormSignatures.size > 1;
  const parsedPaperForm = paperFormSignatures.size === 1 ? [...paperFormSignatures.values()][0] : null;
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
  // Controllo bonifici (decisione di Giuliano, 2026-09-07, corretta alla
  // radice l'8/9/2026 dopo il falso blocco di Ronconi): riconoscere con
  // precisione un segmento bonifico misto a una fattura nello stesso
  // allegato aveva causato piu' falsi blocchi reali (Manso, Liliana Gloria,
  // Mastrangelo, Coda), dove la ricevuta di pagamento veniva letta come una
  // fattura indipendente (con importo comprensivo di commissioni o del
  // tutto illeggibile). Verificare soltanto che la terna sia completa non
  // basta: una ricevuta "Presa in carico - Bonifico per Agevolazioni
  // Fiscali" puo' citare nella propria causale un numero/data che il
  // rilevatore di intestazioni fattura legge come se fosse una vera
  // intestazione, e "Totale operazione" come se fosse il totale documento,
  // producendo una terna completa ma fasulla (controprova verificata su
  // questo stesso file di test). Il segno distintivo reale, verificato sui
  // documenti originali di tutti i casi coinvolti: in una fattura vera la
  // terna fiscale si risolve gia' dal testo che precede la prima
  // intestazione bancaria (il bonifico e' accodato DOPO, come conferma di
  // pagamento di una fattura gia' completa in se stessa: Ronconi); in una
  // ricevuta fantasma la terna dipende da testo a partire dall'intestazione
  // bancaria in poi, perche' e' la ricevuta stessa a fornire numero/data/
  // importo nella propria causale (Manso, Mastrangelo, Coda, e la
  // controprova "Presa in carico"). Si ri-analizza percio' soltanto il
  // testo del segmento precedente alla prima intestazione bancaria.
  const bankEvidenceContaminatedSourceIds: string[] = [];
  const invoiceSegments = invoiceDocuments.flatMap(({ item, text: documentText }) => splitLocalInvoiceText({
    documentKey: item.documentKey,
    text: documentText,
    extractionMode: item.extractionMode ?? "macos_vision_ocr",
  })).filter((segment) => {
    if (segment.result.documentType !== "invoice" && segment.result.documentType !== "credit_note") return false;
    if (extractBankTransferEvidences(segment.sourceId, segment.text).length === 0) return true;
    const headerIndex = firstBankTransferHeaderIndex(segment.text);
    const textBeforeBankHeader = headerIndex !== null ? segment.text.slice(0, headerIndex) : segment.text;
    const parsedBeforeBankHeader = parseScreeningInvoiceText(textBeforeBankHeader, segment.sourceId);
    const hasCompleteTripleBeforeBankHeader = Boolean(parsedBeforeBankHeader.result.documentNumber
      && parsedBeforeBankHeader.result.documentDate && parsedBeforeBankHeader.result.total !== null);
    if (hasCompleteTripleBeforeBankHeader) bankEvidenceContaminatedSourceIds.push(segment.sourceId);
    return hasCompleteTripleBeforeBankHeader;
  });
  if (bankEvidenceContaminatedSourceIds.length) warnings.push({
    code: "invoice_segment_kept_despite_bank_transfer_evidence",
    reason: `${bankEvidenceContaminatedSourceIds.length} segmento/i fattura mantenuti nonostante una conferma di bonifico accodata nello stesso allegato: terna fiscale (numero, data, totale) gia' completamente risolta dall'intestazione propria, il bonifico non e' letto per questa decisione.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.bankTransferSegmentExclusionRequiresIncompleteTriple],
  });
  const segmentReconciliation = reconcileLocalInvoiceSegments(invoiceSegments);
  const advanceInvoiceReferences = resolveExplicitAdvanceInvoiceReferences(invoiceSegments);
  const missingAdvanceInvoices = advanceInvoiceReferences.missing;
  if (missingAdvanceInvoices.length) blockers.push({
    code: "original_invoice_missing_or_unavailable",
    field: "economic_sources",
    reason: `La fattura presente detrae o richiama una fattura di acconto non acquisita (${missingAdvanceInvoices.map((item) => item.reference).join(", ")}); APR non puo ricostruire il totale documentale completo senza la fonte fiscale originaria.`,
    sourceIds: [...new Set(missingAdvanceInvoices.map((item) => item.sourceId))],
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue, USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum, "core-economic-classification", "system-apr-operator-intervention-routing"],
  });
  if (advanceInvoiceReferences.uniqueBaseMatches.length) warnings.push({
    code: "invoice_reference_unique_base_matched",
    reason: `Riferimenti fattura risolti tramite numero base univoco: ${advanceInvoiceReferences.uniqueBaseMatches.map((item) => `${item.reference} -> ${item.matchedDocumentNumber}`).join(", ")}. Riferimento e numero documento completi restano separati nell'audit.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.uniqueInvoiceBaseReferenceMatch, USER_AUTHORIZED_RULE_IDS.missingInvoiceOperatorRequeue],
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
  let resellerInvoiceExclusionApplied = false;
  const financialEvidence = segmentReconciliation.uniqueFinancialSegments.map((segment) => {
    const evidence = extractLocalInvoiceFinancialEvidence({
      sourceId: segment.sourceId,
      text: segment.text,
      extractionMode: segment.extractionMode,
      documentNumber: segment.documentNumber,
      documentDate: segment.documentDate,
      grossTotal: segment.total,
    });
    // Regola generale definitiva di Giuliano (2026-09-08, regressione
    // Calvacchi): una fattura del produttore al rivenditore/installatore,
    // non al cliente beneficiario, non entra mai nel totale economico;
    // resta una fonte tecnica (misure, caratteristiche prodotto).
    if (!invoiceAddressedToDifferentCompanyThanBeneficiary(segment.text, text(row?.cliente_nome), text(row?.cliente_cognome))) return evidence;
    resellerInvoiceExclusionApplied = true;
    return { ...evidence, kind: "non_economic" as const };
  });
  const financialReconciliation = reconcileFinancialEvidence(financialEvidence, { mode: "test", scheme: "ecobonus" });
  const scheduleAmountMissingSources = financialEvidence
    .filter((item) => item.extractionIssues?.some((issue) => issue.code === "schedule_amount_missing"))
    .map((item) => item.sourceId);
  // Regola generale definitiva di Giuliano (2026-09-08, regressione
  // Calvacchi): il totale fatture della pratica e' sempre e soltanto la
  // somma delle fatture verso il cliente beneficiario; una fattura del
  // produttore al rivenditore/installatore (kind "non_economic" per
  // invoiceAddressedToDifferentCompanyThanBeneficiary) non va mai contata,
  // in nessuno degli usi di questo totale (eleggibilita', riconciliazione
  // bonifici, importo mostrato in report).
  const economicFinancialEvidence = financialEvidence.filter((item) => item.kind !== "non_economic");
  const invoiceGrossValues = economicFinancialEvidence.map((item) => item.grossTotal);
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
  if (paperFormConflict) blockers.push({ code: "customer_paper_form_conflict", field: "customer_form", reason: "Più moduli cartacei PraticaRapida originari espongono valori espliciti non concordanti; nessun documento viene scelto per posizione o ordine.", sourceIds: paperFormDocuments.map((item) => item.documentKey), appliedRuleIds: [ORIGINAL_PRACTICA_RAPIDA_PAPER_FORM_RULE_ID, "core-form-first", "system-apr-operator-intervention-routing"] });
  if (parsedPaperForm && !lineaSolePaperForm) warnings.push({ code: "original_pratica_rapida_paper_form_explicit_values_accepted", reason: `Valori espliciti del modulo cartaceo PraticaRapida originario riconosciuti da ${paperFormDocuments.map((item) => item.documentKey).join(", ")}; nessun fallback specifico del rivenditore applicato.`, appliedRuleIds: [ORIGINAL_PRACTICA_RAPIDA_PAPER_FORM_RULE_ID, "core-form-first"] });
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
  const invoiceCustomerBlockCf = resolveCrmFiscalCodeFromOriginalInvoiceCustomerBlock({
    customerKey,
    name: text(row?.cliente_nome),
    surname: text(row?.cliente_cognome),
    taxCode: crmCf,
    analysis,
  });
  const effectiveDocumentCf = documentCf.status === "verified" || documentCf.status === "conflict"
    ? documentCf
    : invoiceCustomerBlockCf.status === "verified_invoice_customer_block"
      ? { status: "verified" as const, value: invoiceCustomerBlockCf.value, sourceIds: invoiceCustomerBlockCf.sourceIds, candidates: [invoiceCustomerBlockCf.value] }
      : documentCf;
  const coBeneficiaryResolution = resolveCoBeneficiaryFromOriginalInvoices({ customerKey, coOwnership: object(form?.cointestazione), mainDocumentFiscalCode: effectiveDocumentCf, primaryFiscalCodes: [formCf, crmCf], analysis });
  let taxCodeStatus: AprCrmLocalPreflightReport["taxCodeStatus"] = "missing_or_invalid";
  let resolvedTaxCode: string | null = null;
  const resolution = resolveBeneficiaryFiscalCode({ formFiscalCode: formCf, originalDocumentFiscalCode: effectiveDocumentCf.value, documentCoherentWithIdentity: effectiveDocumentCf.status === "verified" });
  if (resolution.source === "form") {
    taxCodeStatus = crmCf && isValidCodiceFiscale(crmCf) && crmCf !== resolution.value ? "conflict" : "verified_form";
    resolvedTaxCode = taxCodeStatus === "verified_form" ? resolution.value : null;
  } else if (resolution.source === "original_document") {
    taxCodeStatus = "verified_original_document";
    resolvedTaxCode = resolution.value;
  } else if (effectiveDocumentCf.status === "conflict") taxCodeStatus = "conflict";
  if (invoiceCustomerBlockCf.status === "verified_invoice_customer_block" && resolvedTaxCode === invoiceCustomerBlockCf.value) warnings.push({
    code: "crm_fiscal_code_confirmed_by_invoice_customer_block",
    reason: `CF CRM ${invoiceCustomerBlockCf.value} confermato nel blocco ${invoiceCustomerBlockCf.usedCfDestinatarioAnchor ? "'CF ... DESTINATARIO'" : "CLIENTE"} di una fattura originaria, con checksum e prefissi fiscali di nome/cognome concordanti.`,
    appliedRuleIds: [
      INVOICE_CUSTOMER_BLOCK_CRM_CF_RULE_ID,
      USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck,
      ...(invoiceCustomerBlockCf.usedCfDestinatarioAnchor ? [USER_AUTHORIZED_RULE_IDS.cfDestinatarioAnchorWithoutClienteLabel] : []),
    ],
  });
  if (fiscalCodeRepair && resolvedTaxCode === fiscalCodeRepair.corrected) warnings.push({
    code: "fiscal_code_single_ocr_confusable_repaired",
    reason: `CF originario ${fiscalCodeRepair.original} corretto in ${fiscalCodeRepair.corrected}: unica sostituzione OCR confondibile, checksum valido e anagrafica form concordante; entrambi conservati in audit.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  const primaryBeneficiaryResolution = resolvePrimaryBeneficiaryFromOfficialDocuments({ customerKey, taxCode: resolvedTaxCode, requesterBirthDate: text(requester?.data_nascita), analysis });
  if (!resolvedTaxCode) blockers.push({
    code: taxCodeStatus === "conflict" ? "tax_code_conflict" : "tax_code_missing_or_invalid",
    field: "beneficiary.taxCode",
    reason: taxCodeStatus === "conflict" ? "CF validi divergenti tra le fonti originarie o tra form e CRM." : "CF valido e coerente non disponibile nel form o nelle fatture originarie.",
    sourceIds: [customerKey, ...effectiveDocumentCf.sourceIds],
    appliedRuleIds: ["core-form-first", USER_AUTHORIZED_RULE_IDS.validOriginalDocumentFiscalCode, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  if (primaryBeneficiaryResolution.status === "conflict") blockers.push({
    code: "primary_beneficiary_invoice_identity_conflict",
    field: "beneficiary.identity",
    reason: "Le fatture originarie riportano identita anagrafiche diverse per lo stesso CF; la precedenza fattura non e applicabile senza intervento operatore.",
    sourceIds: primaryBeneficiaryResolution.sourceIds,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.officialIdentityOverManualCrm, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck, "system-apr-operator-intervention-routing"],
  });
  if (primaryBeneficiaryResolution.status === "verified_document" && primaryBeneficiaryResolution.identity
    && (normalizedIdentityText(text(requester?.nome)) !== normalizedIdentityText(primaryBeneficiaryResolution.identity.name)
      || normalizedIdentityText(text(requester?.cognome)) !== normalizedIdentityText(primaryBeneficiaryResolution.identity.surname)
      || (primaryBeneficiaryResolution.identity.birthDate && text(requester?.data_nascita).slice(0, 10) !== primaryBeneficiaryResolution.identity.birthDate))) warnings.push({
    code: "primary_beneficiary_identity_overridden_by_invoice",
    reason: `Identita principale ricavata da ${primaryBeneficiaryResolution.authority === "official_identity_document" ? "documento ufficiale" : "documento fiscale"} per il CF verificato: ${primaryBeneficiaryResolution.identity.name} ${primaryBeneficiaryResolution.identity.surname}${primaryBeneficiaryResolution.identity.birthDate ? `, nascita ${primaryBeneficiaryResolution.identity.birthDate}, sesso ${primaryBeneficiaryResolution.identity.sex}` : ""}; prevale sui dati inseriti nel CRM e nel form cliente.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.officialIdentityOverManualCrm, USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck],
  });
  // Il mapper deriva l'indirizzo lavori dalla residenza quando
  // stesso_indirizzo_lavori e' vero: confrontare sempre con appartamento_lavori
  // produceva falsi allarmi quando quel campo era semplicemente assente dal CRM.
  const crmResidenceAddress = object(form?.residenza);
  const crmWorksAddress = crmResidenceAddress?.stesso_indirizzo_lavori ? crmResidenceAddress : object(form?.appartamento_lavori);
  const worksMunicipalityResolution = resolveWorksMunicipalityFromOriginalInvoices({
    customerKey, analysis, requireDeliveryDestinationMarker: !crmResidenceAddress?.stesso_indirizzo_lavori,
  });
  const crmWorksComuneRaw = text(crmWorksAddress?.comune);
  const crmWorksProvinciaRaw = text(crmWorksAddress?.provincia);
  // La provincia CRM puo' essere una sigla, un nome ufficiale ISTAT o un nome
  // colloquiale ("Reggio Emilia" invece di "Reggio nell'Emilia"): la fattura
  // produce sempre una sigla. Risolvere quando possibile; se la provincia CRM
  // non e' gia' una sigla e non si risolve, ometterla dal confronto invece di
  // segnalare come "discordante" un dato che potrebbe essere solo un nome
  // colloquiale corretto.
  const crmWorksCanonical = crmWorksComuneRaw ? resolveOfficialMunicipalityCanonicalIdentity({ name: crmWorksComuneRaw, province: crmWorksProvinciaRaw }) : null;
  const crmWorksComune = crmWorksCanonical?.canonicalName ?? crmWorksComuneRaw;
  const crmWorksProvinciaSigla = crmWorksCanonical?.provinceCode
    ?? (/^[A-Za-z]{2}$/.test(crmWorksProvinciaRaw) ? crmWorksProvinciaRaw.toUpperCase() : null);
  if (worksMunicipalityResolution.status === "conflict") blockers.push({
    code: "works_municipality_invoice_conflict",
    field: "immobile.comune",
    reason: "Le fatture originarie riportano un Comune di destinazione lavori diverso tra loro; la precedenza fattura non e applicabile senza intervento operatore.",
    sourceIds: worksMunicipalityResolution.sourceIds,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.officialWorksMunicipalityOverManualCrm, "system-apr-operator-intervention-routing"],
  });
  // Canonicalizzare anche il nome estratto dalla fattura ("Monte Compatri" vs
  // CRM "MONTECOMPATRI") prima del confronto per spazi/varianti grafiche, con
  // lo stesso meccanismo gia' usato per il lato CRM.
  const resolvedWorksCanonical = worksMunicipalityResolution.value
    ? resolveOfficialMunicipalityCanonicalIdentity({ name: worksMunicipalityResolution.value.comune, province: worksMunicipalityResolution.value.provincia })
    : null;
  const resolvedWorksComune = resolvedWorksCanonical?.canonicalName ?? worksMunicipalityResolution.value?.comune ?? "";
  if (worksMunicipalityResolution.status === "verified_document" && worksMunicipalityResolution.value
    && (normalizedIdentityText(crmWorksComune) !== normalizedIdentityText(resolvedWorksComune)
      || (crmWorksProvinciaSigla !== null && crmWorksProvinciaSigla !== worksMunicipalityResolution.value.provincia))) warnings.push({
    code: "works_municipality_overridden_by_invoice",
    reason: `Comune lavori ricavato dalla fattura originaria: ${worksMunicipalityResolution.value.comune} (${worksMunicipalityResolution.value.provincia}); prevale sul dato CRM/form '${crmWorksComune || "assente"}${crmWorksProvinciaRaw ? ` (${crmWorksProvinciaRaw})` : ""}'.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.officialWorksMunicipalityOverManualCrm],
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
  const buildingQualification = floorBandBuildingType
      ? "multi_unit" as const
      : explicitlySingleUnitBuilding
        ? "single_unit" as const
        : buildingUnitCount !== null && buildingUnitCount > 1
        ? "multi_unit" as const
        : buildingUnitCount === 1
          ? "single_unit" as const
          : null;
  if (formAvailable && (rawUnits === null || rawUnits <= 0)) warnings.push({ code: "building_units_defaulted_to_one", reason: "Numero appartamenti non specificato o zero: impostata una unita immobiliare.", appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.defaultSingleUnitWhenUnspecified, USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification] });
  if (floorBandBuildingType && buildingUnitCount === 1) warnings.push({
    code: "explicit_building_type_over_apartment_count",
    reason: "La tipologia esplicita fino/oltre tre piani prevale sul numero appartamenti della singola pratica: edificio qualificato come plurimo.",
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount],
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
    const mapping = formMappings.mappings[index] ?? { declared: null, source: null }; const declared = mapping.declared;
    // La famiglia riconciliata e' stabilita dalla descrizione di fattura e,
    // solo quando questa e' generica, dal gruppo form univocamente associato.
    // Passarla al resolver prima dei fallback impedisce che una zanzariera
    // descritta come "Altra schermatura solare" riceva il fallback Tessuto.
    const sourceFamily = normalizedFamily(item.description);
    const reconciledFamily = sourceFamily ?? normalizedFamily(text(declared?.tipo_prodotto));
    const resolverDescription = reconciledFamily === "zanzariera" && sourceFamily === null
      ? `${item.description} - zanzariera`
      : item.description;
    const rule = resolveProductTechnicalAttributes(resolverDescription, attributeContext, item.gTot, text(declared?.tipo_prodotto) || null);
    if (!rule) {
      if (/\b(?:vepa|vetrat[ae]\s+scorrevol[ei])\b/i.test(item.description)) blockers.push({ code: `vepa_module_not_enabled_${index + 1}`, field: `screenings.${index + 1}.type`, reason: "Vetrata scorrevole/VEPA riconosciuta e conservata 1:1, ma il modulo APR VEPA non è ancora abilitato: pratica parcheggiata senza classificazione ENEA.", sourceIds: [item.sourcePath], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.vepaDeferredCurrentPhase, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, "system-apr-operator-intervention-routing"] });
      else blockers.push({ code: `product_unclassified_${index + 1}`, field: `screenings.${index + 1}.type`, reason: "Prodotto non qualificabile senza inventare una classificazione.", sourceIds: [item.sourcePath], appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality] });
      continue;
    }
    if (rule.gTot === null || rule.source === "operator_required") {
      blockers.push({
        code: `screening_gtot_missing_operator_required_${index + 1}`,
        field: `screenings.${index + 1}.gTot`,
        reason: `gTot non documentato per famiglia ${rule.classification.family}: nessun fallback autorizzato. Richiesto intervento operatore per questa pratica; la coda prosegue.`,
        sourceIds: [item.sourcePath],
        appliedRuleIds: [rule.ruleId, rule.classification.ruleId, SPECIFIC_INCOMPLETE_SCREENING_BLOCKER_RULE_ID, "system-apr-operator-intervention-routing", "system-atomic-checkpoint-resume"],
      });
      continue;
    }
    if (shutterContractDescription && !rule.material) {
      blockers.push({ code: `${shutterLabel}_material_contradiction_${index + 1}`, field: `screenings.${index + 1}.material`, reason: `La fonte originaria attribuisce all${avvolgibileDescription ? "'avvolgibile" : "a persiana"} un materiale contrario al contratto autorizzato alluminio/Metallo. Richiesto intervento operatore.`, sourceIds: [item.sourcePath], appliedRuleIds: [shutterRuleId, "system-apr-operator-intervention-routing"] });
      continue;
    }
    const fallbackMaterialBlocker = screeningFallbackMaterialCategoryBlocker({
      index,
      description: item.description,
      declaredType: text(declared?.tipo_prodotto) || null,
      material: rule.material,
      materialSource: rule.materialSource,
      sourceId: item.sourcePath,
    });
    if (fallbackMaterialBlocker) {
      blockers.push(fallbackMaterialBlocker);
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
        ...(mapping.source === "group_inheritance" || mapping.source === "group_invoice_type_override" ? [USER_AUTHORIZED_RULE_IDS.formGroupProductInheritance] : []),
        ...(mapping.source === "group_inheritance_uniform_family" ? [USER_AUTHORIZED_RULE_IDS.screeningInvoiceDescriptionInheritsUniformFormFamily] : [])] });
  }
  // `screenings_missing` descrive esclusivamente l'assenza di righe fisiche.
  // Se una riga e' stata riconosciuta ma un attributo obbligatorio resta
  // irrisolto, il blocker specifico deve sostituire quello generico: altrimenti
  // lo stesso prodotto risulta contemporaneamente presente e assente.
  if (!products.length && technicalItems.length === 0 && !blockers.some((item) => /^(?:vepa_module_not_enabled_|screening_fallback_material_category_conflict_)/.test(item.code))) blockers.push({ code: "screenings_missing", field: "screenings", reason: "Nessun prodotto fisico riconciliato dalle fatture originarie.", sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, SPECIFIC_INCOMPLETE_SCREENING_BLOCKER_RULE_ID] });

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

  // Sospensione del controllo di riconciliazione bonifici/fatture (decisione
  // di Giuliano, 2026-09-07): questo gate bloccava pratiche economicamente
  // corrette per via di bonifici non letti/riconosciuti in modo affidabile.
  // Da ora APR usa esclusivamente il totale delle fatture per decidere se una
  // pratica e' economicamente a posto; i due blocker restano scritti ma non
  // vengono piu' generati. Sospensione temporanea: da rivalutare entro
  // dicembre 2026 per un eventuale requisito di separazione pagamenti
  // 2026/2027 richiesto da ENEA (vedi BANK_TRANSFER_RECONCILIATION_GATE_SUSPENDED_RULE_ID).
  if (!BANK_TRANSFER_RECONCILIATION_GATE_SUSPENDED && bankTransferReconciliation.status === "principal_exceeds_invoices") blockers.push({
    code: "bank_transfer_principal_exceeds_invoices",
    field: "economic_sources.bankTransfers",
    reason: `Il capitale bonificato supera le fatture di € ${bankTransferReconciliation.difference?.toFixed(2)}: intervento operatore richiesto.`,
    sourceIds: bankTransfers.map((item) => item.sourceId),
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers, "system-apr-operator-intervention-routing"],
  });
  if (!BANK_TRANSFER_RECONCILIATION_GATE_SUSPENDED && bankTransferReconciliation.status === "unverified") blockers.push({
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
  if (bundledProfessionalExpense.status === "resolved_case_specific") warnings.push({
    code: "bundled_professional_expense_case_specific_resolution",
    reason: `Risoluzione caso-specifica auditata: lordo € ${bundledProfessionalExpense.resolution.grossInvoiceTotal.toFixed(2)}, spesa tecnica € ${bundledProfessionalExpense.eligibleTechnicalExpense.toFixed(2)}, differenza esclusa ma non classificata dalle fonti € ${bundledProfessionalExpense.excludedUnclassifiedExpense.toFixed(2)}. Non propagabile ad altre pratiche.`,
    appliedRuleIds: bundledProfessionalExpense.resolution.appliedRuleIds,
  });
  if (bundledProfessionalExpense.status === "gross_used_marker_present") warnings.push({
    code: "bundled_professional_expense_gross_used",
    reason: `Le fatture menzionano un servizio ENEA incluso o fatturato a parte («${bundledProfessionalExpense.markers.map((item) => item.text).join(" · ")}»), ma per regola generale il totale economico resta la somma di tutte le fatture, senza scomposizione: lordo € ${invoiceGrossTotal?.toFixed(2) ?? "non verificato"}.`,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.grossInvoiceSumSupersedesServiceSeparation, USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded],
  });

  const invoiceWorkDates = resolveInvoiceWorkDates(segmentReconciliation.uniqueFinancialSegments);
  const startDate = invoiceWorkDates.startDate ?? combinedFinancial?.firstInvoiceDate ?? null;
  const startDateSource = invoiceWorkDates.startDateSource
    ?? combinedFinancial?.documents.find((document) => document.documentDate === combinedFinancial.firstInvoiceDate)?.path ?? null;
  const crmExplicitCompletion = text(row?.data_fine_lavori) || text(form?.fine_lavori);
  const originalCompletion = resolveExplicitOriginalCompletionDate(analysis, customerKey);
  const originalCompletionConflictsWithCrm = Boolean(crmExplicitCompletion && originalCompletion.status === "verified" && originalCompletion.value !== crmExplicitCompletion);
  if (originalCompletion.status === "conflict" || originalCompletionConflictsWithCrm) blockers.push({
    code: "completion_date_source_conflict",
    field: "dates.completion",
    reason: originalCompletionConflictsWithCrm
      ? `Data fine lavori CRM ${crmExplicitCompletion} diversa dalla dichiarazione originaria ${originalCompletion.value}; richiesto controllo operatore.`
      : "Più documenti originari dichiarano date di fine lavori/collaudo finale diverse; richiesto controllo operatore.",
    sourceIds: [...new Set([customerKey, ...originalCompletion.sourceIds])],
    appliedRuleIds: [EXPLICIT_ORIGINAL_COMPLETION_DATE_RULE_ID, "system-apr-operator-intervention-routing"],
  });
  const explicitCompletion = crmExplicitCompletion || (originalCompletion.status === "verified" && !originalCompletionConflictsWithCrm ? originalCompletion.value : "");
  const completionDate = explicitCompletion || invoiceWorkDates.completionDate || combinedFinancial?.lastInvoiceDate || null;
  const completionDateSource = crmExplicitCompletion ? customerKey
    : originalCompletion.status === "verified" && !originalCompletionConflictsWithCrm ? originalCompletion.sourceIds[0] ?? null
    : invoiceWorkDates.completionDateSource
    ?? combinedFinancial?.documents.filter((document) => document.documentDate === combinedFinancial.lastInvoiceDate).at(-1)?.path ?? null;
  if (!crmExplicitCompletion && originalCompletion.status === "verified" && !originalCompletionConflictsWithCrm) warnings.push({
    code: "explicit_original_completion_date_applied",
    reason: `Data fine lavori ${originalCompletion.value} acquisita da dichiarazione originaria esplicita (${originalCompletion.evidenceKinds.join(", ")}).`,
    appliedRuleIds: [EXPLICIT_ORIGINAL_COMPLETION_DATE_RULE_ID],
  });
  if (!completionDate) blockers.push({ code: "completion_date_missing", field: "dates.completion", reason: "Fine lavori assente e data fattura non ricavabile.", sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.missingCompletionDate] });
  else {
    const deadline = assessEnea2026SubmissionDeadline(completionDate, now);
    blockers.push(...completionDateOperatorBlockers(completionDate, completionDateSource, Boolean(explicitCompletion), now));
    if (deadline.specialWindowApplied) warnings.push({
      code: "enea_2026_june_30_ninety_day_window_applied",
      reason: `Regola ENEA 2026 applicata: fine lavori ${completionDate} dal 04/02/2026 in poi; i 90 giorni decorrono dal 30/06/2026 e terminano il 28/09/2026, indipendentemente dalla fine lavori reale.`,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.enea2026June30NinetyDayWindowCompletionDateOnly],
    });
  }

  for (const message of combinedFinancial?.blockers ?? []) {
    if (technicalItems.length > 0 && /Nessuna riga di schermatura con dimensioni/i.test(message)) continue;
    if (isResolvedNonEconomicTotalBlocker(message, combinedFinancial?.documents ?? [], financialReconciliation)) {
      warnings.push({
        code: "resolved_non_economic_total_blocker_retired",
        reason: `Rimosso il falso blocker di totale non riconosciuto: tutti i segmenti senza totale del parser documentale coincidono con storni non_economic verificati (${financialReconciliation.nonEconomicSourceIds.join(", ")}) e la tripla riconciliazione economica e verde.`,
        appliedRuleIds: [RESOLVED_NON_ECONOMIC_TOTAL_BLOCKER_RETIREMENT_RULE_ID, "system-zero-total-full-reversal-non-economic-v1", "core-gross-triple-reconciliation"],
      });
      continue;
    }
    blockers.push(screeningMeasurementEvidence === "missing" && /Nessuna riga di schermatura con dimensioni/i.test(message)
      ? { code: "screening_primary_measurements_missing", field: "screenings.dimensions", reason: "La fattura descrive la schermatura ma nessuna fonte primaria riporta le misure fisiche del prodotto. APR non usa le misure della finestra protetta come misure del prodotto: acquisire o confermare le misure e rimettere la pratica in Pronte da fare.", sourceIds, appliedRuleIds: ["system-screening-primary-measurements-operator-routing", USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, "system-apr-operator-intervention-routing"] }
      : { code: `invoice_${sha256(message).slice(0, 8)}`, field: "economic_sources", reason: message, sourceIds, appliedRuleIds: ["core-economic-classification"] });
  }
  if (scheduleAmountMissingSources.length > 0) blockers.push({
    code: "invoice_schedule_amount_missing",
    field: "economic_sources.schedule.amount",
    reason: "Scadenza non leggibile, importo mancante: verificare l'importo dello scadenziario nella fattura originaria.",
    sourceIds: scheduleAmountMissingSources,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceScheduleMissingAmount],
  });
  if (!financialReconciliation.usable) blockers.push({ code: "gross_triple_reconciliation_failed", field: "economic_sources.total", reason: `Tripla riconciliazione non dimostrata: ${financialReconciliation.blockers.length ? financialReconciliation.blockers.join(", ") : financialReconciliation.methods.filter((method) => !method.ok).map((method) => method.reason).join(", ")}.`, sourceIds, appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded, "core-gross-triple-reconciliation", ...financialReconciliation.appliedRuleIds] });
  const uniqueBlockers = blockers.filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code) === index);
  const financialEligibleForEnea = financialReconciliation.usable;
  // Conservare la ripartizione economica auditata anche quando un controllo
  // indipendente (per esempio il tipo fiscale del bonifico) blocca la pratica.
  // Il gate resta chiuso tramite tripleReconciliationVerified/blockers, ma la
  // dashboard non deve perdere il valore tecnico verificato e tornare al lordo.
  const eligibleTechnicalExpense = bundledProfessionalExpense.eligibleTechnicalExpense;
  const baseEneaPayloadAudit = buildCrmEneaPayloadAudit({
    customerKey,
    dossierValue: dossier && row && form ? { ...dossier, row: { ...row, dati_form: form } } : dossierValue,
    resolvedTaxCode,
    resolvedPrimaryBeneficiary: primaryBeneficiaryResolution.status === "verified_document" ? primaryBeneficiaryResolution.identity : null,
    resolvedPrimaryBeneficiarySourceIds: primaryBeneficiaryResolution.sourceIds,
    resolvedWorksMunicipality: worksMunicipalityResolution.status === "verified_document" ? worksMunicipalityResolution.value : null,
    resolvedWorksMunicipalitySourceIds: worksMunicipalityResolution.sourceIds,
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
  const structuredFinalBlockers = finalBlockers.map((blocker) => {
    const structured = structureAprResidualBlocker({ practiceId: text(row?.id) || customerKey, code: blocker.code, field: blocker.field, reason: blocker.reason });
    return { ...blocker, exactCause: structured.exactCause, missingDocumentType: structured.missingDocumentType, operatorQuestion: structured.operatorQuestion, onboardingGap: structured.onboardingGap, appliedRuleIds: [...new Set([...blocker.appliedRuleIds, structured.ruleId])] };
  });
  const ready = structuredFinalBlockers.length === 0;
  return { outcome: ready ? "ready_local_plan" : "blocked_case", formAvailable, startDate, startDateSource, completionDate, completionDateSource, buildingQualification, buildingUnitCount, deductionRate, taxCodeStatus, resolvedTaxCode, taxCodeSourceIds: taxCodeStatus === "verified_original_document" ? effectiveDocumentCf.sourceIds : [customerKey], primaryBeneficiaryResolution, worksMunicipalityResolution, coBeneficiaryResolution, products,
    financial: {
      // I prodotti tecnici possono essere superseduti tra acconto e saldo,
      // mentre gli importi fiscali restano tutte le fatture uniche. Non usare
      // quindi il sottoinsieme tecnico per il totale economico.
      invoiceTotal: invoiceGrossTotal, eligibleExpense: eligibleTechnicalExpense,
      tripleReconciliationVerified: financialEligibleForEnea, reconciledTotal: eligibleTechnicalExpense,
      evidence: financialEvidence.map(({ sourceId, kind, taxableAmount, vatAmount, grossTotal, interventionGrossAmount, extractionConfidence, extractionIssues }) => ({ sourceId, kind, taxableAmount, vatAmount, grossTotal, interventionGrossAmount, extractionConfidence, extractionIssues: [...(extractionIssues ?? [])] })),
      bankTransfers,
      bankTransferReconciliation,
      methods: financialReconciliation.methods.map((method) => ({ ...method })),
      discardedDuplicateSourceIds: [...new Set([...segmentReconciliation.discardedDuplicateSourceIds, ...financialReconciliation.discardedDuplicateSourceIds])],
      supersededTechnicalSourceIds: segmentReconciliation.supersededTechnicalSourceIds,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded, USER_AUTHORIZED_RULE_IDS.grossInvoiceSumSupersedesServiceSeparation, USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck, "core-gross-triple-reconciliation", USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, EXPLICIT_ADVANCE_INVOICE_REFERENCE_MARKER_RULE_ID, ...(advanceInvoiceReferences.uniqueBaseMatches.length ? [USER_AUTHORIZED_RULE_IDS.uniqueInvoiceBaseReferenceMatch] : []), ...(segmentReconciliation.discardedDuplicateSourceIds.length ? ["system-invoice-header-identity-over-body-reference"] : []), ...(segmentReconciliation.discardedPartialScanDuplicateSourceIds.length ? [USER_AUTHORIZED_RULE_IDS.partialScanSameInvoiceNumberDuplicateMerge] : []), ...(segmentReconciliation.discardedConflictingOcrDuplicateSourceIds.length ? [NATIVE_OCR_FISCAL_DUPLICATE_AUTHORITY_RULE_ID, USER_AUTHORIZED_RULE_IDS.duplicateInvoiceOcrVariantDeduplication, USER_AUTHORIZED_RULE_IDS.duplicateInvoiceMatchingNumberAndDateOverTotal] : []), ...(segmentReconciliation.nonFiscalTechnicalSourceIds.length ? [USER_AUTHORIZED_RULE_IDS.nonFiscalSupportingDocumentExclusion] : []), ...(resellerInvoiceExclusionApplied ? [USER_AUTHORIZED_RULE_IDS.resellerInstallerInvoiceExcludedFromEconomicTotal] : []), ...(segmentReconciliation.uniqueFinancialSegments.some((segment) => hasInternalAdvanceCreditLine(segment.text)) ? [USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalOnlyNeverInternalRecalculation] : []), ...(segmentReconciliation.replacedFinancialSourceIds.length ? ["system-explicit-replacement-invoice-supersession"] : []), ...(segmentReconciliation.percentageCausalSupersededTechnicalSourceIds.length ? [EXPLICIT_PERCENTAGE_CAUSAL_TECHNICAL_SUPERSESSION_RULE_ID] : []), ...financialReconciliation.appliedRuleIds],
    }, warnings, blockers: structuredFinalBlockers, sourceIds, eneaPayloadAudit,
    draftPlan: { status: ready ? "ready_before_external_action" : "blocked", externalActionAllowed: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false,
      nextAction: ready ? "Piano locale pronto; fermo prima di ENEA." : uniqueBlockers.some((item) => item.code === "original_invoice_missing_or_unavailable") ? "Richiesto intervento operatore: acquisire la fattura; al ritorno in Pronte da fare APR riprende dal nuovo fingerprint." : "Risolvere i blocker con sole fonti originarie; la coda prosegue sugli altri casi." } };
}

function initialState(now: Date): AprCrmLocalPreflightState { const reason = "Preflight CRM locale non preparato."; return { version: APR_CRM_LOCAL_PREFLIGHT_VERSION, revision: 0, status: "unprepared", sourceFingerprint: null, currentCustomerKey: null, items: [], externalActionAllowed: false, reason, nextAction: "Attendere dossier e analisi documenti completi.", validationRevisionsApplied: [], sourceRevisionsApplied: [], operatorMeasurementResolutions: [], audit: [{ revision: 0, at: now.toISOString(), type: "initialized", customerKey: null, reason, appliedRuleIds: BASE_RULE_IDS }] }; }

function verifiedBeneficiaryDisplayName(report: AprCrmLocalPreflightReport, fallback: string) {
  const identity = report.primaryBeneficiaryResolution.status === "verified_document" ? report.primaryBeneficiaryResolution.identity : null;
  return identity ? `${identity.name} ${identity.surname}`.trim().replace(/\s+/g, " ") : fallback;
}

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
      item.report = report; item.displayName = verifiedBeneficiaryDisplayName(report, item.displayName); item.state = report.outcome; item.reason = report.outcome === "ready_local_plan" ? "Piano bozza locale pronto dopo revisione fonti; azioni esterne ancora bloccate." : `${report.blockers.length} blocker per-pratica dopo revisione fonti; coda conservata.`;
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
    const next = structuredClone(this.load(now)); const target = next.items.find((candidate) => candidate.customerKey === item!.customerKey)!; next.revision += 1; target.state = report.outcome; target.report = report; target.displayName = verifiedBeneficiaryDisplayName(report, target.displayName); target.endedAt = now.toISOString(); target.reason = report.outcome === "ready_local_plan" ? "Piano bozza locale pronto; azioni esterne bloccate." : `${report.blockers.length} blocker per-pratica registrati; coda prosegue.`; next.currentCustomerKey = null; next.reason = `${target.displayName}: ${target.reason}`; next.nextAction = "Proseguire con il caso successivo senza aprire ENEA."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: report.outcome === "ready_local_plan" ? "case_ready" : "case_blocked", customerKey: target.customerKey, reason: target.reason, appliedRuleIds: [...new Set([...BASE_RULE_IDS, ...report.financial.appliedRuleIds, ...report.products.flatMap((product) => product.appliedRuleIds), ...report.blockers.flatMap((blocker) => blocker.appliedRuleIds), ...report.warnings.flatMap((warning) => warning.appliedRuleIds)])] }); this.write(next);
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
      item.report = report; item.displayName = verifiedBeneficiaryDisplayName(report, item.displayName); item.state = report.outcome; item.reason = report.outcome === "ready_local_plan" ? "Piano bozza locale pronto; azioni esterne bloccate." : `${report.blockers.length} blocker per-pratica registrati; coda conclusa senza perdita.`;
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
  /**
   * L'appartenenza al modulo Infissi e' decisa a monte, per fonti documentali,
   * da resolveAprDocumentedProductRouting (infissiBatchPreflight.ts): un
   * customerKey compare in infissi.items solo se le fonti originarie non lo
   * classificano come screening puro. Questo resta vero anche quando il gate
   * Infissi ha propri blocker tecnici (es. dimensioni non riconosciute in
   * fattura): un blocker tecnico Infissi non retrocede la pratica a
   * Schermature. Richiedere in aggiunta "ready_local_plan e zero blocker"
   * (comportamento storico) escludeva dalla riconciliazione ogni pratica
   * Infissi con un problema tecnico ancora aperto, lasciando nel report
   * comune blocker Schermature fuorvianti (es. "Nessuna riga di schermatura
   * con dimensioni e gTot riconosciuta") per una pratica che schermature non
   * ne ha (regressione reale: coorte 2925, Andreea Ioana Olteanu).
   * Le pratiche "mixed" (screening e Infissi genuinamente presenti insieme)
   * restano escluse: per quelle i blocker Schermature possono essere reali.
   */
  reconcileAuthoritativeInfissiApplicability(
    infissi: { status: string; items: ReadonlyArray<{ customerKey: string; state: string; productModule?: string; report?: { blockers?: readonly unknown[] } | null }> },
    validationRevision = "infissi-authoritative-product-applicability-v66",
    now = new Date(),
  ) {
    const current = this.initialize(now);
    if (current.status !== "completed" || infissi.status !== "completed") return current;
    const authoritativeInfissiCustomerKeys = new Set(infissi.items
      .filter((item) => item.productModule === undefined || item.productModule === "infissi")
      .map((item) => item.customerKey));
    if (authoritativeInfissiCustomerKeys.size === 0) return current;
    const next = structuredClone(current);
    let changed = 0;
    for (const item of next.items) {
      if (!authoritativeInfissiCustomerKeys.has(item.customerKey) || !item.report) continue;
      const report = reconcileCommonReportWithAuthoritativeInfissiGate(item.report);
      if (report === item.report) continue;
      item.report = report;
      item.state = report.outcome;
      item.reason = report.outcome === "ready_local_plan"
        ? "Dati comuni riconciliati con il gate Infissi autorevole; nessun blocker Schermature applicato."
        : `${report.blockers.length} blocker comuni residui; i blocker Schermature non applicabili sono esclusi.`;
      changed += 1;
    }
    const revisionAlreadyRecorded = current.validationRevisionsApplied.includes(validationRevision);
    if (changed === 0 && revisionAlreadyRecorded) return current;
    next.revision += 1;
    if (!revisionAlreadyRecorded) next.validationRevisionsApplied.push(validationRevision);
    const ready = next.items.filter((item) => item.state === "ready_local_plan").length;
    const blocked = next.items.filter((item) => item.state === "blocked_case").length;
    next.reason = `Applicabilità Infissi riconciliata per ${changed} pratiche: ${ready} pronte, ${blocked} bloccate; nessuna azione esterna.`;
    next.nextAction = "Usare il gate del modulo documentale autorevole; non applicare blocker Schermature alle pratiche Infissi.";
    next.audit.push({
      revision: next.revision,
      at: now.toISOString(),
      type: "validation_recomputed",
      customerKey: null,
      reason: next.reason,
      appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.documentedProductModuleOverLabel, "system-atomic-checkpoint-resume"],
    });
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
