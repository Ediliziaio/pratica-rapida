import { describe, expect, it } from "vitest";
import {
  validateAprInfissiPortalContract,
  type AprInfissiPortalObservedContract,
} from "./infissiPortalContract";

function validContract(): AprInfissiPortalObservedContract {
  return {
    portalYear: 2026,
    pageIdentity: "ENEA 2026 - Serramenti e infissi",
    observedAt: "2026-08-22T12:00:00.000Z",
    rowControls: [
      { field: "oldMaterial", selector: "#old-material", control: "select" },
      { field: "oldGlass", selector: "#old-glass", control: "select" },
      { field: "oldTransmittance", selector: "#old-u", control: "input" },
      { field: "surfaceM2", selector: "#surface", control: "input" },
      { field: "newMaterial", selector: "#new-material", control: "select" },
      { field: "newGlass", selector: "#new-glass", control: "select" },
      { field: "newTransmittance", selector: "#new-u", control: "input" },
      { field: "installation", selector: "#installation", control: "select" },
      { field: "hasDarkeningClosure", selector: "#darkening", control: "select" },
    ],
  };
}

describe("APR infissi portal contract", () => {
  it("accetta solo un contratto 2026 completo e osservato", () => {
    expect(validateAprInfissiPortalContract(validContract())).toEqual({
      valid: true,
      blockers: [],
    });
  });

  it("resta fail-closed se manca un controllo tecnico", () => {
    const contract = validContract();
    contract.rowControls = contract.rowControls.filter((control) => control.field !== "newTransmittance");

    expect(validateAprInfissiPortalContract(contract)).toEqual({
      valid: false,
      blockers: ["required-control-missing"],
    });
  });

  it("rifiuta selettori che sembrano azioni di salvataggio o invio", () => {
    const contract = validContract();
    contract.rowControls[0] = {
      ...contract.rowControls[0],
      selector: "#submit-salva",
    };

    const result = validateAprInfissiPortalContract(contract);
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("selector-unsafe");
  });
});
