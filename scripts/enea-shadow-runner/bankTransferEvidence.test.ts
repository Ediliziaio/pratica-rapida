import { describe, expect, it } from "vitest";
import { extractBankTransferEvidence, extractBankTransferEvidences, reconcileBankTransfers } from "./bankTransferEvidence";

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
});
