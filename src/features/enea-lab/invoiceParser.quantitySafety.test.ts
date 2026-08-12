import { describe, expect, it } from "vitest";
import { combineDocumentResults, parseScreeningInvoiceText } from "./invoiceParser";

function invoiceWithQuantity(quantity: string): string {
  return `
fattura n. QS-1 del 09/04/2026
SCHERMATURA SOLARE MOBILE NR ${quantity} 100,00 100,00
LARGHEZZA 1200X1000 VALORE G TOT 0,13
Totale 100,00
`;
}

describe("invoiceParser quantity safety", () => {
  it.each([
    ["zero", "0"],
    ["frazionaria", "1,5"],
    ["oltre il limite prudenziale", "51"],
  ])("blocca una quantità esplicita %s invece di degradarla silenziosamente a uno", (_label, quantity) => {
    const parsed = parseScreeningInvoiceText(invoiceWithQuantity(quantity), "fattura-quantita.pdf");
    const analysis = combineDocumentResults([parsed]);

    expect(parsed.items).toHaveLength(0);
    expect(parsed.result.status).toBe("failed");
    expect(parsed.result.message).toContain("Quantità schermatura esplicita non valida");
    expect(analysis.blockers).toContain("Almeno un documento deve essere letto o controllato manualmente.");
  });

  it("scarta anche le righe valide della stessa fattura quando una quantità esplicita è ambigua", () => {
    const text = `
fattura n. QS-2 del 10/04/2026
SCHERMATURA SOLARE MOBILE NR 1 100,00 100,00
LARGHEZZA 1200X1000 VALORE G TOT 0,13
SCHERMATURA SOLARE MOBILE NR 1,5 200,00 200,00
LARGHEZZA 1400X1000 VALORE G TOT 0,14
Totale 300,00
`;
    const parsed = parseScreeningInvoiceText(text, "fattura-righe-miste.pdf");
    const analysis = combineDocumentResults([parsed]);

    expect(parsed.result.status).toBe("failed");
    expect(parsed.result.itemCount).toBe(0);
    expect(parsed.items).toHaveLength(0);
    expect(analysis.items).toHaveLength(0);
    expect(analysis.blockers).toContain(
      "La quantità di almeno una schermatura non è affidabile: verificare manualmente numero totale, misure e gTot.",
    );
  });

  it("mantiene il fallback a una schermatura solo quando la quantità non è presente", () => {
    const text = invoiceWithQuantity("1").replace(/\s+NR\s+1\s+100,00\s+100,00/, " 100,00 100,00");
    const parsed = parseScreeningInvoiceText(text, "fattura-senza-quantita.pdf");

    expect(parsed.result.status).toBe("parsed");
    expect(parsed.items).toHaveLength(1);
  });
});
