import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione meccanismo schermature", () => {
  it("accetta e normalizza Servoassistito", () => {
    expect(validateOperatorOverride("schermature.0.regolazione", "servoassistito")).toEqual({
      valid: true,
      value: "Servoassistito",
    });
  });
});
