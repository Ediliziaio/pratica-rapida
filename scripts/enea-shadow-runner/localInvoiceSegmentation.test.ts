import { describe, expect, it } from "vitest";
import { combineDocumentResults } from "../../src/features/enea-lab/invoiceParser";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";

const advance = `Fattura Accompagnatoria n. 86/A del 13/05/2026
Descrizione Importo IVA Totale
ACCONTO FORNITURA E POSA TENDE DA SOLE. N. 2 TENDE DA CM 275 X 200, GTOT 0,12 SCHERMATURA SOLARE DINAMICA 1.000,00 € 22% 1.000,00 €
Imponibile 819,67 €
Imposta 22% 180,33 €
Totale 1.000,00 €`;
const balance = `Fattura Accompagnatoria n. 136/A del 13/06/2026
Descrizione Importo IVA Totale
SALDO: FORNITURA E POSA TENDE DA SOLE. N. 2 TENDE DA CM 275 X 200, GTOT 0,12 SCHERMATURA SOLARE DINAMICA 3.464,00 € 22% 3.464,00 €
TRASPORTO, TASSELLI 320,00 € 22% 320,00 €
ACCONTO: FATTURA N. 86/A DEL 13/05/2026 -1.000,00 € 22% -1.000,00 €
Imponibile 2.281,97 €
Imposta 22% 502,03 €
Totale 2.784,00 €`;

