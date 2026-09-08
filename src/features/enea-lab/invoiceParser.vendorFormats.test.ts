import { describe, expect, it } from "vitest";
import { combineDocumentResults, containsHistoricalEneaAppendix, normalizePersianaMeasure, parseScreeningInvoiceText, parseScreeningTechnicalSourceText, stripHistoricalEneaAppendix } from "./invoiceParser";
import { resolveProductTechnicalAttributes } from "../../../scripts/enea-shadow-runner/crmLocalPreflight";
import { USER_AUTHORIZED_RULE_IDS } from "../enea-shadow-crm/operationalRegistry";

describe("invoiceParser formati rivenditore originari", () => {
  it.each([
    ["260", "05-03-26", "2026-03-05"],
    ["261", "05/03/26", "2026-03-05"],
    ["534", "26-05-2026", "2026-05-26"],
    ["535", "26/05/2026", "2026-05-26"],
  ])("legge numero e data separati con separatori e anno ammessi (%s, %s)", (number, date, expectedDate) => {
    const parsed = parseScreeningInvoiceText(`AGENTE N° DOCUMENTO DATA DOCUMENTO TERRITORY
${number}
${date}
TOTALE FATTURA
EUR 5.353,36`, "fattura-tabellare-generica.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: number, documentDate: expectedDate, total: 5353.36 });
  });

  it("legge il numero in coda alla riga delle etichette e la data sulla riga seguente", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA DI VENDITA
N° DOCUMENTO DATA DOCUMENTO 619
19-06-26
TOTALE FATTURA
EUR 680,14`, "fattura-tabellare-generica.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "619", documentDate: "2026-06-19", total: 680.14 });
  });

  it("legge identita e totale quando Fattura precede Data e Numero sulla stessa riga tabellare", () => {
    const parsed = parseScreeningInvoiceText(`Fattura
Data 22/06/2026 Numero 146 Pagina
1/1
Codice Descrizione UM Q.tà Prezzo Unit. Sconto Importo IVA
Fornitura e posa in opera di schermatura solare
1,00 7.500,00 7.500,00 10
Codice IVA - Descrizione Imponibile Aliquota Imposta
10 - IVA 10% 7.500,00 10,00% 750,00
Spese anticipate Altre spese 0,00 0,00 Totale documento
8.250,00
Totale da pagare
0,00 0,00 0,00 0,00 8.250,00`, "fattura-tabellare.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "146", documentDate: "2026-06-22", total: 8250 });
  });

  it("preferisce Totale documento al totale descrittivo della commessa", () => {
    const parsed = parseScreeningInvoiceText(`NUMERO DOCUMENTO DATA DOCUMENTO PAG.
1512 12/03/2026 001
Totale complessivo fornitura e posa in opera euro 9.010,00
IMPONIBILE 1.986,00 3.640,00
AL.IVA 22 10 IMPORTO IVA TOTALE MERCE
436,92 5.626,00
364,00
TOTALE A PAGARE TOTALE DOCUMENTO
800,92 6.426,92`, "fattura-multi-aliquota.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "1512", documentDate: "2026-03-12", total: 6426.92 });
  });
  it("separa tutte le tapparelle della descrizione narrativa mista senza inventare tende", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA\nnr. FPR 337/26 del 01/07/2026\nPRODOTTI E SERVIZI\n1 fattura saldo per fornitura e posa di Tapparella in\nalluminio media densità colore avorio A02 N° 1 da 143\nx 185 cm Schermatura superficie mq 2,645 , Gtot 0,060\nclasse 4 N° 1 da 283,5 x 185 cm Schermatura\nsuperficie mq 5,2447 Gtot 0,060 classe 4 N° 1 tubo\ncompleto in ferro L. 300 cm Data Collaudo 01/07/2026\n1 400,00 € 400,00 € 22 % -\n2 Infissi PVC esterno bianco massa interno 49233\nMETODO DI PAGAMENTO\nTotale documento 3.446,50 €`, "misto-saldo-tapparelle.pdf");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items).toEqual([
      expect.objectContaining({ description: "Tapparella in alluminio", widthMm: 1430, heightMm: 1850, surfaceM2: 2.645, gTot: 0.06 }),
      expect.objectContaining({ description: "Tapparella in alluminio", widthMm: 2835, heightMm: 1850, surfaceM2: 5.2447, gTot: 0.06 }),
    ]);
    expect(parsed.items.some((item) => /tenda/i.test(item.description))).toBe(false);
  });
  it("estrae prodotti da un preventivo tecnico senza promuoverlo a fattura", () => {
    const text = "Preventivo tecnico\nSuperficie Avvolgibili in alluminio / L1545mm x h1700mm - 2 pz";
    expect(parseScreeningInvoiceText(text, "preventivo.pdf").items).toEqual([]);
    expect(parseScreeningTechnicalSourceText(text, "preventivo.pdf")).toHaveLength(2);
  });
  it("legge una tenda Linea Sole quando LxH resta sulla riga descrittiva", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA 195/2026 del 13/06/2026
DESCRIZIONE QUANTITA PREZZO IMPORTO IVA
Tenda da Sole S/88 Pantografo a bracci L3000x2200
tempotest 15/52 mantovana onda lunga bordino in tinta
1
525,00 €
525,00 € 10 %
GHOT TENDA 0,12
TOTALE DOCUMENTO 660,00 €`, "linea-sole-layout.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 3000, heightMm: 2200, gTot: 0.12 }),
    ]);
  });
  it("non trasforma in tenda una misura LxH priva di una riga prodotto e gTot", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA 1/2026 del 13/06/2026
Larghezza vano L3000x2200
1
525,00 €
TOTALE DOCUMENTO 660,00 €`, "misura-generica.pdf");
    expect(parsed.items).toEqual([]);
  });

  it("ricava una sola unità quando SdI perde la quantità ma prezzo e importo di riga coincidono", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA n. 204/2026 del 19/06/2026
LINEA SOLE POTITO SRL
PRODOTTI E SERVIZI
NR
DESCRIZIONE
QUANTITA
PREZZO
IMPORTO
Tenda da Sole S/81E Pantografo a bracci L4600 x 2200
625,00 €
625,00 € 10 %
2
Motore radiocomando nice Saldo
140,00 €
8
GHOT 0,13
1
0,00 €`, "riccardo-layout.pdf");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ widthMm: 4600, heightMm: 2200, gTot: 0.13 });
  });

  it("non ricava la quantità SdI se prezzo unitario e importo di riga non coincidono", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA n. 205/2026 del 19/06/2026
LINEA SOLE POTITO SRL
PRODOTTI E SERVIZI
NR
DESCRIZIONE
QUANTITA
PREZZO
IMPORTO
Tenda da Sole S/81E Pantografo a bracci L4600 x 2200
625,00 €
1.250,00 € 10 %
2
Motore radiocomando nice
140,00 €
8
GHOT 0,13
1
0,00 €`, "quantita-ambigua.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("legge le posizioni fisiche di una scheda ordine persiane", () => {
    const items = parseScreeningTechnicalSourceText(`Ordine n. C261490
Serie JAGUAR 45 > Modello AURORA J
Persiana in alluminio con lamelle orientabili
POS. P01 Riferimento SALA
Tipologia PF4 DX A
Quantità 1 PZ
misure L 2445
misure H 2405
G-TOT 0,09 - CLASSE 4
POS. P02 Riferimento CUCINA
Tipologia PF2 DX
Quantità 1 PZ
misure L 1060
misure H 2405
G-TOT 0,09 - CLASSE 4
POS. P03 Riferimento CAMERETTA
Tipologia PF2 SX
Quantità 1 PZ
misure L 1060
misure H 2405
G-TOT 0,09 - CLASSE 4`, "ordine-persiane.pdf");
    expect(items).toEqual([
      expect.objectContaining({ widthMm: 2445, heightMm: 2405, gTot: 0.09 }),
      expect.objectContaining({ widthMm: 1060, heightMm: 2405, gTot: 0.09 }),
      expect.objectContaining({ widthMm: 1060, heightMm: 2405, gTot: 0.09 }),
    ]);
  });
  it("ignora una posizione ordine senza quantità esplicita", () => {
    const items = parseScreeningTechnicalSourceText(`Ordine n. C1
POS. P01 Modello generico
misure L 2445
misure H 2405
G-TOT 0,09`, "ordine-incompleto.pdf");
    expect(items).toEqual([]);
  });
  it("legge totale documento anche sulla riga successiva", () => {
    const parsed = parseScreeningInvoiceText("Fattura n. A1 del 22/05/2026\nTotale documento\n1.450,00 €", "a.pdf");
    expect(parsed.result.total).toBe(1450);
  });
  it("legge tenda in centimetri con gTot esplicito e totale separato", () => {
    const parsed = parseScreeningInvoiceText("FATTURA ACCOMPAGNATORIA 851/26 DATA\n30/07/2026\nDIM.L.CM 197X H.CM 200\nCLASSE DI SCHERMATURA gtot 0,08\nTotale\n€ 1.160,01", "danila.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "851/26", documentDate: "2026-07-30", total: 1160.01 });
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 1970, heightMm: 2000, gTot: 0.08 })]);
  });
  it("legge due righe Rinaldi anche quando la dichiarazione normativa separa misura e gTot", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA ACCOMPAGNATORIA 844/26 DATA
29/07/2026
DIM.L.CM 480 X H.CM 250
Fornitura ed installazione di schermature solari in unità immobiliare con riferimenti normativi e descrizione tecnica estesa.
PRODOTTO MARCATO CE SECONDO LA NORMATIVA UNI EN 13561
CLASSE DI SCHERMATURA gtot 0,10 - classe 3
DIM.L.CM 475 X H.CM 250
Fornitura ed installazione di schermature solari in unità immobiliare con riferimenti normativi e descrizione tecnica estesa.
PRODOTTO MARCATO CE SECONDO LA NORMATIVA UNI EN 13561
CLASSE DI SCHERMATURA gtot 0,10 - classe 3
Totale
€ 3.000,01`, "toselli.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "844/26", documentDate: "2026-07-29", total: 3000.01 });
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 4800, heightMm: 2500, gTot: 0.1 }),
      expect.objectContaining({ widthMm: 4750, heightMm: 2500, gTot: 0.1 }),
    ]);
  });
  it("non confonde il totale spese congrue Rinaldi con il totale contabile", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA ACCOMPAGNATORIA 747/26 DATA
10/07/2026
DIM.L.CM 340 X H.CM 150
CLASSE DI SCHERMATURA gtot 0,02 - classe 4
TOTALE SPESE CONGRUE SOSTENUTE IN BASE AI MASSIMALI AMMESSI € 2.113,36
TOTALE IMPONIBILE
€ 1.431,83
Totale Iva
€ 143,18
Totale
€ 1.575,01`, "cecchi.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "747/26", documentDate: "2026-07-10", total: 1575.01 });
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 3400, heightMm: 1500, gTot: 0.02 })]);
  });
  it("legge la pergola Rinaldi quando la profondita usa SP.CM. con il punto finale", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA ACCOMPAGNATORIA 700/26 DATA
14/07/2026
PERGOTENDA IRIDIUM 2 GUIDE INCLINATA COMANDO MOTORIZZATO CON MOTORE
DIM.L.CM 400 X SP.CM. 300
CLASSE DI SCHERMATURA gtot 0,02 - classe 4
SUPERFICIE SCHERMATURA 12 mq
Totale € 5.700,00`, "chiericati.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 4000, heightMm: 3000, surfaceM2: 12, gTot: 0.02 })]);
  });
  it("riconosce la pergotenda quando la sporgenza e etichettata con la sola S", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 46/2026 del 23/06/2026
FATTURA A SALDO
Compakt
Pergotenda telo retrattile motorizzata
L 500 x S 290, colore struttura 1013, colore tessuto champagne
1 pezzi € 4.550,00
Imponibile € 3.729,51
Totale IVA € 820,49
Totale documento € 4.550,00`, "ragni-saldo.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 5000, heightMm: 2900, surfaceM2: 14.5, gTot: null, description: "Pergotenda" }),
    ]);
    expect(parsed.items[0].measurementAudit?.ruleId).toBe("system-labelled-screening-depth-abbreviation-v1");
  });
  it("non promuove una coppia numerica senza entrambe le etichette L e S", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 47/2026 del 23/06/2026
Pergotenda telo retrattile motorizzata 500 x 290
1 pezzi € 4.550,00
Totale documento € 4.550,00`, "misure-non-etichettate.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("legge identita, netto e tre tende Galbiati senza duplicare l'acconto", () => {
    const balance = parseScreeningInvoiceText(`TIPO DOCUMENTO Fattura
DATA DOCUMENTO
23/07/2026 NUMERO DOCUMENTO
92/A
Tenda da sole Musa cm.330x200 (mq. 6,60) STARLIGHT gTot 0,09
Tenda da sole a caduta TZone cm. 165,5x275 (mq. 4,55) gTot 0,09
Tenda da sole a caduta TZone cm. 87x275 (mq. 2,39) gTot 0,09
IMPONIBILE 2.345,00
IMPOSTA 515,90
TOTALE DOCUMENTO 2.860,90 €
NETTO A PAGARE
2.860,90 €`, "ballabio-saldo.pdf");
    const advance = parseScreeningInvoiceText(`TIPO DOCUMENTO Fattura
DATA DOCUMENTO
22/05/2026 NUMERO DOCUMENTO
59/A
Acconto per posa e fornitura tende da sole
TOTALE DOCUMENTO 2.342,40 €
NETTO A PAGARE 2.342,40 €`, "ballabio-acconto.pdf");
    expect(balance.result).toMatchObject({ documentNumber: "92/A", documentDate: "2026-07-23", total: 2860.9 });
    expect(balance.items).toEqual([
      expect.objectContaining({ widthMm: 3300, heightMm: 2000, gTot: 0.09 }),
      expect.objectContaining({ widthMm: 1655, heightMm: 2750, gTot: 0.09 }),
      expect.objectContaining({ widthMm: 870, heightMm: 2750, gTot: 0.09 }),
    ]);
    expect(advance.result).toMatchObject({ documentNumber: "59/A", documentDate: "2026-05-22", total: 2342.4 });
    expect(advance.items).toHaveLength(0);
  });
  it("preferisce l'intestazione cortesia al riferimento a una fattura dedotta", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 186 del 04-08-2026
SALDO PREVENTIVO
DEDOTTO FATTURA N. 12 DEL 24/02/2026
Totale € 10.400,50`, "ferrari.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "186", documentDate: "2026-08-04", total: 10400.5 });
  });
  it("legge quantità, misure e identità da una fattura accompagnatoria G hitti", () => {
    const parsed = parseScreeningInvoiceText(`Fattura Accompagnatoria n. 136/A del 13/06/2026
SALDO: FORNITURA E POSA TENDE DA SOLE.
N. 2 TENDE DA CM 275 X 200, COMPLETE DI TESSUTO E ACCESSORI SU MISURA, GTOT 0,12 CLASSE 3
Totale
2.784,00 €
ACCONTO. FATTURA N. 86/A DEL 13/05/2026`, "lonardi.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "136/A", documentDate: "2026-06-13", total: 2784 });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.widthMm === 2750 && item.heightMm === 2000 && item.gTot === 0.12)).toBe(true);
  });
  it("legge l'identità della fattura senza n. quando usa DATA sulla riga successiva", () => {
    const parsed = parseScreeningInvoiceText("FATTURA 630/26 DATA\n19/06/2026\nTotale\n€ 1.450,00", "acconto.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "630/26", documentDate: "2026-06-19", total: 1450 });
  });
  it("legge tenda cassonetto e totale fattura dal formato Parolo", () => {
    const parsed = parseScreeningInvoiceText(`DATA
02/07/2026 NUMERO
PAGINA
251 1
FATTURA
TENDA DA SOLE CASSONETTO MOD.R51 DIM.CM L 300x200 SP (=MQ 6), TESSUTO TEMPOTEST, GTOT 0,09 CLASSE 4
TOTALE MERCE 1721,31
TOTALE FATTURA
2100,00`, "parolo.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "251", documentDate: "2026-07-02", total: 2100 });
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 3000, heightMm: 2000, gTot: 0.09 })]);
  });
  it("conserva la tenda Parolo dimensionata anche quando il gTot non e presente nella fattura", () => {
    const parsed = parseScreeningInvoiceText(`DATA
07/07/2026 NUMERO
PAGINA
260 1
FATTURA
TSCASS ACCONTO TENDA DA SOLE CASSONETTO MOD.R51 PONANT, DIM.CM L 265x220 SP (=MQ 5,83),
STRUTTURA RAL 1013, TESSUTO TEMPOTEST PARA' ART. 5001/15 CLASSE 4
ACCONTO RIF.FATTURA N.207 DEL 12/06/2026
N -344,26
TOTALE FATTURA
980,00`, "parolo-saldo-senza-gtot.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "260", documentDate: "2026-07-07", total: 980, itemCount: 1 });
    expect(parsed.items).toEqual([expect.objectContaining({
      description: "Tenda da sole cassonetto",
      widthMm: 2650,
      heightMm: 2200,
      surfaceM2: 5.83,
      gTot: null,
    })]);
  });
  it("non trasforma in prodotto una fattura di solo acconto o una riga di detrazione", () => {
    const advance = parseScreeningInvoiceText("FATTURA 207 del 12/06/2026\nACCONTO TENDA DA SOLE\nTOTALE FATTURA 420,00", "acconto.pdf");
    const deduction = parseScreeningInvoiceText("FATTURA 260 del 07/07/2026\nACCONTO RIF.FATTURA N.207 DEL 12/06/2026 N -344,26\nTOTALE FATTURA 980,00", "detrazione.pdf");
    expect(advance.items).toEqual([]);
    expect(deduction.items).toEqual([]);
  });
  it("legge misure in metri e non confonde totale fornitura con totale fattura", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. 17 del 03/07/2026
TENDA da sole modello 8000 L 3,00 x S 2,50 Tot mq 7.5 Tessuto Parà Gtot classe 3 valore 0.11
Totale fornitura 1,00 pz 1.229,5000 € 22% 1.229,50 €
Imponibile 1.229,50 €
Imposta 22% 270,49 €
Totale 1.499,99 €`, "desando.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "17", documentDate: "2026-07-03", total: 1499.99 });
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 3000, heightMm: 2500, gTot: 0.11 })]);
  });
  it("risolve Teotino in centimetri tramite Tot mq e conserva audit di unita e superficie", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. 7 del 28/05/2026
TENDA da sole modello NEW ORLY, tenda a scomparsa totale, motorizzata, L 400 x S 250Tot mq 10 Tessuto Parà Tempotest Gtot classe 3 valore0,10
Totale 2.257,00 €`, "teotino.pdf");
    expect(parsed.result.status).toBe("parsed");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 4000,
      heightMm: 2500,
      surfaceM2: 10,
      gTot: 0.1,
      measurementAudit: expect.objectContaining({
        explicitUnit: null,
        widthResolution: "surface_reconciled_cm",
        heightResolution: "surface_reconciled_cm",
        ruleId: USER_AUTHORIZED_RULE_IDS.screeningDimensionUnitSurfaceCoherence,
      }),
      surfaceAudit: expect.objectContaining({
        explicitSurfaceM2: 10,
        calculatedSurfaceM2: 10,
        relativeDifference: 0,
        toleranceRelative: 0.05,
        consistent: true,
        ruleId: USER_AUTHORIZED_RULE_IDS.screeningDimensionUnitSurfaceCoherence,
      }),
    })]);
    expect(combineDocumentResults([parsed]).blockers).toEqual([]);
  });
  it("blocca fail-closed quando unita esplicita e superficie dichiarata sono incoerenti", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. 8 del 29/05/2026
TENDA DA SOLE L 400 cm x S 250 cm Tot mq 12 Gtot valore 0,10
Totale 2.257,00 €`, "superficie-incoerente.pdf");
    expect(parsed.items[0]).toMatchObject({
      widthMm: 4000,
      heightMm: 2500,
      surfaceM2: 12,
      surfaceAudit: { explicitSurfaceM2: 12, calculatedSurfaceM2: 10, consistent: false },
    });
    expect(parsed.result).toMatchObject({ status: "failed", message: expect.stringContaining("oltre la tolleranza del 5%") });
    expect(combineDocumentResults([parsed]).blockers).toContainEqual(expect.stringContaining("superficie esplicita 12 m2 non coerente"));
  });
  it("accetta esattamente il confine relativo del 5%", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. 9 del 30/05/2026
TENDA DA SOLE L 420 x S 250 Tot mq 10 Gtot valore 0,10
Totale 2.257,00 €`, "superficie-confine.pdf");
    expect(parsed.result.status).toBe("parsed");
    expect(parsed.items[0]).toMatchObject({ widthMm: 4200, heightMm: 2500, surfaceM2: 10 });
    expect(parsed.items[0].surfaceAudit?.relativeDifference).toBeCloseTo(0.05, 10);
    expect(parsed.items[0].surfaceAudit?.consistent).toBe(true);
  });
  it("respinge appena oltre il confine relativo del 5%", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. 10 del 31/05/2026
TENDA DA SOLE L 421 x S 250 Tot mq 10 Gtot valore 0,10
Totale 2.257,00 €`, "superficie-oltre-confine.pdf");
    expect(parsed.items[0]).toMatchObject({ widthMm: 4210, heightMm: 2500, surfaceM2: 10 });
    expect(parsed.items[0].surfaceAudit?.relativeDifference).toBeCloseTo(0.0525, 10);
    expect(parsed.result.status).toBe("failed");
  });
  it("legge tenda cassonata con quantità e gTot esplicito", () => {
    const parsed = parseScreeningInvoiceText("Fattura n. FPR 344/26 del 04/07/2026\nN°1 da 277 x 210 cm Schermatura superficie mq 5,817 G tot 0.10\nTotale documento 915,00 €", "albertoni.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 2770, heightMm: 2100, gTot: 0.1 })]);
    expect(parsed.result.total).toBe(915);
  });
  it("legge numero e data quando FATTURA e nr. sono su righe separate", () => {
    const parsed = parseScreeningInvoiceText("FATTURA\nnr. FPR 272/26 del 05/06/2026\nTotale documento\n915,00 €", "albertoni-acconto.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "FPR 272/26", documentDate: "2026-06-05", total: 915 });
  });
  it("legge numero e data quando anche la data è sulla riga successiva", () => {
    const parsed = parseScreeningInvoiceText("Fattura\nnr. 14/2026 del\n09/04/2026\nTotale documento\n6.545,00 €", "fiorini-acconto.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "14/2026", documentDate: "2026-04-09", total: 6545 });
  });
  it("preserva quattro piu una tende Cristal come cinque prodotti distinti con gTot da fallback successivo", () => {
    const parsed = parseScreeningInvoiceText("Fattura n. 28/2026 del 25/05/2026\nn°2 + 2 tende tecniche a caduta modello zip teli cristal misure L 2700 x H 2020 mm\nn°1 tenda tecnica a caduta telo cristal brown misure L 2200 x H 2020 mm\nTot. documento\n€ 6.545,00", "fiorini.pdf");
    expect(parsed.items).toHaveLength(5);
    expect(parsed.items.slice(0, 4).every((item) => item.widthMm === 2700 && item.heightMm === 2020 && item.gTot === null)).toBe(true);
    expect(parsed.items[4]).toMatchObject({ widthMm: 2200, heightMm: 2020, gTot: null });
    expect(combineDocumentResults([parsed]).blockers).toEqual([]);
  });
  it("preserva N04 veneziane come quattro prodotti fisici distinti", () => {
    const invoice = "Fattura n. FATTURA165/2026 del 22/05/2026\nFornitura e posa in opera Veneziane da 50mm complete di accessori e guide\nN04 Da l 1290x3000\nTotale documento 1.450,00 €";
    const parsed = parseScreeningInvoiceText(`${invoice}\n\f\n${invoice}`, "ciotta.pdf");
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items.every((item) => item.widthMm === 1290 && item.heightMm === 3000 && item.gTot === null)).toBe(true);
    expect(combineDocumentResults([parsed]).blockers).toEqual([]);
  });
  it("legge Linea Sole Potito: progressivo riga distinto dalla quantita e GHOT esplicito", () => {
    const invoice = `Fattura n. 252 del 30/06/2026
1 Tenda da Sole S/81E Pantografo a bracci Saldo
L3400x1800
2 550,00 22 1.100,00
9 GHOT TENDA 0,11
Totale documento 1.831,50 €`;
    const parsed = parseScreeningInvoiceText(invoice, "linea-sole-potito.pdf");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.widthMm === 3400 && item.heightMm === 1800 && item.gTot === 0.11)).toBe(true);
  });

  it("legge Linea Sole Potito scomparsa totale con misura prima della descrizione e GHOT nel saldo", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA 229/2026 del 01/07/2026
S/20222 scomparsa totale L 3600x2750 tessuto tempotest 426
SALDO per fornitura tenda da sole modello S/20222
1 800,00 800,00 10%
GHOT 0,12
Totale documento 1.265,00`, "linea-sole-saldo.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 3600,
      heightMm: 2750,
      surfaceM2: 9.9,
      gTot: 0.12,
      description: "Tenda da sole scomparsa totale",
    })]);
  });
  it("regressione Mocenighi: riconosce 'scomparsa totale' anche col codice modello tra 'totale' e 'L' e chiusura plurale 'tende da sole'", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA nr. FATTURA179/2026 del 08/06/2026
Tenda modello cassonata a scomparsa totale S/2022 L
5000x2000 con motore radio comando RTS (acconto 50%)
radiocomando (acconto 50%)
impianto elettrico x 2 tende da sole (acconto 50%)
GHOT TENDA 0,13
Totale documento 1.740,20`, "mocenighi.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 5000,
      heightMm: 2000,
      gTot: 0.13,
      description: "Tenda da sole scomparsa totale",
    })]);
  });
  it("regressione Mocenighi (documento reale): riconosce la misura anche quando l'OCR tabellare intercala righe di importo e IVA fra la descrizione e la misura, senza 'tenda da sole' vicino alla misura", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA nr. FATTURA179/2026 del 08/06/2026
NR
DESCRIZIONE
QUANTITA'
PREZZO
IMPORTO IVA NATURA IVA
1
Tenda modello cassonata a scomparsa totale S/2022 L
872,00 €
872,00 € 10 %
50%)
5000x2000 con motore radio comando RTS (acconto
2
radiocomando (acconto 50%)
Cappottina S/83 motorizzata L 1800x600 con motore
1
500,00 €
500,00 € 10 %
3
Anemometro sole vento (acconto 50%)
75,00 €
75,00 € 10 %
4
telecomando era P/6 (acconto 50%)
45,00 €
45,00 € 10 %
5
impianto elettrico x 2 tende da sole (acconto 50%)
90,00 €
90,00 €
10 %
GHOT TENDA 0,13
Totale documento 1.740,20`, "mocenighi-reale.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 5000,
      heightMm: 2000,
      gTot: 0.13,
      description: "Tenda da sole scomparsa totale",
    })]);
  });
  it("non riconosce 'scomparsa totale' se il codice modello tra 'totale' e 'L' e' troppo lungo per essere un codice prodotto", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA nr. 1/2026 del 01/01/2026
Tenda modello cassonata a scomparsa totale con riferimento descrittivo esteso non un codice L
5000x2000
tenda da sole
Totale documento 1.740,20`, "estraneo.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("regressione Bellotti: riconosce due prodotti distinti 'Tenda modello <codice> L <largh>x<alt>' sullo stesso fornitore, senza la parola 'scomparsa'", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA
nr. FATTURA265/2026 del 22/07/2026
PRODOTTI E SERVIZI
Fornitura e posa in opera Tenda da sole TESSUTO
TEMPOTEST 1330/509 Struttura bianco 9010
/mantovana retta bordino in tinta
1
0,00 € 10 %
0,00 €
2
Tenda modello S/2022 L 310 x1600 Saldo
1
550,00 €
550,00 € 10 %
3
Tenda modello T/v cassonata L700x1600 Saldo
1
325.00 €
325,00 €
10 %
Ghot tenda 0,08
1
0,00 €
0,00 € 10 %
Totale documento 1.045,00 €`, "bellotti.pdf");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ widthMm: 310, heightMm: 1600, gTot: 0.08, description: "Tenda da sole modello S/2022" }),
      expect.objectContaining({ widthMm: 700, heightMm: 1600, gTot: 0.08, description: "Tenda da sole modello T/v" }),
    ]));
  });
  it("regressione Di Bello: riconosce la misura orfana quando l'ordine tabellare OCR la colloca PRIMA di 'scomparsa totale L' invece che dopo", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA
nr. FATTURA264/2026 del 22/07/2026
PRODOTTI E SERVIZI
Fornitura e posa in opera Tende da sole TESSUTO
9010/mantovana retta bordino in tinta
TEMPOTEST 1330/509 Struttura bianco
2
3000×1800
N01 Saldo Tenda modello S/2022 scomparsa totale L
1
550,00 €
550,00 € 10 %
GHOT 0,08
Totale documento 1.155,00 €`, "di-bello.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 3000,
      heightMm: 1800,
      gTot: 0.08,
      description: "Tenda da sole scomparsa totale",
    })]);
  });
  it("non inventa una riga prodotto per una coppia di cifre estranea quando 'scomparsa totale L' non compare affatto nel documento", () => {
    const parsed = parseScreeningInvoiceText(`LINEA SOLE POTITO SRL
FATTURA nr. 9/2026 del 01/01/2026
Riferimento pratica 3000×1800 del cliente precedente
Totale documento 900,00 €`, "estraneo-cifre.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("esclude una pratica ENEA storica accodata prima di analizzare la fattura", () => {
    const text = "Fattura n. A1 del 22/05/2026\nVeneziane da 50mm N01 Da l 1000x2000\nTotale documento 1.450,00 €\nCPID\n19364-2022E-STORICO\nData chiusura\nSCHERMATURA SOLARE LARGHEZZA 9999 X 9999 VALORE G TOT 0,01";
    expect(containsHistoricalEneaAppendix(text)).toBe(true);
    expect(stripHistoricalEneaAppendix(text)).not.toContain("STORICO");
    const parsed = parseScreeningInvoiceText(text, "combinato.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 1000, heightMm: 2000, gTot: null })]);
  });
  it("legge il formato Vans L.xsp. senza perdere il gTot esplicito", () => {
    const parsed = parseScreeningInvoiceText(`Fattura 215/2026 del 30/06/2026
N.1 Tenda da sole a bracci estensibili, L.460xsp.220
G TOT 0,15 CLASSE 3
Totale Fattura € 1.582,00`, "vans.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 4600, heightMm: 2200, gTot: 0.15 })]);
  });
  it("legge il formato Vans verticale L.xh. senza aggregare", () => {
    const parsed = parseScreeningInvoiceText("Fattura 237/2026 del 09/07/2026\nN.1 Tenda a movimento verticale L.380xh.210\nG TOT 0,13\nTotale Fattura € 1.295,01", "vans-verticale.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 3800, heightMm: 2100, gTot: 0.13 })]);
  });
  it("riconosce una vetrata scorrevole VEPA senza abilitarne la classificazione ENEA", () => {
    const parsed = parseScreeningInvoiceText(`Fattura 243/2026 del 10/07/2026
Fornitura e posa di:
N.1 Vetrata scorrevole, sistema di vetrate Sliding, scorrevole su binario a 5 vie, vetro temperato da 10 mm, L.472xh.277.
Pratica Enea compresa G TOT 0,10 CLASSE 3
Totale Fattura € 4.500,01`, "lionti.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "243/2026", documentDate: "2026-07-10", total: 4500.01, itemCount: 1 });
    expect(parsed.items).toEqual([expect.objectContaining({ description: "VEPA - vetrata scorrevole", widthMm: 4720, heightMm: 2770, gTot: 0.1 })]);
  });
  it("legge il gruppo Vans di quattro tende verticali e quattro tende integrate preservando otto prodotti", () => {
    const parsed = parseScreeningInvoiceText(`Fattura 247/2026 del 13/07/2026
N. 4 tende verticali in pvc trasparente + n.4 tende da sole integrate nella struttura
STRUTTURA DA due L.255xh.159 + n.1 da L.276xh.269,5 + n.1 da L.275xh.162,5
PRATICA ENEA SCHERMATURE SOLARI G TOT 0,10 CLASSE 3
Totale Fattura € 7.518,01`, "seleni-saldo.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "247/2026", documentDate: "2026-07-13", total: 7518.01, itemCount: 8 });
    expect(parsed.items.filter((item) => item.description === "Tenda verticale in PVC trasparente")).toHaveLength(4);
    expect(parsed.items.filter((item) => item.description === "Tenda da sole integrata")).toHaveLength(4);
    for (const description of ["Tenda verticale in PVC trasparente", "Tenda da sole integrata"]) {
      expect(parsed.items.filter((item) => item.description === description).map((item) => [item.widthMm, item.heightMm, item.gTot])).toEqual([
        [2550, 1590, 0.1], [2550, 1590, 0.1], [2760, 2695, 0.1], [2750, 1625, 0.1],
      ]);
    }
  });
  it("legge tenda e zanzariere S.A. Montaggi preservando la cardinalita fisica", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 161/2026 del 12/06/2026
Tenda da sole MODELLO 8000 - GTOT TESSUTO 0,13 - MISURA 450 X 200
Zanzariera MODELLO SALI E SCENDI - MISURA 110,3 X 149,7
Zanzariera MODELLO SALI E SCENDI - MISURA 106,5 X 149,2
Zanzariera MODELLO LATERALE - MISURA 103 X 239,3
Totale documento € 3.140,00`, "sa-montaggi.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 4500, heightMm: 2000, gTot: 0.13, description: "Tenda da sole" }),
      expect.objectContaining({ widthMm: 1103, heightMm: 1497, gTot: null, description: "Altra schermatura solare - zanzariera" }),
      expect.objectContaining({ widthMm: 1065, heightMm: 1492, gTot: null, description: "Altra schermatura solare - zanzariera" }),
      expect.objectContaining({ widthMm: 1030, heightMm: 2393, gTot: null, description: "Altra schermatura solare - zanzariera" }),
    ]);
  });
  it("legge la tenda Zanzasol quando prezzo e quantita precedono la descrizione tecnica", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 182 del 30-07-2026
Articolo Descrizione Unità IVA Quantità Importo U. Importo
N 1.850,00
FORNITURA TENDA DA SOLE 22
1,00 1.850,00
TENDA IN BARRA QUADRA
modello: ISEO
misura: 280x250
Gtot 0,08 Classe 4
FORNITURA MOTORE TUBOLARE per tenda da sole mod. ISEO N 400,00
POSA IN OPERA N 450,00
PRATICA ENEA N 150,00
Imponibile € 2.850,00
Totale IVA € 627,00
Totale
€ 3.477,00`, "beghini.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "182", documentDate: "2026-07-30", total: 3477, itemCount: 1 });
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 2800, heightMm: 2500, surfaceM2: 7, gTot: 0.08, description: "Tenda da sole motorizzata" })]);
  });
  it("regressione Pelizzari/Tiraboschi (Zanzasol): riconosce 'Gtot.' col punto e l'intestazione plurale 'FORNITURA E POSA TENDE DA SOLE'", () => {
    const pelizzari = parseScreeningInvoiceText(`Copia di cortesia Fattura 129 del 15-06-2026
FORNITURA TENDA DA SOLE 22
1,00 1.255,00
modello: ISEO B.Q.
misura: 310X250
Gtot.0,08 Classe 4
Totale
€ 5.002,00`, "pelizzari.pdf");
    expect(pelizzari.items).toEqual([expect.objectContaining({ widthMm: 3100, heightMm: 2500, gTot: 0.08, description: "Tenda da sole" })]);

    const tiraboschi = parseScreeningInvoiceText(`Copia di cortesia Fattura 84 del 22-05-2026
FORNITURA E POSA TENDE
DA SOLE
modello: ISEO
misura: 595x250
Gtot. 0,10 Classe 3
Totale
€ 2.035,00`, "tiraboschi.pdf");
    expect(tiraboschi.items).toEqual([expect.objectContaining({ widthMm: 5950, heightMm: 2500, gTot: 0.10, description: "Tenda da sole" })]);
  });
  it("regressione Falconi (Zanzasol): riconosce la quantita' fisica reale '2,00' dopo il gTot invece di presumere sempre una sola tenda", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 98 del 26-05-2026
FORNITURA E POSA TENDE
DA SOLE
modello: BARRA QUADRA ISEO
colore struttura: AVORIO
tessuto tempotest parà: 639/99
mantovana: DRITTA
misura: 360x200
Gtot 0,16 Classe 2
N 1.350,00
22
2,00 2.700,00
Totale
€ 3.660,00`, "falconi.pdf");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.widthMm === 3600 && item.heightMm === 2000 && item.gTot === 0.16 && item.description === "Tenda da sole")).toBe(true);
  });
  it("non inventa una quantita' plurale quando il blocco N/iva/quantita non e' nel formato atteso (resta 1 come prima)", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 129 del 15-06-2026
FORNITURA TENDA DA SOLE 22
1,00 1.255,00
modello: ISEO B.Q.
misura: 310X250
Gtot.0,08 Classe 4
Totale a pagare
€ 5.002,00`, "pelizzari-variante.pdf");
    expect(parsed.items).toHaveLength(1);
  });
  it("regressione Lavezzi: riconosce la misura narrativa incorporata subito dopo 'tenda da sole' in una frase di pagamento, senza etichette L/H", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 66/2026 del 27/04/2026
DESCRIZIONE IMPORTO
SALDO 50%
Vostro dare per fornitura e posa di tenda da sole 300x250, presso vostra abitazione in Saint-Vincent in Via Prof. A.
Ferrè n.25 censita al catasto fabbricati al fg 50 mappale 80 subalterno 18.
Totale contratto 2'200,00 € ivati
Acconto 50%`, "lavezzi.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 3000, heightMm: 2500, gTot: null, description: "Tenda da sole" })]);
  });
  it("non applica la misura narrativa di pagamento quando un altro parser ha gia' trovato una riga fisica", () => {
    const parsed = parseScreeningInvoiceText(`Copia di cortesia Fattura 84 del 22-05-2026
FORNITURA E POSA TENDE
DA SOLE
modello: ISEO
misura: 595x250
Gtot. 0,10 Classe 3
Vostro dare per fornitura e posa di tenda da sole 100x100, saldo finale
Totale
€ 2.035,00`, "doppio-riferimento.pdf");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ widthMm: 5950, heightMm: 2500 });
  });
  it("non estende l'intestazione Zanzasol a un prodotto diverso senza 'tenda da sole'", () => {
    const parsed = parseScreeningInvoiceText(`FORNITURA E POSA ZANZARIERA
misura: 200x150
Gtot. 0,33`, "estraneo.pdf");
    expect(parsed.items.some((item) => item.description === "Tenda da sole")).toBe(false);
  });
  it("regressione Vigetti (LM Tende): riconosce la tenda da sole cassonata narrativa 'N° <qta> da <L> x <H> cm' anche senza gTot esplicito", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. FPR 202/26 del 08/05/2026
Fattura acconto per fornitura e posa Tenda da sole
cassonata modello TUCANO colore struttura nero
tessuto TEMPOTEST 634/51 Attacco a soffitto N° 2 da
320 x 185 cm motorizzate N° 2 motori + 1 telecomando
multicanale + 1 anemometro
Totale documento 2.287,50 €`, "vigetti.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 3200, heightMm: 1850, gTot: null, description: "Tenda da sole motorizzata" }),
      expect.objectContaining({ widthMm: 3200, heightMm: 1850, gTot: null, description: "Tenda da sole motorizzata" }),
    ]);
  });
  it("non applica il formato narrativo LM Tende senza l'unita' cm esplicita", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. FPR 203/26 del 08/05/2026
Fattura acconto per fornitura e posa Tenda da sole
cassonata modello TUCANO N° 2 da 320 x 185
Totale documento 2.287,50 €`, "vigetti-unita-assente.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("legge la zanzariera motorizzata LM Tende e somma acconto e saldo senza duplicare il prodotto", () => {
    const advance = parseScreeningInvoiceText(`FATTURA nr. FPR 96/26 del 28/03/2026
Fattura acconto per fornitura e posa di Zanzariera
modello ZIP 140 60 motore con rete fabrinet nera
colore struttura argento N° 1 da 490 x 355 motore a sx
Totale documento 1.567,50 €`, "mario-acconto.pdf");
    const balance = parseScreeningInvoiceText(`FATTURA nr. FPR 206/26 del 11/05/2026
Fattura saldo per fornitura e posa di Zanzariera
modello ZIP 140 60 motore con rete fabrinet nera
colore struttura argento N° 1 da 490 x 355 motore a sx
V.I uscita cavo frontale Schermatura superficie mq : 17,935 , classe 1 g tot 0,35
Totale documento 1.567,50 €`, "mario-saldo.pdf");
    expect(advance.result).toMatchObject({ documentNumber: "FPR 96/26", documentDate: "2026-03-28", total: 1567.5, itemCount: 0 });
    expect(balance.result).toMatchObject({ documentNumber: "FPR 206/26", documentDate: "2026-05-11", total: 1567.5, itemCount: 1 });
    expect(balance.items).toEqual([expect.objectContaining({
      widthMm: 4900,
      heightMm: 3550,
      gTot: 0.35,
      description: "Altra schermatura solare - zanzariera motorizzata",
    })]);
    const combined = combineDocumentResults([advance, balance]);
    expect(combined.items).toHaveLength(1);
    expect(combined.invoiceTotal).toBe(3135);
    expect(combined.eligibleExpense).toBe(3135);
    expect(combined.blockers).toEqual([]);
  });
  it("legge tre tende dal saldo narrativo LM Tende senza duplicare l'acconto", () => {
    const advance = parseScreeningInvoiceText(`FATTURA nr. FPR 298/26 del 16/06/2026
LM TENDE DA SOLE E ZANZARIERE S.R.L.
PRODOTTI E SERVIZI
1 fattura acconto per fornitura e posa di Tende da sole modello MINI CHIOCCIOLA N°1 da 265 x 160 N°1 da 258 x 160
2 Tenda da sole a caduta modello VIENNA N°1 da 128 x 200
METODO DI PAGAMENTO
Totale documento 1.756,80 €`, "khemara-acconto.pdf");
    const balance = parseScreeningInvoiceText(`FATTURA nr. FPR 394/26 del 27/07/2026
LM TENDE DA SOLE E ZANZARIERE S.R.L.
PRODOTTI E SERVIZI
1 fattura saldo per fornitura e posa di Tende da sole modello MINI CHIOCCIOLA
N°1 da 265 x 160 Schermatura superficie mq: 4.24 N°1 da 258 x 160 Schermatura superficie mq: 4.128 Classe 3 G tot 0,12
1 1.140,00 € 1.140,00 € 22 %
2 Tenda da sole a caduta modello VIENNA N°1 da 128 x 200 Schermatura superficie mq: 2,56 classe 3 Gtot 0.12
1 300,00 € 300,00 € 22 %
METODO DI PAGAMENTO
Totale documento 1.756,80 €`, "khemara-saldo.pdf");
    expect(advance.items).toHaveLength(0);
    expect(balance.items).toEqual([
      expect.objectContaining({ widthMm: 2650, heightMm: 1600, surfaceM2: 4.24, gTot: 0.12, description: "Tenda da sole" }),
      expect.objectContaining({ widthMm: 2580, heightMm: 1600, surfaceM2: 4.128, gTot: 0.12, description: "Tenda da sole" }),
      expect.objectContaining({ widthMm: 1280, heightMm: 2000, surfaceM2: 2.56, gTot: 0.12, description: "Tenda da sole a caduta" }),
    ]);
    const combined = combineDocumentResults([advance, balance]);
    expect(combined.items).toHaveLength(3);
    expect(combined.invoiceTotal).toBe(3513.6);
    expect(combined.eligibleExpense).toBe(3513.6);
    expect(combined.blockers).toEqual([]);
  });
  it("regressione Pezzani: riconosce la tenda quando la riga usa la preposizione 'a' invece di 'da' fra il quantitativo e la misura, senza scambiare le piantane della zanzariera per un prodotto", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. FPR 407/26 del 05/08/2026
LM TENDE DA SOLE E ZANZARIERE S.R.L.
PRODOTTI E SERVIZI
1 fattura saldo per fornitura e posa di Tenda da sole cassonata totale modello MINI CHIOCCIOLA colore struttura RAL 9010 attacco a soffitto Tessuto TEMPOTEST 15/1 motorizzata con telecomando, e anemometro N° 1 a 500 x 185 cm (motore a SX V.I.) Schermatura superficie mq 9,25 classe 3 G tot 0,13 Data collaudo 05/08/2026
1 1.125,00 € 1.125,00 € 22 %
2 Zanzariera modello KZIP 105/60 colore struttura RAL 9010 Rete Fabrinet Nera argano manuale N° 1 da 344 x 174 cm (manovra a DX V.I. asta 160 cm) N° 4 piantane 6 x 3 cm H. 180 cm N° 2 piantane 6 x 3 cm H. 166 cm Schermatura superficie mq 5,985 Classe 1 G tot 0.35 Data collaudo 05/08/2026
1 675,00 € 675,00 € 10 %
METODO DI PAGAMENTO
Totale documento 2.115,00 €`, "pezzani-saldo.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 5000, heightMm: 1850, surfaceM2: 9.25, gTot: 0.13, description: "Tenda da sole motorizzata" }),
      expect.objectContaining({ widthMm: 3440, heightMm: 1740, surfaceM2: 5.985, gTot: 0.35, description: expect.stringContaining("zanzariera") }),
    ]);
  });
  it("preserva dodici prodotti fisici LM misti con superfici, gTot e movimento del gruppo", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. FPR 374/26 del 17/07/2026
LM TENDE DA SOLE E ZANZARIERE S.R.L.
PRODOTTI E SERVIZI
1 Fattura saldo per fornitura e posa di Tende a rullo 43mm N°2 da 237 x 285 Motorizzate Schermatura superficie mq: 6,754 Classe 3 G tot 0,33
2 Zanzariere N°1 da 129,2 x 125,5 Schermatura superficie mq: 1,621 N°1 da 69,5 x 235,4 Schermatura superficie mq: 1,636 N°1 da 219,3 x 265,5 Schermatura superficie mq: 5,822 N°1 da 69 x 125,6 Schermatura superficie mq: 0,8666 N°1 da 129,7 x 235,3 Schermatura superficie mq: 3,0518 N°1 da 128,5 x 235,4 Schermatura superficie mq: 3,024 N°1 da 79 x 74,8 Schermatura superficie mq: 0,590 classe 3 G tot 0,34
3 Tende da sole cassonata N°2 da 390 x 210 Schermatura superficie mq: 8,19 N°1 da 425 x 210 Schermatura superficie mq: 8,925 N°3 motori classe 3 G tot 0,19
METODO DI PAGAMENTO
Totale documento 11.730,40 €`, "righetti-saldo.pdf");

    expect(parsed.result.itemCount).toBe(12);
    expect(parsed.items.map((item) => item.surfaceM2)).toEqual([
      6.754, 6.754,
      1.621, 1.636, 5.822, 0.8666, 3.0518, 3.024, 0.59,
      8.19, 8.19, 8.925,
    ]);
    expect(parsed.items.slice(0, 2).every((item) => item.description.includes("motorizzata"))).toBe(true);
    expect(parsed.items.slice(2, 9).every((item) => item.description.includes("zanzariera") && item.gTot === 0.34)).toBe(true);
    expect(parsed.items.slice(9).every((item) => item.description.includes("motorizzata") && item.gTot === 0.19)).toBe(true);
  });
  it("mantiene ordine, superficie e movimento per due tende LM diverse", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. FPR 384/26 del 22/07/2026
LM TENDE DA SOLE E ZANZARIERE S.R.L.
PRODOTTI E SERVIZI
1 Fattura saldo per fornitura e posa di Tenda mini chiocciola N°1 da 350 x 185 Motorizzata Schermatura superficie mq: 6,475 G tot 0,08
2 Tenda da sole a caduta N°1 da 105 x 200 argano manuale Schermatura superficie mq: 2,100 G tot 0,08
METODO DI PAGAMENTO
Totale documento 3.120,00 €`, "chiolini-saldo.pdf");

    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 3500, heightMm: 1850, surfaceM2: 6.475, description: "Tenda da sole motorizzata" }),
      expect.objectContaining({ widthMm: 1050, heightMm: 2000, surfaceM2: 2.1, description: "Tenda da sole a caduta" }),
    ]);
  });
  it("regressione Pasinato: legge larghezza e profondita' di una pergotenda dal modulo d'ordine tecnico VA.ILA. 'MODULO ORDINE OPEN HOUSE' quando la fattura stessa non riporta alcuna misura", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA
nr. FPR 94/26 del 02/03/2026
PRODOTTI E SERVIZI
1 RIF.CONFERMA D'ORDINE 2002SS- IMMOBILE SITO
IN SEVESO (MB) - VIA ENRICO FERMI, 19B -
FORNITURA N. 1 PERGOTENDA - INTERVENTO IN
ECOBONUS L.296
Totale documento 7.000,00 €

MODULO ORDINE OPEN HOUSE alluminio
Modello
S120
Qta
1
Larghezza
campata L1
cm
Motore laterale DX
Larghezza totale
L
cm 500
Larghezza
campata L2
cm
Motore laterale SX
Profondità
Matore centrale a MURO
SP
Avorio 1013
Cm 300
Altezza parete
HD
cm 390`, "pasinato.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 5000,
      heightMm: 3000,
      gTot: null,
      description: "Pergotenda",
    })]);
  });

  it("regressione Pescatori: riconosce il trigger 'Schermatura solare' del fallback narrativo a singolo prodotto gia' autorizzato per pergotenda/tenda da sole", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 18/2026 del 14/05/2026
DESCRIZIONE IMPORTO
Schermatura solare modello Compact
Larghezza 300cm
Sporgenza 250 cm
Colore 9016 biabca
Valore Gtot 0,08
€ 1.600,00`, "pescatori.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 3000,
      heightMm: 2500,
      gTot: 0.08,
    })]);
  });

  it("non applica il trigger 'Schermatura solare' quando la fattura dichiara una quantita' plurale (resta fail-closed come il fallback esistente)", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 19/2026 del 14/05/2026
Schermatura solare modello Compact
Quantita 2
Larghezza 300cm
Sporgenza 250 cm
Valore Gtot 0,08`, "pescatori-plurale.pdf");
    expect(parsed.items).toHaveLength(0);
  });

  it("regressione Padoani: riconosce 'misure WxH ed WxH' come due tende da sole fisicamente distinte, senza dedurre mai il gTot qui", () => {
    const parsed = parseScreeningInvoiceText(`Tipologia documento Art. 73 Numero documento Data documento
TD01 fattura 42/00 03-08-2026
Fornitura ed istallazione di 2 tende da sole a caduta con cassonetto di cui 1 con guide laterali e motore con telecomando ed 1 con ganci a ringhiera, misure 396x241 ed 182x241 colore struttura bianco soft elegance ed telo tempotest 6234/197.
Schermature solari dinamiche ai sensi del D.L.S 311/2006 allegato M`, "padoani.pdf");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items).toContainEqual(expect.objectContaining({ widthMm: 3960, heightMm: 2410, gTot: null }));
    expect(parsed.items).toContainEqual(expect.objectContaining({ widthMm: 1820, heightMm: 2410, gTot: null }));
    // Il gTot resta responsabilita' del solo classificatore condiviso (famiglia "tenda" -> 0,13 di fallback).
    const attributes = resolveProductTechnicalAttributes(parsed.items[0].description, "", parsed.items[0].gTot);
    expect(attributes).toMatchObject({ gTot: 0.13, source: "authorized_fallback" });
  });

  it("regola generale di Giuliano (2026-09-08): 'veneziana' segue esattamente lo stesso trattamento delle persiane, incluse letture OCR degradate 'Venezianita'/'Venezianina'", () => {
    const parsedSaldo = parseScreeningInvoiceText(`FATTURA nr. 198/2026 del 16/06/2026
Venezianita coiere bianco da 25mm L 116x99,5 no gucte salte
75,00 €`, "monti-saldo.pdf");
    expect(parsedSaldo.items).toEqual([expect.objectContaining({
      widthMm: 1160,
      heightMm: 995,
      description: expect.stringContaining("Persiana"),
    })]);
    const parsedAcconto = parseScreeningInvoiceText(`FATTURA nr. 113/2026 del 15/04/2026
Venezianina colore bianco da 25mm L116x99,5 no
75,00 €`, "monti-acconto.pdf");
    expect(parsedAcconto.items).toEqual([expect.objectContaining({ widthMm: 1160, heightMm: 995 })]);
    // Stesso gTot di default (0,06) e stesso materiale/resistenza termica gia' autorizzati per le persiane.
    const attributes = resolveProductTechnicalAttributes(parsedSaldo.items[0].description, "", parsedSaldo.items[0].gTot);
    expect(attributes).toMatchObject({ gTot: 0.06, source: "authorized_fallback", material: "Metallo", supplementaryThermalResistance: 0.17 });
  });

  it("non estende il trattamento persiana al plurale gia' autorizzato 'Veneziane' (formato narrativo distinto, famiglia tenda)", () => {
    const parsed = parseScreeningInvoiceText("Fattura n. FATTURA165/2026 del 22/05/2026\nFornitura e posa in opera Veneziane da 50mm complete di accessori e guide\nN04 Da l 1290x3000\nTotale documento 1.450,00 €", "veneziane-plurale.pdf");
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items.every((item) => !/persiana/i.test(item.description))).toBe(true);
  });
  it("non riconosce una pergotenda dal modulo VA.ILA. se manca una delle due misure (larghezza o profondita')", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA
nr. FPR 1/26 del 01/01/2026
FORNITURA N. 1 PERGOTENDA
MODULO ORDINE OPEN HOUSE alluminio
Larghezza totale
L
cm 500
Totale documento 1.000,00 €`, "pergotenda-incompleta.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("fa prevalere la superficie esplicita Rinaldi sul prodotto delle misure", () => {
    const parsed = parseScreeningInvoiceText(`RINALDI
Fattura n. 814/26 del 23/07/2026
PERGOLA ROOM DIM. L. CM 540 X SP. CM 532 SUPERFICIE SCHERMATURA 28,72 mq G TOT 0,02
Totale documento 6.550,01 €`, "maranesi-saldo.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 5400, heightMm: 5320, surfaceM2: 28.72, gTot: 0.02 }),
    ]);
  });
  it("preserva sei avvolgibili ODHAUS senza riclassificarli come tende", () => {
    const parsed = parseScreeningInvoiceText(`ODHAUS S.R.L.
fattura n. 97/001 del 14/05/2026
AVVOLGIBILE IN ALLUMINIO COIBENTATO - 810X229 + AVVOLGIMENTO
AVVOLGIBILE IN ALLUMINIO COIBENTATO - 1350X229 + AVVOLGIMENTO
AVVOLGIBILE IN ALLUMINIO COIBENTATO - 1100X2290 + AVVOLGIMENTO
AVVOLGIBILE IN ALLUMINIO COIBENTATO - 1100X2290 + AVVOLGIMENTO
AVVOLGIBILE IN ALLUMINIO COIBENTATO - 1110X2290 + AVVOLGIMENTO
AVVOLGIBILE IN ALLUMINIO COIBENTATO - 600X2290 + AVVOLGIMENTO
Totale € 2.976,80`, "percaccioli.pdf");
    expect(parsed.items).toHaveLength(6);
    expect(parsed.items.map((item) => [item.widthMm, item.heightMm, item.description])).toEqual([
      [810, 2290, "Avvolgibile in alluminio"], [1350, 2290, "Avvolgibile in alluminio"],
      [1100, 2290, "Avvolgibile in alluminio"], [1100, 2290, "Avvolgibile in alluminio"],
      [1110, 2290, "Avvolgibile in alluminio"], [600, 2290, "Avvolgibile in alluminio"],
    ]);
    expect(parsed.items[0].measurementAudit).toMatchObject({ widthResolution: "inferred_mm", heightResolution: "inferred_cm", ruleId: USER_AUTHORIZED_RULE_IDS.avvolgibileScreening });
  });
  it("non attribuisce all'avvolgibile il PVC della riga Infissi successiva", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA n. 176/26 del 23/04/2026
1 fornitura e posa di Tapparella in alluminio N. 1 da 143 x 185 cm
2 Infissi PVC esterno bianco N. 3 da 1390 x 1600
Totale documento 3.446,50 €`, "misto-tapparella-infissi.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 1430,
      heightMm: 1850,
      description: "Tapparella in alluminio",
    })]);
  });
  it("espande il gruppo multipagina e ignora 14x55 della lamella", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA n. 124 del 11/07/2026
Chiusure oscuranti avvolgibili in alluminio media densità 14x55 mm
Dimensioni L x H:
1525 x 1706 mm (strutturalmente non integrato) Pezzi 1
925 x 1706 mm (strutturalmente non integrato) Pezzi 1
1529 x 1706 mm (strutturalmente non integrato) Pezzi 2
Zanzariere finitura bianco
Totale fattura € 3.839,18`, "cdf-group.pdf");
    expect(parsed.items.filter((item) => /Avvolgibile/.test(item.description))).toEqual([
      expect.objectContaining({ widthMm: 1525, heightMm: 1706 }),
      expect.objectContaining({ widthMm: 925, heightMm: 1706 }),
      expect.objectContaining({ widthMm: 1529, heightMm: 1706 }),
      expect.objectContaining({ widthMm: 1529, heightMm: 1706 }),
    ]);
    expect(parsed.items.some((item) => item.widthMm === 14 && item.heightMm === 55)).toBe(false);
  });
  it("espande il riepilogo compatto degli avvolgibili con quantita per misura", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA n. 9 del 06/07/2026
Superficie Avvolgibili in alluminio media densità / L1545mm x h1700mm - 5 pz; L910mm x h1700mm - 1 pz; L915mm x h1700mm - 1 pz / colore ral 9003
Pagina: 22 / 23
Totale documento € 12.772,40`, "grk-summary.pdf");
    expect(parsed.items).toHaveLength(7);
    expect(parsed.items.filter((item) => item.widthMm === 1545 && item.heightMm === 1700)).toHaveLength(5);
    expect(parsed.items.map((item) => item.description)).toEqual(Array(7).fill("Avvolgibile in alluminio"));
  });
  it("espande due persiane e normalizza misure senza unita espresse in centimetri", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. P-1 del 18/08/2026
N. 2 PERSIANE IN ALLUMINIO MISURE 120 x 245 G TOT 0,11
Totale documento 2.400,00 €`, "persiane-cm.pdf");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items).toEqual(Array(2).fill(expect.objectContaining({
      widthMm: 1200,
      heightMm: 2450,
      surfaceM2: 2.94,
      gTot: 0.11,
      description: "Persiana in alluminio",
      measurementAudit: expect.objectContaining({ explicitUnit: null, widthResolution: "inferred_cm", heightResolution: "inferred_cm" }),
    })));
  });
  it("normalizza millimetri e conserva motore e audit della persiana", () => {
    const parsed = parseScreeningInvoiceText(`Fattura n. P-2 del 18/08/2026
PERSIANA MOTORIZZATA IN ALLUMINIO MISURE IN MM 900 x 2450
Totale documento 1.200,00 €`, "persiana-mm.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 900,
      heightMm: 2450,
      gTot: null,
      description: "Persiana in alluminio motorizzata",
      measurementAudit: expect.objectContaining({ explicitUnit: "mm", widthResolution: "explicit_mm", heightResolution: "explicit_mm" }),
    })]);
  });
  it("regressione Garbato: preferisce 'Misure Luce Architettonica: LxH' alla prima coppia di numeri incidentale (es. la sede della guida di scorrimento) trovata prima nel blocco", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 1 del 01/01/2026
Persiana INGRESSO scorrevole manuale in Alluminio 20 mm
Doghe verticali cieche
Guida inferiore esistente incassata 17x18 (Vedi disegno e foto allegate)
Colore Antine e Telaio: Bianco RAL 9010 OPACO
Pezzi: n° 1
Misure Luce Architettonica: 2520 x 2710 mm
Totale documento 4.800,00 €`, "garbato.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({
      widthMm: 2520,
      heightMm: 2710,
      description: "Persiana in alluminio",
      measurementAudit: expect.objectContaining({ explicitUnit: "mm", widthResolution: "explicit_mm", heightResolution: "explicit_mm" }),
    })]);
  });
  it("senza l'etichetta 'Misure Luce Architettonica' resta la prima coppia trovata (nessuna regressione sul comportamento esistente)", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 2 del 01/01/2026
Persiana in alluminio misure 120x200
Totale documento 900,00 €`, "senza-etichetta-architettonica.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 1200, heightMm: 2000 })]);
  });
  it("regressione Codognato: legge il formato Finestra Italia '(L=NNN;A=NNN;)' per le persiane, indipendentemente dagli infissi della stessa fattura", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 620
DESCRIZIONE D.D.T. NR. D1F260270 DEL 16-06-2026
ORDINE:38685
Persiana finestra 1 anta (L=660;A=1.365;)
Persiana portafinestra 2 ante con cremonese
(L=1.290;A=2.350;)
Persiana finestra 3 ante (L=2.220;A=1.420;)
Totale documento 693,00`, "codognato-persiane.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 660, heightMm: 1365, description: "Persiana in alluminio" }),
      expect.objectContaining({ widthMm: 1290, heightMm: 2350, description: "Persiana in alluminio" }),
      expect.objectContaining({ widthMm: 2220, heightMm: 1420, description: "Persiana in alluminio" }),
    ]);
  });
  it("non conta una posizione Finestra (infissi) come persiana quando compaiono nella stessa fattura", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 1
Finestra 1 anta - Sistema PV6K (L=665;A=1.435;)
Persiana finestra 1 anta (L=660;A=1.365;)
Totale documento 100,00`, "mista.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 660, heightMm: 1365, description: "Persiana in alluminio" })]);
  });
  it("normalizza cm e mm entro i limiti ampi di plausibilita refuso", () => {
    expect(normalizePersianaMeasure(120, "width", null)).toEqual({ millimeters: 1200, resolution: "inferred_cm" });
    expect(normalizePersianaMeasure(1200, "width", null)).toEqual({ millimeters: 1200, resolution: "inferred_mm" });
    expect(normalizePersianaMeasure(245, "height", null)).toEqual({ millimeters: 2450, resolution: "inferred_cm" });
    expect(normalizePersianaMeasure(2450, "height", null)).toEqual({ millimeters: 2450, resolution: "inferred_mm" });
    expect(normalizePersianaMeasure(500, "width", "mm")).toEqual({ millimeters: 500, resolution: "explicit_mm" });
    expect(normalizePersianaMeasure(4000, "width", "mm")).toEqual({ millimeters: 4000, resolution: "explicit_mm" });
    expect(normalizePersianaMeasure(499, "width", "mm")).toBeNull();
    expect(normalizePersianaMeasure(4001, "width", "mm")).toBeNull();
    expect(normalizePersianaMeasure(450, "height", "mm")).toEqual({ millimeters: 450, resolution: "explicit_mm" });
    expect(normalizePersianaMeasure(3200, "height", "mm")).toEqual({ millimeters: 3200, resolution: "explicit_mm" });
    expect(normalizePersianaMeasure(449, "height", "mm")).toBeNull();
    expect(normalizePersianaMeasure(3201, "height", "mm")).toBeNull();
  });
  it("non tratta una dichiarazione sostitutiva come seconda fattura", () => {
    const parsed = parseScreeningInvoiceText(`DICHIARAZIONE SOSTITUTIVA DELL’ATTO DI NOTORIETA’
DICHIARA di aver ricevuto la somma di € 2.976,80 a fronte della fattura n. 97/001 del 14/05/2026`, "dichiarazione.pdf");
    expect(parsed.result).toMatchObject({ documentType: "unknown", total: null, itemCount: 0 });
  });
  it("riconosce il totale lordo IVA incluso isolato nella seconda pagina", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 161/2026 del 12/06/2026
RIEPILOGO IVA IMPORTO LORDO IMPOSTE
22% 2.040,00 € 367,87
10% 1.100,00 € 100,00
Imponibile € 2.672,13
Totale IVA € 467,87
€ 3.140,00
Fattura nr. 161/2026 del 12/06/2026 - 2 / 2`, "lagrasta.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "161/2026", documentDate: "2026-06-12", total: 3140 });
  });
  it("riconosce il lordo S.A. Montaggi quando imponibile e' in coda alla riga aliquota", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 211/2026 del 22/07/2026
RIEPILOGO IVA IMPORTO LORDO IMPOSTE
22% 3.030,00 € 546,39
10% 370,00 € 33,64
0% 0,00 € 0,00 Imponibile € 2.819,97
Totale IVA € 580,03
€ 3.400,00
Fattura nr. 211/2026 del 22/07/2026 - 2 / 2`, "farinelli.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "211/2026", documentDate: "2026-07-22", total: 3400 });
  });
  it("legge due tende Suman elencate nella stessa descrizione e non confonde l'IVA col totale", () => {
    const parsed = parseScreeningInvoiceText(`SUMAN GIANNI
Fattura Numero 9 del 31/03/2026
Effettuata vendita piu installazione di tende da sole a
1.650,00 22
Manuali
braccia estensibili Mis Mt 410 x 225 e 360 x 225
Beni detraibili in quanto schermature solari ai sensi
D.L del 311/2006 Allegato G.tot 0.13 Classe 3
Totale imponibile
1.850,00
Totale IVA
407,00
Totale documento
22
22% - GENERICO
1.850.00
407,00
2.257,00`, "martinez.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "9", documentDate: "2026-03-31", total: 2257, itemCount: 2 });
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 4100, heightMm: 2250, gTot: 0.13 }),
      expect.objectContaining({ widthMm: 3600, heightMm: 2250, gTot: 0.13 }),
    ]);
  });
  it("preferisce la cardinalita narrativa completa quando il gTot Vans e' dichiarato in chiusura", () => {
    const parsed = parseScreeningInvoiceText(`Vans Tappezzeria SRLS
fattura 202/2026 del 19/06/2026
Fornitura e posa di:
N. 1 Tenda verticale con guide laterali tessuto oscurante L.88,8xh.164
N. 1 Tenda verticale con guide laterali tessuto oscurante L.87xh.248
N. 1 Tenda da sole L.80xh.160,tessuto GALA 25688
Pratica Enea compresa G TOT 0,10 CLASSE 3
Totale Fattura € 875,00`, "moro.pdf");
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.map((item) => [item.widthMm, item.heightMm, item.gTot])).toEqual([
      [888, 1640, 0.1], [870, 2480, 0.1], [800, 1600, 0.1],
    ]);
  });
  it("non usa un importo isolato che non coincide con imponibile piu IVA", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 161/2026 del 12/06/2026
Imponibile € 2.672,13
Totale IVA € 467,87
€ 3.141,00`, "totale-incoerente.pdf");
    expect(parsed.result.total).toBeNull();
  });
  it("regola generale di Giuliano (Laurelli): senza un'etichetta piu' specifica, con piu' righe 'Totale' vince sempre l'ultima (dopo lo storno dell'acconto interno)", () => {
    const parsed = parseScreeningInvoiceText(`Fattura Accompagnatoria n. 169/A del 02/07/2026
Descrizione
Importo
IVA
Totale
SALDO: FORNITURA E POSA TENDE DA SOLE VOSTRO APPARTAMENTO.
N. 2 TENDE DA 400 X 200, COMPLETE DI TESSUTO E ACCESSORI SU
MISURA, GTOT 0,12 CLASSE 3
4.599,40 €
22%
4.599,40 €
ACCONTO: FATTURA N. 135/A DEL 13/06/2026
-840,00 €
22%
-840,00 €
Termini di Pagamento
Imponibile
3.081,47 €
Imposta 22%
677,93 €
Totale
3.759,40 €
Scadenze:
3.759.40 € il 02/07/2026 - Bonifico`, "laurelli-169A.pdf");
    expect(parsed.result.total).toBe(3759.4);
  });
  it("regola generale di Giuliano: una sola riga 'Totale' resta quella usata (non e' richiesta la presenza di uno storno)", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 200/2026 del 01/01/2026
Descrizione Importo
Fornitura tende da sole
1.000,00 €
Totale
1.220,00 €`, "totale-singolo.pdf");
    expect(parsed.result.total).toBe(1220);
  });
  it("regola generale di Giuliano (Laurelli): riconosce la misura 'N. <n> TEND[AE] DA <numero> X <numero>' anche senza le etichette esplicite L./H.", () => {
    const parsed = parseScreeningInvoiceText(`Fattura Accompagnatoria n. 169/A del 02/07/2026
SALDO: FORNITURA E POSA TENDE DA SOLE VOSTRO APPARTAMENTO.
N. 2 TENDE DA 400 X 200, COMPLETE DI TESSUTO E ACCESSORI SU
MISURA, GTOT 0,12 CLASSE 3 "SCHERMATURA SOLARE DINAMICA AI
SENSI DEL D.L 311/2006 ALLEGATO M" IN OPERA A CORPO`, "laurelli-misura.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 4000, heightMm: 2000, gTot: 0.12, description: "Tenda da sole" }),
      expect.objectContaining({ widthMm: 4000, heightMm: 2000, gTot: 0.12, description: "Tenda da sole" }),
    ]);
  });
  it("regola generale di Giuliano: non riconosce come misura un 'TENDA DA SOLE' generico dove 'DA' introduce del testo, non due numeri", () => {
    const parsed = parseScreeningInvoiceText(`N. 1 TENDA DA SOLE motorizzata con telecomando
GTOT 0,13`, "tenda-da-sole-generica.pdf");
    expect(parsed.items).toEqual([]);
  });
  it("legge il formato Rinaldi DIM.L CM x SP.CM con gTot documentato", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA ACCOMPAGNATORIA 411/26 DATA
09/07/2026
STORBOX TENDA A BRACCI ESTENSIBILI DIM.L CM 256 X SP.CM 225
CLASSE DI SCHERMATURA G TOT 0,13
Totale € 1.450,00`, "rinaldi.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 2560, heightMm: 2250, gTot: 0.13 })]);
  });
  it("regola generale di Giuliano (Ferletic): due coppie di misure 'N) L. ... X H ...' nella stessa descrizione tenda sono sempre due prodotti fisici distinti", () => {
    const parsed = parseScreeningInvoiceText(`IDEA TENDE DI CERESA ROBERTO
FATTURA nr. 25/2026 del 16/06/2026
DESCRIZIONE IMPORTO
INSTALLAZIONE TENDA DA SOLE A CADUTA MOD. 3000
1) L. 75 X H 220
Mod. T4 senza cassonetto
1) L. 400 x h 220
TESSUTO TEMPOTEST 5009/1 SCHERMATURA SOLARE DINAMICA AI SENSI DL 311/2006 ALLEGATO M -
GTOT 0,13-
CLASSE DI SCHERMATURA 3
€ 1.803,28`, "ferletic.pdf");
    expect(parsed.items).toEqual([
      expect.objectContaining({ widthMm: 750, heightMm: 2200, gTot: 0.13, description: "Tenda da sole a caduta" }),
      expect.objectContaining({ widthMm: 4000, heightMm: 2200, gTot: 0.13, description: "Tenda da sole a caduta" }),
    ]);
  });
  it("regola generale di Giuliano: una sola coppia di misure 'N) L. ... X H ...' non attiva la regola delle due coppie (non inventa mai una seconda riga)", () => {
    const parsed = parseScreeningInvoiceText(`TENDA DA SOLE A CADUTA MOD. 3000
