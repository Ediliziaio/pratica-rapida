import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaOfficialPortalWorkflowScript } from "./portalWorkflow";

describe("workflow ENEA official: rappresentazione risparmio energetico", () => {
  it("resta fail-closed finché il controllo portale del risparmio energetico non è osservato", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0], undefined, {
      includeTestConventions: false,
    });
    const energyField = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.risparmio_energia");

    expect(energyField).toBeDefined();
    if (!energyField) throw new Error("Campo risparmio energetico assente dal mapping ENEA");

    energyField.value = "311 kWh/anno";
    energyField.status = "ready";
    energyField.source = "Inserimento operatore";
    energyField.testOnly = false;

    const workflow = buildEneaOfficialPortalWorkflowScript(mapped);

    expect(workflow.mode).toBe("blocked");
    expect(workflow.script).toBe("");
  });
});
