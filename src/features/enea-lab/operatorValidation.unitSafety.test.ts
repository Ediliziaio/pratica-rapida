import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione correzioni operatore · coerenza unità fisiche", () => {
  it("rifiuta unità esplicite incompatibili con il campo numerico", () => {
    expect(validateOperatorOverride("impianto.potenza", "25 m²").valid).toBe(false);
    expect(validateOperatorOverride("immobile.superficie", "140 kW").valid).toBe(false);
    expect(validateOperatorOverride("schermature.spesa", "100 kW").valid).toBe(false);
    expect(validateOperatorOverride("schermature.risparmio_energia", "100 €").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.rsupp", "0,08 kWh/anno").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.gtot", "0,13 kW").valid).toBe(false);
  });

  it("continua ad accettare unità coerenti oppure il solo numero", () => {
    expect(validateOperatorOverride("impianto.potenza", "25 kW").valid).toBe(true);
    expect(validateOperatorOverride("immobile.superficie", "140 m²").valid).toBe(true);
    expect(validateOperatorOverride("schermature.spesa", "100 €").valid).toBe(true);
    expect(validateOperatorOverride("schermature.risparmio_energia", "100 kWh/anno").valid).toBe(true);
    expect(validateOperatorOverride("schermature.0.rsupp", "0,08 Km²/W").valid).toBe(true);
    expect(validateOperatorOverride("schermature.0.gtot", "0,13").valid).toBe(true);
    expect(validateOperatorOverride("impianto.potenza", "25").valid).toBe(true);
  });
});
