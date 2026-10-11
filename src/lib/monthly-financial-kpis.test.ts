import { describe, expect, it } from "vitest";
import { calculateMonthlyFinancialKpis, fallbackMonthlyPracticePrice } from "./monthly-financial-kpis";

describe("calculateMonthlyFinancialKpis", () => {
  const now = new Date("2026-10-15T12:00:00+02:00");

  it("calcola soltanto il mese corrente e mantiene gli importi netti IVA", () => {
    const result = calculateMonthlyFinancialKpis([
      { revenue_at: "2026-10-01T08:00:00Z", prezzo: 65, pagamento_stato: "pagata" },
      { revenue_at: "2026-10-02T08:00:00Z", prezzo: "100", pagamento_stato: "non_pagata" },
      { revenue_at: "2026-09-30T08:00:00Z", prezzo: 999, pagamento_stato: "pagata" },
    ], now);

    expect(result).toEqual({ fatturato: 165, incassato: 65, daIncassare: 100, pratiche: 2, senzaPrezzo: 0, senzaPrezzoLabels: [] });
  });

  it("include le pratiche chiuse ricevute dalla query e tratta in verifica come da incassare", () => {
    const result = calculateMonthlyFinancialKpis([
      { revenue_at: "2026-10-03T08:00:00Z", prezzo: 65, pagamento_stato: "in_verifica" },
      { revenue_at: "2026-10-04T08:00:00Z", prezzo: 65, pagamento_stato: "rimborsata" },
    ], now);

    expect(result).toEqual({ fatturato: 65, incassato: 0, daIncassare: 65, pratiche: 2, senzaPrezzo: 0, senzaPrezzoLabels: [] });
  });

  it("usa il listino netto quando una pratica rivenditore legacy ha prezzo zero", () => {
    const result = calculateMonthlyFinancialKpis([
      {
        revenue_at: "2026-10-03T08:00:00Z",
        prezzo: 0,
        prezzo_listino: 65,
        pagamento_stato: "non_pagata",
      },
    ], now);

    expect(result).toEqual({ fatturato: 65, incassato: 0, daIncassare: 65, pratiche: 1, senzaPrezzo: 0, senzaPrezzoLabels: [] });
  });

  it("rispetta il cambio mese nel fuso Europe/Rome", () => {
    const result = calculateMonthlyFinancialKpis([
      { revenue_at: "2026-09-30T22:30:00Z", prezzo: 65, pagamento_stato: "pagata" },
      { revenue_at: "2026-10-31T23:30:00Z", prezzo: 70, pagamento_stato: "pagata" },
    ], now);

    expect(result).toEqual({ fatturato: 65, incassato: 65, daIncassare: 0, pratiche: 1, senzaPrezzo: 0, senzaPrezzoLabels: [] });
  });

  it("segnala le pratiche senza prezzo invece di far sembrare completo il totale", () => {
    const result = calculateMonthlyFinancialKpis([
      { label: "Mario Rossi", revenue_at: "2026-10-03T08:00:00Z", prezzo: 0, prezzo_listino: 0, pagamento_stato: "non_pagata" },
    ], now);

    expect(result).toEqual({ fatturato: 0, incassato: 0, daIncassare: 0, pratiche: 1, senzaPrezzo: 1, senzaPrezzoLabels: ["Mario Rossi"] });
  });
});

describe("fallbackMonthlyPracticePrice", () => {
  it.each([
    ["rivenditore", "Brianza Serramenti", 60],
    ["rivenditore", "Vans Tappezzeria", 60],
    ["rivenditore", "Rinaldi Lab", 75],
    ["rivenditore", "FV Tende", 65],
    ["rivenditore", "Service Casa", 65],
    ["cliente_finale", "Sima Home", 100],
    ["cliente_finale", "Tenda System SRLS", 150],
  ])("applica il listino a %s / %s", (tipoFatturazione, resellerName, expected) => {
    expect(fallbackMonthlyPracticePrice({ tipoFatturazione, resellerName })).toBe(expected);
  });
});
