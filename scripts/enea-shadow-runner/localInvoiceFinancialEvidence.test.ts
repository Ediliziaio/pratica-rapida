import { describe, expect, it } from "vitest";
import { reconcileFinancialEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import { extractLocalInvoiceFinancialEvidence } from "./localInvoiceFinancialEvidence";

const extract = (text: string, patch: Partial<Parameters<typeof extractLocalInvoiceFinancialEvidence>[0]> = {}) =>
  extractLocalInvoiceFinancialEvidence({
    sourceId: "invoice-1",
    text,
    extractionMode: "native_text",
    documentNumber: "1/2026",
    documentDate: "2026-06-01",
    grossTotal: 1_220,
    ...patch,
  });

describe("evidenza economica: solo totale finale stampato", () => {
  it("non acquisisce imponibile, IVA, aliquote, scadenziario o somme di riga", () => {
    const evidence = extract(`
FATTURA 1/2026
Riga prodotto 999,00
Imponibile 1.000,00
IVA 22% 220,00
Scadenza 01/07/2026 400,00
Totale documento 1.220,00
`);
    expect(evidence).toMatchObject({
      taxableAmount: null,
      vatAmount: null,
      grossTotal: 1_220,
      interventionGrossAmount: 1_220,
      extractionIssues: [],
      extractionConfidence: "certain",
    });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 1_220, blockers: [] });
  });

  it("Codognato: cifre interne assurde non possono bloccare il totale finale", () => {
    const evidence = extract(`
FATTURA 619
Imponibile 1.097,00
IVA 5.485,00
Aliquota 22%
Totale fattura 680,14
`, { grossTotal: 680.14 });
    expect(evidence).toMatchObject({ taxableAmount: null, vatAmount: null, grossTotal: 680.14, interventionGrossAmount: 680.14 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 680.14, blockers: [] });
  });

  it("una scadenza priva di importo non crea issue o blocker", () => {
    const evidence = extract(`FATTURA 2/2026\nTotale documento 3.477,00\nSCADENZE\n03-08-2026\n-`, { grossTotal: 3_477 });
    expect(evidence).toMatchObject({ extractionIssues: [], interventionGrossAmount: 3_477 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 3_477, auditNotes: [] });
  });

  it("OCR accetta il totale soltanto quando ancorato a una etichetta finale", () => {
    const labelled = extract(`FATTURA 3/2026\nImponibile 2.500,00\nIVA 250,00\nTOTALE A PAGARE\nEuro 2.750,00`, {
      extractionMode: "macos_vision_ocr", grossTotal: 2_750,
    });
    const unlabelled = extract(`FATTURA 3/2026\nImponibile 2.500,00\nIVA 250,00\nEuro 2.750,00`, {
      extractionMode: "macos_vision_ocr", grossTotal: null,
    });
    expect(labelled).toMatchObject({ extractionConfidence: "certain", taxableAmount: null, vatAmount: null });
    expect(unlabelled).toMatchObject({ extractionConfidence: "uncertain", taxableAmount: null, vatAmount: null });
    expect(reconcileFinancialEvidence([unlabelled]).usable).toBe(false);
  });

  it("riconosce advance e balance come fatture economiche a tutti gli effetti", () => {
    const advance = extract("Fattura acconto\nTotale documento 600,00", { sourceId: "advance", grossTotal: 600 });
    const balance = extract("Fattura saldo\nTotale documento 975,01", { sourceId: "balance", grossTotal: 975.01 });
    expect(advance.kind).toBe("advance");
    expect(balance.kind).toBe("balance");
    expect(reconcileFinancialEvidence([advance, balance])).toMatchObject({ usable: true, total: 1_575.01 });
  });

  it("non richiede numero o data per validare economicamente un totale finale certo", () => {
    const evidence = extract("FATTURA\nTotale documento 915,00", { documentNumber: undefined, documentDate: undefined, grossTotal: 915 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 915, blockers: [] });
  });

  it("resta fail-closed quando il totale finale manca", () => {
    const evidence = extract("FATTURA 4/2026\nImponibile 750,00\nIVA 165,00", { grossTotal: null });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: false, total: null });
    expect(reconcileFinancialEvidence([evidence]).blockers).toContain("nessuna-fattura-economica-valida");
  });

  it("classifica come non economico uno storno integrale a zero provato", () => {
    const evidence = extract(`
FATTURA SALDO
A Detrarre nostra fattura n. 434 importo -5.000,00
Fattura a saldo 0,00
Totale documento 0,00
`, { grossTotal: null });
    expect(evidence).toMatchObject({ kind: "non_economic", grossTotal: 0, taxableAmount: null, vatAmount: null });
    expect(evidence.internalAdjustmentNote).toContain("somma dei totali finali");
  });

  it("non trasforma in storno una fattura zero priva del riferimento esplicito", () => {
    const evidence = extract("FATTURA SALDO\nTotale documento 0,00", { grossTotal: 0 });
    expect(evidence.kind).toBe("balance");
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 0 });
  });

  it("mantiene l'importo ENEA Rinaldi soltanto con etichetta esplicita", () => {
    const explicit = extract(`RINALDI SRL\nTOTALE SPESE CONGRUE SOSTENUTE IN BASE AI MASSIMALI AMMESSI\n€ 3.134,06\nTotale documento € 4.400,00`, { grossTotal: 4_400 });
    const ordinary = extract(`RINALDI SRL\nTotale documento € 4.400,00`, { sourceId: "ordinary", grossTotal: 4_400 });
    expect(reconcileFinancialEvidence([explicit], { mode: "test", scheme: "ecobonus" })).toMatchObject({ usable: true, total: 3_134.06 });
    expect(reconcileFinancialEvidence([ordinary], { mode: "test", scheme: "ecobonus" })).toMatchObject({ usable: true, total: 4_400 });
  });
});
