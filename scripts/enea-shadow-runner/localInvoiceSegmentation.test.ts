import { describe, expect, it } from "vitest";
import { combineDocumentResults } from "../../src/features/enea-lab/invoiceParser";
import { normalizeRotatedFiscalReadingOrder, reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";

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
  it("normalizza solo una pagina fiscale 180 gradi con intestazione dopo i totali", () => {
    const reversed = `APR_OCR_ORIENTATION:180\nTotale documento\n660,00 €\nTotale IVA\n60,00 €\nTotale imponibile\n600,00 €\nFattura Nr. FATTURA129/2026 del 23/04/2026\nnr. FATTURA129/2026 del 23/04/2026\nFATTURA`;
    const normalized = normalizeRotatedFiscalReadingOrder(reversed);
    expect(normalized.indexOf("FATTURA\nnr.")).toBeLessThan(normalized.indexOf("Totale documento"));
    expect(splitLocalInvoiceText({ documentKey: "rotated-sdi", text: normalized, extractionMode: "macos_vision_ocr" })[0])
      .toMatchObject({ documentNumber: "FATTURA129/2026", documentDate: "2026-04-23", total: 660 });
  });

  it("non inverte pagine senza marker o gia in ordine e resta fail-closed se mancano gli ancoraggi", () => {
    const ordered = `APR_OCR_ORIENTATION:180\nFATTURA\nnr. FATTURA195/2026 del 13/06/2026\nTotale imponibile\n600,00 €\nTotale IVA\n60,00 €\nTotale documento\n660,00 €`;
    const ambiguous = `APR_OCR_ORIENTATION:180\n660,00 €\nFATTURA\nnr. FATTURA195/2026 del 13/06/2026`;
    expect(normalizeRotatedFiscalReadingOrder(ordered)).toBe(ordered);
    expect(normalizeRotatedFiscalReadingOrder(ambiguous)).toBe(ambiguous);
    expect(normalizeRotatedFiscalReadingOrder(ordered.replace("APR_OCR_ORIENTATION:180\n", "")))
      .toBe(ordered.replace("APR_OCR_ORIENTATION:180\n", ""));
  });

  it("riordina una fattura OCR 180 quando il totale fiscale e etichettato TOTALE FATTURA", () => {
    const reversed = `APR_OCR_ORIENTATION:180
1.750,00
TOTALE FATTURA
614,75
ACCONTO RIF.FATTURA N.161 DEL 14/05/2026
FATTURA
FATTURA
229
18/06/2026
PAGINA
NUMERO
DATA`;
    const [segment] = splitLocalInvoiceText({ documentKey: "rotated-total-invoice", text: reversed, extractionMode: "macos_vision_ocr" });
    expect(segment).toMatchObject({ documentNumber: "229", documentDate: "2026-06-18", total: 1750 });
    expect(segment.referencedInvoiceNumbers).toEqual(["161/26"]);
  });

  it("separa due fatture SdI quando la seconda pagina OCR 180 e' in ordine inverso", () => {
    const text = `APR_OCR_ORIENTATION:0\nFATTURA\nnr. FATTURA195/2026 del 13/06/2026\nTotale imponibile\n600,00 €\nTotale IVA\n60,00 €\nTotale documento\n660,00 €\n\fAPR_OCR_ORIENTATION:180\nTotale documento\n660,00 €\nTotale IVA\n60,00 €\nTotale imponibile\n600,00 €\nFattura Nr. FATTURA129/2026 del 23/04/2026\nnr. FATTURA129/2026 del 23/04/2026\nFATTURA`;
    expect(splitLocalInvoiceText({ documentKey: "sdi-rotated-double", text, extractionMode: "macos_vision_ocr" })
      .map((segment) => [segment.documentNumber, segment.documentDate, segment.total])).toEqual([
      ["FATTURA195/2026", "2026-06-13", 660], ["FATTURA129/2026", "2026-04-23", 660],
    ]);
  });

  it("separa tutte le fatture fiscali in un fascicolo OCR anche con testate verticali o SdI ripetute", () => {
    const ideal = `Tipo documento\nNum. Doc.\nData Docum.\nPag.\n26/11/2025\nFATTURA\n630/00\n1/ 1\nImponibile\n3.590,91\nImporto IVA\n359,09\nTOTALE DOCUMENTO\nEuro 3.950,00
\fTipo documento\nNum. Doc.\nData Docum.\nPag.\nFATTURA\n715/00\n31/12/2025\n1/ 1\nA DETRARRE FATTURA N°630 DEL 26/11/2025\nImponibile\n3.590,91\nImporto IVA\n359,09\nTOTALE DOCUMENTO\nEuro 3.950,00`;
    const sdi = `FATTURA\nnr. FATTURA195/2026 del 13/06/2026\nTotale imponibile\n600,00 €\nTotale IVA\n60,00 €\nTotale documento\n660,00 €
\fFATTURA\nnr. FATTURA129/2026 del 23/04/2026\nTotale imponibile\n600,00 €\nTotale IVA\n60,00 €\nTotale documento\n660,00 €`;
    expect(splitLocalInvoiceText({ documentKey: "ideal-double", text: ideal, extractionMode: "macos_vision_ocr" })
      .map((segment) => [segment.documentNumber, segment.documentDate, segment.total])).toEqual([
      ["630/00", "2025-11-26", 3950], ["715/00", "2025-12-31", 3950],
    ]);
    expect(splitLocalInvoiceText({ documentKey: "sdi-double", text: sdi, extractionMode: "macos_vision_ocr" })
      .map((segment) => [segment.documentNumber, segment.documentDate, segment.total])).toEqual([
      ["FATTURA195/2026", "2026-06-13", 660], ["FATTURA129/2026", "2026-04-23", 660],
    ]);
  });

  it("preferisce il totale fattura etichettato al totale ordine e al totale IVA di colonna", () => {
    const orderWithDeduction = splitLocalInvoiceText({ documentKey: "saldo-detratto", text: `FATTURA 129/2026 DATA\n07/04/2026\nTOTALE ORDINE N. 1 6.229,9996 6.230,00 10\nA DETRARRE CAPARRA RIF. FATTURA N. 44/2026\nN. 1 -1.869,00 -1.869,00 10\nTOTALE IMPONIBILE\n€ 3.964,55\nTotale Iva\n€ 396,45\nTotale\n€ 4.361,00`, extractionMode: "native_text" })[0];
    const columnar = splitLocalInvoiceText({ documentKey: "columnar", text: `FATTURA\n698/00\n19/12/2025\nImponibile\nAL.IVA\n6.144,70\n10,00\nImporto IVA\nTotale merce\n853,14 22,00\n614,47\nNetto merce\n187,69\n6.997,84\nTOTALE DOCUMENTO\nTOTALE A PAGARE\nTot.\n802,16\nEuro 7.800,00`, extractionMode: "macos_vision_ocr" })[0];
    expect(orderWithDeduction.total).toBe(4361);
    expect(columnar.total).toBe(7800);
  });

  it("riconosce numero e data nella testata PA-Digitale TD01", () => {
    const [segment] = splitLocalInvoiceText({ documentKey: "sdi-pa", text: `TIPOLOGIA DOCUMENTO ART.\n73 NUMERO DOCUMENTO DATA\nDOCUMENTO CODICE DESTINATARIO\nTD01 fattura 88 28-05-2026\nRIEPILOGHI IVA E TOTALI\nESIGIBILITÀ IVA / RIFERIMENTI NORMATIVI %IVA SPESE ACCESSORIE ARR. TOTALE IMPONIBILE TOTALE IMPOSTA\nI (esigibilità immediata) 22,00 0,00 7.175,00 1.578,50\nIMPORTO BOLLO SCONTO/MAGGIORAZIONE ARR. TOTALE DOCUMENTO\n8.753,50`, extractionMode: "native_text" });
    expect(segment).toMatchObject({ documentNumber: "88", documentDate: "2026-05-28", total: 8753.5 });
  });

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

  it("preferisce il PDF nativo alla scansione OCR duplicata solo con identita fiscale e prodotto concordanti", () => {
    const native = splitLocalInvoiceText({ documentKey: "native-869", extractionMode: "native_text", text: `Fattura Accompagnatoria n. 869/26 del 05/08/2026
P.IVA 03030671204 Cod. Fisc. CMPCLD62T52A944A
TENDA A BRACCI ESTENSIBILI DIM.L.CM 260 X SP.CM 225 GTOT 0,13
Totale documento 2.102,00` })[0];
    const ocr = splitLocalInvoiceText({ documentKey: "ocr-869", extractionMode: "macos_vision_ocr", text: `APR_OCR_ORIENTATION:90
FATTURA ACCOMPAGNATORIA 869/26
05/08/2026
P.IVA 03030671204 Cod. Fisc. CMPCLD62T52A944A
TENDA A BRACCI ESTENSIBILI DIM.L.CM 260 X SP.CM 225 GTOT 0,13
Totale 2.236,36` })[0];
    const reconciled = reconcileLocalInvoiceSegments([native, ocr]);
    expect(ocr).toMatchObject({ documentNumber: "869/26", documentDate: "2026-08-05", total: 2236.36 });
    expect(reconciled.uniqueFinancialSegments).toEqual([native]);
    expect(reconciled.discardedConflictingOcrDuplicateSourceIds).toEqual([ocr.sourceId]);
  });

  it("mantiene fail-closed copie native OCR se data, soggetti fiscali o prodotto non concordano", () => {
    const native = splitLocalInvoiceText({ documentKey: "native-safe", extractionMode: "native_text", text: `Fattura Accompagnatoria n. 869/26 del 05/08/2026
P.IVA 03030671204 Cod. Fisc. CMPCLD62T52A944A
TENDA A BRACCI ESTENSIBILI DIM.L.CM 260 X SP.CM 225 GTOT 0,13
Totale documento 2.102,00` })[0];
    const conflictingEntity = splitLocalInvoiceText({ documentKey: "ocr-other-entity", extractionMode: "macos_vision_ocr", text: `FATTURA ACCOMPAGNATORIA 869/26
05/08/2026
P.IVA 99999999999 Cod. Fisc. RSSMRA80A01H501U
TENDA A BRACCI ESTENSIBILI DIM.L.CM 260 X SP.CM 225 GTOT 0,13
Totale 2.236,36` })[0];
    const conflictingProduct = splitLocalInvoiceText({ documentKey: "ocr-other-product", extractionMode: "macos_vision_ocr", text: `FATTURA ACCOMPAGNATORIA 869/26
05/08/2026
P.IVA 03030671204 Cod. Fisc. CMPCLD62T52A944A
TENDA A BRACCI ESTENSIBILI DIM.L.CM 300 X SP.CM 225 GTOT 0,13
Totale 2.236,36` })[0];
    const ambiguousDate = splitLocalInvoiceText({ documentKey: "ocr-ambiguous-date", extractionMode: "macos_vision_ocr", text: `FATTURA ACCOMPAGNATORIA 869/26
Cliente
05/08/2026
07/08/2026
P.IVA 03030671204 Cod. Fisc. CMPCLD62T52A944A
TENDA A BRACCI ESTENSIBILI DIM.L.CM 260 X SP.CM 225 GTOT 0,13
Totale 2.236,36` })[0];
    expect(ambiguousDate.documentNumber).toBeUndefined();
    for (const candidate of [conflictingEntity, conflictingProduct, ambiguousDate]) {
      const reconciled = reconcileLocalInvoiceSegments([native, candidate]);
      expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
      expect(reconciled.discardedConflictingOcrDuplicateSourceIds).toEqual([]);
    }
  });

  it("regressione Sanvito: riconosce come duplicata una scansione OCR che non estrae affatto numero/data se importo, firma tecnica e soggetti fiscali coincidono", () => {
    const native = splitLocalInvoiceText({ documentKey: "sanvito-native", extractionMode: "native_text", text: `Fattura n. 310 del 05/08/2026
COD.FISC. SNVGNN53D24L677C
TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 325x200 SP GTOT 0,11
P.IVA 03030671204
Totale documento 1.490,00` })[0];
    // Intestazione OCR scomposta su righe sparse: nessun numero/data
    // riconoscibile, ma prodotto e soggetti fiscali restano leggibili.
    const ocrIllegibleHeading = splitLocalInvoiceText({ documentKey: "sanvito-ocr", extractionMode: "macos_vision_ocr", text: `COD.CLIENTE COD.AG. N.ORDINE
DATA ORDINE N. CONFERMA
COD.FISC. SNVGNN53D24L677C
TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 325x200 SP GTOT 0,11
P.IVA 03030671204
TOTALE FATTURA
1490,00` })[0];
    expect(ocrIllegibleHeading.documentNumber).toBeUndefined();
    expect(ocrIllegibleHeading.documentDate).toBeUndefined();
    const reconciled = reconcileLocalInvoiceSegments([native, ocrIllegibleHeading]);
    expect(reconciled.uniqueFinancialSegments).toEqual([native]);
    expect(reconciled.discardedConflictingOcrDuplicateSourceIds).toEqual([ocrIllegibleHeading.sourceId]);
  });

  it("regressione Sanvito reale: riconosce come duplicata una scansione OCR che smarrisce il C.F. e intercetta soltanto la P.IVA (categorie fiscali non comparabili tra le due estrazioni)", () => {
    const native = splitLocalInvoiceText({ documentKey: "sanvito-native-asym", extractionMode: "native_text", text: `Fattura n. 310 del 05/08/2026
COD.FISC. SNVGNN53D24L677C
TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 325x200 SP GTOT 0,11
Totale documento 1.490,00` })[0];
    // L'OCR di questa pagina smarrisce del tutto la riga del C.F. (nessun
    // token a 16 caratteri riconoscibile), ma intercetta comunque un numero
    // a 11 cifre altrove nell'intestazione scomposta (es. la P.IVA del
    // fornitore). Le due estrazioni non condividono nessuna categoria
    // fiscale comparabile: non deve bloccare la deduplicazione.
    const ocrOnlyVat = splitLocalInvoiceText({ documentKey: "sanvito-ocr-asym", extractionMode: "macos_vision_ocr", text: `COD.CLIENTE COD.AG. N.ORDINE
DATA ORDINE N. CONFERMA
TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 325x200 SP GTOT 0,11
P.IVA 04121060133
TOTALE FATTURA
1490,00` })[0];
    expect(ocrOnlyVat.documentNumber).toBeUndefined();
    expect(ocrOnlyVat.documentDate).toBeUndefined();
    const reconciled = reconcileLocalInvoiceSegments([native, ocrOnlyVat]);
    expect(reconciled.uniqueFinancialSegments).toEqual([native]);
    expect(reconciled.discardedConflictingOcrDuplicateSourceIds).toEqual([ocrOnlyVat.sourceId]);
  });

  it("non deduplica una scansione OCR senza numero/data se l'importo totale e diverso (non e' prova sufficiente da sola)", () => {
    const native = splitLocalInvoiceText({ documentKey: "sanvito-native-2", extractionMode: "native_text", text: `Fattura n. 310 del 05/08/2026
COD.FISC. SNVGNN53D24L677C
TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 325x200 SP GTOT 0,11
P.IVA 03030671204
Totale documento 1.490,00` })[0];
    const ocrDifferentTotal = splitLocalInvoiceText({ documentKey: "sanvito-ocr-2", extractionMode: "macos_vision_ocr", text: `COD.CLIENTE COD.AG. N.ORDINE
DATA ORDINE N. CONFERMA
COD.FISC. SNVGNN53D24L677C
TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 325x200 SP GTOT 0,11
P.IVA 03030671204
TOTALE FATTURA
2980,00` })[0];
    expect(ocrDifferentTotal.documentNumber).toBeUndefined();
    const reconciled = reconcileLocalInvoiceSegments([native, ocrDifferentTotal]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.discardedConflictingOcrDuplicateSourceIds).toEqual([]);
  });

  it("regressione Tocchetti: riconosce come duplicata una scansione OCR quando numero e data coincidono, anche se nessun prodotto e' stato riconosciuto sul lato nativo e il totale letto e' diverso", () => {
    // Il lato nativo non riconosce alcuna riga prodotto (nessuna firma
    // tecnica, come la copia pulita reale di Tocchetti): l'assenza di firma
    // non deve mai bloccare la deduplicazione da sola, a differenza di due
    // firme entrambe presenti ma diverse (vedi 'conflictingProduct' sopra).
    const native = splitLocalInvoiceText({ documentKey: "tocchetti-pulita", extractionMode: "native_text", text: `Numero fattura Data fattura\n162 14/05/2026\nTotale fattura € 1.230,00` })[0];
    // La stessa fattura letta con OCR: numero e data restano riconoscibili
    // identici, il totale viene letto diversamente per via del layout
    // illeggibile e stavolta un prodotto viene riconosciuto.
    const ocr = splitLocalInvoiceText({ documentKey: "tocchetti-scombinata", extractionMode: "macos_vision_ocr", text: `Numero fattura Data fattura\n162 14/05/2026\nTENDA DA SOLE A CASSONETTO MOD.T87CT, DIM.CM L 400x300 SP (=MQ 12)\nTotale fattura € 1.680,33` })[0];
    expect(native).toMatchObject({ documentNumber: "162", documentDate: "2026-05-14", total: 1230 });
    expect(native.technicalSignature).toBe("");
    expect(ocr).toMatchObject({ documentNumber: "162", documentDate: "2026-05-14", total: 1680.33 });
    const reconciled = reconcileLocalInvoiceSegments([native, ocr]);
    expect(reconciled.uniqueFinancialSegments).toEqual([native]);
    expect(reconciled.discardedConflictingOcrDuplicateSourceIds).toEqual([ocr.sourceId]);
  });

  it("non riconosce come duplicati due segmenti con numero coincidente ma data diversa (resta fail-closed su due fatture distinte)", () => {
    const first = splitLocalInvoiceText({ documentKey: "distinta-1", extractionMode: "native_text", text: `Fattura n. 162 del 14/05/2026\nTenda da sole\nTotale documento 1.230,00` })[0];
    const second = splitLocalInvoiceText({ documentKey: "distinta-2", extractionMode: "native_text", text: `Fattura n. 162 del 14/06/2026\nTenda da sole\nTotale documento 1.680,33` })[0];
    const reconciled = reconcileLocalInvoiceSegments([first, second]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
  });

  it("regressione Giuga/De Marinis: esclude dal gate economico una ricevuta di bonifico o un'esportazione di movimento bancario, non una fattura, anche se cita l'importo e un riferimento a 'Fattura N'", () => {
    const invoice = splitLocalInvoiceText({ documentKey: "giuga-fattura", extractionMode: "native_text", text: `Fattura 124/FE del 05/06/2025\nFATTURA INFISSI PVC PRIMO ACCONTO\nTotale fattura 4.853,65 €` })[0];
    const bankReceipt = splitLocalInvoiceText({ documentKey: "giuga-bonifico", extractionMode: "native_text", text: `GIUGA SANTO\nBENEFICIARIO\nNominativo del beneficiario INNOVA SERRAMENTI SRL\nDATI DI PAGAMENTO\nTRN 1191261901368453\nImporto EUR 275,00\nCausale Fattura 297/FE produzione e posa zanzariera` })[0];
    const bankStatement = splitLocalInvoiceText({ documentKey: "demarinis-bonifico", extractionMode: "native_text", text: `Ricevuta bonifico\nper agevolazione fiscale\nNumero operazione\n2105619\nImporto\n4.500,00 €` })[0];
    const homeBankingExport = splitLocalInvoiceText({ documentKey: "giuga-movimento", extractionMode: "native_text", text: `Desio Web Remote Banking Dettaglio movimento\nDettaglio singolo movimento\nData contabile: 06/06/25\nDare: Avere:\n5.339,01\nDesc. movimento:\nBONIFICO AGEVOLAZIONI FISCALI Note: Fattura 127/FE infissi PVC - Primo Acconto` })[0];
    const idCard = splitLocalInvoiceText({ documentKey: "giuga-tessera", extractionMode: "macos_vision_ocr", text: `TESSERA SANITARIA\nREPUBBLICA ITALIANA\nCARTA REGIONALE DEI SERVIZI\nCodice Fiscale GGISNT65C08E532K` })[0];
    const reconciled = reconcileLocalInvoiceSegments([invoice, bankReceipt, bankStatement, homeBankingExport, idCard]);
    expect(reconciled.uniqueFinancialSegments).toEqual([invoice]);
    expect(reconciled.nonFiscalTechnicalSourceIds).toEqual(expect.arrayContaining([bankReceipt.sourceId, bankStatement.sourceId, homeBankingExport.sourceId, idCard.sourceId]));
  });

  it("regressione Tiraboschi: esclude dal gate economico una dichiarazione di aliquota IVA agevolata, non una fattura", () => {
    const invoice = splitLocalInvoiceText({ documentKey: "tiraboschi-fattura", extractionMode: "native_text", text: `Fattura 84 del 22-05-2026\nFORNITURA E POSA TENDE DA SOLE\nTotale documento 1.850,00 €` })[0];
    const vatDeclaration = splitLocalInvoiceText({ documentKey: "tiraboschi-dichiarazione", extractionMode: "native_text", text: `Oggetto: Dichiarazione per applicazione aliquota IVA agevolata al 10%.\nIl sottoscritto dichiara, sotto la sua personale responsabilita', che l'intervento edilizio rientra nelle previsioni di legge e pertanto DICHIARA che sulle prestazioni eseguite verra' applicata l'aliquota I.V.A. nella misura agevolata del 10%.` })[0];
    const reconciled = reconcileLocalInvoiceSegments([invoice, vatDeclaration]);
    expect(reconciled.uniqueFinancialSegments).toEqual([invoice]);
    expect(reconciled.nonFiscalTechnicalSourceIds).toContain(vatDeclaration.sourceId);
  });

  it("non esclude un documento che contiene realmente un'intestazione fattura anche se cita 'Beneficiario' o 'Dichiara' (fail-closed: mai escludere una fattura vera)", () => {
    const invoiceMentioningBeneficiario = splitLocalInvoiceText({ documentKey: "fattura-vera-beneficiario", extractionMode: "native_text", text: `FATTURA N. 55 del 01/02/2026\nBeneficiario detrazione: Mario Rossi\nDICHIARA di aver eseguito i lavori\nTotale documento 900,00 €` })[0];
    const reconciled = reconcileLocalInvoiceSegments([invoiceMentioningBeneficiario]);
    expect(reconciled.uniqueFinancialSegments).toEqual([invoiceMentioningBeneficiario]);
    expect(reconciled.nonFiscalTechnicalSourceIds).toEqual([]);
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
  it("non duplica il prodotto quando acconto e saldo sono espressi come causali percentuali", () => {
    const product = "Tenda da Sole S/81E Pantografo a bracci\nDIM.L CM 460 X SP.CM 220\nG TOT 0,13";
    const acconto = splitLocalInvoiceText({ documentKey: "percentuale-acconto", text: `FATTURA n. 10 del 01/06/2026\n${product}\nCAUSALE DOCUMENTO Acconto 50% Tenda da sole\nTotale documento 625,00`, extractionMode: "native_text" })[0];
    const saldo = splitLocalInvoiceText({ documentKey: "percentuale-saldo", text: `FATTURA n. 11 del 30/06/2026\n${product}\nDATI AGGIUNTIVI SALDO 50 TENDA DA SOLE\nTotale documento 625,00`, extractionMode: "native_text" })[0];
    const reconciled = reconcileLocalInvoiceSegments([acconto, saldo]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.technicalSegments).toEqual([saldo]);
    expect(reconciled.supersededTechnicalSourceIds).toEqual([acconto.sourceId]);
  });
  it("non fonde due fatture tecniche per parole acconto e saldo fuori da una causale esplicita", () => {
    const product = "Tenda da Sole S/81E Pantografo a bracci\nDIM.L CM 460 X SP.CM 220\nG TOT 0,13";
    const first = splitLocalInvoiceText({ documentKey: "nota-generica-a", text: `FATTURA n. 20 del 01/06/2026\n${product}\nNota cliente: ipotesi acconto 50\nTotale documento 625,00`, extractionMode: "native_text" })[0];
    const second = splitLocalInvoiceText({ documentKey: "nota-generica-b", text: `FATTURA n. 21 del 30/06/2026\n${product}\nNota cliente: ipotesi saldo 50\nTotale documento 625,00`, extractionMode: "native_text" })[0];
    const reconciled = reconcileLocalInvoiceSegments([first, second]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.technicalSegments).toEqual([first, second]);
    expect(reconciled.percentageCausalSupersededTechnicalSourceIds).toEqual([]);
  });
  it("non scambia 'fattura acconto per fornitura' per un riferimento alla fattura PER", () => {
    const [segment] = splitLocalInvoiceText({
      documentKey: "acconto-descrittivo",
      text: "FATTURA n. 176/26 del 23/04/2026\nfattura acconto per fornitura e posa di Tapparella\nTotale documento 3.446,50 €",
      extractionMode: "native_text",
    });
    expect(segment.referencedInvoiceNumbers).toEqual([]);
  });

  it("non scambia l'imponibile della fattura di acconto corrente per il numero di un'altra fattura", () => {
    const [segment] = splitLocalInvoiceText({
      documentKey: "acconto-tabellare",
      text: `Fattura 312/FE del 15/12/2025
DESCRIZIONE IMPORTO Q.TÀ IVA TOTALE
FATTURA ACCONTO PER POSA E FORNITURA INFISSI IN PVC 4.090,91 € 1 10% 4.500,00 €
Imponibile
IVA 10% su 4.090,91 €
Totale fattura
4.090,91 €
409,09 €
4.500,00 €`,
      extractionMode: "native_text",
    });
    expect(segment).toMatchObject({ documentNumber: "312/FE", documentDate: "2025-12-15", total: 4500 });
    expect(segment.referencedInvoiceNumbers).toEqual([]);
  });

  it("riconosce anche il riferimento Fatt.acconto scritto prima della parola acconto", () => {
    const [segment] = splitLocalInvoiceText({ documentKey: "saldo-con-acconto", text: "FATTURA 1512 del 12/03/2026\nTotale complessivo 9.010,00 - Fatt.acconto nr. 320 del 30/11/2025\nTotale documento 6.426,92", extractionMode: "native_text" });
    expect(segment.referencedInvoiceNumbers).toContain("320/25");
  });

  it("regressione Toscano: 'fattura acconto 1.500,00 €' descrive se stessa e non produce un riferimento fantasma all'importo", () => {
    const [segment] = splitLocalInvoiceText({
      documentKey: "acconto-toscano",
      text: "Fattura n. 4 del 11/05/2026\nFornitura ed installazione di schermature solari\nfattura acconto 1.500,0000 € 22% 1.500,00 €\nTotale 1.830,00 €",
      extractionMode: "native_text",
    });
    expect(segment).toMatchObject({ documentNumber: "4", documentDate: "2026-05-11" });
    expect(segment.referencedInvoiceNumbers).toEqual([]);
  });

  it("continua a riconoscere 'fattura d'acconto nr X' quando il marcatore di numero e' presente", () => {
    const [segment] = splitLocalInvoiceText({
      documentKey: "saldo-toscano",
      text: "Fattura n. 8 del 28/05/2026\na detrarre fattura acconto nr 4 del 11.05.2026 -1.500,0000 €\nTotale fornitura 3.565,57 €",
      extractionMode: "native_text",
    });
    expect(segment.referencedInvoiceNumbers).toContain("4/26");
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

  it("usa solo il saldo tecnico per le causali fattura di acconto e fattura a saldo", () => {
    const product = "Pergotenda telo retrattile motorizzata L 500 x S 290 1 pezzi";
    const advanceSegment = splitLocalInvoiceText({ documentKey: "ragni-acconto", text: `FATTURA nr. 18/2026 del 20/04/2026\nFattura di acconto\n${product}\nTotale documento € 5.000,00`, extractionMode: "native_text" })[0];
    const balanceSegment = splitLocalInvoiceText({ documentKey: "ragni-saldo", text: `FATTURA nr. 46/2026 del 23/06/2026\nFATTURA A SALDO\n${product}\nTotale documento € 4.550,00`, extractionMode: "native_text" })[0];
    const reconciled = reconcileLocalInvoiceSegments([advanceSegment, balanceSegment]);
    expect(reconciled.uniqueFinancialSegments).toHaveLength(2);
    expect(reconciled.technicalSegments.map((segment) => segment.sourceId)).toEqual([balanceSegment.sourceId]);
    expect(reconciled.supersededTechnicalSourceIds).toEqual([advanceSegment.sourceId]);
  });

  it("scarta un frammento pagina senza totale quando la stessa fattura completa e' nello stesso PDF", () => {
    const complete = splitLocalInvoiceText({ documentKey: "same-pdf", text: advance, extractionMode: "native_text" })[0];
    const fragment = { ...complete, sourceId: "same-pdf:fragment", total: null, result: { ...complete.result, total: null } };
    const reconciled = reconcileLocalInvoiceSegments([complete, fragment]);
    expect(reconciled.uniqueFinancialSegments).toEqual([complete]);
    expect(reconciled.discardedDuplicateSourceIds).toContain("same-pdf:fragment");
  });

  it("regressione Tuttolani: scarta scansioni parziali senza totale della stessa fattura anche da FILE diversi", () => {
    const complete = splitLocalInvoiceText({ documentKey: "tuttolani-completa", text: advance, extractionMode: "native_text" })[0];
    const productOnlyPage = { ...complete, sourceId: "tuttolani-solo-prodotto:fragment", parentDocumentKey: "tuttolani-solo-prodotto", total: null, result: { ...complete.result, total: null } };
    const totalsOnlyPage = { ...complete, sourceId: "tuttolani-solo-totali:fragment", parentDocumentKey: "tuttolani-solo-totali", total: null, result: { ...complete.result, total: null } };
    const reconciled = reconcileLocalInvoiceSegments([complete, productOnlyPage, totalsOnlyPage]);
    expect(reconciled.uniqueFinancialSegments).toEqual([complete]);
    expect(reconciled.discardedDuplicateSourceIds).toEqual(expect.arrayContaining(["tuttolani-solo-prodotto:fragment", "tuttolani-solo-totali:fragment"]));
  });

  it("non unisce due documenti diversi soltanto perche' uno dei due manca di un proprio totale, se il numero fattura non e' condiviso", () => {
    const complete = splitLocalInvoiceText({ documentKey: "tuttolani-completa", text: advance, extractionMode: "native_text" })[0];
    const unrelatedIncomplete = { ...complete, sourceId: "altra-pratica:fragment", documentNumber: undefined, total: null, result: { ...complete.result, total: null } };
    const reconciled = reconcileLocalInvoiceSegments([complete, unrelatedIncomplete]);
    expect(reconciled.uniqueFinancialSegments.map((segment) => segment.sourceId)).toEqual(expect.arrayContaining([complete.sourceId, "altra-pratica:fragment"]));
    expect(reconciled.discardedDuplicateSourceIds).not.toContain("altra-pratica:fragment");
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
