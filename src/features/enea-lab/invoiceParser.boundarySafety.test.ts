import { describe, expect, it } from "vitest";
import { combineDocumentResults, parseScreeningInvoiceText } from "./invoiceParser";

describe("invoice parser row boundaries", () => {
  it("blocca l'intera fattura se una schermatura non ha misure leggibili", () => {
    const invoice = `
fattura n. 91/001 del 10/08/2026
SCHERMATURA SOLARE MOBILE NR 2,00
DESCRIZIONE SENZA MISURE RICONOSCIBILI
SCHERMATURA SOLARE MOBILE NR 1,00
LARGHEZZA 1200X1000 VALORE G TOT 0,20
Totale 1.000,00
`;

    const parsed = parseScreeningInvoiceText(invoice, "fattura-confini.pdf");
    const analysis = combineDocumentResults([parsed]);

    expect(parsed.result.status).toBe("failed");
    expect(parsed.result.itemCount).toBe(0);
    expect(parsed.items).toHaveLength(0);
    expect(parsed.result.message).toMatch(/non contiene misure e gTot riconoscibili/i);
    expect(analysis.blockers).toContain(
      "Almeno una schermatura della fattura non è stata letta integralmente: verificare manualmente numero totale, misure e gTot.",
    );
  });

  it("non fa contaminare una riga incompleta con le misure della schermatura successiva", () => {
    const invoice = `
fattura n. 91/002 del 10/08/2026
SCHERMATURA SOLARE MOBILE NR 2,00
DESCRIZIONE SENZA MISURE RICONOSCIBILI
SCHERMATURA SOLARE MOBILE NR 1,00
LARGHEZZA 1200X1000 VALORE G TOT 0,20
Totale 1.000,00
`;

    const parsed = parseScreeningInvoiceText(invoice, "fattura-confini-2.pdf");

    expect(parsed.items).toHaveLength(0);
    expect(parsed.result.status).toBe("failed");
  });
});
