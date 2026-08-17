import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione operatore ENEA - interi canonici", () => {
  it("normalizza gli interi scritti con una parte decimale nulla prima del runtime", () => {
    expect(validateOperatorOverride("immobile.unita", "1,0")).toEqual({
      valid: true,
      value: "1",
    });
    expect(validateOperatorOverride("intervento.unita_oggetto", "2,0")).toEqual({
      valid: true,
      value: "2",
    });
    expect(validateOperatorOverride("impianto.numero_generatori", "3,0")).toEqual({
      valid: true,
      value: "3",
    });
  });
});
