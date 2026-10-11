import { describe, expect, it } from "vitest";
import { cfNetPriceEurFromSettings } from "./cfPracticePrice";

const settings = [
  { key: "prezzo_cf_standard", value: { imponibile_cents: 15000, iva_percent: 22 } },
  { key: "prezzo_cf_sima_home", value: { imponibile_cents: 10000, iva_percent: 22 } },
  { key: "cf_sima_home_company_id", value: { company_id: "sima-id" } },
];

describe("cfNetPriceEurFromSettings", () => {
  it("usa 150 euro per un CF di un rivenditore ordinario", () => {
    expect(cfNetPriceEurFromSettings(settings, "tenda-system-id")).toBe(150);
  });

  it("usa 100 euro soltanto per Sima Home", () => {
    expect(cfNetPriceEurFromSettings(settings, "sima-id")).toBe(100);
  });

  it("si ferma se il prezzo configurato manca", () => {
    expect(() => cfNetPriceEurFromSettings([], "tenda-system-id"))
      .toThrow("Prezzo CF non configurato");
  });
});
