import { describe, expect, it } from "vitest";
import { aprAutomationExclusion } from "./aprFutureTestExclusions";

describe("esclusioni permanenti APR per relazione", () => {
  it("riconosce Erre Emme e RM Legno nei campi CRM disponibili", () => {
    expect(aprAutomationExclusion({ customerKey: "massimiliano-montemorra", companies: { ragione_sociale: "RM LEGNO" } })).toMatchObject({ kind: "supplier", canonicalKey: "erre-emme-rm-legno", sourceField: "row.companies.ragione_sociale" });
    expect(aprAutomationExclusion({ customerKey: "cliente-test", fornitore: "Erre Emme S.r.l." })).toMatchObject({ kind: "supplier", canonicalKey: "erre-emme-rm-legno", sourceField: "row.fornitore" });
  });

  it("non estende gli alias a nomi solo parzialmente simili", () => {
    expect(aprAutomationExclusion({ customerKey: "cliente-test", companies: { ragione_sociale: "Evans Serramenti" } })).toBeNull();
    expect(aprAutomationExclusion({ customerKey: "cliente-test", companies: { ragione_sociale: "R.M. Falegnameria" } })).toBeNull();
  });

  it("mantiene esclusa la pratica interna Overthemol per chiave cliente", () => {
    expect(aprAutomationExclusion({ customerKey: "samuele-beretta", companies: { ragione_sociale: "Overthemol S.r.l." } })).toMatchObject({ kind: "customer", canonicalKey: "samuele-beretta" });
  });

  it("esclude la pratica interna PROVA RIVENDITORE 1 30/04 prima dell'elaborazione", () => {
    expect(aprAutomationExclusion({ displayName: "PROVA RIVENDITORE 1 30/04" })).toMatchObject({
      kind: "customer",
      canonicalKey: "prova-rivenditore-1-30-04",
      sourceField: "customerKey",
    });
  });

  it("non estende l'esclusione interna a pratiche dal nome soltanto simile", () => {
    expect(aprAutomationExclusion({ displayName: "PROVA RIVENDITORE 1 30/05" })).toBeNull();
    expect(aprAutomationExclusion({ displayName: "RIVENDITORE 1 30/04" })).toBeNull();
  });

  it("esclude la pratica interna Smaj Hhhhh (dossier interamente fittizio, rivenditore prova samu) prima dell'elaborazione", () => {
    expect(aprAutomationExclusion({ customerKey: "smaj-hhhhh", displayName: "Smaj Hhhhh", companies: { ragione_sociale: "prova samu" } })).toMatchObject({
      kind: "customer",
      canonicalKey: "smaj-hhhhh",
      sourceField: "customerKey",
    });
  });
});
