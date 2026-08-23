import { describe, expect, it } from "vitest";
import { comparisonScope, requiredCrmManualComparisonExclusions } from "./comparisonPolicy";

describe("scope confronto CRM manuale", () => {
  it("esclude i quattro gruppi richiesti in TEST", () => {
    expect(requiredCrmManualComparisonExclusions(true)).toEqual([
      "dati impianto termico", "risparmio energetico stimato", "finestre protette", "data fine lavori",
    ]);
  });

  it("non usa documenti ENEA storici e non esclude la data fuori TEST", () => {
    expect(comparisonScope(false)).toMatchObject({
      forbiddenSource: "documenti ENEA storici",
      excludedFields: ["dati impianto termico", "risparmio energetico stimato", "finestre protette"],
    });
  });
});
