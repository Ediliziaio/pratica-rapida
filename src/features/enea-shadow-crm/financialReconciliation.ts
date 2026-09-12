export const FINANCIAL_RECONCILIATION_POLICY_VERSION = "financial-triple-gross-invoices-v3";
export const MONEY_TOLERANCE_EUR = 0.01;

export type FinancialDocumentKind = "invoice" | "advance" | "balance" | "credit_note" | "non_economic" | "unknown";

export interface FinancialDocumentEvidence {
  sourceId: string;
  supplierId: string;
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
}

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const validMoney = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hasInvoiceTriple = (doc: FinancialDocumentEvidence): boolean => Boolean(doc.documentNumber.trim() && doc.documentDate.trim() && validMoney(doc.grossTotal));
const identity = (doc: FinancialDocumentEvidence): string => [doc.documentNumber.trim(), doc.documentDate.trim(), doc.grossTotal].join("|").toLowerCase();

export function reconcileFinancialEvidence(documents: readonly FinancialDocumentEvidence[]): TripleFinancialReconciliation {
  const blockers: string[] = [];
  if (documents.length === 0) blockers.push("fonti-assenti");
  const nonEconomic = documents.filter((doc) => doc.kind === "non_economic");
  const economic = documents.filter((doc) => doc.kind !== "non_economic");
  const incompleteInvoiceSources: string[] = [];
  for (const doc of economic) {
    if (!hasInvoiceTriple(doc)) incompleteInvoiceSources.push(doc.sourceId);
  }
  incompleteInvoiceSources.forEach((sourceId) => blockers.push(`terna-fattura-incerta:${sourceId}`));

  const duplicateSources: string[] = [];
  const seen = new Set<string>();
  for (const doc of economic.filter(hasInvoiceTriple)) {
    const key = identity(doc);
    if (seen.has(key)) duplicateSources.push(doc.sourceId);
    seen.add(key);
    if (doc.extractionConfidence !== "certain") blockers.push(`estrazione-incerta:${doc.sourceId}`);
    if (!validMoney(doc.taxableAmount) || !validMoney(doc.vatAmount) || !validMoney(doc.grossTotal)) blockers.push(`totali-incompleti:${doc.sourceId}`);
    else if (Math.abs(money(doc.taxableAmount + doc.vatAmount) - doc.grossTotal) > MONEY_TOLERANCE_EUR) blockers.push(`imponibile-iva-mismatch:${doc.sourceId}`);
  }

  const candidates = economic.filter(hasInvoiceTriple);
  const unique = candidates.filter((doc, index) => candidates.findIndex((other) => identity(other) === identity(doc)) === index);
  const sourceIds = unique.map((doc) => doc.sourceId);
  const structuredTotal = blockers.length === 0 ? money(unique.reduce((sum, doc) => sum + (doc.grossTotal ?? 0), 0)) : null;
  const structured: FinancialMethodResult = {
    method: "structured_extraction", ok: structuredTotal !== null, total: structuredTotal, sources: sourceIds,
    reason: structuredTotal === null ? blockers.join(", ") : "Ogni documento ha imponibile, IVA e totale verificati.",
  };

  const accountingTotal = blockers.length === 0 ? money(unique.reduce((sum, doc) => {
    if (doc.kind === "credit_note") return sum - (doc.grossTotal ?? 0);
    return sum + (doc.grossTotal ?? 0);
  }, 0)) : null;
  const accounting: FinancialMethodResult = {
    method: "accounting_reconciliation", ok: accountingTotal !== null, total: accountingTotal, sources: sourceIds,
    reason: accountingTotal === null ? blockers.join(", ") : "Somma dei totali lordi IVA inclusa delle fatture uniche deduplicate; gli storni interni sono solo note auditabili.",
  };

  const interventionMissing = unique.filter((doc) => !validMoney(doc.interventionGrossAmount)).map((doc) => doc.sourceId);
  const interventionTotal = blockers.length === 0 && interventionMissing.length === 0
    ? money(unique.reduce((sum, doc) => sum + (doc.interventionGrossAmount ?? 0), 0)) : null;
  const cross: FinancialMethodResult = {
    method: "intervention_cross_check", ok: interventionTotal !== null, total: interventionTotal, sources: sourceIds,
    reason: interventionTotal === null ? `righe-intervento-non-dimostrate:${interventionMissing.join("|")}` : "Totale ricostruito esclusivamente dalle righe pertinenti all'intervento.",
  };

  const methods = [structured, accounting, cross] as const;
  const totals = methods.map((method) => method.total);
  const usable = methods.every((method) => method.ok && method.total !== null)
    && totals.every((total) => Math.abs((total ?? 0) - (totals[0] ?? 0)) <= MONEY_TOLERANCE_EUR);
  if (!usable && totals.every((total) => total !== null)) blockers.push("totali-metodi-non-coincidenti");
  return {
    policyVersion: FINANCIAL_RECONCILIATION_POLICY_VERSION, toleranceEur: MONEY_TOLERANCE_EUR, methods,
    usable, total: usable ? totals[0] : null, blockers: [...new Set(blockers)],
    candidateInvoiceSourceIds: unique.map((doc) => doc.sourceId),
    discardedDuplicateSourceIds: duplicateSources,
    nonEconomicSourceIds: nonEconomic.map((doc) => doc.sourceId),
    auditNotes: unique.flatMap((doc) => doc.internalAdjustmentNote?.trim() ? [`${doc.sourceId}:${doc.internalAdjustmentNote.trim()}`] : []),
  };
}
