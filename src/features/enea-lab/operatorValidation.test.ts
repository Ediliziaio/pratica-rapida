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
    expect(validateOperatorOverride("schermature.0.esposizione", "Direzione inventata").valid).toBe(false);
    expect(validateOperatorOverride("schermature.risparmio_energia", "non calcolato").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.dimensioni", "80 x 1200").valid).toBe(false);
    expect(validateOperatorOverride("impianto.numero_generatori", "0").valid).toBe(false);
    expect(validateOperatorOverride("impianto.numero_generatori", "1,5").valid).toBe(false);
    expect(validateOperatorOverride("impianto.potenza", "0 kW").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.rsupp", "0,08 x 2").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.superficie", "2 x 9 m²").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.superficie", "0 m²").valid).toBe(false);
    expect(validateOperatorOverride("schermature.0.superficie_finestrata", "0 m²").valid).toBe(false);
    expect(validateOperatorOverride("schermature.superficie_totale", "0 m²").valid).toBe(false);
    expect(validateOperatorOverride("immobile.superficie", "0 m²").valid).toBe(false);
    expect(validateOperatorOverride("beneficiario.cf", "RSSMRA80A01H501X").valid).toBe(false);
    expect(validateOperatorOverride("beneficiario.data_nascita", "01/01/2080").valid).toBe(false);
  });

  it("non accetta identificativi fiscali di soggetti IVA come beneficiari persone fisiche", () => {
    expect(validateOperatorOverride("beneficiario.cf", "12345678901").valid).toBe(false);
    expect(validateOperatorOverride("beneficiario.cointestatario_cf", "12345678901").valid).toBe(false);
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
    expect(validateOperatorOverride("schermature.spesa", "1.000 €").valid).toBe(true);
    expect(validateOperatorOverride("schermature.superficie_totale", "14,5 m²").valid).toBe(true);
    expect(validateOperatorOverride("immobile.superficie", "140 m²").valid).toBe(true);
    expect(validateOperatorOverride("beneficiario.sesso", "f")).toEqual({ valid: true, value: "F" });
    expect(validateOperatorOverride("beneficiario.abitazione_principale", "si")).toEqual({ valid: true, value: "Sì" });
    expect(validateOperatorOverride("impianto.tipo", "A. IMPIANTO AUTONOMO")).toEqual({
      valid: true,
      value: "a. impianto autonomo",
    });
    expect(validateOperatorOverride("schermature.0.esposizione", "sud-est")).toEqual({ valid: true, value: "Sud-Est" });
    expect(validateOperatorOverride("schermature.0.esposizione", "nord-est")).toEqual({ valid: true, value: "Nord-Est" });
    expect(validateOperatorOverride("schermature.0.dimensioni", "1200x1450")).toEqual({
      valid: true,
      value: "1200 × 1450 mm",
    });
    expect(validateOperatorOverride("impianto.numero_generatori", "2")).toEqual({ valid: true, value: "2" });
    expect(validateOperatorOverride("impianto.potenza", "26,4 kW").valid).toBe(true);
  });

  it("limita il numero di schermature per evitare una scheda ingestibile", () => {
    expect(validateOperatorOverride("schermature.numero", "50")).toMatchObject({ valid: true, value: "50" });
    expect(validateOperatorOverride("schermature.numero", "51")).toMatchObject({ valid: false });
    expect(validateOperatorOverride("schermature.numero", "100000")).toMatchObject({ valid: false });
  });
});
