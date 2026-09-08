import { describe, expect, it } from "vitest";
import { isFiscalInvoiceSegment } from "./aprEconomicCorpusReplay";

describe("bridge economico: confine fattura/bonifico", () => {
  it("conserva una fattura reale anche quando lo stesso segmento contiene il bonifico", () => {
    expect(isFiscalInvoiceSegment(`FATTURA nr. 715/00 del 31/12/2025
Tipo documento\nNum. Doc.\nIVA\nImponibile\nTotale documento 3.950,00
Presa in carico - Bonifico per Agevolazioni Fiscali\nTotale operazione 3.950,00`)).toBe(true);
  });

  it("rifiuta fail-closed una ricevuta bancaria che cita numero e data fattura", () => {
    expect(isFiscalInvoiceSegment(`Presa in carico - Bonifico per Agevolazioni Fiscali
Pag. ft 252/2026 del 20/07/2026 saldo
Importo 1.831,50 Euro\nCommissioni 0,00 Euro\nTotale operazione 1.831,50 Euro`)).toBe(false);
  });
});
