import { describe, expect, it } from "vitest";
import { parseCompletedEneaInfissiText } from "./completedEneaInfissi";
import { auditHistoricalInfissi } from "./infissiHistoricalAudit";

const COMPLETED = `
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

describe("APR historical audit infissi", () => {
  it("classifica come blocked una ground truth valida ma con dato CRM aggregato misto", () => {
    const result = auditHistoricalInfissi({
      oldMaterial: "legno",
      oldGlass: "doppio",
      newMaterial: "pvc",
      newGlass: "triplo",
      hasAccessories: false,
    }, parseCompletedEneaInfissiText(COMPLETED));

    expect(result.status).toBe("blocked");
    expect(result.itemCount).toBe(7);
    expect(result.expense).toBe(9996.66);
    expect(result.blockers).toEqual(["aggregate-field-mixed"]);
  });

  it("classifica come difference una divergenza che APR non deve lasciar passare", () => {
    const result = auditHistoricalInfissi({
      oldMaterial: "metallo",
      oldGlass: "doppio",
      newMaterial: "pvc",
      newGlass: "triplo",
      hasAccessories: false,
    }, parseCompletedEneaInfissiText(COMPLETED));

    expect(result.status).toBe("difference");
    expect(result.blockers).toContain("aggregate-field-mismatch");
  });

  it("rifiuta come error un PDF senza sezione tecnica infissi", () => {
    const result = auditHistoricalInfissi({
      oldMaterial: "legno",
      oldGlass: "doppio",
      newMaterial: "pvc",
      newGlass: "triplo",
      hasAccessories: false,
    }, parseCompletedEneaInfissiText("Documento senza tabella tecnica"));

    expect(result.status).toBe("error");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "completed-enea-items-missing",
      "completed-enea-expense-missing",
    ]));
  });
});
