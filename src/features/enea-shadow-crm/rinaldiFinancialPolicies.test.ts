import { describe, expect, it } from "vitest";
import { applyRinaldiScopedFinancialRules } from "./rinaldiFinancialPolicies";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

const base = { sourceId: "fattura-1", supplierId: "rinaldi", supplierName: "Rinaldi", documentNumber: "1", grossTotal: 12_000 };

describe("regole finanziarie limitate a Rinaldi", () => {
  it("usa l'unico totale massimo detraibile certo", () => {
    const result = applyRinaldiScopedFinancialRules([{ ...base, explicitDeductibleLines: [
      { lineId: "d", lineNumber: 9, text: "Totale massimo detraibile", amount: 8_000, extractionConfidence: "certain" },
    ] }], { mode: "test", scheme: "ecobonus" });
    expect(result.effectiveEneaAmounts).toEqual({ "fattura-1": 8_000 });
    expect(result.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.rinaldiExplicitDeductibleTotal);
  });

  it("non estende la regola a un fornitore diverso e non inferisce righe ambigue", () => {
    const other = applyRinaldiScopedFinancialRules([{ ...base, supplierId: "altro", supplierName: "Altro", explicitDeductibleLines: [
      { lineId: "d", text: "Totale massimo detraibile", amount: 8_000, extractionConfidence: "certain" },
    ] }], { mode: "test", scheme: "ecobonus" });
    expect(other.effectiveEneaAmounts).toEqual({});
    const ambiguous = applyRinaldiScopedFinancialRules([{ ...base, explicitDeductibleLines: [
      { lineId: "d", text: "Totale forse detraibile", amount: 8_000, extractionConfidence: "uncertain" },
    ] }], { mode: "test", scheme: "ecobonus" });
    expect(ambiguous.blockers).toEqual(["rinaldi-totale-detraibile-ambiguo:fattura-1"]);
  });

  it("separa VEPA dalla pergola soltanto nel TEST Ecobonus", () => {
    const source = { ...base, lineItems: [
      { lineId: "p", text: "Pergola", grossAmount: 8_000, classification: "pergola" as const, extractionConfidence: "certain" as const },
      { lineId: "v", text: "VEPA", grossAmount: 4_000, classification: "vepa" as const, extractionConfidence: "certain" as const },
    ] };
    const test = applyRinaldiScopedFinancialRules([source], { mode: "test", scheme: "ecobonus" });
    expect(test).toMatchObject({ effectiveEneaAmounts: { "fattura-1": 8_000 }, deferredVepaLineIds: ["v"], bonusCasaDraftAllowed: false });
    expect(applyRinaldiScopedFinancialRules([source], { mode: "production", scheme: "ecobonus" }).deferredVepaLineIds).toEqual([]);
  });
});
