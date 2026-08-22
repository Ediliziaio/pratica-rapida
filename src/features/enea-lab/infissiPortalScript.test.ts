import { describe, expect, it } from "vitest";
import { parseCompletedEneaInfissiText } from "./completedEneaInfissi";
import type { AprInfissiPortalObservedContract } from "./infissiPortalContract";
import { prepareAprInfissiPortalScript } from "./infissiPortalScript";

const COMPLETED = `
IN. Serramenti e infissi
1 Legno Doppio 3 1.5 PVC Triplo 0.88 Verso No
esterno
Spese congrue sostenute [€] 9996.66
`;

function observedContract(): AprInfissiPortalObservedContract {
  return {
    portalYear: 2026,
    pageIdentity: "ENEA 2026 - Serramenti e infissi",
    observedAt: "2026-08-22T12:00:00.000Z",
    rowControls: [
      { field: "oldMaterial", selector: "#row-{{row}}-old-material", control: "select" },
      { field: "oldGlass", selector: "#row-{{row}}-old-glass", control: "select" },
      { field: "oldTransmittance", selector: "#row-{{row}}-old-u", control: "input" },
      { field: "surfaceM2", selector: "#row-{{row}}-surface", control: "input" },
      { field: "newMaterial", selector: "#row-{{row}}-new-material", control: "select" },
      { field: "newGlass", selector: "#row-{{row}}-new-glass", control: "select" },
      { field: "newTransmittance", selector: "#row-{{row}}-new-u", control: "input" },
      { field: "installation", selector: "#row-{{row}}-installation", control: "select" },
      { field: "hasDarkeningClosure", selector: "#row-{{row}}-darkening", control: "select" },
    ],
  };
}

describe("APR infissi portal script", () => {
  it("genera un comando che compila i campi ma non contiene click, submit o navigazione", () => {
    const result = prepareAprInfissiPortalScript(
      observedContract(),
      parseCompletedEneaInfissiText(COMPLETED),
    );

    expect(result.mode).toBe("ready");
    expect(result.rowCount).toBe(1);
    expect(result.script).toContain("#row-{{row}}-old-material");
    expect(result.script).toContain("Verso esterno");
    expect(result.script).not.toMatch(/\.click\s*\(/);
    expect(result.script).not.toMatch(/\.submit\s*\(/);
    expect(result.script).not.toMatch(/requestSubmit\s*\(/);
    expect(result.script).not.toMatch(/window\.open\s*\(/);
  });

  it("non genera nulla se il contratto tecnico non è completo", () => {
    const contract = observedContract();
    contract.rowControls = contract.rowControls.slice(0, 2);

    const result = prepareAprInfissiPortalScript(
      contract,
      parseCompletedEneaInfissiText(COMPLETED),
    );

    expect(result.mode).toBe("blocked");
    expect(result.script).toBe("");
    expect(result.reason).toContain("invalid-portal-contract");
  });
});
