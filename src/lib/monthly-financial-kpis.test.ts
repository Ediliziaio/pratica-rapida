import { describe, expect, it } from "vitest";
import { calculateMonthlyFinancialKpis } from "./monthly-financial-kpis";

describe("calculateMonthlyFinancialKpis", () => {
  const now = new Date("2026-10-15T12:00:00+02:00");

  it("calcola soltanto il mese corrente e mantiene gli importi netti IVA", () => {
    const result = calculateMonthlyFinancialKpis([
      { created_at: "2026-10-01T08:00:00Z", prezzo: 65, pagamento_stato: "pagata" },
      { created_at: "2026-10-02T08:00:00Z", prezzo: "100", pagamento_stato: "non_pagata" },
      { created_at: "2026-09-30T08:00:00Z", prezzo: 999, pagamento_stato: "pagata" },
    ], now);

    expect(result).toEqual({ fatturato: 165, incassato: 65, daIncassare: 100, pratiche: 2 });
  });

  it("include le pratiche chiuse ricevute dalla query e tratta in verifica come da incassare", () => {
    const result = calculateMonthlyFinancialKpis([
      { created_at: "2026-10-03T08:00:00Z", prezzo: 65, pagamento_stato: "in_verifica" },
      { created_at: "2026-10-04T08:00:00Z", prezzo: 65, pagamento_stato: "rimborsata" },
    ], now);

    expect(result).toEqual({ fatturato: 65, incassato: 0, daIncassare: 65, pratiche: 2 });
  });

  it("usa il listino netto quando una pratica rivenditore legacy ha prezzo zero", () => {
    const result = calculateMonthlyFinancialKpis([
      {
        created_at: "2026-10-03T08:00:00Z",
        prezzo: 0,
        prezzo_listino: 65,
        pagamento_stato: "non_pagata",
      },
    ], now);

    expect(result).toEqual({ fatturato: 65, incassato: 0, daIncassare: 65, pratiche: 1 });
  });

  it("rispetta il cambio mese nel fuso Europe/Rome", () => {
    const result = calculateMonthlyFinancialKpis([
      { created_at: "2026-09-30T22:30:00Z", prezzo: 65, pagamento_stato: "pagata" },
      { created_at: "2026-10-31T23:30:00Z", prezzo: 70, pagamento_stato: "pagata" },
    ], now);

    expect(result).toEqual({ fatturato: 65, incassato: 65, daIncassare: 0, pratiche: 1 });
  });
});
