import { describe, expect, it } from "vitest";
import { combineDocumentResults, parseScreeningInvoiceText } from "./invoiceParser";

const observedLayout = `
fattura n. OBS-1 del 09/04/2026
DESCRIZIONE UM QT PREZZO UN. SCONTO IMPORTO
SCHERMATURA SOLARE MOBILE
LARGHEZZA 2900X1300 VALORE G TOT
0,13
NR 2,00 868,00 1.736,00
SCHERMATURA SOLARE MOBILE
LARGHEZZA 1200X1000 VALORE G TOT
0,20
NR 1,00 500,00 500,00
Totale imponibile 2.236,00
Totale 2.459,60
`;

describe("invoice parser layout osservato", () => {
  it("legge la quantità anche quando NR segue dimensioni e gTot", () => {
    const parsed = parseScreeningInvoiceText(observedLayout, "fattura-layout-osservato.pdf");

    expect(parsed.result.status).toBe("parsed");
    expect(parsed.result.itemCount).toBe(3);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      widthMm: 2900,
      heightMm: 1300,
      gTot: 0.13,
      description: "Schermatura solare MOBILE",
    });
    expect(parsed.items[1]).toMatchObject({ widthMm: 2900, heightMm: 1300, gTot: 0.13 });
    expect(parsed.items[2]).toMatchObject({ widthMm: 1200, heightMm: 1000, gTot: 0.2 });
    expect(parsed.items.every(({ description }) => !/LARGHEZZA|G\s*TOT/i.test(description))).toBe(true);
  });

  it("blocca una quantità ambigua anche nel layout osservato con NR dopo il gTot", () => {
    const parsed = parseScreeningInvoiceText(
      observedLayout.replace("NR 2,00 868,00 1.736,00", "NR 1,5 868,00 1.302,00"),
      "fattura-layout-osservato-ambigua.pdf",
    );
    const analysis = combineDocumentResults([parsed]);

    expect(parsed.result.status).toBe("failed");
    expect(parsed.items).toHaveLength(0);
    expect(analysis.blockers).toContain(
      "La quantità di almeno una schermatura non è affidabile: verificare manualmente numero totale, misure e gTot.",
    );
  });
});
