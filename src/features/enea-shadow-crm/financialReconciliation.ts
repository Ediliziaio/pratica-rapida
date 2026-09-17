import {
  applyRinaldiScopedFinancialRules,
  type RinaldiDeductibleLineEvidence,
  type RinaldiInvoiceLineEvidence,
  type RinaldiPolicyContext,
} from "./rinaldiFinancialPolicies";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const FINANCIAL_RECONCILIATION_POLICY_VERSION = "financial-final-printed-total-only-v8";
export const NO_VALID_ECONOMIC_INVOICE_RULE_ID = "user-2026-08-31-no-valid-economic-invoice-operator-v1" as const;
export const MONEY_TOLERANCE_EUR = 0.05;

export type FinancialDocumentKind = "invoice" | "advance" | "balance" | "credit_note" | "non_economic" | "unknown";

export interface FinancialExtractionIssue {
  code: "schedule_amount_missing";
  reason: "Scadenza non leggibile, importo mancante";
}

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
  extractionIssues?: readonly FinancialExtractionIssue[];
  internalAdjustmentNote?: string | null;
  explicitDeductibleLines?: readonly RinaldiDeductibleLineEvidence[];
  lineItems?: readonly RinaldiInvoiceLineEvidence[];
}

export interface FinancialMethodResult {
  method: "final_printed_total";
  ok: boolean;
  total: number | null;
  sources: readonly string[];
  reason: string;
}

export interface FinalPrintedInvoiceTotalVerification {
  policyVersion: typeof FINANCIAL_RECONCILIATION_POLICY_VERSION;
  toleranceEur: typeof MONEY_TOLERANCE_EUR;
  methods: readonly [FinancialMethodResult];
  usable: boolean;
  total: number | null;
  blockers: readonly string[];
  candidateInvoiceSourceIds: readonly string[];
  discardedDuplicateSourceIds: readonly string[];
  nonEconomicSourceIds: readonly string[];
  ignoredIncompleteEconomicSourceIds: readonly string[];
  auditNotes: readonly string[];
  appliedRuleIds: readonly string[];
  deferredVepaLineIds: readonly string[];
  bonusCasaDraftAllowed: boolean;
}

/**
 * @deprecated Nome conservato soltanto per compatibilita dei chiamanti.
 * Il risultato contiene un unico metodo autorevole (`final_printed_total`),
 * non una riconciliazione tripla.
 */
export type TripleFinancialReconciliation = FinalPrintedInvoiceTotalVerification;

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const validMoney = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export const isFiscalInvoiceFinancialKind = (kind: FinancialDocumentKind): kind is "invoice" | "advance" | "balance" =>
  kind === "invoice" || kind === "advance" || kind === "balance";
const isFiscalEconomicDocumentKind = (kind: FinancialDocumentKind): kind is "invoice" | "advance" | "balance" | "credit_note" =>
  isFiscalInvoiceFinancialKind(kind) || kind === "credit_note";
