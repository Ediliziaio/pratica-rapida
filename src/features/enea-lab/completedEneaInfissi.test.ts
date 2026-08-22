import { describe, expect, it } from "vitest";
import {
  compareInfissiIntakeToCompleted,
  parseCompletedEneaInfissiText,
} from "./completedEneaInfissi";

const OBSERVED_INFISSI_SECTION = `
IN. Serramenti e infissi
1 Legno Triplo 3 1.5 PVC Triplo 0.88 Verso No
esterno
Verso
2 Legno Doppio 3 1.5 PVC Triplo 0.88 esterno No
3 Legno Doppio 3 1.6 PVC Triplo 0.88 esterno No
4 Legno Doppio 3 2.7 PVC Triplo 0.87 esterno No
5 Legno Doppio 3 3.1 PVC Triplo 0.93 esterno No
6 Legno Doppio 3 1.9 PVC Triplo 0.7 esterno No
7 Legno Doppio 3 2.6 PVC Triplo 0.87 esterno No
Spese congrue sostenute [€] 9996.66
`;

describe("APR completed ENEA infissi", () => {
  it("estrae le sette righe tecniche osservate senza riusare il parser schermature", () => {
    const result = parseCompletedEneaInfissiText(OBSERVED_INFISSI_SECTION);

    expect(result.items).toHaveLength(7);
    expect(result.items[0]).toMatchObject({
      ordinal: 1,
      oldMaterial: "legno",
      oldGlass: "triplo",
      oldTransmittance: 3,
      surfaceM2: 1.5,
      newMaterial: "pvc",
      newGlass: "triplo",
      newTransmittance: 0.88,
      installation: "verso_esterno",
      hasDarkeningClosure: false,
    });
    expect(result.expense).toBe(9996.66);
  });

  it("segnala il vetro vecchio misto invece di certificare il valore aggregato del form", () => {
    const completed = parseCompletedEneaInfissiText(OBSERVED_INFISSI_SECTION);
    const comparison = compareInfissiIntakeToCompleted({
      oldMaterial: "legno",
      oldGlass: "doppio",
      newMaterial: "pvc",
      newGlass: "triplo",
      hasAccessories: false,
    }, completed);

    expect(comparison).toContainEqual({
      field: "oldGlass",
      intakeValue: "doppio",
      completedValues: ["triplo", "doppio"],
      status: "mixed",
    });
    expect(comparison.filter((item) => item.status === "match")).toHaveLength(4);
  });
});
