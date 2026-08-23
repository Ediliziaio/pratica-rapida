import { describe, expect, it } from "vitest";
import {
  catalogLine,
  convertQuote,
  createQuote,
  DEMO_CATALOG,
  DEMO_COMPANIES,
  documentTotals,
  simulatePracticeRequest,
} from "./domain";

describe("dominio FatturaRapida", () => {
  it("calcola imponibile, IVA e totale senza effetti esterni", () => {
    const totals = documentTotals([{ ...catalogLine(DEMO_CATALOG[0], 1), quantity: 2, unitPrice: 100, vatRate: 22 }]);
    expect(totals).toEqual({ net: 200, vat: 44, gross: 244 });
  });

  it("richiede soltanto gli obblighi mancanti prima della conversione", () => {
    const quote = createQuote("demo-sole", 1);
    expect(convertQuote(quote, DEMO_COMPANIES[0], 1).missing).toEqual([
      "Nome cliente",
      "Codice fiscale o Partita IVA cliente",
      "Indirizzo cliente",
      "Almeno una riga",
    ]);
    quote.customer = { name: "Cliente Demo", taxId: "DEMO0000000000", address: "Via Demo 1", email: "" };
    quote.lines = [catalogLine(DEMO_CATALOG[0], 1)];
    const result = convertQuote(quote, DEMO_COMPANIES[0], 1);
    expect(result.missing).toEqual([]);
    expect(result.invoice?.sourceQuoteId).toBe(quote.id);
    expect(result.invoice?.lines).not.toBe(quote.lines);
  });

  it("prepara la richiesta PraticaRapida solo con lo schema schermature completo", () => {
    const quote = createQuote("demo-sole", 1);
    quote.customer = { name: "Cliente Demo", taxId: "DEMO0000000000", address: "Via Demo 1", email: "" };
    const line = catalogLine(DEMO_CATALOG[0], 1);
    quote.lines = [line];
    const invoice = convertQuote(quote, DEMO_COMPANIES[0], 1).invoice!;
    expect(simulatePracticeRequest(invoice).missing).toEqual([
      "Schermatura 1: tipo prodotto",
      "Schermatura 1: direzione",
      "Schermatura 1: misure",
    ]);
    invoice.lines[0].screening = { productType: "tende_da_sole", manufacturer: "Demo", orientation: "sud", widthCm: 300, heightCm: 200, motorized: false, color: "Demo" };
    const result = simulatePracticeRequest(invoice);
    expect(result.missing).toEqual([]);
    expect(result.request).toMatchObject({ status: "local_simulation", consent: true, companyId: "demo-sole" });
  });
});
