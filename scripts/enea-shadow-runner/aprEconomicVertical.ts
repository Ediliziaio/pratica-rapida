import type { BankTransferEvidence } from "./bankTransferEvidence";
import { reconcileBankTransfers } from "./bankTransferEvidence";
import {
  MONEY_TOLERANCE_EUR,
  reconcileFinancialEvidence,
  type FinancialDocumentEvidence,
} from "../../src/features/enea-shadow-crm/financialReconciliation";
import { USER_AUTHORIZED_RULE_IDS, registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import {
  APR_L2_FACT_RULE_ID,
  createBusinessDecisionsArtifact,
  createCanonicalFactsArtifact,
  type AprBusinessDecisionsArtifact,
  type AprCanonicalFact,
  type AprCanonicalFactsArtifact,
  type AprCanonicalValue,
} from "./aprLevelSeparationContracts";

export const APR_ECONOMIC_VERTICAL_VERSION = "apr-economic-vertical-v1" as const;

export interface AprEconomicSourceLocator {
  sourceId: string;
  pageNumber: number | null;
  contentSha256: string | null;
  excerptSha256: string | null;
}

export interface AprEconomicInvoiceObservation extends FinancialDocumentEvidence {
  locator: AprEconomicSourceLocator;
}

export interface AprEconomicBankTransferObservation extends BankTransferEvidence {
  locator: AprEconomicSourceLocator;
}

export interface AprEconomicReplacementObservation {
  replacementSourceId: string;
  replacedSourceId: string;
  locator: AprEconomicSourceLocator;
}

export interface AprEconomicFactsInput {
  customerKey: string;
  practiceId: string;
  sourceFingerprint: string;
  invoices: readonly AprEconomicInvoiceObservation[];
  bankTransfers: readonly AprEconomicBankTransferObservation[];
  replacements: readonly AprEconomicReplacementObservation[];
}

export interface AprEconomicDecisionResult {
  factsArtifact: AprCanonicalFactsArtifact;
  decisionsArtifact: AprBusinessDecisionsArtifact;
  outcome: "RESOLVED" | "BLOCKED" | "OPERATOR_REQUIRED";
  eligibleExpense: number | null;
  invoiceReconciliation: ReturnType<typeof reconcileFinancialEvidence>;
  bankTransferReconciliation: ReturnType<typeof reconcileBankTransfers>;
}

const INVOICE_FIELDS = [
  "supplierId", "supplierName", "documentNumber", "documentDate", "kind", "taxableAmount", "vatAmount", "grossTotal",
  "referencedAdvanceIds", "interventionGrossAmount", "extractionConfidence", "extractionIssues", "internalAdjustmentNote",
  "explicitDeductibleLines", "lineItems",
] as const;

const TRANSFER_FIELDS = [
  "transactionReference", "principalAmount", "fees", "debitedTotal", "invoiceReference", "taxReliefType",
] as const;

function asCanonical(value: unknown): AprCanonicalValue {
  return JSON.parse(JSON.stringify(value ?? null)) as AprCanonicalValue;
}

function fact(input: {
  field: string;
  value: unknown;
  locator: AprEconomicSourceLocator;
  method?: "pdf_text" | "ocr_text" | "legacy_projection";
}): Omit<AprCanonicalFact, "factId"> {
  return {
    field: input.field,
    status: input.value === null || input.value === undefined ? "missing" : "observed",
    value: asCanonical(input.value),
    sourceIds: [input.locator.sourceId],
    sourceLocators: [{ ...input.locator }],
    extractionMethod: input.method ?? "pdf_text",
    confidence: input.value === null || input.value === undefined ? "not_applicable" : "high",
    extractionRuleId: APR_L2_FACT_RULE_ID,
  };
}

export function createEconomicFactsArtifact(input: AprEconomicFactsInput): AprCanonicalFactsArtifact {
  const facts: Omit<AprCanonicalFact, "factId">[] = [];
  for (const invoice of input.invoices) {
    facts.push(fact({ field: "economic.invoice.sourceId", value: invoice.sourceId, locator: invoice.locator }));
    for (const field of INVOICE_FIELDS) facts.push(fact({
      field: `economic.invoice.${field}`,
      value: invoice[field] ?? null,
      locator: invoice.locator,
      method: invoice.extractionConfidence === "uncertain" ? "ocr_text" : "pdf_text",
    }));
  }
  for (const transfer of input.bankTransfers) {
    facts.push(fact({ field: "economic.bankTransfer.sourceId", value: transfer.sourceId, locator: transfer.locator }));
    for (const field of TRANSFER_FIELDS) facts.push(fact({ field: `economic.bankTransfer.${field}`, value: transfer[field] ?? null, locator: transfer.locator }));
  }
  for (const replacement of input.replacements) facts.push(fact({
    field: "economic.invoice.explicitReplacement",
    value: { replacementSourceId: replacement.replacementSourceId, replacedSourceId: replacement.replacedSourceId },
    locator: replacement.locator,
  }));
  return createCanonicalFactsArtifact({
    customerKey: input.customerKey,
    practiceId: input.practiceId,
    sourceFingerprint: input.sourceFingerprint,
    facts,
  });
}

function sourceFacts(artifact: AprCanonicalFactsArtifact, prefix: string) {
  const grouped = new Map<string, Map<string, AprCanonicalFact>>();
  for (const item of artifact.payload.facts.filter((candidate) => candidate.field.startsWith(prefix))) {
    if (item.sourceIds.length !== 1) continue;
    const byField = grouped.get(item.sourceIds[0]) ?? new Map<string, AprCanonicalFact>();
    byField.set(item.field.slice(prefix.length), item);
    grouped.set(item.sourceIds[0], byField);
  }
  return grouped;
}

const value = (fields: Map<string, AprCanonicalFact>, field: string) => fields.get(field)?.value ?? null;
const stringValue = (fields: Map<string, AprCanonicalFact>, field: string) => typeof value(fields, field) === "string" ? value(fields, field) as string : "";
const nullableString = (fields: Map<string, AprCanonicalFact>, field: string) => typeof value(fields, field) === "string" ? value(fields, field) as string : null;
const nullableNumber = (fields: Map<string, AprCanonicalFact>, field: string) => typeof value(fields, field) === "number" ? value(fields, field) as number : null;
const arrayValue = <T>(fields: Map<string, AprCanonicalFact>, field: string) => Array.isArray(value(fields, field)) ? value(fields, field) as T[] : [];

function invoicesFromFacts(artifact: AprCanonicalFactsArtifact): FinancialDocumentEvidence[] {
  return [...sourceFacts(artifact, "economic.invoice.").entries()].flatMap(([_sourceKey, fields]) => {
    const sourceId = stringValue(fields, "sourceId");
    if (!sourceId) return [];
    return [{
      sourceId,
      supplierId: stringValue(fields, "supplierId"),
      supplierName: nullableString(fields, "supplierName"),
      documentNumber: stringValue(fields, "documentNumber"),
      documentDate: stringValue(fields, "documentDate"),
      kind: stringValue(fields, "kind") as FinancialDocumentEvidence["kind"],
      taxableAmount: nullableNumber(fields, "taxableAmount"),
      vatAmount: nullableNumber(fields, "vatAmount"),
      grossTotal: nullableNumber(fields, "grossTotal"),
      referencedAdvanceIds: arrayValue<string>(fields, "referencedAdvanceIds"),
      interventionGrossAmount: nullableNumber(fields, "interventionGrossAmount"),
      extractionConfidence: stringValue(fields, "extractionConfidence") as FinancialDocumentEvidence["extractionConfidence"],
      extractionIssues: arrayValue<NonNullable<FinancialDocumentEvidence["extractionIssues"]>[number]>(fields, "extractionIssues"),
      internalAdjustmentNote: nullableString(fields, "internalAdjustmentNote"),
      explicitDeductibleLines: arrayValue<NonNullable<FinancialDocumentEvidence["explicitDeductibleLines"]>[number]>(fields, "explicitDeductibleLines"),
      lineItems: arrayValue<NonNullable<FinancialDocumentEvidence["lineItems"]>[number]>(fields, "lineItems"),
    }];
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function transfersFromFacts(artifact: AprCanonicalFactsArtifact): BankTransferEvidence[] {
  return [...sourceFacts(artifact, "economic.bankTransfer.").entries()].flatMap(([_sourceKey, fields]) => {
    const sourceId = stringValue(fields, "sourceId");
    if (!sourceId) return [];
    return [{
      sourceId,
      transactionReference: nullableString(fields, "transactionReference"),
      principalAmount: nullableNumber(fields, "principalAmount"),
      fees: nullableNumber(fields, "fees"),
      debitedTotal: nullableNumber(fields, "debitedTotal"),
      invoiceReference: nullableString(fields, "invoiceReference"),
      taxReliefType: nullableString(fields, "taxReliefType") as BankTransferEvidence["taxReliefType"],
      appliedRuleIds: [],
    }];
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function replacementPairs(artifact: AprCanonicalFactsArtifact) {
  return artifact.payload.facts.filter((item) => item.field === "economic.invoice.explicitReplacement").flatMap((item) => {
    const record = item.value && typeof item.value === "object" && !Array.isArray(item.value)
      ? item.value as Readonly<Record<string, AprCanonicalValue>> : null;
    const replacementSourceId = record && typeof record.replacementSourceId === "string" ? record.replacementSourceId : "";
    const replacedSourceId = record && typeof record.replacedSourceId === "string" ? record.replacedSourceId : "";
    return replacementSourceId && replacedSourceId ? [{ replacementSourceId, replacedSourceId }] : [];
  });
}

function precedence(ruleIds: readonly string[]) {
  return [...new Set(ruleIds)].flatMap((ruleId) => {
    const rule = registryRule(ruleId);
    if (!rule) throw new Error(`apr_economic_unregistered_rule:${ruleId}`);
    return rule.sourcePrecedence.map((source) => `${ruleId}:${source}`);
  });
}

export function decideEconomicFacts(factsArtifact: AprCanonicalFactsArtifact): AprEconomicDecisionResult {
  const replacements = replacementPairs(factsArtifact);
  const observedInvoices = invoicesFromFacts(factsArtifact);
  const observedInvoiceSourceIds = new Set(observedInvoices.map((invoice) => invoice.sourceId));
  for (const replacement of replacements) {
    if (replacement.replacementSourceId === replacement.replacedSourceId
      || !observedInvoiceSourceIds.has(replacement.replacementSourceId)
      || !observedInvoiceSourceIds.has(replacement.replacedSourceId)) {
      throw new Error(`apr_economic_invalid_replacement_link:${replacement.replacementSourceId}:${replacement.replacedSourceId}`);
    }
  }
  const replaced = new Set(replacements.map((item) => item.replacedSourceId));
  const invoices = observedInvoices.filter((invoice) => !replaced.has(invoice.sourceId));
  const transfers = transfersFromFacts(factsArtifact);
  const invoiceReconciliation = reconcileFinancialEvidence(invoices, { mode: "test", scheme: "ecobonus" });
  const invoiceTotal = invoiceReconciliation.usable ? invoiceReconciliation.total : null;
  // Il controllo bonifici resta informativo anche quando la tripla
  // riconciliazione non rende ancora la spesa utilizzabile: se tutti i lordi
  // fattura sono osservati, il capitale puo essere confrontato senza
  // trasformare quel totale grezzo in una spesa ENEA risolta.
  const observedInvoiceGrossTotal = invoices.length > 0 && invoices.every((invoice) => invoice.grossTotal !== null)
    ? Math.round((invoices.reduce((sum, invoice) => sum + (invoice.grossTotal ?? 0), 0) + Number.EPSILON) * 100) / 100
    : null;
  const bankTransferReconciliation = reconcileBankTransfers(observedInvoiceGrossTotal, transfers, invoices.map((invoice) => invoice.documentNumber));
  const invoiceRuleIds = [
    "core-economic-classification",
    USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded,
    "core-gross-triple-reconciliation",
    ...(replacements.length ? ["system-explicit-replacement-invoice-supersession"] : []),
    ...invoiceReconciliation.appliedRuleIds,
  ];
  const bankRuleIds = transfers.length ? [
    USER_AUTHORIZED_RULE_IDS.invoiceTotalOverBankTransfers,
    USER_AUTHORIZED_RULE_IDS.mandatoryBankTransferInvoiceExpenseCrossCheck,
    USER_AUTHORIZED_RULE_IDS.bankTransferTaxReliefLabelNonBlocking,
  ] : ["core-economic-classification"];
  const invoiceFactIds = factsArtifact.payload.facts.filter((item) => item.field.startsWith("economic.invoice.")).map((item) => item.factId);
  const transferFactIds = factsArtifact.payload.facts.filter((item) => item.field.startsWith("economic.bankTransfer.")).map((item) => item.factId);
  const invoiceDecision = invoiceReconciliation.usable
    ? {
      field: "economic.eligibleExpense",
      status: "resolved" as const,
      resolvedValue: invoiceReconciliation.total,
      blockerCode: null,
      inputFactIds: invoiceFactIds,
      appliedRuleIds: [...new Set(invoiceRuleIds)],
      sourcePrecedence: precedence(invoiceRuleIds),
      reason: `Tripla riconciliazione conclusa entro EUR ${MONEY_TOLERANCE_EUR.toFixed(2)}; totale lordo fatture autorevole.`,
    }
    : {
      field: "economic.eligibleExpense",
      status: "blocked" as const,
      resolvedValue: null,
      blockerCode: "gross_triple_reconciliation_failed",
      inputFactIds: invoiceFactIds,
      appliedRuleIds: [...new Set(invoiceRuleIds)],
      sourcePrecedence: precedence(invoiceRuleIds),
      reason: `Tripla riconciliazione non conclusa: ${invoiceReconciliation.blockers.join(", ") || invoiceReconciliation.methods.map((method) => method.reason).join(", ")}.`,
    };
  const bankRequiresOperator = bankTransferReconciliation.status === "principal_exceeds_invoices" || bankTransferReconciliation.status === "unverified";
  const bankDecision = {
    field: "economic.bankTransferCheck",
    status: bankRequiresOperator ? "operator_required" as const : "resolved" as const,
    resolvedValue: bankRequiresOperator ? null : bankTransferReconciliation.status,
    blockerCode: bankRequiresOperator ? `bank_transfer_${bankTransferReconciliation.status}` : null,
    inputFactIds: transferFactIds.length ? transferFactIds : invoiceFactIds,
    appliedRuleIds: bankRuleIds,
    sourcePrecedence: precedence(bankRuleIds),
    reason: transfers.length
      ? `Bonifici verificati separando capitale e commissioni: ${bankTransferReconciliation.status}.`
      : "Nessun bonifico originario fornito; controllo non applicabile.",
  };
  const decisionsArtifact = createBusinessDecisionsArtifact({ factsArtifact, decisions: [invoiceDecision, bankDecision] });
  const outcome = !invoiceReconciliation.usable ? "BLOCKED"
    : bankRequiresOperator ? "OPERATOR_REQUIRED" : "RESOLVED";
  return { factsArtifact, decisionsArtifact, outcome, eligibleExpense: outcome === "RESOLVED" ? invoiceTotal : null, invoiceReconciliation, bankTransferReconciliation };
}

export function runEconomicVertical(input: AprEconomicFactsInput) {
  return decideEconomicFacts(createEconomicFactsArtifact(input));
}
