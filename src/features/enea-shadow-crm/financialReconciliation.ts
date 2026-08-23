import {
  applyRinaldiScopedFinancialRules,
  type RinaldiDeductibleLineEvidence,
  type RinaldiInvoiceLineEvidence,
  type RinaldiPolicyContext,
} from "./rinaldiFinancialPolicies";

export const FINANCIAL_RECONCILIATION_POLICY_VERSION = "financial-triple-gross-invoices-v4";
export const MONEY_TOLERANCE_EUR = 0.01;

export type FinancialDocumentKind = "invoice" | "advance" | "balance" | "credit_note" | "non_economic" | "unknown";

export interface FinancialDocumentEvidence {
  sourceId: string;
  supplierId: string;
  supplierName?: string | null;
  documentNumber: string;
  documentDate: string;
  kind: FinancialDocumentKind;
  taxableAmount: number | null;
  vatAmount: number | null;
  grossTotal: number | null;
  referencedAdvanceIds: readonly string[];
  interventionGrossAmount: number | null;
  extractionConfidence: "certain" | "uncertain";
  internalAdjustmentNote?: string | null;
  explicitDeductibleLines?: readonly RinaldiDeductibleLineEvidence[];
  lineItems?: readonly RinaldiInvoiceLineEvidence[];
}

export interface FinancialMethodResult {
  method: "structured_extraction" | "accounting_reconciliation" | "intervention_cross_check";
  ok: boolean;
  total: number | null;
  sources: readonly string[];
  reason: string;
}

export interface TripleFinancialReconciliation {
  policyVersion: typeof FINANCIAL_RECONCILIATION_POLICY_VERSION;
  toleranceEur: typeof MONEY_TOLERANCE_EUR;
  methods: readonly [FinancialMethodResult, FinancialMethodResult, FinancialMethodResult];
  usable: boolean;
  total: number | null;
  blockers: readonly string[];
  candidateInvoiceSourceIds: readonly string[];
  discardedDuplicateSourceIds: readonly string[];
  nonEconomicSourceIds: readonly string[];
  auditNotes: readonly string[];
  appliedRuleIds: readonly string[];
  deferredVepaLineIds: readonly string[];
  bonusCasaDraftAllowed: boolean;
}

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const validMoney = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hasInvoiceTriple = (doc: FinancialDocumentEvidence): boolean => Boolean(doc.documentNumber.trim() && doc.documentDate.trim() && validMoney(doc.grossTotal));
const identity = (doc: FinancialDocumentEvidence): string => [doc.documentNumber.trim(), doc.documentDate.trim(), doc.grossTotal].join("|").toLowerCase();
const internallyReconciled = (doc: FinancialDocumentEvidence): boolean => validMoney(doc.taxableAmount)
  && validMoney(doc.vatAmount)
  && validMoney(doc.grossTotal)
  && validMoney(doc.interventionGrossAmount)
  && money(Math.abs(money(doc.taxableAmount + doc.vatAmount) - doc.grossTotal)) <= MONEY_TOLERANCE_EUR
  && money(Math.abs(doc.interventionGrossAmount - doc.grossTotal)) <= MONEY_TOLERANCE_EUR;

