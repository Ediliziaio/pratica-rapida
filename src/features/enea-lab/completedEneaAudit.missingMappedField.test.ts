import { describe, expect, it } from "vitest";
import { compareMappedToCompletedEnea } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("audit storico ENEA - copertura del mapper", () => {
  it("tratta come differenza un campo presente nel PDF conclusivo ma assente dal mapper", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const screeningCount = Number(
      mapped.sections
        .flatMap((section) => section.fields)
        .find((field) => field.id === "schermature.numero")?.value ?? 0,
    );
    const withoutMaterial = {
      ...mapped,
      sections: mapped.sections.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.id !== "schermature.0.materiale"),
      })),
    };

    const audit = compareMappedToCompletedEnea(withoutMaterial, {
      cpid: "288717-2026E-TESTTESTTESTTEST",
      screeningCount,
      fields: {
        "schermature.0.materiale": "Misto",
      },
    });

    expect(audit.compared).toBe(2);
    expect(audit.matches).toBe(1);
    expect(audit.mismatches).toBe(1);
    expect(audit.differences).toContainEqual({
      fieldId: "schermature.0.materiale",
      completedValue: "Misto",
      mappedValue: "Campo non disponibile",
    });
  });
});