1) L. 300 X H 220
GTOT 0,13
Totale € 900,00`, "ferletic-singola.pdf");
    expect(parsed.items.filter((item) => item.description === "Tenda da sole a caduta")).toHaveLength(0);
  });

  it("regressione Biagioni/Riviera: legge numero e data documento del fornitore Finestra Italia quando etichette e valori sono in due blocchi separati", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA DI VENDITA
COD. CLI.
PARTITA IVA
CODICE FISCALE
TELEFONO
FAX
AGENTE
N° DOCUMENTO DATA DOCUMENTO
PAG.
CONDIZIONI DI PAGAMENTO
026062
BGNNCL60E45I684G
3384659283
TERRITORY
BANCA D'APPOGGIO
809
29-07-26
1/1
BONIFICO BANCARIO VF
TOTALE FATTURA
EUR 280,28`, "finestra-italia-saldo.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "809", documentDate: "2026-07-29", total: 280.28 });
  });

  it("regressione Biagioni/Riviera: legge numero e data anche quando il valore segnaposto 'BANCA D'APPOGGIO' non separa numero e data (adiacenti)", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA DI VENDITA ACCONTI
COD. CLI.
PARTITA IVA
CODICE FISCALE
TELEFONO
FAX
AGENTE
N° DOCUMENTO DATA DOCUMENTO
PAG.
CONDIZIONI DI PAGAMENTO
026062
BGNNCL60E45I684G
3384659283
TERRITORY
515
19-05-26
1/1
PAGAMENTO EFFETTUATO
TOTALE FATTURA
EUR 1.121,12`, "finestra-italia-acconto.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "515", documentDate: "2026-05-19", total: 1121.12 });
  });

  it("regressione Biagioni/Riviera: legge numero e data anche quando 'BANCA D'APPOGGIO' si intromette DOPO il numero, subito prima della data", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA DI VENDITA
COD. CLI.
PARTITA IVA
CODICE FISCALE
TELEFONO
FAX
AGENTE
N° DOCUMENTO DATA DOCUMENTO
PAG.
CONDIZIONI DI PAGAMENTO
026003
RVRLTT59E56A859V
3473410054
TERRITORY
641
BANCA D'APPOGGIO
25-06-26
1/1
BONIFICO BANCARIO VF
TOTALE FATTURA
EUR 602,80`, "finestra-italia-saldo-2.pdf");
    expect(parsed.result).toMatchObject({ documentNumber: "641", documentDate: "2026-06-25", total: 602.8 });
  });

  it("regressione Lavezzi: non usa 'Totale contratto' come totale documento, riconosce il vero totale dalla riconciliazione Imponibile+IVA", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA nr. 5/2026 del 13/01/2026
DESCRIZIONE IMPORTO
ACCONTO 50%
Vostro dare per fornitura e posa di tenda da sole, presso vostra abitazione in Saint-Vincent in Via Prof. A. Ferrè n.25
censita al catasto fabbricati al fg 50 mappale 80 subalterno 18.
Totale contratto 2'200,00 € ivati
Acconto 50%
Saldo 50%
€ 901,64
SCADENZE
13/01/2026: € 1.100,00
RIEPILOGO IVA IMPONIBILE IMPOSTE
22% 901,64 € 198,36
Imponibile € 901,64
Totale IVA € 198,36
€ 1.100,00`, "lavezzi-acconto.pdf");
    expect(parsed.result.total).toBe(1100);
  });

  it("regola generale gia' esistente confermata: senza 'Totale contratto/commessa' di mezzo, l'ultima riga 'Totale' non etichettata resta usata come prima", () => {
    const parsed = parseScreeningInvoiceText(`Fornitura e posa in opera
Totale
€ 3.660,00`, "totale-bare-invariato.pdf");
    expect(parsed.result.total).toBe(3660);
  });

  it("regressione Biagioni/Riviera: legge il vero totale quando 'SCADENZE' si intromette dopo 'Totale fattura', prima del riepilogo imponibile/IVA/lordo", () => {
    const parsed = parseScreeningInvoiceText(`ACCONTO
Secondo acconto su fornitura e posa in opera di
NR
1,00 1.274,0000
1.274,00 10D
TOTALE IMPONIBILE
TOTALE IVA
TOTALE ESENTE
NETTO A PAGARE
TOTALE FATTURA
SCADENZE
1.274,00
127,40
EUR
1.401,40
EUR
1.401,40
21-07-26 Alt
1.401,40`, "finestra-italia-scadenze.pdf");
    expect(parsed.result.total).toBe(1401.4);
  });

  it("regressione Biagioni/Riviera: legge il vero totale anche quando 'EUR' e l'importo condividono la stessa riga", () => {
    const parsed = parseScreeningInvoiceText(`TOTALE IMPONIBILE
TOTALE IVA
TOTALE ESENTE
INETTO A PAGARE
TOTALE FATTURA
SCADENZE
2.192,00
219,20
EUR 2.411,20
EUR
2.411,20
13-03-26 Alt
2.411,20`, "finestra-italia-scadenze-stessa-riga.pdf");
    expect(parsed.result.total).toBe(2411.2);
  });

  it("regressione Biagioni: tollera la parentesi iniziale prodotta dall'OCR su 'SCADENZE' ('(SCADENZE')", () => {
    const parsed = parseScreeningInvoiceText(`TOTALE IMPONIBILE
TOTALE IVA
TOTALE ESENTE
INETTO A PAGARE
TOTALE FATTURA
(SCADENZE
254,80
25,48
EUR
280,28
EUR
280,28
29-07-26 Bon VF
280,28`, "finestra-italia-scadenze-parentesi.pdf");
    expect(parsed.result.total).toBe(280.28);
  });

  it("senza la sigla 'EUR' entro le righe successive, la variante 'SCADENZE' non si applica (resta fail-closed sul resto della logica generica)", () => {
    const parsed = parseScreeningInvoiceText(`TOTALE FATTURA
SCADENZE
1.274,00
127,40
1.401,40`, "finestra-italia-scadenze-senza-eur.pdf");
    expect(parsed.result.total).toBe(1274);
  });

  it("non riconosce numero/data dal formato Finestra Italia senza l'ancora della pagina 'N/N' subito dopo la data (resta fail-closed)", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA DI VENDITA
COD. CLI.
PARTITA IVA
CODICE FISCALE
TELEFONO
FAX
AGENTE
N° DOCUMENTO DATA DOCUMENTO
PAG.
CONDIZIONI DI PAGAMENTO
026062
BGNNCL60E45I684G
3384659283
TERRITORY
BANCA D'APPOGGIO
809
29-07-26
BONIFICO BANCARIO VF
TOTALE FATTURA
EUR 280,28`, "finestra-italia-senza-pagina.pdf");
    expect(parsed.result.documentNumber).toBeUndefined();
    expect(parsed.result.documentDate).toBeUndefined();
  });
});
