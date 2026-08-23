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
  it("usa il lordo riconciliato nel riepilogo verticale delle fatture Infissi", () => {
    const parsed = parseScreeningInvoiceText(`Fattura 321/FE del 22/07/2026
Imponibile
IVA 10% su 1.772,16 €
Totale fattura
1.772,16 €
177,22 €
1.949,37 €
Totale dovuto 1.949,37 €`, "infissi-321.pdf");
    expect(parsed.result).toMatchObject({ documentType: "invoice", total: 1949.37 });
  });

  it("riconosce la tenda Vans senza gTot e lascia il fallback al registro", () => {
    const parsed = parseScreeningInvoiceText(`
      fattura 254/2026 del 17/07/2026
      N. 1 Tenda a bracci estensibili con cassonetto di copertura totale motorizzato,
      L.480xsp.240, struttura verniciata. Tessuto Tempotest.
      Totale Fattura € 3.050,00
    `, "fattura-vans.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 4800,
      heightMm: 2400,
      surfaceM2: 11.52,
      gTot: null,
      description: "Tenda da sole a bracci estensibili motorizzata",
    })]);
    expect(parsed.result).toMatchObject({ documentType: "invoice", itemCount: 1, total: 3050 });
  });

  it("non inventa una riga Vans quando mancano le misure", () => {
    const parsed = parseScreeningInvoiceText("fattura 1/2026 del 17/07/2026 N. 1 Tenda a bracci estensibili motorizzata Totale Fattura € 3.050,00");
    expect(parsed.items).toHaveLength(0);
  });

  it("estrae dimensioni e conserva la precisione tecnica senza troncare", () => {
    const parsed = parseScreeningInvoiceText(invoice, "fattura.pdf");

    expect(parsed.items).toEqual([
      {
        widthMm: 2900,
        heightMm: 1300,
        surfaceM2: 3.77,
        gTot: 0.13,
        description: "Schermatura solare MOBILE",
        sourcePath: "fattura.pdf",
      },
      {
        widthMm: 5340,
        heightMm: 2120,
        surfaceM2: 11.3208,
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
    expect(analysis.lastInvoiceDate).toBe("2026-04-09");
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

  it("sottrae la nota di credito anche quando il PDF espone un totale negativo", () => {
    const negativeCredit = parseScreeningInvoiceText(credit, "nota-credito.pdf");
    negativeCredit.result.total = -200;
    const analysis = combineDocumentResults([
      parseScreeningInvoiceText(invoice, "fattura.pdf"),
      negativeCredit,
    ]);

    expect(analysis.creditTotal).toBe(200);
    expect(analysis.eligibleExpense).toBe(13924);
  });

  it("segnala documenti sconosciuti e totali non leggibili", () => {
    const analysis = combineDocumentResults([
      parseScreeningInvoiceText("documento generico senza importi", "altro.pdf"),
    ]);

    expect(analysis.eligibleExpense).toBeNull();
    expect(analysis.blockers).toContain("Nessuna fattura riconosciuta tra i documenti fiscali.");
    expect(analysis.blockers).toContain("Almeno un documento non è stato riconosciuto come fattura o nota di credito.");
  });

  it("non usa una data calendario impossibile", () => {
    const parsed = parseScreeningInvoiceText(invoice.replace("09/04/2026", "31/02/2026"), "fattura.pdf");

    expect(parsed.result.documentDate).toBeUndefined();
    expect(combineDocumentResults([parsed]).warnings).toContain("La data non è stata riconosciuta in almeno una fattura.");
  });

  it("estrae una pergotenda singola da larghezza e sporgenza narrative in centimetri", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 23/2026 del 18/05/2026
Pergo tenda Modello Icover
Larghezza 600 cm
Sporgenza 350 cm
MQ 21
Valore Gtot 0,05
Totale € 10.000,00`, "narrativa.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 6000, heightMm: 3500, surfaceM2: 21, gTot: 0.05, description: expect.stringContaining("Pergotenda") }),
    ]);
  });

  it("legge numero e data dalle intestazioni tabellari verticali", () => {
    const cor = parseScreeningInvoiceText(`DATA NUMERO PAGINA\n14/05/2026\n161\n1\nFATTURA\nTOTALE FATTURA\n750,00`, "cor.pdf");
    const differita = parseScreeningInvoiceText(`NUMERO DOCUMENTO DATA DOCUMENTO PAG.\n1512 12/03/2026 001\nTIPO DOCUMENTO\nFattura differita\nTOTALE DOCUMENTO\n6.426,92`, "differita.pdf");
    expect(cor.result).toMatchObject({ documentNumber: "161", documentDate: "2026-05-14", total: 750 });
    expect(differita.result).toMatchObject({ documentNumber: "1512", documentDate: "2026-03-12", total: 6426.92 });
  });

  it("preferisce il numero nell'intestazione sfalsata al riferimento di acconto nel corpo", () => {
    const parsed = parseScreeningInvoiceText(`DATA
18/06/2026 NUMERO
PAGINA
229 1
FATTURA
N. 1 TENDA DA SOLE L 400x240 GTOT 0,13
ACCONTO RIF.FATTURA N.161 DEL 14/05/2026
TOTALE FATTURA
1.750,00`, "cor-saldo-ocr.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "229", documentDate: "2026-06-18", total: 1750 });
  });

  it("blocca il calcolo quando lo stesso documento risulta caricato due volte", () => {
    const first = parseScreeningInvoiceText(invoice, "fattura.pdf");
    const duplicate = parseScreeningInvoiceText(invoice, "copia-fattura.pdf");
    const analysis = combineDocumentResults([first, duplicate]);

    expect(analysis.eligibleExpense).toBeNull();
    expect(analysis.blockers).toContain("Possibile documento fiscale duplicato: verificare numero, data e importo prima di calcolare la spesa.");
  });
});
