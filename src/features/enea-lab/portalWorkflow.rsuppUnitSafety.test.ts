import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { validateOperatorOverride } from "./operatorValidation";
import { buildEneaOfficialPortalWorkflowScript } from "./portalWorkflow";

describe("workflow ENEA official · unità Rsupp", () => {
  it("blocca una Rsupp ready con unità incompatibile anche se il workflow viene invocato direttamente", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!analysis) throw new Error("Fixture senza analisi documentale.");

    const base = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });
    const malformed = "0,08 kg";
    expect(validateOperatorOverride("schermature.0.rsupp", malformed).valid).toBe(false);

    const mapped = {
      ...base,
      sections: base.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => field.id === "schermature.0.rsupp"
          ? {
              ...field,
              value: malformed,
              status: "ready" as const,
              source: "Inserimento operatore" as const,
              testOnly: false,
            }
          : field),
      })),
    };

    const workflow = buildEneaOfficialPortalWorkflowScript(mapped);
    expect(workflow.mode).toBe("blocked");
    expect(workflow.script).toBe("");
  });
});
