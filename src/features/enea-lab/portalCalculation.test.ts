import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaCalculationPortalScript } from "./portalCalculation";

describe("pagina calcolo ENEA", () => {
  it("espone soltanto il risparmio prodotto dalla policy versionata e non salva", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
    });
    const preparation = buildEneaCalculationPortalScript(mapped);
    expect(preparation.readyFieldIds).toEqual(["schermature.risparmio_energia"]);
    expect(preparation.runtime.fields).toHaveLength(1);
    expect(preparation.runtime.fields[0]).toMatchObject({ portalId: "id-risp", control: "input" });
    expect(preparation.script).not.toMatch(/\.submit\s*\(|\bpreview\b|\banteprima\b|\binvia\b/i);
    expect(preparation.allocationRuntime).toBeNull();
  });

  it("prepara l'intero totale 2025-2026 al 36% per una seconda abitazione", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.richiedente.abitazione_principale = false;
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      includeTestConventions: true,
      financialReconciliationVerified: true,
      reconciledEligibleExpense: 10_478.07,
    });
    const preparation = buildEneaCalculationPortalScript(mapped);
    expect(preparation.readyFieldIds).toContain("schermature.spesa");
    expect(preparation.allocationRuntime).toMatchObject({
      pageName: "Allocazione costi e detrazioni",
      hostRoute: "calcolo",
      fields: [],
      expenseAllocation: {
        fieldId: "schermature.spesa",
        interventionLabel: "Schermature solari",
        value: "10478.07",
        rate: 36,
      },
    });
    expect(preparation.allocationRuntime?.expenseAllocation?.appliedRuleIds).toContain("user-2026-08-16-secondary-home-36-percent-calculation-allocation");
  });
});
