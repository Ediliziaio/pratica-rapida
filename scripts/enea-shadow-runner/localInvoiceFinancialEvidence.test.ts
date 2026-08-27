import { describe, expect, it } from "vitest";
import { reconcileFinancialEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import { extractLocalInvoiceFinancialEvidence } from "./localInvoiceFinancialEvidence";

const extract = (text: string, overrides: Partial<Parameters<typeof extractLocalInvoiceFinancialEvidence>[0]> = {}) => extractLocalInvoiceFinancialEvidence({
  sourceId: "invoice-1", text, extractionMode: "native_text", documentNumber: "FPR 1/26", documentDate: "2026-08-01", grossTotal: 915, ...overrides,
});

describe("evidenza finanziaria da PDF originario locale", () => {
  it("riconcilia etichette fiscali raggruppate e valori sulla riga successiva", () => {
    const evidence = extract(`TOTALE IMPONIBILE SCADENZE
TOTALE IVA TOTALE ESENTE
NETTO A PAGARE
4.388,00 965,36 EUR 5.353,36 05-03-26 Bon VF 5.353,36
TOTALE FATTURA
EUR 5.353,36`, { documentNumber: "260", documentDate: "2026-03-05", grossTotal: 5353.36 });
    expect(evidence).toMatchObject({ taxableAmount: 4388, vatAmount: 965.36, grossTotal: 5353.36, interventionGrossAmount: 5353.36 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 5353.36 });
  });

  it("riconcilia un importo IVA negativo nel riepilogo fiscale raggruppato", () => {
    const evidence = extract(`TOTALE IMPONIBILE TOTALE IVA TOTALE ESENTE
NETTO A PAGARE
1.097,00 -416,86 EUR 680,14 SCADENZE
19-06-26 Bon VF 680,14
TOTALE FATTURA
EUR 680,14`, { documentNumber: "619", documentDate: "2026-06-19", grossTotal: 680.14 });
    expect(evidence).toMatchObject({ taxableAmount: 1097, vatAmount: -416.86, grossTotal: 680.14, interventionGrossAmount: 680.14 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 680.14 });
  });

  it("resta fail-closed se imponibile, IVA firmata e totale non si riconciliano", () => {
    const evidence = extract(`TOTALE IMPONIBILE TOTALE IVA TOTALE ESENTE
NETTO A PAGARE
1.097,00 -400,00 EUR 680,14 SCADENZE
19-06-26 Bon VF 680,14`, { documentNumber: "619", documentDate: "2026-06-19", grossTotal: 680.14 });
    expect(reconcileFinancialEvidence([evidence]).usable).toBe(false);
  });

  it("riconcilia il riepilogo compatto con IVA prima dell'imponibile", () => {
    const evidence = extract(`Merci e servizi 7.500,00 Totale imposta 750,00 Totale imponibile
7.500,00
Scadenze
22/06/2026 Bonifico 8.250,00`, { documentNumber: "146", grossTotal: 8250 });
    expect(evidence).toMatchObject({ taxableAmount: 7500, vatAmount: 750, grossTotal: 8250, interventionGrossAmount: 8250 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 8250 });
  });

  it("resta fail-closed se il riepilogo compatto non quadra col totale documento", () => {
    const evidence = extract(`Merci e servizi 7.500,00 Totale imposta 700,00 Totale imponibile
7.500,00
Scadenze
22/06/2026 Bonifico 8.250,00`, { documentNumber: "146", grossTotal: 8250 });
    expect(reconcileFinancialEvidence([evidence]).usable).toBe(false);
  });

  it("riconcilia un riepilogo fiscale multi-aliquota con totale documento autorevole", () => {
    const evidence = extract(`Totale complessivo fornitura e posa in opera euro 9.010,00
IMPONIBILE 1.986,00 3.640,00
AL.IVA 22 10 IMPORTO IVA TOTALE MERCE % SCONTO IMPORTO SCONTO NETTO MERCE
436,92 5.626,00 5.626,00
364,00
BOLLI SPESE INCASSO VARIE ACCONTO
TOTALE A PAGARE TOTALE DOCUMENTO
800,92 6.426,92`, { documentNumber: "1512", grossTotal: 6426.92 });
    expect(evidence).toMatchObject({ taxableAmount: 5626, vatAmount: 800.92, grossTotal: 6426.92, interventionGrossAmount: 6426.92 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 6426.92 });
  });

  it("resta fail-closed se il riepilogo multi-aliquota non riconcilia col totale documento", () => {
    const evidence = extract(`IMPONIBILE 1.986,00 3.640,00
AL.IVA 22 10 IMPORTO IVA TOTALE MERCE
436,92
360,00
BOLLI
TOTALE DOCUMENTO 6.426,92`, { documentNumber: "1512", grossTotal: 6426.92 });
    expect(reconcileFinancialEvidence([evidence]).usable).toBe(false);
  });
  it("riconcilia totale documento, imponibile+IVA e righe intervento", () => {
    const evidence = extract("Importo prodotti o servizi 750,00 €\nTotale imponibile 750,00 €\nTotale IVA 165,00 €\nTotale documento 915,00 €");
    expect(evidence).toMatchObject({ taxableAmount: 750, vatAmount: 165, grossTotal: 915, interventionGrossAmount: 915, extractionConfidence: "certain" });
    expect(reconcileFinancialEvidence([evidence], { mode: "test", scheme: "ecobonus" })).toMatchObject({ usable: true, total: 915 });
  });

  it("riconcilia la tabella Zanzasol con importi prima o dopo le descrizioni", () => {
    const evidence = extract(`ZANZASOL SNC
Articolo Descrizione
Unità IVA
Quantità
Importo U. Importo
N 1.850,00
FORNITURA TENDA DA SOLE 22
1,00 1.850,00
FORNITURA MOTORE TUBOLARE
per tenda da sole
N 400,00
22
1,00 400,00
N 450,00
POSA IN OPERA 22
1,00 450,00
N 150,00
PRATICA ENEA 22
1,00 150,00
Aliquote IVA Codice %
Imponibile € 2.850,00
Totale IVA € 627,00`, { documentNumber: "182", grossTotal: 3477 });
    expect(evidence).toMatchObject({ taxableAmount: 2850, vatAmount: 627, grossTotal: 3477, interventionGrossAmount: 3477 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 3477 });
  });

  it("mantiene fail-closed Zanzasol quando le righe non quadrano con l'imponibile", () => {
    const evidence = extract(`ZANZASOL SNC
Articolo Descrizione
N 1.850,00
FORNITURA TENDA DA SOLE 22
N 400,00
FORNITURA MOTORE TUBOLARE
Aliquote IVA Codice %
Imponibile € 2.850,00
Totale IVA € 627,00`, { documentNumber: "182", grossTotal: 3477 });
    expect(evidence.interventionGrossAmount).toBeNull();
    expect(reconcileFinancialEvidence([evidence]).usable).toBe(false);
  });

  it("ricostruisce il lordo dalle righe importo IVA totale di una fattura saldo", () => {
    const evidence = extract("Tenda 3.464,00 € 22% 3.464,00 €\nTrasporto 320,00 € 22% 320,00 €\nAcconto -1.000,00 € 22% -1.000,00 €\nImponibile 2.281,97 €\nImposta 22% 502,03 €\nTotale 2.784,00 €", { documentNumber: "136/A", grossTotal: 2784 });
    expect(evidence).toMatchObject({ taxableAmount: 2281.97, vatAmount: 502.03, grossTotal: 2784, interventionGrossAmount: 2784, extractionConfidence: "certain" });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 2784 });
  });

  it("ricostruisce saldo da totale fornitura meno acconto citato", () => {
    const evidence = extract("Totale 10\n€ 11.900,00\nAcconto (Rif. Fattura 14/2026 del 09/04/2026) € -5.950,00\nTot. imponibile\nTot. Iva\n€ 5.950,00\n€ 595,00", { grossTotal: 6545 });
    expect(evidence).toMatchObject({ taxableAmount: 5950, vatAmount: 595, interventionGrossAmount: 6545 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 6545 });
  });

  it("riconosce Importo IVA e le righe con prezzo unitario a cinque decimali", () => {
    const lorena = extract("Subtotale € 6.818,18\nTotale imponibile € 6.818,18\nImporto Iva € 681,82", { grossTotal: 7500 });
    expect(lorena).toMatchObject({ taxableAmount: 6818.18, vatAmount: 681.82, interventionGrossAmount: 7500 });
    const danila = extract("NR 1 681,81818 681,82 10\nINST NR 1 272,72727 272,73 10\nDICH NR 1 100,00 100,00 10\nTOTALE IMPONIBILE\n€ 1.054,55\nTotale Iva\n€ 105,46", { grossTotal: 1160.01 });
    expect(danila).toMatchObject({ taxableAmount: 1054.55, vatAmount: 105.46, interventionGrossAmount: 1160.01 });
    expect(reconcileFinancialEvidence([lorena])).toMatchObject({ usable: true, total: 7500 });
    expect(reconcileFinancialEvidence([danila])).toMatchObject({ usable: true, total: 1160.01 });
  });

  it("include l'acconto negativo nelle righe della fattura finale Rinaldi", () => {
    const evidence = extract(`NR 1 1.613,63636 1.613,64 10
NR 1 1.613,63636 1.613,64 10
INST NR 1 681,81818 681,82 10
DICHENEA NR 1 136,36364 136,36 10
ACCONTO GIA' VERSATO RIF.NS FT 630/2026 NR 1 -1.318,18182 -1.318,18 10
TOTALE IMPONIBILE
€ 2.727,28
Totale Iva
€ 272,73`, { grossTotal: 3000.01 });
    expect(evidence).toMatchObject({ taxableAmount: 2727.28, vatAmount: 272.73, interventionGrossAmount: 3000.01 });
    expect(reconcileFinancialEvidence([evidence], { mode: "test", scheme: "ecobonus" })).toMatchObject({ usable: true, total: 3000.01 });
  });

  it("applica il totale spese congrue Rinaldi come importo detraibile distinto dal lordo fattura", () => {
    const evidence = extract(`RINALDI SRL
NR 1 1.454,54545 1.454,55 10
INST NR 1 363,63636 363,64 10
DICHENEA NR 1 150,00 150,00 10
ACCONTO GIA' VERSATO RIF.NS FT 435/2026 NR 1 -536,36364 -536,36 10
TOTALE SPESE CONGRUE SOSTENUTE IN BASE AI MASSIMALI AMMESSI € 2.113,36
TOTALE IMPONIBILE
€ 1.431,83
Totale Iva
€ 143,18`, { documentNumber: "747/26", grossTotal: 1575.01 });
    expect(evidence).toMatchObject({ taxableAmount: 1431.83, vatAmount: 143.18, grossTotal: 1575.01, interventionGrossAmount: 1575.01,
      explicitDeductibleLines: [expect.objectContaining({ text: "TOTALE SPESE CONGRUE SOSTENUTE IN BASE AI MASSIMALI AMMESSI € 2.113,36", amount: 2113.36, extractionConfidence: "certain" })] });
    const result = reconcileFinancialEvidence([evidence], { mode: "test", scheme: "ecobonus" });
    expect(result).toMatchObject({ usable: true, total: 2113.36 });
    expect(result.auditNotes[0]).toContain("lordo_fattura=1575.01");
  });

  it("riconcilia il layout OCR Rinaldi con imponibile ripetuto prima dell'IVA e lordo nelle scadenze", () => {
    const evidence = extract(`RINALDI SRL
TOTALE IMPONIBILE
€ 1.727,27
Codice Descrizione
Imponibile
% IVA
10
Iva 10%
Imposta
Totale Iva
1.727,27
10
€ 172,73
172,73
Totale
€ 1.900,00
Scadenze Pagamenti
17/06/2026
€ 1.900,00`, { extractionMode: "macos_vision_ocr", documentNumber: "616/26", grossTotal: 1900 });
    expect(evidence).toMatchObject({ taxableAmount: 1727.27, vatAmount: 172.73, grossTotal: 1900, interventionGrossAmount: 1900, extractionConfidence: "certain" });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 1900 });
  });

  it("non scambia il totale documento Bonfanti per l'IVA nel riepilogo fiscale verticale", () => {
    const evidence = extract(`Iva 10%
IMPONIBILE
1.540,00
IMPOSTA
154,00
TOTALE
IMPONIBILE
1.540,00
TOTALE
DOCUMENTO
TOTALE IMPOSTA
154,00
1.694,00 €
SCADENZE
13/07/2026 - 1.694,00 €`, { documentNumber: "85/A", grossTotal: 1694 });
    expect(evidence).toMatchObject({ taxableAmount: 1540, vatAmount: 154, grossTotal: 1694, interventionGrossAmount: 1694 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 1694 });
  });

  it("preserva il layout OCR in cui l'imponibile e' ripetuto prima dell'IVA corretta", () => {
    const evidence = extract(`TOTALE IMPONIBILE
€ 1.727,27
Totale Iva
1.727,27
10
€ 172,73
172,73
Totale
€ 1.900,00
Scadenze Pagamenti
17/06/2026
€ 1.900,00`, { extractionMode: "macos_vision_ocr", grossTotal: 1900 });
    expect(evidence).toMatchObject({ taxableAmount: 1727.27, vatAmount: 172.73, grossTotal: 1900, interventionGrossAmount: 1900 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 1900 });
  });

  it("somma tutte le rate dello scadenziario invece di scambiare la prima rata per il totale intervento", () => {
    const evidence = extract(`Totale imponibile € 4.318,18
Importo Iva € 431,82
Totale € 4.750,00
Netto a pagare € 4.750,00
Scadenze:
17/02/2026 € 2.375,00
17/02/2026 € 2.375,00
Copia della fattura elettronica`, { documentNumber: "28/001", grossTotal: 4750 });
    expect(evidence).toMatchObject({ taxableAmount: 4318.18, vatAmount: 431.82, grossTotal: 4750, interventionGrossAmount: 4750, extractionConfidence: "certain" });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 4750 });
  });

  it("legge la riga Rinaldi detraibile anche senza spazio prima dell'euro", () => {
    const evidence = extract(`RINALDI SRL
TOTALE SPESE CONGRUE SOSTENUTE IN BASE AI MASSIMALI AMMESSI€3253,38
TOTALE IMPONIBILE
€ 4.136,36
Totale Iva
€ 413,64
Totale
€ 4.550,00
Scadenze Pagamenti
21/07/2026
€ 4.550,00`, { documentNumber: "793/26", grossTotal: 4550 });
    expect(evidence).toMatchObject({ taxableAmount: 4136.36, vatAmount: 413.64, interventionGrossAmount: 4550,
      explicitDeductibleLines: [expect.objectContaining({ amount: 3253.38, extractionConfidence: "certain" })] });
    expect(reconcileFinancialEvidence([evidence], { mode: "test", scheme: "ecobonus" })).toMatchObject({ usable: true, total: 3253.38 });
  });

  it("usa il netto a pagare come terza prova nei layout Galbiati", () => {
    const evidence = extract(`IMPONIBILE
2.345,00
IMPOSTA
SPESE VARIE
SPESE TRASPORTO
515,90
NETTO A PAGARE
2.860,90 €`, { documentNumber: "92/A", grossTotal: 2860.9 });
    expect(evidence).toMatchObject({ taxableAmount: 2345, vatAmount: 515.9, grossTotal: 2860.9, interventionGrossAmount: 2860.9 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 2860.9 });
  });

  it("usa il pagamento fattura separato e accetta l'arrotondamento contabile di un centesimo", () => {
    const evidence = extract(`TOTALE IMPONIBILE 3012,30 TOTALE IMPOSTA 662,71
TOTALE FATTURA
3675,01
NETTO A PAGARE
PAGAMENTO FATTURA
ARROTONDAMENTO
0 3675,00`, { grossTotal: 3675.01 });
    expect(evidence).toMatchObject({ taxableAmount: 3012.3, vatAmount: 662.71, interventionGrossAmount: 3675 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 3675.01 });
  });

  it("riconcilia i formati Totale merce e Totale fornitura con imposta esplicita", () => {
    const parolo = extract("TOTALE MERCE 1721,31\nTOTALE IMPONIBILE 1721,31 TOTALE IMPOSTA 378,69\nTOTALE FATTURA 2100,00", { grossTotal: 2100 });
    expect(parolo).toMatchObject({ taxableAmount: 1721.31, vatAmount: 378.69, interventionGrossAmount: 2100 });
    const desando = extract("Totale fornitura 1,00 pz 1.229,5000 € 22% 1.229,50 €\nImponibile 1.229,50 €\nImposta 22% 270,49 €", { grossTotal: 1499.99 });
    expect(desando).toMatchObject({ taxableAmount: 1229.5, vatAmount: 270.49, interventionGrossAmount: 1499.99 });
    expect(reconcileFinancialEvidence([parolo])).toMatchObject({ usable: true, total: 2100 });
    expect(reconcileFinancialEvidence([desando])).toMatchObject({ usable: true, total: 1499.99 });
  });

  it("mantiene OCR e Rinaldi misto ambigui in fail-closed", () => {
    const ocr = extract("RINALDI SRL\nPergola e fornitura VEPA\nTotale imponibile 750,00 €\nTotale IVA 165,00 €", { extractionMode: "macos_vision_ocr" });
    const result = reconcileFinancialEvidence([ocr], { mode: "test", scheme: "ecobonus" });
    expect(result.usable).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(["estrazione-incerta:invoice-1", "rinaldi-pergola-vepa-attribuzione-ambigua:invoice-1"]));
  });

  it("non inventa una terza prova quando le righe non sono ricostruibili", () => {
    const evidence = extract("Totale imponibile 750,00 €\nTotale IVA 165,00 €");
    expect(evidence.interventionGrossAmount).toBeNull();
    expect(reconcileFinancialEvidence([evidence]).usable).toBe(false);
    const missing = extract("Totale IVA 165,00 €");
    expect(reconcileFinancialEvidence([missing]).usable).toBe(false);
  });

  it("usa il riepilogo IVA per aliquota come terza prova del lordo comprensivo di IVA", () => {
    const evidence = extract(`RIEPILOGO IVA IMPORTO LORDO IMPOSTE
22% 2.040,00 € 367,87
10% 1.100,00 € 100,00
Imponibile € 2.672,13
Totale IVA € 467,87
€ 3.140,00`, { documentNumber: "161/2026", documentDate: "2026-06-12", grossTotal: 3140 });
    expect(evidence).toMatchObject({ taxableAmount: 2672.13, vatAmount: 467.87, grossTotal: 3140, interventionGrossAmount: 3140 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 3140 });
  });

  it("non scambia l'intestazione Importo IVA per l'imposta e riconcilia il layout OCR Suman", () => {
    const evidence = extract(`Articolo Descrizione UM Quantità Prezzo Sconto Importo IVA
Tende da sole a braccia estensibili Mis Mt 410 x 225 e 360 x 225
1.650,00 22
Manodopera
200,00 22
Totale importi
1.850,00
Totale imponibile
1.850,00
Totale IVA
407,00
Totale documento
22
1.850,00
407,00
2.257,00`, { extractionMode: "macos_vision_ocr", documentNumber: "9", grossTotal: 2257 });
    expect(evidence).toMatchObject({ taxableAmount: 1850, vatAmount: 407, grossTotal: 2257, interventionGrossAmount: 2257, extractionConfidence: "certain" });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 2257 });
  });

  it("legge l'imponibile incorporato nel riepilogo IVA multipagina", () => {
    const evidence = extract(`RIEPILOGO IVA IMPORTO LORDO IMPOSTE
22% 3.030,00 € 546,39
10% 370,00 € 33,64
0% 0,00 € 0,00 Imponibile € 2.819,97
Totale IVA € 580,03
€ 3.400,00`, { documentNumber: "211/2026", grossTotal: 3400 });
    expect(evidence).toMatchObject({ taxableAmount: 2819.97, vatAmount: 580.03, grossTotal: 3400, interventionGrossAmount: 3400 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 3400 });
  });

  it("riconcilia la terna verticale imponibile IVA e lordo delle fatture Infissi", () => {
    const evidence = extract(`Fattura 321/FE del 22/07/2026
Imponibile
IVA 10% su 1.772,16 €
Totale fattura
1.772,16 €
177,22 €
1.949,37 €
Totale dovuto 1.949,37 €`, { documentNumber: "321/FE", grossTotal: 1949.37 });
    expect(evidence).toMatchObject({ taxableAmount: 1772.16, vatAmount: 177.22, grossTotal: 1949.37, interventionGrossAmount: 1949.37 });
  });

  it("legge imponibile e IVA dalla riga del riepilogo aliquota Infissi", () => {
    const evidence = extract(`Totale imponibile
€ 6.054,92
Scadenziario
Data Importo
31/05/2026 € 6.660,41
Riepilogo IVA
Imponibile IVA % IVA Importo IVA
€ 6.054,92 IVA 10% € 605,49
Totale fattura € 6.660,41`, { documentNumber: "35", grossTotal: 6660.41 });
    expect(evidence).toMatchObject({ taxableAmount: 6054.92, vatAmount: 605.49, grossTotal: 6660.41, interventionGrossAmount: 6660.41 });
  });

  it("riconcilia il riepilogo OCR a colonne Ideal Sistem senza scambiare aliquote e importi", () => {
    const evidence = extract(`Imponibile
1.914,55
AL.IVA
Importo IVA
Totale merce
% Sconto
Importo sconto
Netto merce
200,00
10,00
22,00
191,46
44,00
2.114,55
0,00
2.114,55
Spese Bolli
TOTALE DOCUMENTO
TOTALE A PAGARE
2.114,55)
Euro 2.350,01
Tot.
235,46
Euro 2.350,01`, { extractionMode: "macos_vision_ocr", documentNumber: "252/00", grossTotal: 2350.01 });
    expect(evidence).toMatchObject({ taxableAmount: 2114.55, vatAmount: 235.46, grossTotal: 2350.01, interventionGrossAmount: 2350.01, extractionConfidence: "certain" });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 2350.01 });
  });

  it("usa la scadenza della fattura Infissi come terza prova del lordo", () => {
    const evidence = extract(`Sostituzione finestre e serramenti
SCADENZE
18/05/2026: € 9.996,66
Imponibile € 9.087,87
Totale IVA € 908,79
€ 9.996,66`, { documentNumber: "297/2026", grossTotal: 9996.66 });
    expect(evidence).toMatchObject({ taxableAmount: 9087.87, vatAmount: 908.79, interventionGrossAmount: 9996.66 });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 9996.66 });
  });

  it("riconosce la scadenza Beghini due righe dopo la data senza inventare zero", () => {
    const evidence = extract(`Imponibile € 2.850,00
Totale IVA € 627,00
Totale
€ 3.477,00
Scadenze
03-08-2026 €
-
3.477,00`, { documentNumber: "BEGHINI/26", grossTotal: 3477 });
    expect(evidence).toMatchObject({
      taxableAmount: 2850,
      vatAmount: 627,
      grossTotal: 3477,
      interventionGrossAmount: 3477,
      extractionIssues: [],
    });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 3477, blockers: [] });
  });

  it("preserva uno zero monetario esplicito nello scadenziario", () => {
    const evidence = extract(`Imponibile € 0,00
Totale IVA € 0,00
Scadenze
03-08-2026 € 0,00`, { documentNumber: "ZERO/26", grossTotal: 0 });
    expect(evidence).toMatchObject({ interventionGrossAmount: 0, extractionIssues: [] });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 0, blockers: [] });
  });

  it("traccia il trattino isolato come scadenza non determinata e produce un blocker leggibile", () => {
    const evidence = extract(`Imponibile € 2.850,00
Totale IVA € 627,00
Scadenze
03-08-2026 €
-`, { documentNumber: "MISSING-DUE/26", grossTotal: 3477 });
    expect(evidence).toMatchObject({
      interventionGrossAmount: null,
      extractionIssues: [{ code: "schedule_amount_missing", reason: "Scadenza non leggibile, importo mancante" }],
    });
    const reconciliation = reconcileFinancialEvidence([evidence]);
    expect(reconciliation.usable).toBe(false);
    expect(reconciliation.blockers).toContain("schedule-amount-missing:invoice-1");
    expect(reconciliation.auditNotes).toContain("invoice-1:Scadenza non leggibile, importo mancante");
    expect(reconciliation.appliedRuleIds).toContain("user-2026-08-26-invoice-schedule-missing-amount-v1");
  });

  it("riconcilia il riepilogo compatto e le rate Bonifico delle fatture GRK", () => {
    const evidence = extract(`Fattura Numero : 6 Data 13.02.2026
Totale documento € 11.562,71
Totale da pagare € 11.562,71
Pagamenti Data fattura
IT00 Bonifico 13.02.2026 6.306,93
IT00 Bonifico 27.02.2026 3.153,47
IT00 Bonifico 27.03.2026 2.102,31
Riepilogo totali
Non
Imponibile
Imponibile Cassa ( %) Iva Ritenuta Totale
documento
Totale da
pagare
0,00 € 10.511,55 € 0,00 € 1.051,16 € - 0,00 € 11.562,71 € 11.562,71 €`, {
      documentNumber: "6", documentDate: "2026-02-13", grossTotal: 11562.71,
    });
    expect(evidence).toMatchObject({
      taxableAmount: 10511.55,
      vatAmount: 1051.16,
      grossTotal: 11562.71,
      interventionGrossAmount: 11562.71,
      extractionConfidence: "certain",
    });
    expect(reconcileFinancialEvidence([evidence])).toMatchObject({ usable: true, total: 11562.71 });
  });
});
