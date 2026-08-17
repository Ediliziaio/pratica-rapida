import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { validateOperatorOverride } from "./operatorValidation";
import { buildEneaOfficialPortalWorkflowScript } from "./portalWorkflow";

describe("workflow ENEA official · numero schermature", () => {
  it("blocca un conteggio ready in notazione scientifica anche se coincide numericamente con gli indici", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!analysis) throw new Error("Fixture senza analisi documentale.");

    const base = mapSchermaturaPractice(source, analysis, { includeTestConventions: true });
    expect(buildEneaOfficialPortalWorkflowScript(base).mode).toBe("official");

    const countField = base.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.numero");
    if (!countField) throw new Error("Fixture senza numero schermature.");

    const count = Number(countField.value.trim().replace(/\s/g, "").replace(",", "."));
    if (!Number.isInteger(count) || count < 1) throw new Error("Fixture con numero schermature non valido.");
    const malformed = `${count}e0`;
    expect(Number(malformed)).toBe(count);
    expect(validateOperatorOverride("schermature.numero", malformed).valid).toBe(false);

    const mapped = {
      ...base,
      sections: base.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => field.id === "schermature.numero"
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