export function reconcileFinancialEvidence(
  documents: readonly FinancialDocumentEvidence[],
  context: RinaldiPolicyContext = { mode: "production", scheme: "ecobonus" },
): TripleFinancialReconciliation {
  const blockers: string[] = [];
  if (documents.length === 0) blockers.push("fonti-assenti");
  const nonEconomic = documents.filter((doc) => doc.kind === "non_economic");
  const economic = documents.filter((doc) => doc.kind !== "non_economic");
  const incompleteInvoiceSources: string[] = [];
  for (const doc of economic) {
    if (!hasInvoiceTriple(doc)) incompleteInvoiceSources.push(doc.sourceId);
  }
  incompleteInvoiceSources.forEach((sourceId) => blockers.push(`terna-fattura-incerta:${sourceId}`));

  const candidates = economic.filter(hasInvoiceTriple);
  const duplicateSources: string[] = [];
  const uniqueByIdentity = new Map<string, FinancialDocumentEvidence>();
  for (const doc of candidates) {
    const key = identity(doc); const current = uniqueByIdentity.get(key);
    if (!current) { uniqueByIdentity.set(key, doc); continue; }
    const preferred = current.extractionConfidence === "certain" ? current : doc.extractionConfidence === "certain" ? doc : current;
    const discarded = preferred === current ? doc : current;
    uniqueByIdentity.set(key, preferred); duplicateSources.push(discarded.sourceId);
  }
  const unique = [...uniqueByIdentity.values()];
  const distinctInvoiceNumbers = new Set(unique.map((doc) => doc.documentNumber.trim().toLowerCase()));
  const distinctSameDossierInvoiceSum = unique.length >= 2
    && distinctInvoiceNumbers.size === unique.length
    && unique.every((doc) => ["invoice", "advance", "balance"].includes(doc.kind) && internallyReconciled(doc));
  for (const doc of unique) {
    if (doc.extractionConfidence !== "certain" && !distinctSameDossierInvoiceSum) blockers.push(`estrazione-incerta:${doc.sourceId}`);
    if (!validMoney(doc.taxableAmount) || !validMoney(doc.vatAmount) || !validMoney(doc.grossTotal)) blockers.push(`totali-incompleti:${doc.sourceId}`);
    else if (money(Math.abs(money(doc.taxableAmount + doc.vatAmount) - doc.grossTotal)) > MONEY_TOLERANCE_EUR) blockers.push(`imponibile-iva-mismatch:${doc.sourceId}`);
  }
  const rinaldiPolicy = applyRinaldiScopedFinancialRules(unique, context);
  blockers.push(...rinaldiPolicy.blockers);
  const effectiveAmount = (doc: FinancialDocumentEvidence) => rinaldiPolicy.effectiveEneaAmounts[doc.sourceId] ?? (doc.grossTotal ?? 0);
  const sourceIds = unique.map((doc) => doc.sourceId);
  const structuredTotal = blockers.length === 0 ? money(unique.reduce((sum, doc) => sum + effectiveAmount(doc), 0)) : null;
  const structured: FinancialMethodResult = {
    method: "structured_extraction", ok: structuredTotal !== null, total: structuredTotal, sources: sourceIds,
    reason: structuredTotal === null ? blockers.join(", ") : "Ogni documento ha imponibile, IVA e totale verificati.",
  };

  const accountingTotal = blockers.length === 0 ? money(unique.reduce((sum, doc) => {
    if (doc.kind === "credit_note") return sum - effectiveAmount(doc);
    return sum + effectiveAmount(doc);
  }, 0)) : null;
  const accounting: FinancialMethodResult = {
    method: "accounting_reconciliation", ok: accountingTotal !== null, total: accountingTotal, sources: sourceIds,
    reason: accountingTotal === null ? blockers.join(", ") : "Somma dei totali lordi IVA inclusa delle fatture uniche deduplicate; gli storni interni sono solo note auditabili.",
  };

  const interventionMissing = unique.filter((doc) => rinaldiPolicy.effectiveEneaAmounts[doc.sourceId] === undefined
    && !validMoney(doc.interventionGrossAmount)).map((doc) => doc.sourceId);
  const interventionTotal = blockers.length === 0 && interventionMissing.length === 0
    ? money(unique.reduce((sum, doc) => sum + (rinaldiPolicy.effectiveEneaAmounts[doc.sourceId]
      ?? doc.interventionGrossAmount ?? 0), 0)) : null;
  const cross: FinancialMethodResult = {
    method: "intervention_cross_check", ok: interventionTotal !== null, total: interventionTotal, sources: sourceIds,
    reason: interventionTotal === null ? `righe-intervento-non-dimostrate:${interventionMissing.join("|")}` : "Totale ricostruito esclusivamente dalle righe pertinenti all'intervento.",
  };

  const methods = [structured, accounting, cross] as const;
  const totals = methods.map((method) => method.total);
  const usable = methods.every((method) => method.ok && method.total !== null)
    && totals.every((total) => money(Math.abs((total ?? 0) - (totals[0] ?? 0))) <= MONEY_TOLERANCE_EUR);
  if (!usable && totals.every((total) => total !== null)) blockers.push("totali-metodi-non-coincidenti");
  return {
    policyVersion: FINANCIAL_RECONCILIATION_POLICY_VERSION, toleranceEur: MONEY_TOLERANCE_EUR, methods,
    usable, total: usable ? totals[0] : null, blockers: [...new Set(blockers)],
    candidateInvoiceSourceIds: unique.map((doc) => doc.sourceId),
    discardedDuplicateSourceIds: duplicateSources,
    nonEconomicSourceIds: nonEconomic.map((doc) => doc.sourceId),
    auditNotes: [
      ...unique.flatMap((doc) => doc.internalAdjustmentNote?.trim() ? [`${doc.sourceId}:${doc.internalAdjustmentNote.trim()}`] : []),
      ...(distinctSameDossierInvoiceSum ? [`fatture-distinte-stesso-dossier:${unique.map((doc) => `${doc.documentNumber}=${doc.grossTotal?.toFixed(2)}`).join("|")}|somma=${money(unique.reduce((sum, doc) => sum + (doc.grossTotal ?? 0), 0)).toFixed(2)}`] : []),
      ...rinaldiPolicy.auditNotes,
    ],
    appliedRuleIds: [
      ...(distinctSameDossierInvoiceSum ? ["user-2026-08-16-distinct-invoice-numbers-same-customer-sum"] : []),
      ...rinaldiPolicy.appliedRuleIds,
    ],
    deferredVepaLineIds: rinaldiPolicy.deferredVepaLineIds,
    bonusCasaDraftAllowed: rinaldiPolicy.bonusCasaDraftAllowed,
  };
}
