import { describe, expect, it } from "vitest";
import { parseCompletedEneaInfissiText } from "./completedEneaInfissi";
import { auditInfissiTechnicalMappingAgainstCompleted } from "./infissiTechnicalAudit";
import { mapInfissiTechnicalEvidence } from "./infissiTechnicalMapping";

const COMPLETED = `
IN. Serramenti e infissi
1 Legno Doppio 3 1.5 PVC Triplo 0.88 Verso No
esterno
Spese congrue sostenute [€] 9996.66
`;

const COMPLETED_TWO_ROWS = `
IN. Serramenti e infissi
1 Legno Doppio 3 1.5 PVC Triplo 0.88 Verso No
esterno
2 Legno Doppio 3 1.6 PVC Triplo 0.87 Verso No
esterno
Spese congrue sostenute [€] 9996.66
`;

const intake = {
  oldMaterial: "legno" as const,
  oldGlass: "doppio" as const,
  newMaterial: "pvc" as const,
  newGlass: "triplo" as const,
  hasAccessories: false,
};

function mapped(newTransmittance = 0.88) {
  const result = mapInfissiTechnicalEvidence(intake, [{
    sourcePath: "evidenza-tecnica.pdf",
    oldMaterial: "legno",
    oldGlass: "doppio",
    oldTransmittance: 3,
    surfaceM2: 1.5,
    newMaterial: "pvc",
    newGlass: "triplo",
    newTransmittance,
    installation: "verso_esterno",
    hasDarkeningClosure: false,
  }]);
  if (result.status !== "ready") throw new Error("Fixture APR non ready");
  return result.items;
}

describe("APR infissi technical audit", () => {
  it("certifica match solo quando tutti i nove campi tecnici coincidono", () => {
    const result = auditInfissiTechnicalMappingAgainstCompleted(
      mapped(),
      parseCompletedEneaInfissiText(COMPLETED),
    );

    expect(result.status).toBe("match");
    expect(result.comparisons).toHaveLength(9);
    expect(result.comparisons.every((comparison) => comparison.status === "match")).toBe(true);
  });

  it("segnala una differenza di trasmittanza che sarebbe sfuggita al mapping", () => {
    const result = auditInfissiTechnicalMappingAgainstCompleted(
      mapped(0.93),
      parseCompletedEneaInfissiText(COMPLETED),
    );

    expect(result.status).toBe("difference");
    expect(result.comparisons).toContainEqual(expect.objectContaining({
      ordinal: 1,
      field: "newTransmittance",
      aprValue: 0.93,
      completedEneaValue: 0.88,
      status: "difference",
    }));
  });

  it("blocca il confronto se APR e PDF ENEA non hanno lo stesso numero di righe", () => {
    const result = auditInfissiTechnicalMappingAgainstCompleted(
      mapped(),
      parseCompletedEneaInfissiText(COMPLETED_TWO_ROWS),
    );

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("technical-item-count-mismatch");
  });
});
