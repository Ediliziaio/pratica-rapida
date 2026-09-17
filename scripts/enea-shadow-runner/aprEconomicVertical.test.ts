import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import {
  createEconomicFactsArtifact,
  runEconomicVertical,
  type AprEconomicBankTransferObservation,
  type AprEconomicFactsInput,
  type AprEconomicInvoiceObservation,
} from "./aprEconomicVertical";

const locator = (sourceId: string) => ({
  sourceId,
  pageNumber: 1,
  contentSha256: canonicalSha256({ sourceId }),
  excerptSha256: canonicalSha256({ sourceId, excerpt: true }),
});

function invoice(sourceId: string, documentNumber: string, grossTotal: number, overrides: Partial<AprEconomicInvoiceObservation> = {}): AprEconomicInvoiceObservation {
  return {
    sourceId,
    supplierId: "supplier",
    supplierName: "Supplier fixture",
    documentNumber,
    documentDate: "2026-06-01",
    kind: "invoice",
    taxableAmount: grossTotal / 1.1,
    vatAmount: grossTotal - grossTotal / 1.1,
    grossTotal,
    referencedAdvanceIds: [],
    interventionGrossAmount: grossTotal,
    extractionConfidence: "certain",
    extractionIssues: [],
    internalAdjustmentNote: null,
    explicitDeductibleLines: [],
    lineItems: [],
    locator: locator(sourceId),
    ...overrides,
  };
}

function transfer(sourceId: string, principalAmount: number, fees: number): AprEconomicBankTransferObservation {
  return {
    sourceId,
    transactionReference: `TRN-${sourceId}`,
    principalAmount,
    fees,
    debitedTotal: principalAmount + fees,
    invoiceReference: "1",
    taxReliefType: "building_renovation",
    appliedRuleIds: [],
    locator: locator(sourceId),
  };
}

function input(overrides: Partial<AprEconomicFactsInput> = {}): AprEconomicFactsInput {
  return {
    customerKey: "economic-fixture",
    practiceId: "practice-economic-fixture",
    sourceFingerprint: canonicalSha256({ corpus: "economic-fixture" }),
    invoices: [invoice("invoice-1", "1", 110, { taxableAmount: 100, vatAmount: 10 })],
    bankTransfers: [],
    replacements: [],
    ...overrides,
  };
}

describe("APR Slice 2 economic vertical", () => {
  it("L2 osserva importi distinti senza sommare o scegliere un valore ENEA", () => {
    const facts = createEconomicFactsArtifact(input({
      invoices: [
        invoice("invoice-1", "1", 110, { taxableAmount: 100, vatAmount: 10 }),
        invoice("invoice-2", "2", 220, { taxableAmount: 200, vatAmount: 20 }),
      ],
    }));
    const grossFacts = facts.payload.facts.filter((item) => item.field === "economic.invoice.grossTotal");
    expect(grossFacts.map((item) => item.value).sort((a, b) => Number(a) - Number(b))).toEqual([110, 220]);
    expect(facts.payload.facts.some((item) => item.field === "economic.eligibleExpense")).toBe(false);
  });

  it("positivo: L3 somma fatture distinte, esclude commissioni e mantiene la fattura autorevole", () => {
    const result = runEconomicVertical(input({
      invoices: [
        invoice("invoice-1", "1", 110, { taxableAmount: 100, vatAmount: 10 }),
        invoice("invoice-2", "2", 220, { taxableAmount: 200, vatAmount: 20 }),
      ],
      bankTransfers: [transfer("transfer-1", 329, 1)],
    }));
    expect(result).toMatchObject({ outcome: "RESOLVED", eligibleExpense: 330 });
    expect(result.bankTransferReconciliation).toMatchObject({ status: "principal_below_invoices", principalTotal: 329, feesTotal: 1 });
    expect(result.decisionsArtifact.payload.decisions.flatMap((item) => item.appliedRuleIds)).toContain("user-2026-08-16-distinct-invoice-numbers-same-customer-sum");
  });

  it("regola generale di Giuliano: risolve anche con una terna imponibile/IVA/lordo vistosamente incoerente, perché quella coerenza interna non viene più verificata", () => {
    const result = runEconomicVertical(input({ invoices: [invoice("invoice-1", "1", 110, { taxableAmount: 1, vatAmount: 1, interventionGrossAmount: 110 })] }));
    expect(result.outcome).toBe("RESOLVED");
    expect(result.eligibleExpense).toBe(110);
    expect(result.invoiceReconciliation.blockers.some((code) => code.startsWith("imponibile-iva-mismatch"))).toBe(false);
  });

  it("applica la sostituzione esplicita senza sommare la fattura sostituita", () => {
    const result = runEconomicVertical(input({
      invoices: [
        invoice("old-invoice", "10", 110, { taxableAmount: 100, vatAmount: 10 }),
        invoice("replacement-invoice", "11", 220, { taxableAmount: 200, vatAmount: 20 }),
      ],
      replacements: [{ replacementSourceId: "replacement-invoice", replacedSourceId: "old-invoice", locator: locator("replacement-invoice") }],
    }));
    expect(result).toMatchObject({ outcome: "RESOLVED", eligibleExpense: 220 });
    expect(result.decisionsArtifact.payload.decisions.flatMap((item) => item.appliedRuleIds)).toContain("system-explicit-replacement-invoice-supersession");
  });

  it("rifiuta un riferimento di sostituzione che non identifica entrambe le fatture osservate", () => {
    expect(() => runEconomicVertical(input({
      replacements: [{ replacementSourceId: "invoice-1", replacedSourceId: "invoice-missing", locator: locator("invoice-1") }],
    }))).toThrow("apr_economic_invalid_replacement_link");
  });

  it("audita senza bloccare quando il capitale bonificato supera le fatture", () => {
    const result = runEconomicVertical(input({ bankTransfers: [transfer("transfer-1", 110.06, 1)] }));
    expect(result.outcome).toBe("RESOLVED");
    expect(result.eligibleExpense).toBe(110);
    expect(result.bankTransferReconciliation.status).toBe("principal_exceeds_invoices");
    expect(result.decisionsArtifact.payload.decisions.find((item) => item.field === "economic.bankTransferCheck"))
      .toMatchObject({ status: "resolved", blockerCode: null });
  });

  it("mantiene l'audit capitale/lordi separato e non bloccante dal totale finale fattura", () => {
    const result = runEconomicVertical(input({
      invoices: [invoice("invoice-1", "1", 110, { taxableAmount: 1, vatAmount: 1, interventionGrossAmount: 110 })],
      bankTransfers: [transfer("transfer-1", 120, 1)],
    }));
    expect(result.invoiceReconciliation.usable).toBe(true);
    expect(result.outcome).toBe("RESOLVED");
    expect(result.eligibleExpense).toBe(110);
    expect(result.bankTransferReconciliation.status).toBe("principal_exceeds_invoices");
  });

  it("produce artefatti deterministici e immutabili", () => {
    const first = runEconomicVertical(input());
    const second = runEconomicVertical(input());
    expect(first.factsArtifact.artifactId).toBe(second.factsArtifact.artifactId);
    expect(first.decisionsArtifact.artifactId).toBe(second.decisionsArtifact.artifactId);
    expect(Object.isFrozen(first.factsArtifact.payload.facts)).toBe(true);
    expect(() => ((first.factsArtifact.payload.facts[0] as unknown as { field: string }).field = "tampered")).toThrow();
  });
});
