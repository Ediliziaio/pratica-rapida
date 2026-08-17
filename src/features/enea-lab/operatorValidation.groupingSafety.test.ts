import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione raggruppamenti numerici ENEA", () => {
  it("rifiuta separatori delle migliaia e decimali mescolati in modo malformato", () => {
    expect(validateOperatorOverride("schermature.spesa", "1.234.56 €").valid).toBe(false);
    expect(validateOperatorOverride("immobile.superficie", "12.34.567 m²").valid).toBe(false);
  });

  it("continua ad accettare i raggruppamenti italiani ben formati", () => {
    expect(validateOperatorOverride("schermature.spesa", "1.234,56 €").valid).toBe(true);
    expect(validateOperatorOverride("schermature.spesa", "1.234.567,89 €").valid).toBe(true);
  });
});
