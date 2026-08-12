import { describe, expect, it } from "vitest";
import { parseScreeningInvoiceText } from "./invoiceParser";

describe("invoice parser row boundaries", () => {
  it("non abbina quantità di una schermatura alle misure della riga successiva", () => {
    const invoice = `
fattura n. 91/001 del 10/08/2026
SCHERMATURA SOLARE MOBILE NR 2,00
DESCRIZIONE SENZA MISURE RICONOSCIBILI
SCHERMATURA SOLARE MOBILE NR 1,00
LARGHEZZA 1200X1000 VALORE G TOT 0,20
Totale 1.000,00
`;

    const parsed = parseScreeningInvoiceText(invoice, "fattura-confini.pdf");

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      widthMm: 1200,
      heightMm: 1000,
      gTot: 0.2,
    });
  });
});
