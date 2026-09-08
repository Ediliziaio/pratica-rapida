import { describe, expect, it } from "vitest";
import { classifyScreeningProduct, resolveScreeningGTot } from "./productClassifier";

describe("classificatore condiviso e politica gTot", () => {
  it.each([
    ["Zanzariera plissettata", null, "zanzariera", 0.33],
    ["Pergola bioclimatica", null, "pergola", 0.06],
    ["Persiana in alluminio", null, "persiana", 0.06],
    ["Tapparella coibentata", null, "tapparella", 0.06],
    ["Avvolgibile", null, "avvolgibile", 0.06],
    ["Tenda da sole", null, "tenda", 0.13],
    ["Schermatura generica", null, "generico", 0.13],
  ])("applica un solo fallback per famiglia a %s", (description, declared, family, expected) => {
    expect(classifyScreeningProduct(description, declared)).toMatchObject({ family, fallbackAuthorized: true });
    expect(resolveScreeningGTot(description, declared, null)).toMatchObject({ value: expected, source: "authorized_fallback" });
  });

  it("preserva 0,08 quando è davvero documentato", () => {
    expect(resolveScreeningGTot("Tenda da sole", "tenda", 0.08)).toMatchObject({ value: 0.08, source: "invoice_explicit" });
  });

  it.each(["Cristal trasparente", "Prodotto non classificato", ""])("fallisce chiuso senza una famiglia con fallback autorizzato per %s", (description) => {
    expect(resolveScreeningGTot(description, null, null)).toMatchObject({ value: null, source: "operator_required" });
  });

  it("non sostituisce il gTot documentato della tenda con il fallback 0,13", () => {
    expect(resolveScreeningGTot("Tenda da sole", null, 0.08)).toMatchObject({
      value: 0.08,
      source: "invoice_explicit",
      ruleId: "user-2026-08-31-documented-gtot-precedence-v1",
    });
  });

  it("non deduce alcuna famiglia dal solo form quando la fattura non offre alcuna descrizione (nessun allargamento della classificazione generale)", () => {
    expect(classifyScreeningProduct("", "tende_da_sole")).toMatchObject({ family: "generico" });
    expect(resolveScreeningGTot("", "tende_da_sole", null)).toMatchObject({ value: null, source: "operator_required" });
  });

  it("regressione Fiorini: guarda il form prima di fermarsi per operatore quando la fattura usa un sottotipo ambiguo ('cristal')", () => {
    expect(resolveScreeningGTot("Tenda tecnica a caduta zip T2Q teli cristal trasparente", "tende_da_sole", null)).toMatchObject({
      value: 0.13,
      source: "authorized_fallback",
      ruleId: "user-2026-09-07-form-declared-type-resolves-classification-ambiguity-v1",
    });
  });

  it("resta fail-closed per il sottotipo 'cristal' quando il form non dichiara nulla di utile", () => {
    expect(resolveScreeningGTot("Cristal trasparente", null, null)).toMatchObject({ value: null, source: "operator_required" });
    expect(resolveScreeningGTot("Cristal trasparente", "pergola", null)).toMatchObject({ value: null, source: "operator_required" });
  });

  it("non tratta un generico suggerimento di famiglia interno ('tenda') come dichiarazione autentica del form (non-conflitto con userAuthorizedPolicies: Cristal senza gTot documentato resta bloccato)", () => {
    expect(resolveScreeningGTot("Tenda cristal guidata con motore", "tenda", null)).toMatchObject({ value: null, source: "operator_required" });
  });
});
