import { describe, expect, it } from "vitest";
import { extractBankTransferEvidence, extractBankTransferEvidences, firstBankTransferHeaderIndex, reconcileBankTransfers } from "./bankTransferEvidence";

describe("evidenza bonifici separata dalle fatture", () => {
  const first = extractBankTransferEvidence("bonifico-1", `CONFERMA ORDINE DI BONIFICO SEPA PER DETRAZIONI FISCALI
Importo: e 2160,00
Commissioni: e 1,00
Totale: e 2161,00
FATTURA 131/2026.ACCONTO`)!;
  const second = extractBankTransferEvidence("bonifico-2", `CONFERMA ORDINE DI BONIFICO SEPA PER DETRAZIONI FISCALI
Importo: € 5.770,00
Commissioni: € 1,00
Totale: € 5.771,00
FATTURA N. 253/2026`)!;

  it("estrae capitale, commissioni e totale senza classificare una fattura ordinaria", () => {
    expect(first).toMatchObject({ principalAmount: 2160, fees: 1, debitedTotal: 2161, invoiceReference: "131/2026.ACCONTO" });
    expect(second).toMatchObject({ principalAmount: 5770, fees: 1, debitedTotal: 5771, invoiceReference: "253/2026" });
    expect(extractBankTransferEvidence("fattura", "Fattura 253/2026\nTotale Fattura € 5.770,00")).toBeNull();
  });

  it("usa il capitale e non l'addebito comprensivo di spese", () => {
    expect(reconcileBankTransfers(7930, [first, second])).toMatchObject({ status: "reconciled", principalTotal: 7930, feesTotal: 2, debitedTotal: 7932, difference: 0 });
    expect(reconcileBankTransfers(7929, [first, second])).toMatchObject({ status: "principal_exceeds_invoices", difference: 1 });
    expect(reconcileBankTransfers(8000, [first, second])).toMatchObject({ status: "principal_below_invoices", difference: -70 });
  });

  it("applica EUR 0,05 di tolleranza al capitale e blocca da EUR 0,06", () => {
    expect(reconcileBankTransfers(7929.95, [first, second])).toMatchObject({ status: "reconciled", difference: 0.05, feesTotal: 2 });
    expect(reconcileBankTransfers(7929.94, [first, second])).toMatchObject({ status: "principal_exceeds_invoices", difference: 0.06, feesTotal: 2 });
  });

  it("separa due bonifici Intesa contenuti nello stesso PDF multipagina", () => {
    const transfers = extractBankTransferEvidences("intesa-composito", `Presa in carico - Bonifico per Agevolazioni Fiscali
Causale
fattura n.208/2026 del 23/06/2026
Importo
Commissioni
1.831,50 Euro
0,00 Euro
Totale operazione
1.831,50 Euro
\f
Presa in carico - Bonifico per Agevolazioni Fiscali
Causale
Pag. ft 252/2026 del 20/07/2026 saldo
Importo
Commissioni
1.831,50 Euro
0,00 Euro
Totale operazione
1.831,50 Euro`);
    expect(transfers).toEqual([
      expect.objectContaining({ sourceId: "intesa-composito:transfer-1", principalAmount: 1831.5, fees: 0, debitedTotal: 1831.5, invoiceReference: "208/2026" }),
      expect.objectContaining({ sourceId: "intesa-composito:transfer-2", principalAmount: 1831.5, fees: 0, debitedTotal: 1831.5, invoiceReference: "252/2026" }),
    ]);
    expect(reconcileBankTransfers(3663, transfers)).toMatchObject({ status: "reconciled", principalTotal: 3663, difference: 0 });
  });

  it("separa ricevute bancarie eterogenee e riconcilia i totali anche se le etichette OCR sono sfalsate", () => {
    const transfers = extractBankTransferEvidences("mixed-bank", `Presa in carico - Bonifico per Agevolazioni Fiscali
Fattura n 715/00 del 31/12/2025
Commissioni
0,50 Euro
Totale operazione
3.950,00 Euro
3.950,50 Euro
Importo
\f
BONIFICO AGEVOLAZIONI FISCALI
COMMISSIONI
3.950,00
TOT. A VS. CRED.
Rif. Pag.: Fattura numero 630/00 del 26/11/2025
3.950,00
A VS. CREDITO
A VS. DEBITO`);
    expect(transfers).toEqual([
      expect.objectContaining({ principalAmount: 3950, fees: 0.5, debitedTotal: 3950.5, invoiceReference: "715/00" }),
      expect.objectContaining({ principalAmount: 3950, fees: null, debitedTotal: null, invoiceReference: "630/00" }),
    ]);
    expect(reconcileBankTransfers(7900, transfers, ["630/00", "715/00"])).toMatchObject({
      status: "reconciled", principalTotal: 7900, referenceStatus: "verified", missingInvoiceReferences: [],
    });
  });

  it("resta fail-closed se il prospetto credito/debito contiene più importi ripetuti", () => {
    const transfer = extractBankTransferEvidence("ambiguous-bank", `BONIFICO AGEVOLAZIONI FISCALI
COMMISSIONI
3.950,00
TOT. A VS. CRED.
Rif. Pag.: Fattura numero 630/00
3.950,00
1,00
1,00
A VS. CREDITO
A VS. DEBITO`);
    expect(transfer).toMatchObject({ principalAmount: null });
  });

  it("riconosce la ricevuta BONIFICO AGEVOLAZIONE FISCALE senza trasformarla in fattura", () => {
    const transfer = extractBankTransferEvidence("moro-bonifico", `BONIFICO AGEVOLAZIONE FISCALE
Disposizione di bonifico numero 901435 inoltrata per l'esecuzione.
Importo: 375,00 €
Causale/N.fattura: Acconto su fattura 104 2026 del 20 04 2026
Data di esecuzione: 10/04/2026`);
    expect(transfer).toMatchObject({ sourceId: "moro-bonifico", principalAmount: 375, fees: null, debitedTotal: null, invoiceReference: "104" });
  });

  it("riconosce il dettaglio movimento Desio e ignora un modulo bonifico vuoto", () => {
    const transfer = extractBankTransferEvidence("desio-321", `Desio Web Remote Banking Movimenti consolidati
Dare: Avere:
1.949,37
Bonifico Instant agevolazioni fisc - CIPRIANI FLAVIA
Cro: 2607223289575823ZX0320000000IT
Note: Secondo acconto Fattura 321/FE 22.07.2026`);
    expect(transfer).toMatchObject({ sourceId: "desio-321", principalAmount: 1949.37, invoiceReference: "321/FE" });
    expect(extractBankTransferEvidence("modulo-vuoto", `Certificazione bonifico risparmio energetico (L. 296/06)
Importo in euro Data esecuzione Causale
Commissioni e spese
Codice riferimento (TRN)
Beneficiario CF / P. IVA IBAN`)).toBeNull();
  });

  it("riconosce il dettaglio movimento mobile con importo a debito e riferimento fattura", () => {
    const transfer = extractBankTransferEvidence("mobile", `Dettaglio movimento
Bonifico A Debito A Favore Di Innova Serramenti Fattura Numero 315 Fe Del 16.12.2025 Saldo
Rif=0303235100190622zx6644066440it
Importo
- 1.645,20€`);
    expect(transfer).toMatchObject({ principalAmount: 1645.2, invoiceReference: "315/FE", transactionReference: "0303235100190622zx6644066440it" });
  });

  it("legge il TRN quando il layout bancario mette il valore nella riga successiva", () => {
    const transfer = extractBankTransferEvidence("trn-verticale", `Presa in carico - Bonifico per Agevolazioni Fiscali
Importo
Commissioni
660,00 Euro
0,60 Euro
Totale operazione
660,60 Euro
TRN
SALDO TENDA DA SOLE
0306913432570507S90179101791IT`);
    expect(transfer).toMatchObject({ principalAmount: 660, transactionReference: "0306913432570507S90179101791IT" });
  });

  it("riconosce anche l'abbreviazione Ft nelle ricevute mobile", () => {
    const transfer = extractBankTransferEvidence("mobile-ft", `Dettaglio movimento
Bonifico A Debito A Favore Di Innova Serramenti Ft 274 Fe Del 20 11 25 Secondo Acconto
Rif=0303234300211122zx6644066440it
Importo
- 2.467,82€`);
    expect(transfer).toMatchObject({ principalAmount: 2467.82, invoiceReference: "274/FE", transactionReference: "0303234300211122zx6644066440it" });
  });

  it("estrae il tipo fiscale e verifica che ogni fattura abbia un bonifico associato", () => {
    const renovation = extractBankTransferEvidence("moro-acconto", `BONIFICO AGEVOLAZIONE FISCALE
Importo: 375,00 €
Causale/N.fattura: Acconto su fattura 104 2026
Tipo detrazione: Ristrutturazione edilizia
Art. 16-bis, D.P.R. n. 917/1986 Ristr. Edil.`)!;
    const energy = extractBankTransferEvidence("moro-saldo", `BONIFICO AGEVOLAZIONE FISCALE
Importo: 875,00 €
Causale/N.fattura: SALDO FATTURA 202 2026
Tipo detrazione: Risparmio energetico
L. 296/06 e succ. mod. e proroghe Risp.Energ.`)!;
    expect(renovation.taxReliefType).toBe("building_renovation");
    expect(energy.taxReliefType).toBe("energy_saving");
    expect(reconcileBankTransfers(1250, [renovation, energy], ["104/2026", "202/2026"])).toMatchObject({
      status: "reconciled",
      principalTotal: 1250,
      referenceStatus: "verified",
      missingInvoiceReferences: [],
      taxReliefTypes: expect.arrayContaining(["building_renovation", "energy_saving"]),
    });
    expect(reconcileBankTransfers(1250, [energy], ["104/2026", "202/2026"])).toMatchObject({
      status: "principal_below_invoices",
      referenceStatus: "incomplete",
      missingInvoiceReferences: ["104/2026"],
    });
  });

  it("regressione Manso: riconosce la ricevuta bancaria 'SERVIZIO PAGAMENTI/ORDINANTE' con commissioni bancarie", () => {
    const transfer = extractBankTransferEvidence("manso-264", `SERVIZIO PAGAMENTI/ORDINANTE
ABBIAMO RICEVUTO L'ORDINE DI BONIFICO INDICATO, AL QUALE ABBIAMO
DATO ESECUZIONE IN CONFORMITA' ALLE VOSTRE ISTRUZIONI.
EUR *1.320,00*
CON APPLICAZIONE DI COMMISSIONI: SU VS C/C IMPORTO EUR *0,40*
N.FAT:264 DEL 08/07/26
SALDO fattura num. 264 del 08-07-2026 per fornitura tenda da sole
TOTALE: EUR 1.320,40`);
    expect(transfer).not.toBeNull();
  });

  it("regressione Mastrangelo: riconosce la ricevuta 'OGGETTO: Ricevuta Pagamento Bonifico' ING Bank", () => {
    const transfer = extractBankTransferEvidence("mastrangelo-1", `MILANO, 03 LUGLIO 2026
OGGETTO: Ricevuta Pagamento
Bonifico
IMPORTO IN EURO
1.497,34 €
DESCRIZIONE / CAUSALE
Fattura di saldo per produzione e installazione infissi comm 1139/2026`);
    expect(transfer).toMatchObject({ principalAmount: 1497.34 });
  });

  it("regressione Coda: riconosce la ricevuta Banco BPM 'Dettaglio disposizione: Bonifico per detrazioni' anche quando il segmento non contiene piu' l'intestazione originale", () => {
    // La segmentazione per fattura puo' separare l'intestazione "Dettaglio
    // disposizione" dal resto della stessa ricevuta quando piu' ricevute e
    // fatture condividono lo stesso allegato: il marcatore "A favore di
    // (P.iva o CF)" + "Tipologia fruitore della detrazione" resta presente
    // in ogni segmento della stessa ricevuta.
    const segmentWithoutHeader = extractBankTransferEvidences("coda-130", `FATTURA N 130/2026
del
24/04/2026
A favore di (P.iva o CF)
03397500962
Tipologia fruitore della detrazione
PERSONA FISICA
CF
CDORCR50A30A859R
POSA IN OPERA
ACCONTO 50 PC TENDA SOLE CON MOTORE TELEC IMPIANTO ELETTRICO COLLEG AD ANEMOMETRO`);
    expect(segmentWithoutHeader).not.toEqual([]);
  });

  it("regressione Ronconi (2026-09-08): firstBankTransferHeaderIndex individua l'intestazione bancaria dopo una fattura vera gia' completa", () => {
    const text = `Fattura n. 545/26 del 05/06/2026\nTotale documento 600,00 EUR\nCONFERMA ORDINE DI BONIFICO SEPA PER DETRAZIONE FISCALE\nImporto disposto: EUR 600,00`;
    const index = firstBankTransferHeaderIndex(text);
    expect(index).not.toBeNull();
    expect(text.slice(0, index!)).toBe("Fattura n. 545/26 del 05/06/2026\nTotale documento 600,00 EUR\n");
  });

  it("firstBankTransferHeaderIndex restituisce null in assenza di qualunque marcatore bancario", () => {
    expect(firstBankTransferHeaderIndex("Fattura n. 10 del 01/01/2026\nTotale documento 100,00 EUR")).toBeNull();
  });

  it("controprova 'Presa in carico': l'intestazione bancaria e' all'inizio del testo quando la ricevuta cita numero/data/importo soltanto nella propria causale", () => {
    const text = `Presa in carico - Bonifico per Agevolazioni Fiscali\nfattura n.208/2026 del 23/06/2026\nTotale operazione\n1.831,50 Euro`;
    expect(firstBankTransferHeaderIndex(text)).toBe(0);
  });

  it("non riconosce come bonifico una fattura ordinaria che cita soltanto 'a favore di' senza il contesto di una ricevuta bancaria", () => {
    expect(extractBankTransferEvidences("fattura-ordinaria", `FATTURA
nr. FATTURA204/2026 del 19/06/2026
FORNITORE
LINEA SOLE POTITO SRL
PRODOTTI E SERVIZI
Tenda da Sole S/81E Pantografo a bracci
Totale documento 1.050,50 €`)).toEqual([]);
  });
});
