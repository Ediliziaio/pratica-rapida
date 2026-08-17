import { describe, expect, it } from "vitest";
import { compareMappedToCompletedEnea } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("audit storico ENEA - numeri ambigui", () => {
  it("non certifica un valore ready che contiene piu numeri", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "immobile.superficie");
    const screeningCount = fields.find((field) => field.id === "schermature.numero");

    expect(surface).toBeDefined();
    expect(screeningCount).toBeDefined();

    surface!.status = "ready";
    surface!.testOnly = false;
    surface!.value = "112 x 2 m²";
    screeningCount!.status = "ready";
    screeningCount!.testOnly = false;
    screeningCount!.value = "2";

    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: null,
      screeningCount: 2,
      fields: {
        "immobile.superficie": "112",
      },
    });

    expect(audit.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "immobile.superficie" }),
    ]));
  });

  it("non interpreta una frazione con punto e zero iniziale come un intero", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "immobile.superficie");
    const screeningCount = fields.find((field) => field.id === "schermature.numero");

    expect(surface).toBeDefined();
    expect(screeningCount).toBeDefined();

    surface!.status = "ready";
    surface!.testOnly = false;
    surface!.value = "0.080 m²";
    screeningCount!.status = "ready";
    screeningCount!.testOnly = false;
    screeningCount!.value = "2";

    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: null,
      screeningCount: 2,
      fields: {
        "immobile.superficie": "80 m²",
      },
    });

    expect(audit.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "immobile.superficie" }),
    ]));
  });

  it("considera equivalenti 0.080 e 0,08 come stessa frazione decimale", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "immobile.superficie");
    const screeningCount = fields.find((field) => field.id === "schermature.numero");

    expect(surface).toBeDefined();
    expect(screeningCount).toBeDefined();

    surface!.status = "ready";
    surface!.testOnly = false;
    surface!.value = "0.080 m²";
    screeningCount!.status = "ready";
    screeningCount!.testOnly = false;
    screeningCount!.value = "2";

    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: null,
      screeningCount: 2,
      fields: {
        "immobile.superficie": "0,08 m²",
      },
    });

    expect(audit.matchedFieldIds).toContain("immobile.superficie");
  });
});
