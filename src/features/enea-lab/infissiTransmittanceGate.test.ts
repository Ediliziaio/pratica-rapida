import { describe, expect, it } from "vitest";
import { validateAprInfissiTransmittance } from "./infissiTransmittanceGate";
import type { AprInfissiMappedTechnicalItem } from "./infissiTechnicalMapping";

function item(overrides: Partial<AprInfissiMappedTechnicalItem> = {}): AprInfissiMappedTechnicalItem {
  return {
    ordinal: 1,
    sourcePath: "technical.pdf",
    oldMaterial: "legno",
    oldGlass: "doppio",
    oldTransmittance: 3,
    surfaceM2: 1.5,
    newMaterial: "pvc",
    newGlass: "triplo",
    newTransmittance: 0.88,
    installation: "verso_esterno",
    hasDarkeningClosure: false,
    ...overrides,
  };
}

describe("APR infissi transmittance gate", () => {
  it("applica il limite E=1.30: vecchio sopra e nuovo entro", () => {
    const result = validateAprInfissiTransmittance("E", [item()]);
    expect(result.status).toBe("pass");
    expect(result.checks[0]).toEqual(expect.objectContaining({
      limit: 1.3,
      oldAboveLimit: true,
      newWithinLimit: true,
    }));
  });

  it("blocca un nuovo infisso sopra il limite climatico", () => {
    const result = validateAprInfissiTransmittance("F", [item({ newTransmittance: 1.1 })]);
    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("new-transmittance-above-limit:1");
  });

  it("blocca se la trasmittanza del vecchio non è superiore al limite", () => {
    const result = validateAprInfissiTransmittance("D", [item({ oldTransmittance: 1.5 })]);
    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("old-transmittance-not-above-limit:1");
  });

  it("non deduce la zona climatica quando manca", () => {
    expect(validateAprInfissiTransmittance(null, [item()])).toEqual({
      status: "blocked",
      checks: [],
      blockers: ["climate-zone-unobserved"],
    });
  });
});
