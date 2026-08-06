import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";

describe("validazione correzioni operatore", () => {
  it("rifiuta formati strutturati non validi", () => {
    expect(validateOperatorOverride("beneficiario.email", "email-sbagliata").valid).toBe(false);
    expect(validateOperatorOverride("immobile.cap", "2012").valid).toBe(false);
    expect(validateOperatorOverride("immobile.zona_climatica", "G").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.gtot", "0,42").valid).toBe(false);
    expect(validateOperatorOverride("immobile.gradi_giorno", "nessun numero").valid).toBe(false);
    expect(validateOperatorOverride("beneficiario.sesso", "testo libero").valid).toBe(false);
    expect(validateOperatorOverride("beneficiario.telefono", "123").valid).toBe(false);
    expect(validateOperatorOverride("impianto.tipo", "impianto inventato").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.esposizione", "Nord").valid).toBe(false);
    expect(validateOperatorOverride("schermature.risparmio_energia", "non calcolato").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.dimensioni", "80 x 1200").valid).toBe(false);
  });

  it("accetta e normalizza valori verificabili", () => {
    expect(validateOperatorOverride("beneficiario.cf", "rssmra80a01h501u")).toEqual({
      valid: true,
      value: "RSSMRA80A01H501U",
    });
    expect(validateOperatorOverride("immobile.codice_comune", "h501")).toEqual({
      valid: true,
      value: "H501",
    });
    expect(validateOperatorOverride("schermature.0.gtot", "0,13").valid).toBe(true);
    expect(validateOperatorOverride("schermature.0.superficie_finestrata", "2,9 m²").valid).toBe(true);
    expect(validateOperatorOverride("beneficiario.sesso", "f")).toEqual({ valid: true, value: "F" });
    expect(validateOperatorOverride("beneficiario.abitazione_principale", "si")).toEqual({ valid: true, value: "Sì" });
    expect(validateOperatorOverride("impianto.tipo", "autonomo")).toEqual({ valid: true, value: "Autonomo" });
    expect(validateOperatorOverride("schermature.0.esposizione", "sud-est")).toEqual({ valid: true, value: "Sud-Est" });
    expect(validateOperatorOverride("schermature.0.dimensioni", "1200x1450")).toEqual({
      valid: true,
      value: "1200 × 1450 mm",
    });
  });

  it("limita il numero di schermature per evitare una scheda ingestibile", () => {
    expect(validateOperatorOverride("schermature.numero", "50")).toMatchObject({ valid: true, value: "50" });
    expect(validateOperatorOverride("schermature.numero", "51")).toMatchObject({ valid: false });
    expect(validateOperatorOverride("schermature.numero", "100000")).toMatchObject({ valid: false });
  });
});