describe("segmentazione locale fatture acconto/saldo", () => {
  it("somma due fatture distinte con uguale importo nel layout Data/Numero", () => {
    const first = splitLocalInvoiceText({ documentKey: "invoice-146", text: `Fattura
Data 22/06/2026 Numero 146 Pagina
Totale imponibile 7.500,00
Totale IVA 750,00
Totale documento
8.250,00`, extractionMode: "native_text" })[0];
    const second = splitLocalInvoiceText({ documentKey: "invoice-167", text: `Fattura
Data 31/07/2026 Numero 167 Pagina
Totale imponibile 7.500,00
Totale IVA 750,00
Totale documento
8.250,00`, extractionMode: "native_text" })[0];
    const reconciled = reconcileLocalInvoiceSegments([first, second]);
    expect(reconciled.uniqueFinancialSegments.map((item) => [item.documentNumber, item.documentDate, item.total])).toEqual([
      ["146", "2026-06-22", 8250],
      ["167", "2026-07-31", 8250],
    ]);
    expect(reconciled.uniqueFinancialSegments.reduce((sum, item) => sum + (item.total ?? 0), 0)).toBe(16500);
    expect(reconciled.discardedDuplicateSourceIds).toEqual([]);
  });

  it("non deduplica due fonti irrisolte soltanto perche hanno identita vuota", () => {
    const first = splitLocalInvoiceText({ documentKey: "unresolved-a", text: "Fattura priva di testata leggibile", extractionMode: "native_text" })[0];
    const second = splitLocalInvoiceText({ documentKey: "unresolved-b", text: "Altra fattura priva di testata leggibile", extractionMode: "native_text" })[0];
    const reconciled = reconcileLocalInvoiceSegments([first, second]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.discardedDuplicateSourceIds).toEqual([]);
  });
  it("usa il saldo per la cardinalita tecnica di tapparelle narrative ma somma economicamente acconto e saldo", () => {
    const acconto = splitLocalInvoiceText({ documentKey: "acconto-tapparelle", text: `FATTURA\nnr. FPR 176/26 del 23/04/2026\nfattura acconto per fornitura e posa di Tapparella in alluminio N° 1 da 143 x 185 cm N° 1 da 283,5 x 185 cm\nTotale documento 3.446,50 €`, extractionMode: "native_text" })[0];
    const saldo = splitLocalInvoiceText({ documentKey: "saldo-tapparelle", text: `FATTURA\nnr. FPR 337/26 del 01/07/2026\nPRODOTTI E SERVIZI\n1 fattura saldo per fornitura e posa di Tapparella in alluminio N° 1 da 143 x 185 cm Schermatura superficie mq 2,645 Gtot 0,060 classe 4 N° 1 da 283,5 x 185 cm Schermatura superficie mq 5,2447 Gtot 0,060\n2 Infissi PVC\nMETODO DI PAGAMENTO\nTotale documento 3.446,50 €`, extractionMode: "native_text" })[0];
    const reconciled = reconcileLocalInvoiceSegments([acconto, saldo]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.uniqueFinancialSegments.reduce((sum, segment) => sum + (segment.total ?? 0), 0)).toBe(6893);
    expect(reconciled.technicalSegments).toEqual([saldo]);
    expect(reconciled.technicalSegments.flatMap((segment) => segment.items)).toHaveLength(2);
    expect(reconciled.supersededTechnicalSourceIds).toEqual([acconto.sourceId]);
  });
  it("non scambia 'fattura acconto per fornitura' per un riferimento alla fattura PER", () => {
    const [segment] = splitLocalInvoiceText({
      documentKey: "acconto-descrittivo",
      text: "FATTURA n. 176/26 del 23/04/2026\nfattura acconto per fornitura e posa di Tapparella\nTotale documento 3.446,50 €",
      extractionMode: "native_text",
    });
    expect(segment.referencedInvoiceNumbers).toEqual([]);
  });

  it("riconosce anche il riferimento Fatt.acconto scritto prima della parola acconto", () => {
    const [segment] = splitLocalInvoiceText({ documentKey: "saldo-con-acconto", text: "FATTURA 1512 del 12/03/2026\nTotale complessivo 9.010,00 - Fatt.acconto nr. 320 del 30/11/2025\nTotale documento 6.426,92", extractionMode: "native_text" });
    expect(segment.referencedInvoiceNumbers).toContain("320/25");
  });

  it("riconosce numero e data nell'intestazione tabellare delle fatture Infissi", () => {
    const text = `Codice Fiscale Cliente ABC Numero fattura Data fattura
95 31/05/2026
Secondo acconto su fornitura e posa di infissi
Totale imponibile € 6.054,92
Totale fattura € 6.660,41`;
    const [segment] = splitLocalInvoiceText({ documentKey: "cdf-95", text, extractionMode: "native_text" });
    expect(segment).toMatchObject({ documentNumber: "95", documentDate: "2026-05-31", total: 6660.41 });
  });

  it("riconosce numero e data puntata nell'intestazione verticale GRK", () => {
    const text = `GRK Serramenti Srl
Fattura
Numero : 6
Data 13.02.2026
Totale documento € 11.562,71
Totale da pagare € 11.562,71`;
    const [segment] = splitLocalInvoiceText({ documentKey: "grk-6", text, extractionMode: "native_text" });
    expect(segment).toMatchObject({ documentNumber: "6", documentDate: "2026-02-13", total: 11562.71 });
  });

  it("separa le fatture Ideal Sistem con numero e data sotto la testata verticale", () => {
    const text = `FATTURA IMMEDIATA - COPIA DI CORTESIA
Spett.le CANNAS GAVINA EMANUELA
Tipo documento-
Num. Doc.
Data Docum.
FATTURA
172/00
13/04/2026
ACCONTO PER FORNITURA E POSA DI FINESTRE IN PVC
Imponibile 2.136,36
Importo IVA 213,64
TOTALE DOCUMENTO Euro 2.350,00
\fFATTURA IMMEDIATA DDT
Spett.le CANNAS GAVINA EMANUELA
Tipo documento
Num. Doc.
Data Docum.
FATTURA
252/00
22/05/2026
FINESTRA TELAIO RESTAURO 1 ANTA 89,8X149,7
Imponibile 1.914,55
Importo IVA 235,46
TOTALE DOCUMENTO Euro 2.350,01`;
    const segments = splitLocalInvoiceText({ documentKey: "ideal-sistem", text, extractionMode: "macos_vision_ocr" });
    expect(segments.map((segment) => [segment.documentNumber, segment.documentDate, segment.total])).toEqual([
      ["172/00", "2026-04-13", 2350],
      ["252/00", "2026-05-22", 2350.01],
    ]);
  });

  it("legge il totale Ideal Sistem dalla colonna Totale a pagare prima delle scadenze", () => {
    const [segment] = splitLocalInvoiceText({ documentKey: "ideal-acconto", text: `FATTURA IMMEDIATA - COPIA DI CORTESIA
Tipo documento-
Num. Doc.
Data Docum.
FATTURA
172/00
13/04/2026
Imponibile 2.136,36
Importo IVA 213,64
TOTALE DOCUMENTO
Sconto in fattura
TOTALE A PAGARE
Euro 2.350,00
Scadenze
2.136,36
Tot.
213,64
Euro 2.350,00`, extractionMode: "macos_vision_ocr" });
    expect(segment).toMatchObject({ documentNumber: "172/00", documentDate: "2026-04-13", total: 2350 });
  });

  it("separa due fatture nello stesso PDF, deduplica la copia OCR e preserva solo due prodotti fisici", () => {
    const native = splitLocalInvoiceText({ documentKey: "native", text: `${advance}\n\f\n${balance}`, extractionMode: "native_text" });
    const ocr = splitLocalInvoiceText({ documentKey: "ocr", text: balance, extractionMode: "macos_vision_ocr" });
    expect(native).toHaveLength(2); expect(ocr).toHaveLength(1);
    expect(native.map((segment) => segment.documentNumber)).toEqual(["86/A", "136/A"]);
    expect(native.map((segment) => segment.items.length)).toEqual([2, 2]);
    const reconciled = reconcileLocalInvoiceSegments([...ocr, ...native]);
    expect(reconciled.uniqueFinancialSegments.map((segment) => segment.documentNumber).sort()).toEqual(["136/A", "86/A"]);
    expect(reconciled.uniqueFinancialSegments.every((segment) => segment.extractionMode === "native_text")).toBe(true);
    expect(reconciled.technicalSegments).toHaveLength(1);
    expect(reconciled.technicalSegments[0].documentNumber).toBe("136/A");
    expect(reconciled.technicalSegments[0].items).toHaveLength(2);
    expect(reconciled.discardedDuplicateSourceIds).toHaveLength(1);
    expect(reconciled.supersededTechnicalSourceIds).toHaveLength(1);
  });

  it("deduplica due OCR della stessa fattura anche quando il corpo cita l'acconto", () => {
    const compact = `DATA
18/06/2026 NUMERO
PAGINA
229 1
FATTURA
TENDA DA SOLE BARRA QUADRA MOD.R30, DIM.CM L 400x240 SP (=MQ 9,6), GTOT 0,13
TENDA DA SOLE BARRA QUADRA MOD.R30, DIM.CM L 300x240 SP (=MQ 7,2), GTOT 0,13
ACCONTO RIF.FATTURA N.161 DEL 14/05/2026
TOTALE FATTURA
1.750,00`;
    const tabular = `DATA NUMERO PAGINA
18/06/2026
229
1
FATTURA
TENDA DA SOLE BARRA QUADRA MOD.R30, DIM.CM L 400x240 SP (=MQ 9,6), GTOT 0,13
TENDA DA SOLE BARRA QUADRA MOD.R30, DIM.CM L 300x240 SP (=MQ 7,2), GTOT 0,13
ACCONTO RIF.FATTURA N.161 DEL 14/05/2026
TOTALE FATTURA
1.750,00`;
    const first = splitLocalInvoiceText({ documentKey: "ocr-a", text: compact, extractionMode: "macos_vision_ocr" })[0];
    const second = splitLocalInvoiceText({ documentKey: "ocr-b", text: tabular, extractionMode: "macos_vision_ocr" })[0];
    expect([first.documentNumber, second.documentNumber]).toEqual(["229", "229"]);
    const reconciled = reconcileLocalInvoiceSegments([first, second]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(1);
    expect(reconciled.technicalSegments).toHaveLength(1);
    expect(reconciled.technicalSegments[0].items).toHaveLength(2);
    expect(reconciled.discardedDuplicateSourceIds).toHaveLength(1);
  });

  it("non aggrega o elimina prodotti uguali su fatture indipendenti senza riferimento acconto", () => {
    const first = splitLocalInvoiceText({ documentKey: "a", text: advance, extractionMode: "native_text" })[0];
    const independent = { ...splitLocalInvoiceText({ documentKey: "b", text: balance.replace(/ACCONTO:[^\n]+\n/, ""), extractionMode: "native_text" })[0], referencedInvoiceNumbers: [] };
    const reconciled = reconcileLocalInvoiceSegments([first, independent]);
    expect(reconciled.technicalSegments).toHaveLength(2);
    expect(reconciled.technicalSegments.flatMap((segment) => segment.items)).toHaveLength(4);
  });

  it("scarta un frammento pagina senza totale quando la stessa fattura completa e' nello stesso PDF", () => {
    const complete = splitLocalInvoiceText({ documentKey: "same-pdf", text: advance, extractionMode: "native_text" })[0];
    const fragment = { ...complete, sourceId: "same-pdf:fragment", total: null, result: { ...complete.result, total: null } };
    const reconciled = reconcileLocalInvoiceSegments([complete, fragment]);
    expect(reconciled.uniqueFinancialSegments).toEqual([complete]);
    expect(reconciled.discardedDuplicateSourceIds).toContain("same-pdf:fragment");
  });

  it("mantiene un modulo tecnico di posa ma non lo conta come seconda fattura incompleta", () => {
    const fiscal = splitLocalInvoiceText({ documentKey: "fabio-fattura", text: `FATTURA\nnr. FPR 995/25 del 01/12/2025\nFORNITORE BRIANZA SERRAMENTI\nCLIENTE FABIO TOIA\nFornitura e posa di N. 7 serramenti in PVC\nTotale imponibile 39.363,64 EUR\nTotale IVA 3.936,36 EUR\nTotale documento 43.300,00 EUR\nNetto a pagare 43.300,00 EUR`, extractionMode: "native_text" })[0];
    const worksheet = splitLocalInvoiceText({ documentKey: "fabio-modulo-posa", text: `COGNOME TOIA\nNOME FABIO\nN° ORDINE 2411LG\nMERCE FORNITORE\nARRIVO 20/03/2026\nPOSA SQUADRA GALLARATE\nNOTE NUMERO E DATA FATTURA 995 del 1.12.25\nFINESTRA L=1640 H=2568`, extractionMode: "macos_vision_ocr" })[0];
    const reconciled = reconcileLocalInvoiceSegments([fiscal, worksheet]);
    expect(reconciled.uniqueFinancialSegments).toEqual([fiscal]);
    expect(reconciled.technicalSegments).toEqual(expect.arrayContaining([fiscal, worksheet]));
    expect(reconciled.nonFiscalTechnicalSourceIds).toEqual([worksheet.sourceId]);
    const financial = combineDocumentResults(reconciled.uniqueFinancialSegments.map((segment) => ({ result: segment.result, items: segment.items })));
    expect(financial.blockers).not.toContain("Il totale di almeno un documento fiscale non è stato riconosciuto.");
    expect(financial.invoiceTotal).toBe(43_300);
  });

  it("separa acconto e saldo Vans con intestazione verticale", () => {
    const text = `Vans Tappezzeria\nspett Cliente Test\nacconto/anticipo su fattura\ncfisc\nTESTCF80A01A001A\n175/2026 del\n29/05/2026\nN.1 Tenda da sole L.380xh.210\nG TOT 0,13\nTotale Fattura € 555,00
\fVans Tappezzeria\nspett Cliente Test\nfattura\ncfisc TESTCF80A01A001A\n237/2026 del\n09/07/2026\nN.1 Tenda da sole L.380xh.210\n-acconto ricevuto rif. ns. fattura n. 175 del 29.5.26\nG TOT 0,13\nTotale Fattura € 1.295,01`;
    const segments = splitLocalInvoiceText({ documentKey: "vans", text, extractionMode: "native_text" });
    expect(segments.map((segment) => [segment.documentNumber, segment.documentDate, segment.total])).toEqual([
      ["175/2026", "2026-05-29", 555],
      ["237/2026", "2026-07-09", 1295.01],
    ]);
    expect(reconcileLocalInvoiceSegments(segments).uniqueFinancialSegments).toHaveLength(2);
    expect(reconcileLocalInvoiceSegments(segments).technicalSegments).toHaveLength(1);
  });

  it("riconosce il riferimento Vans abbreviato fatt. e non duplica i prodotti dell'acconto", () => {
    const products = `N. 1 Tenda verticale L.88,8xh.164
N. 1 Tenda verticale L.87xh.248
N. 1 Tenda da sole L.80xh.160
G TOT 0,10`;
    const text = `Vans Tappezzeria
acconto/anticipo su fattura
104/2026 del
02/04/2026
${products}
Totale Fattura € 375,00
\fVans Tappezzeria
fattura
202/2026 del
19/06/2026
${products}
-acconto ricevuto rif. ns. fatt. n. 104 del 2.4.26
Totale Fattura € 875,00`;
    const segments = splitLocalInvoiceText({ documentKey: "elisa-moro", text, extractionMode: "native_text" });
    expect(segments.map((segment) => [segment.documentNumber, segment.items.length])).toEqual([["104/2026", 3], ["202/2026", 3]]);
    const reconciled = reconcileLocalInvoiceSegments(segments);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.technicalSegments).toHaveLength(1);
    expect(reconciled.technicalSegments[0].items).toHaveLength(3);
  });

  it("riconcilia acconto e saldo Vans raggruppati senza duplicare gli otto prodotti Seleni", () => {
    const products = `N. 4 tende verticali in pvc trasparente + n.4 tende da sole integrate nella struttura
STRUTTURA DA due L.255xh.159 + n.1 da L.276xh.269,5 + n.1 da L.275xh.162,5
PRATICA ENEA SCHERMATURE SOLARI G TOT 0,10 CLASSE 3`;
    const text = `Vans Tappezzeria
acconto/anticipo su fattura
85/2026 del
25/03/2026
${products}
Totale Fattura € 3.222,00
\fVans Tappezzeria
fattura
247/2026 del
13/07/2026
${products}
-acconto ricevuto rif. ns. fattura n. 85 del 25.3.26
Totale Fattura € 7.518,01`;
    const segments = splitLocalInvoiceText({ documentKey: "mauro-seleni", text, extractionMode: "native_text" });
    expect(segments.map((segment) => [segment.documentNumber, segment.documentDate, segment.total, segment.items.length])).toEqual([
      ["85/2026", "2026-03-25", 3222, 8],
      ["247/2026", "2026-07-13", 7518.01, 8],
    ]);
    const reconciled = reconcileLocalInvoiceSegments(segments);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.technicalSegments).toHaveLength(1);
    expect(reconciled.technicalSegments[0].items).toHaveLength(8);
    expect(reconciled.supersededTechnicalSourceIds).toHaveLength(1);
  });

  it("separa acconto e saldo Rinaldi quando DATA sostituisce del", () => {
    const text = `RINALDI SRL\nFATTURA ACCOMPAGNATORIA 734/26\nDATA\n08/07/2026\nDIM.L CM 256 X SP.CM 225\nG TOT 0,13\nTotale € 1.450,00
\fRINALDI SRL\nFATTURA 520/26\nDATA 29/05/2026\nACCONTO PER FORNITURA\nTotale € 550,00`;
    const segments = splitLocalInvoiceText({ documentKey: "rinaldi", text, extractionMode: "native_text" });
    expect(segments.map((segment) => [segment.documentNumber, segment.documentDate, segment.total])).toEqual([
      ["734/26", "2026-07-08", 1450],
      ["520/26", "2026-05-29", 550],
    ]);
  });

  it("estrae i gruppi narrativi Muzzi e usa il saldo senza duplicare l'acconto", () => {
    const shared = `N. 1 Pergotenda struttura in alluminio con telo in PVC. Impianto L.790xsp.460
N.2 frontali in cristal pvc, movimento manuale L.395xh.240
N.2 laterali dx con cristal in pvc+tende da sole integrate motorizzate L.230xh.200 cad.
N.1 laterale sx con pvc oscurante, movimento manuale L.460xh.240`;
    const text = `Vans Tappezzeria
acconto/anticipo su fattura
77/2026 del
19/03/2026
${shared}
G TOT 0,10 CLASSE 3
Totale Fattura € 8.550,00
\fVans Tappezzeria
fattura
271/2026 del
30/07/2026
${shared}
N. 4 Tende da sole arricciate piega fissa L.190xh.148 cadauna.
-acconto ricevuto rif. ns. fattura n. 77 del 19.3.26
G TOT 0,10 CLASSE 3
Totale Fattura € 21.750,00`;
    const segments = splitLocalInvoiceText({ documentKey: "roberto-muzzi", text, extractionMode: "native_text" });
    expect(segments.map((segment) => [segment.documentNumber, segment.items.length])).toEqual([["77/2026", 6], ["271/2026", 10]]);
    expect(segments[1].items).toEqual(expect.arrayContaining([
      expect.objectContaining({ widthMm: 7900, heightMm: 4600, gTot: 0.1, description: expect.stringContaining("Pergotenda") }),
      expect.objectContaining({ widthMm: 3950, heightMm: 2400, gTot: 0.1, description: expect.stringContaining("Cristal") }),
      expect.objectContaining({ widthMm: 1900, heightMm: 1480, gTot: 0.1, description: expect.stringContaining("Tenda da sole") }),
    ]));
    const reconciled = reconcileLocalInvoiceSegments(segments);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.technicalSegments).toHaveLength(1);
    expect(reconciled.technicalSegments[0].items).toHaveLength(10);
    expect(reconciled.supersededTechnicalSourceIds).toEqual([segments[0].sourceId]);
  });

  it("non attribuisce arbitrariamente due gTot diversi a una descrizione narrativa", () => {
    const text = `Fattura 1/2026 del 01/08/2026
N.1 Pergotenda L.790xsp.460
G TOT 0,10
G TOT 0,13
Totale Fattura € 1.000,00`;
    const [segment] = splitLocalInvoiceText({ documentKey: "ambiguous", text, extractionMode: "native_text" });
    expect(segment.items).toEqual([]);
  });

  it("conserva la riga narrativa della pergotenda in una fattura saldo multipagina", () => {
    const text = `FATTURA nr. 23/2026 del 18/05/2026
Fattura di saldo
Pergo tenda Modello Icover
Larghezza 600 cm
Sporgenza 350 cm
Motorizzata con radiocomando.
Tessuto Opatex pro 300
MQ 21
Valore Gtot 0,05
€ 11.185,25
manodopera € 700,00
A dedurre fattura N. 10/2026 del 09/04/2026 € -3.688,53
SCADENZE
18/05/2026: € 10.000,00
\fFATTURA nr. 23/2026 del 18/05/2026
RIEPILOGO IVA IMPONIBILE IMPOSTE
22% 8.196,72 € 1.803,28
Imponibile € 8.196,72
Totale IVA € 1.803,28
€ 10.000,00`;
    const segments = splitLocalInvoiceText({ documentKey: "fumagalli-saldo", text, extractionMode: "native_text" });
    const reconciled = reconcileLocalInvoiceSegments(segments);
    expect(reconciled.technicalSegments.flatMap((segment) => segment.items)).toEqual([
      expect.objectContaining({ widthMm: 6000, heightMm: 3500, surfaceM2: 21, gTot: 0.05 }),
    ]);
  });

  it("esclude economicamente e tecnicamente una fattura annullata e sostituita in modo esplicito", () => {
    const text = `Fattura n. 20/001 del 10/02/2026\nTenda L. 500xh.300\nTotale € 4.750,00
\fFattura n. 28/001 del 17/02/2026\nTenda L. 500xh.307\nANNULLA E SOSTITUISCE INTEGRALMENTE LA FATTURA N. 20/001 DEL 10/02/2026\nTotale € 4.750,00`;
    const segments = splitLocalInvoiceText({ documentKey: "sostituzione", text, extractionMode: "native_text" });
    const reconciled = reconcileLocalInvoiceSegments(segments);
    expect(reconciled.uniqueFinancialSegments.map((segment) => segment.documentNumber)).toEqual(["28/001"]);
    expect(reconciled.replacedFinancialSourceIds).toEqual([segments[0].sourceId]);
    expect(reconciled.technicalSegments).toHaveLength(1);
  });

  it("risolve il numero abbreviato della fattura sostituita solo se univoco", () => {
    const text = `Fattura n. 20/001 del 10/02/2026\nTenda L. 500xh.300\nTotale € 4.750,00
\fFattura n. 28/001 del 17/02/2026\nTenda L. 500xh.307\nANNULLA E SOSTITUISCE\nINTEGRALMENTE LA FATTURA N. 20\nDEL 10/02/2026\nTotale € 4.750,00`;
    const segments = splitLocalInvoiceText({ documentKey: "sostituzione-abbreviata", text, extractionMode: "native_text" });
    const reconciled = reconcileLocalInvoiceSegments(segments);
    expect(reconciled.uniqueFinancialSegments.map((segment) => segment.documentNumber)).toEqual(["28/001"]);
    expect(reconciled.replacedFinancialSourceIds).toEqual([segments[0].sourceId]);

    const ambiguous = reconcileLocalInvoiceSegments([
      ...segments,
      { ...segments[0], sourceId: "seconda-serie", documentNumber: "20/002" },
    ]);
    expect(ambiguous.replacedFinancialSourceIds).toEqual([]);
  });
});
