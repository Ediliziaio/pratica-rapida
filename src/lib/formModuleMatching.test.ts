import { describe, expect, it } from "vitest";

import { findFormModuleByProdotto } from "./formModuleMatching";

const modules = [
  { slug: "enea-infissi", prodotto_match: ["infiss", "serrament"] },
  { slug: "enea-vepa", prodotto_match: ["vepa", "vetrat"] },
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

  it("non abbina prodotti senza un pattern configurato", () => {
    expect(findFormModuleByProdotto(modules, "Fotovoltaico")).toBeNull();
  });
});
