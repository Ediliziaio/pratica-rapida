import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione spesa congrua ENEA", () => {
  it("rifiuta una spesa congrua nulla prima del gate official", () => {
    expect(validateOperatorOverride("schermature.spesa", "0 €").valid).toBe(false);
  });

  it("continua ad accettare una spesa congrua positiva verificata", () => {
    expect(validateOperatorOverride("schermature.spesa", "13.924 €").valid).toBe(true);
  });
});
