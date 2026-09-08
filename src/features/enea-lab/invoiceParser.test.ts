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

  it("regressione Cirillo: preferisce l'intestazione 'Fattura / Numero: / <data coi punti>' al riferimento di una fattura precedente detratta nel corpo", () => {
    const parsed = parseScreeningInvoiceText(`RINNOVA S.R.L. - C.F. 04745760274 - P.IVA 04745760274 (IT)
Fattura
Numero: 52
26.02.2025
Cessionario/committente
Valentina Cirillo - C.F. CRLVNT92B47F241O
Descrizione Quantità Prezzo
Salamander 76 // 3 Acconto: per lesecuzione dei lavori di fornitura e
posa dei serramenti
1,00 2.285,45 10,00% 2.285,45
2A detrarre fattura Nr. 577/2024 del
11/10/2024 1,00 -500 10,00% -500,00
TOTALE 1.964,00(EUR)`, "cirillo.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "52", documentDate: "2025-02-26", total: 1964 });
  });

  it("blocca il calcolo quando lo stesso documento risulta caricato due volte", () => {
    const first = parseScreeningInvoiceText(invoice, "fattura.pdf");
    const duplicate = parseScreeningInvoiceText(invoice, "copia-fattura.pdf");
    const analysis = combineDocumentResults([first, duplicate]);

    expect(analysis.eligibleExpense).toBeNull();
    expect(analysis.blockers).toContain("Possibile documento fiscale duplicato: verificare numero, data e importo prima di calcolare la spesa.");
  });

  describe("fallback generico a due misure senza etichette note", () => {
    it("regressione Cotta: calcola l'area da 'L. MT. X X P. MT. Y' senza conoscere il significato di P.", () => {
      const parsed = parseScreeningInvoiceText(`FATTURA nr. 10/2026 del 12/05/2026
FORNITURA TRASPORTO E INSTALLAZIONE DI:
SCHERMATURA SOLARE A BRACCI ESTENSIBILI CON STRUTTURA IN ALLUMINIO LEGA PRIMARIA VERNICIATO RAL 1013
AVORIO
FISSAGGIO A PARETE 3 SUPPORTI CON BRACCI A TRAZIONE MOLLA SU TUBOLARE QUADRO PORTANTE VITERIE INOX
UTILIZZO DI TESSUTO ACRILICO TEMPOTEST PARA' IN H.1,20 TERMOSALDATO COLORE 15/1 AVORIO TINTA UNITA
COMPRESA MANTOVANA H. 0,25 DIRITTA
MOVIMENTAZIONE MANUALE AD ARGANELLO CON ASTA DI MANOVRA AMOVIBILE
N.1 MIS. L. MT. 3,50 X P. MT. 2,50
FATTORE G TOT: 0,13
GARANZIA ANNI 5 (ATTIVA)
Totale documento 1.470,00`, "cotta.pdf");
      expect(parsed.items).toEqual([expect.objectContaining({
        widthMm: 3500,
        heightMm: 2500,
        surfaceM2: 8.75,
        description: "Schermatura solare",
      })]);
      expect(parsed.result).toMatchObject({ documentType: "invoice", itemCount: 1 });
      // Le altezze di tessuto/mantovana ("H.1,20", "H. 0,25") citate nella
      // descrizione prima della vera misura del prodotto non hanno unita' di
      // misura esplicita accanto e non devono mai diventare la riga tecnica.
      expect(parsed.items[0].widthMm).not.toBe(120);
      expect(parsed.items[0].heightMm).not.toBe(25);
    });

    it("generalizza a sigle mai viste altrove nel file ('B.' e 'SP.') senza aggiungerle a un elenco di casi noti", () => {
      const parsed = parseScreeningInvoiceText(`fattura 88/2026 del 01/08/2026
Fornitura e posa di N.1 pergola bioclimatica con struttura in alluminio,
B. MT. 4,00 X SP. MT. 3,20, telo tecnico ombreggiante.
Totale Fattura € 5.200,00`, "pergola-sigle-nuove.pdf");
      expect(parsed.items).toEqual([expect.objectContaining({
        widthMm: 4000,
        heightMm: 3200,
        surfaceM2: 12.8,
        description: "Pergotenda",
      })]);
    });

    it("non inventa una conversione quando l'unita' di misura manca su almeno un lato", () => {
      const parsed = parseScreeningInvoiceText(`fattura 5/2026 del 03/03/2026
N.1 tenda da sole con struttura in alluminio, L. 350 X P. MT. 2,50.
Totale Fattura € 1.000,00`, "unita-mancante.pdf");
      expect(parsed.items).toHaveLength(0);
    });

    it("non si attiva quando un parser piu specifico ha gia' trovato la riga", () => {
      const parsed = parseScreeningInvoiceText(`
        fattura 254/2026 del 17/07/2026
        N. 1 Tenda a bracci estensibili con cassonetto di copertura totale motorizzato,
        L.480xsp.240, struttura verniciata. Tessuto Tempotest.
        Totale Fattura € 3.050,00
      `, "fattura-vans.pdf");
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].measurementAudit?.ruleId).not.toBe("user-2026-09-07-generic-two-measurement-screening-area-fallback-v1");
    });

    it("non intercetta una coppia di misure senza alcun prodotto di schermatura nelle vicinanze", () => {
      const parsed = parseScreeningInvoiceText(`fattura 12/2026 del 01/01/2026
Onorario tecnico per pratica catastale, foglio A. MT. 4,00 X part. MT. 3,00.
Totale Fattura € 500,00`, "estranea.pdf");
      expect(parsed.items).toHaveLength(0);
    });
  });
});
