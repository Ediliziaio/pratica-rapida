import { describe, expect, it } from "vitest";

import {
  calculatePaymentPricing,
  createTestPaymentPricing,
  isCadastralServiceRequested,
} from "../../supabase/functions/_shared/fic-pricing";

const common = {
  simaResellerId: "sima",
  standardNetCents: 15_000,
  simaNetCents: 10_000,
  cadastralNetCents: 1_000,
  vatPercent: 22,
  product: "ENEA",
};

describe("prezzi Fatture in Cloud / TS Pay", () => {
  it("limita il collaudo tecnico a 1 euro IVA inclusa", () => {
    const result = createTestPaymentPricing();
    expect(result.pricingKey).toBe("prezzo_test_pagamento");
    expect(result.lines.map((line) => line.code)).toEqual(["PR-TEST"]);
    expect(result.netCents).toBe(82);
    expect(result.vatCents).toBe(18);
    expect(result.grossCents).toBe(100);
  });

  it("calcola il CF ordinario con due righe separate quando richiede il catasto", () => {
    const result = calculatePaymentPricing({
      ...common,
      tipoFatturazione: "cliente_finale",
      resellerId: "altro",
      cadastralService: true,
    });
    expect(result.netCents).toBe(16_000);
    expect(result.grossCents).toBe(19_520);
    expect(result.lines.map((line) => line.code)).toEqual(["PR-CF", "PR-CATASTO"]);
  });

  it("calcola Sima Home con ricerca catastale", () => {
    const result = calculatePaymentPricing({
      ...common,
      tipoFatturazione: "cliente_finale",
      resellerId: "sima",
      cadastralService: true,
    });
    expect(result.netCents).toBe(11_000);
    expect(result.grossCents).toBe(13_420);
  });

  it("addebita al cliente ordinario soltanto la ricerca catastale", () => {
    const result = calculatePaymentPricing({
      ...common,
      tipoFatturazione: "rivenditore",
      resellerId: "altro",
      cadastralService: true,
    });
    expect(result.pricingKey).toBe("prezzo_servizio_catastale");
    expect(result.lines).toHaveLength(1);
    expect(result.netCents).toBe(1_000);
    expect(result.grossCents).toBe(1_220);
  });

  it("riconosce la scelta anche dagli schemi dinamici storici", () => {
    expect(isCadastralServiceRequested({ catastali: { recupero_richiesto: "true" } })).toBe(true);
    expect(isCadastralServiceRequested({ catastali: { recupero_richiesto: false } })).toBe(false);
  });
});
