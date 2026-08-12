import { describe, expect, it } from "vitest";
import { combineDocumentResults, parseScreeningInvoiceText } from "./invoiceParser";

const invoice = `
fattura n. 67/001 del 09/04/2026
SCHERMATURA SOLARE MOBILE NR 1,00 868,00 868,00
LARGHEZZA 2900X1300 VALORE G TOT 0,13
Totale 14.124,00
`;

describe("sicurezza identita documenti fiscali", () => {
  it("blocca due documenti con stesso tipo, numero e data anche se il totale estratto differisce", () => {
    const first = parseScreeningInvoiceText(invoice, "fattura.pdf");
    const alteredTotal = parseScreeningInvoiceText(
      invoice.replace("14.124,00", "14.125,00"),
      "copia-con-totale-diverso.pdf",
    );
    const analysis = combineDocumentResults([first, alteredTotal]);

    expect(first.result.total).toBe(14124);
    expect(alteredTotal.result.total).toBe(14125);
    expect(analysis.eligibleExpense).toBeNull();
    expect(analysis.blockers).toContain(
      "Possibile documento fiscale duplicato: verificare numero, data e importo prima di calcolare la spesa.",
    );
  });
});
