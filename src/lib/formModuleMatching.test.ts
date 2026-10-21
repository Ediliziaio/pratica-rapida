import { describe, expect, it } from "vitest";

import { findFormModuleByProdotto } from "./formModuleMatching";

const modules = [
  { slug: "enea-infissi", prodotto_match: ["infiss", "serrament"] },
  { slug: "enea-vepa", prodotto_match: ["vepa", "vetrat"] },
  { slug: "enea-fotovoltaico-off-grid", prodotto_match: ["fotovoltaico off-grid", "fotovoltaico off grid"] },
];

describe("findFormModuleByProdotto", () => {
  it.each([
    "Vepa",
    "VEPA – Vetrate Panoramiche",
    "Installazione di vetrate panoramiche amovibili",
  ])("instrada %s al modulo VEPA", (prodotto) => {
    expect(findFormModuleByProdotto(modules, prodotto)?.slug).toBe("enea-vepa");
  });

  it("continua a distinguere il modulo infissi", () => {
    expect(findFormModuleByProdotto(modules, "Infissi / Serramenti")?.slug).toBe("enea-infissi");
  });

  it("instrada il fotovoltaico off-grid al modulo ENEA dedicato", () => {
    expect(findFormModuleByProdotto(modules, "Fotovoltaico off-grid domestico")?.slug)
      .toBe("enea-fotovoltaico-off-grid");
  });

  it("non confonde l'off-grid con il fotovoltaico GSE", () => {
    expect(findFormModuleByProdotto(modules, "Fotovoltaico")).toBeNull();
    expect(findFormModuleByProdotto(modules, "Allaccio fotovoltaico GSE")).toBeNull();
  });
});
