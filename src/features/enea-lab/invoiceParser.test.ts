import { describe, expect, it } from "vitest";
import { combineDocumentResults, parseScreeningInvoiceText } from "./invoiceParser";

const invoice = `
fattura n. 67/001 del 09/04/2026
SCHERMATURA SOLARE MOBILE NR 1,00 868,00 868,00
LARGHEZZA 2900X1300 VALORE G TOT
0,13
SCHERMATURA SOLARE MOBILE NR 1,00 2.559,00 2.559,00
LARGHEZZA 5340X2120 VALORE G TOT 0,13
Totale imponibile 12.840,00
Totale 14.124,00
`;

const credit = `
nota di credito n. 148/001 del 09/07/2026
STORNO PARZIALE FATTURA N. 67
Totale imponibile 181,82
Totale 200,00
`;

describe("parseScreeningInvoiceText", () => {
  it("estrae dimensioni e tronca la superficie a una cifra come il portale ENEA", () => {
    const parsed = parseScreeningInvoiceText(invoice, "fattura.pdf");

    expect(parsed.items).toEqual([
      {
        widthMm: 2900,
        heightMm: 1300,
        surfaceM2: 3.7,
        gTot: 0.13,
        description: "Schermatura solare MOBILE",
        sourcePath: "fattura.pdf",
      },
      {
        widthMm: 5340,
        heightMm: 2120,
        surfaceM2: 11.3,
        gTot: 0.13,
        description: "Schermatura solare MOBILE",
        sourcePath: "fattura.pdf",
      },
    ]);
    expect(parsed.result.total).toBe(14124);
    expect(parsed.result.documentType).toBe("invoice");
    expect(parsed.result.documentNumber).toBe("67/001");
    expect(parsed.result.documentDate).toBe("2026-04-09");
  });

  it("sottrae le note di credito dal totale ammissibile", () => {
    const analysis = combineDocumentResults([
      parseScreeningInvoiceText(invoice, "fattura.pdf"),
      parseScreeningInvoiceText(credit, "nota-credito.pdf"),
    ]);

    expect(analysis.invoiceTotal).toBe(14124);
    expect(analysis.creditTotal).toBe(200);
    expect(analysis.eligibleExpense).toBe(13924);
    expect(analysis.firstInvoiceDate).toBe("2026-04-09");
    expect(analysis.items).toHaveLength(2);
  });

  it("non trasforma righe di una nota di credito in nuove schermature", () => {
    const creditWithDescription = `${credit}\nSCHERMATURA SOLARE LARGHEZZA 1200X1000 VALORE G TOT 0,20`;
    const analysis = combineDocumentResults([
      parseScreeningInvoiceText(invoice, "fattura.pdf"),
      parseScreeningInvoiceText(creditWithDescription, "nota-credito.pdf"),
    ]);

    expect(analysis.items).toHaveLength(2);
    expect(analysis.creditTotal).toBe(200);
  });

  it("segnala documenti sconosciuti e totali non leggibili", () => {
    const analysis = combineDocumentResults([
      parseScreeningInvoiceText("documento generico senza importi", "altro.pdf"),
    ]);

    expect(analysis.eligibleExpense).toBeNull();
    expect(analysis.blockers).toContain("Nessuna fattura riconosciuta tra i documenti fiscali.");
    expect(analysis.blockers).toContain("Almeno un documento non è stato riconosciuto come fattura o nota di credito.");
  });
});
