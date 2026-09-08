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

  it("usa la spesa congrua Rinaldi esplicita seguita dall'importo", () => {
    const result = applyRinaldiScopedFinancialRules([{ ...base, explicitDeductibleLines: [
      { lineId: "d", lineNumber: 17, text: "Spese congrue sostenute in base ai massimali ammessi", amount: 3_134.06, extractionConfidence: "certain" },
    ] }], { mode: "test", scheme: "ecobonus" });
    expect(result.effectiveEneaAmounts).toEqual({ "fattura-1": 3_134.06 });
    expect(result.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.rinaldiExplicitDeductibleTotal);
    expect(result.auditNotes[0]).toContain("importo_pratica=3134.06");
  });

  it("non somma altre fatture Rinaldi alla spesa congrua esplicita della pratica", () => {
    const result = applyRinaldiScopedFinancialRules([
      { ...base, sourceId: "acconto", documentNumber: "A-1", grossTotal: 858, explicitDeductibleLines: [] },
      { ...base, sourceId: "saldo", documentNumber: "S-1", grossTotal: 2_102, explicitDeductibleLines: [
        { lineId: "d", text: "Totale spese congrue sostenute in base ai massimali ammessi", amount: 2_276.06, extractionConfidence: "certain" },
      ] },
    ], { mode: "test", scheme: "ecobonus" });
    expect(result.effectiveEneaAmounts).toEqual({ acconto: 0, saldo: 2_276.06 });
    expect(Object.values(result.effectiveEneaAmounts).reduce((sum, value) => sum + value, 0)).toBe(2_276.06);
    expect(result.auditNotes[0]).toContain("lordi_fatture=2960.00");
  });

  it("blocca due importi di spesa congrua Rinaldi discordanti nella stessa pratica", () => {
    const result = applyRinaldiScopedFinancialRules([
      { ...base, sourceId: "fattura-1", explicitDeductibleLines: [{ lineId: "d1", text: "Spese congrue sostenute in base ai massimali ammessi", amount: 3_000, extractionConfidence: "certain" }] },
      { ...base, sourceId: "fattura-2", explicitDeductibleLines: [{ lineId: "d2", text: "Spese congrue sostenute in base ai massimali ammessi", amount: 3_100, extractionConfidence: "certain" }] },
    ], { mode: "test", scheme: "ecobonus" });
    expect(result.effectiveEneaAmounts).toEqual({});
    expect(result.blockers).toEqual(["rinaldi-totale-detraibile-ambiguo:fattura-1", "rinaldi-totale-detraibile-ambiguo:fattura-2"]);
  });

  it("senza riga spese congrue Rinaldi non sostituisce il lordo fattura", () => {
    const result = applyRinaldiScopedFinancialRules([{ ...base, explicitDeductibleLines: [] }], { mode: "test", scheme: "ecobonus" });
    expect(result.effectiveEneaAmounts).toEqual({});
    expect(result.blockers).toEqual([]);
    expect(result.appliedRuleIds).not.toContain(USER_AUTHORIZED_RULE_IDS.rinaldiExplicitDeductibleTotal);
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
