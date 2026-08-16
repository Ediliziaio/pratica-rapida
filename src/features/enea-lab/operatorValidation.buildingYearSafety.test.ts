import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione anno immobile", () => {
  it("rifiuta sintassi numeriche JavaScript anche se rappresentano un anno plausibile", () => {
    expect(validateOperatorOverride("immobile.anno", "2e3").valid).toBe(false);
    expect(validateOperatorOverride("immobile.anno", "0x7E8").valid).toBe(false);
  });

  it("continua ad accettare un anno decimale esplicito nel range ammesso", () => {
    expect(validateOperatorOverride("immobile.anno", "2000")).toEqual({ valid: true, value: "2000" });
  });
});
