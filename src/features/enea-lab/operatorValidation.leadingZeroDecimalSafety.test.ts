import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione numeri ENEA con frazione a zero iniziale", () => {
  it("non interpreta 0.080 o 0,080 come separatori delle migliaia", () => {
    expect(validateOperatorOverride("schermature.0.gtot", "0.080")).toEqual({
      valid: true,
      value: "0.080",
    });
    expect(validateOperatorOverride("schermature.0.gtot", "0,080")).toEqual({
      valid: true,
      value: "0,080",
    });
  });

  it("mantiene il separatore delle migliaia per importi non ambigui", () => {
    expect(validateOperatorOverride("schermature.spesa", "1.000 €").valid).toBe(true);
  });
});
