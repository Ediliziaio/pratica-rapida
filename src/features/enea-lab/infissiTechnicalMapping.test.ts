import { describe, expect, it } from "vitest";
import { mapInfissiTechnicalEvidence } from "./infissiTechnicalMapping";

const intake = {
  oldMaterial: "legno" as const,
  oldGlass: "doppio" as const,
  newMaterial: "pvc" as const,
  newGlass: "triplo" as const,
  hasAccessories: false,
};

describe("APR infissi technical mapping", () => {
  it("mappa solo valori tecnici esplicitamente presenti nell'evidenza documentale", () => {
    const result = mapInfissiTechnicalEvidence(intake, [{
      sourcePath: "fattura-tecnica.pdf",
      oldMaterial: "legno",
      oldGlass: "doppio",
      oldTransmittance: 3,
      surfaceM2: 1.5,
      newMaterial: "pvc",
      newGlass: "triplo",
      newTransmittance: 0.88,
      installation: "verso_esterno",
      hasDarkeningClosure: false,
    }]);

    expect(result.status).toBe("ready");
    expect(result.blockers).toEqual([]);
    expect(result.items).toEqual([expect.objectContaining({
      ordinal: 1,
      oldTransmittance: 3,
      surfaceM2: 1.5,
      newTransmittance: 0.88,
    })]);
  });

  it("non inventa trasmittanza o superficie mancanti", () => {
    const result = mapInfissiTechnicalEvidence(intake, [{
      sourcePath: "fattura-tecnica.pdf",
      oldMaterial: "legno",
      oldGlass: "doppio",
      oldTransmittance: null,
      surfaceM2: null,
      newMaterial: "pvc",
      newGlass: "triplo",
      newTransmittance: null,
      installation: "verso_esterno",
      hasDarkeningClosure: false,
    }]);

    expect(result.status).toBe("blocked");
    expect(result.items).toEqual([]);
    expect(result.blockers).toContain("technical-numeric-value-missing");
  });

  it("accetta un CRM aggregato quando il corpus reale contiene vetri vecchi misti", () => {
    const result = mapInfissiTechnicalEvidence(intake, [
      {
        sourcePath: "scheda-1.pdf",
        oldMaterial: "legno",
        oldGlass: "doppio",
        oldTransmittance: 3,
        surfaceM2: 1.5,
        newMaterial: "pvc",
        newGlass: "triplo",
        newTransmittance: 0.88,
        installation: "verso_esterno",
        hasDarkeningClosure: false,
      },
      {
        sourcePath: "scheda-2.pdf",
        oldMaterial: "legno",
        oldGlass: "triplo",
        oldTransmittance: 3,
        surfaceM2: 1.6,
        newMaterial: "pvc",
        newGlass: "triplo",
        newTransmittance: 0.87,
        installation: "verso_esterno",
        hasDarkeningClosure: false,
      },
    ]);

    expect(result.status).toBe("ready");
    expect(result.items).toHaveLength(2);
  });

  it("blocca un conflitto uniforme tra CRM e documenti", () => {
    const result = mapInfissiTechnicalEvidence(intake, [{
      sourcePath: "fattura-tecnica.pdf",
      oldMaterial: "metallo",
      oldGlass: "doppio",
      oldTransmittance: 3,
      surfaceM2: 1.5,
      newMaterial: "pvc",
      newGlass: "triplo",
      newTransmittance: 0.88,
      installation: "verso_esterno",
      hasDarkeningClosure: false,
    }]);

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("intake-aggregate-conflict");
  });
});
