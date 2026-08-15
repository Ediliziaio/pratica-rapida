import { describe, expect, it } from "vitest";
import { compareMappedToCompletedEnea } from "./completedEneaAudit";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";

describe("audit storico ENEA - numeri ambigui", () => {
  it("non certifica un valore ready che contiene piu numeri", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const surface = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "immobile.superficie");
    const screeningCount = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.numero");

    expect(surface).toBeDefined();
    expect(screeningCount?.status).toBe("ready");

    surface!.status = "ready";
    surface!.testOnly = false;
    surface!.value = "112 x 2 m²";

    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: null,
      screeningCount: Number(screeningCount!.value),
      fields: {
        "immobile.superficie": "112",
      },
    });

    expect(audit.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "immobile.superficie" }),
    ]));
  });
});
