import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";
import { ENEA_SCREENING_PORTAL_FIELDS } from "./portalScreening";

describe("esposizione orizzontale ENEA osservata", () => {
  it("accetta e normalizza P-orizzontale nell'inserimento operatore", () => {
    expect(validateOperatorOverride("schermature.0.esposizione", "p-orizzontale")).toEqual({
      valid: true,
      value: "P-orizzontale",
    });
  });

  it("mantiene il codice portale osservato 311", () => {
    const exposure = ENEA_SCREENING_PORTAL_FIELDS.find((field) => field.portalId === "id-esp");
    expect(exposure?.selectValues?.["P-orizzontale"]).toBe("311");
  });
});
