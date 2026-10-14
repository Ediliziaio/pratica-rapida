import { describe, expect, it } from "vitest";
import {
  EMPTY_PHOTOVOLTAICO_INTAKE,
  PHOTOVOLTAICO_IVA_PERCENT,
  PHOTOVOLTAICO_PRICE_EUR,
  PHOTOVOLTAICO_UNIFILARE_PRICE_EUR,
  photovoltaicNetPrice,
  validatePhotovoltaicSubmission,
  type PhotovoltaicIntake,
} from "./intake";

function validBase(): PhotovoltaicIntake {
  return {
    ...EMPTY_PHOTOVOLTAICO_INTAKE,
    statoImpianto: "lavori_non_iniziati",
    parte1: "no",
    proprietarioNome: "Luigi Bianchi",
    proprietarioTelefono: "3337654321",
    proprietarioEmail: "luigi@example.it",
    indirizzoImpianto: "Via Roma 1, Milano",
    schemaUnifilare: "fornito_dal_rivenditore",
    confermaSottoSeiKw: false,
    confermaDati: true,
    accettaCosto: true,
  };
}

describe("validatePhotovoltaicSubmission", () => {
  it("accetta la presa in carico minima del rivenditore", () => {
    expect(validatePhotovoltaicSubmission(validBase())).toEqual([]);
  });

  it("non costringe il rivenditore a trascrivere i dati tecnici", () => {
    const errors = validatePhotovoltaicSubmission({
      ...validBase(),
      statoImpianto: "installato_non_connesso",
    });
    expect(errors).toEqual([]);
  });

  it("non contiene campi manuali per POD e distributore", () => {
    expect("pod" in validBase()).toBe(false);
    expect("distributore" in validBase()).toBe(false);
  });

  it("blocca l'invio se il rivenditore non accetta il costo", () => {
    const errors = validatePhotovoltaicSubmission({ ...validBase(), accettaCosto: false });
    expect(errors).toContain("Accetta il costo della pratica per procedere con l'invio.");
    expect(PHOTOVOLTAICO_PRICE_EUR).toBe(199);
    expect(PHOTOVOLTAICO_UNIFILARE_PRICE_EUR).toBe(40);
    expect(PHOTOVOLTAICO_IVA_PERCENT).toBe(22);
  });

  it("aggiunge il disegno tecnico soltanto quando viene richiesto", () => {
    expect(photovoltaicNetPrice(validBase())).toBe(199);
    expect(photovoltaicNetPrice({ schemaUnifilare: "richiesto_a_pratica_rapida" })).toBe(239);
  });

  it("richiede una scelta esplicita per lo schema unifilare", () => {
    expect(validatePhotovoltaicSubmission({ ...validBase(), schemaUnifilare: "" }))
      .toContain("Indica come verrà fornito lo schema unifilare.");
  });

  it("offre la preparazione soltanto per impianti confermati fino a 6 kW", () => {
    const requested = { ...validBase(), schemaUnifilare: "richiesto_a_pratica_rapida" as const };
    expect(validatePhotovoltaicSubmission(requested))
      .toContain("Conferma che l'impianto ha potenza nominale fino a 6 kW per richiedere lo schema.");
    expect(validatePhotovoltaicSubmission({ ...requested, confermaSottoSeiKw: true })).toEqual([]);
  });
});
