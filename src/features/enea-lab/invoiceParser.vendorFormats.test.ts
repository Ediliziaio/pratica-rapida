import { describe, expect, it } from "vitest";
import { combineDocumentResults, containsHistoricalEneaAppendix, normalizePersianaMeasure, parseScreeningInvoiceText, parseScreeningTechnicalSourceText, stripHistoricalEneaAppendix } from "./invoiceParser";
import { USER_AUTHORIZED_RULE_IDS } from "../enea-shadow-crm/operationalRegistry";

describe("invoiceParser formati rivenditore originari", () => {
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
  it("legge il formato Rinaldi DIM.L CM x SP.CM con gTot documentato", () => {
    const parsed = parseScreeningInvoiceText(`FATTURA ACCOMPAGNATORIA 411/26 DATA
09/07/2026
STORBOX TENDA A BRACCI ESTENSIBILI DIM.L CM 256 X SP.CM 225
CLASSE DI SCHERMATURA G TOT 0,13
Totale € 1.450,00`, "rinaldi.pdf");
    expect(parsed.items).toEqual([expect.objectContaining({ widthMm: 2560, heightMm: 2250, gTot: 0.13 })]);
  });
});