const hasFinalPrintedTotal = (doc: FinancialDocumentEvidence): boolean => Boolean(
  isFiscalEconomicDocumentKind(doc.kind)
  && validMoney(doc.grossTotal),
);
const identity = (doc: FinancialDocumentEvidence): string => {
  const number = doc.documentNumber.trim();
  const date = doc.documentDate.trim();
  // Numero e data servono esclusivamente a riconoscere una copia della
  // stessa fattura; non sono requisiti economici ENEA. Se l'identita fiscale
  // non e completa, non si deduplica per il solo importo (due fatture vere
  // possono avere lo stesso totale): resta autorevole l'identita della fonte
  // gia resa unica dal segmentatore documentale.
  return number && date
    ? [number, date, doc.grossTotal].join("|").toLowerCase()
    : `source:${doc.sourceId}`;
};
// Regola generale di Giuliano (2026-09-07): APR non deve mai calcolare,
// verificare o incrociare i dati economici interni della fattura (aliquote
// IVA, singole voci, coerenza imponibile+IVA=lordo) — soltanto il totale
// finale/netto dichiarato (grossTotal) e' autorevole. Una fattura con piu'
// aliquote IVA sulla stessa riga di documento (es. prodotto al 10% e una
// riga servizi/pratica ENEA al 22%) e' perfettamente valida anche se la
// somma imponibile+IVA a bassa fedelta' non torna esattamente: quel confronto
// non va mai fatto.
export function reconcileFinancialEvidence(
  documents: readonly FinancialDocumentEvidence[],
  context: RinaldiPolicyContext = { mode: "production", scheme: "ecobonus" },
): TripleFinancialReconciliation {
  const blockers: string[] = [];
  if (documents.length === 0) blockers.push("fonti-assenti");
  const nonEconomic = documents.filter((doc) => doc.kind === "non_economic");
  const economic = documents.filter((doc) => isFiscalEconomicDocumentKind(doc.kind));
  const incompleteInvoiceSources: string[] = [];
  for (const doc of economic) {
    if (!hasFinalPrintedTotal(doc)) incompleteInvoiceSources.push(doc.sourceId);
  }
  // Una fattura/segmento privo di totale non invalida i totali finali
  // stampati leggibili delle altre fatture del fascicolo. Il segmento resta
  // nell'audit, ma non contribuisce alla somma. Restiamo fail-closed soltanto
  // quando nessun segmento fiscale espone un totale utilizzabile.
  documents.filter((doc) => doc.kind === "unknown")
    .forEach((doc) => blockers.push(`tipo-documento-economico-incerto:${doc.sourceId}`));

  const candidates = economic.filter(hasFinalPrintedTotal);
  if (candidates.length === 0) blockers.push("nessuna-fattura-economica-valida");
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
    && unique.every((doc) => isFiscalInvoiceFinancialKind(doc.kind) && validMoney(doc.grossTotal));
  for (const doc of unique) {
    if (!validMoney(doc.grossTotal)) blockers.push(`totali-incompleti:${doc.sourceId}`);
  }
  const rinaldiPolicy = applyRinaldiScopedFinancialRules(unique, context);
  blockers.push(...rinaldiPolicy.blockers);
  const effectiveAmount = (doc: FinancialDocumentEvidence) => rinaldiPolicy.effectiveEneaAmounts[doc.sourceId] ?? (doc.grossTotal ?? 0);
  const sourceIds = unique.map((doc) => doc.sourceId);
  const finalPrintedTotal = blockers.length === 0 ? money(unique.reduce((sum, doc) => {
    if (doc.kind === "credit_note") return sum - effectiveAmount(doc);
    return sum + effectiveAmount(doc);
  }, 0)) : null;
  const finalPrinted: FinancialMethodResult = {
    method: "final_printed_total", ok: finalPrintedTotal !== null, total: finalPrintedTotal, sources: sourceIds,
    reason: finalPrintedTotal === null ? blockers.join(", ") : "Somma dei soli totali finali stampati delle fatture fiscali uniche; imponibile, IVA, aliquote, scadenziari e cifre intermedie non sono letti ne riconciliati.",
  };

  const methods = [finalPrinted] as const;
  const usable = blockers.length === 0 && finalPrintedTotal !== null;
  return {
    policyVersion: FINANCIAL_RECONCILIATION_POLICY_VERSION, toleranceEur: MONEY_TOLERANCE_EUR, methods,
    usable, total: usable ? finalPrintedTotal : null, blockers: [...new Set(blockers)],
    candidateInvoiceSourceIds: unique.map((doc) => doc.sourceId),
    discardedDuplicateSourceIds: duplicateSources,
    nonEconomicSourceIds: nonEconomic.map((doc) => doc.sourceId),
    ignoredIncompleteEconomicSourceIds: incompleteInvoiceSources,
    auditNotes: [
      ...incompleteInvoiceSources.map((sourceId) => `segmento-economico-senza-totale-ignorato:${sourceId}`),
      ...unique.flatMap((doc) => doc.internalAdjustmentNote?.trim() ? [`${doc.sourceId}:${doc.internalAdjustmentNote.trim()}`] : []),
      ...unique.flatMap((doc) => doc.extractionConfidence === "uncertain"
        ? [`totale-finale-stampato-usato-senza-verifiche-intermedie:${doc.sourceId}`]
        : []),
      ...(distinctSameDossierInvoiceSum ? [`fatture-distinte-stesso-dossier:${unique.map((doc) => `${doc.documentNumber}=${doc.grossTotal?.toFixed(2)}`).join("|")}|somma=${money(unique.reduce((sum, doc) => sum + (doc.grossTotal ?? 0), 0)).toFixed(2)}`] : []),
      ...rinaldiPolicy.auditNotes,
    ],
    appliedRuleIds: [
      USER_AUTHORIZED_RULE_IDS.invoiceFinalPrintedTotalRuntimeAuthority,
      USER_AUTHORIZED_RULE_IDS.advanceBalanceFiscalInvoiceEquivalence,
      ...(incompleteInvoiceSources.length ? [USER_AUTHORIZED_RULE_IDS.partialInvoiceTotalsDoNotBlock] : []),
      ...(candidates.length === 0 ? [NO_VALID_ECONOMIC_INVOICE_RULE_ID] : []),
      ...(distinctSameDossierInvoiceSum ? ["user-2026-08-16-distinct-invoice-numbers-same-customer-sum"] : []),
      ...rinaldiPolicy.appliedRuleIds,
    ],
    deferredVepaLineIds: rinaldiPolicy.deferredVepaLineIds,
    bonusCasaDraftAllowed: rinaldiPolicy.bonusCasaDraftAllowed,
  };
}
