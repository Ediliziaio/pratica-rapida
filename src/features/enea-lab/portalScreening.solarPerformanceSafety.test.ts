import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaScreeningPortalScript } from "./portalScreening";

describe("builder schermatura ENEA · prestazioni solari", () => {
  it("non porta una Rsupp stale in una schermatura solare anche se risulta verificata", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const analysis = ENEA_LAB_MOCK_ANALYSIS[source.id];
    if (!analysis) throw new Error("Fixture senza analisi documentale.");

    const mapped = mapSchermaturaPractice(source, analysis, {
      overrides: { "schermature.0.rsupp": "0,12" },
    });
    const type = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.0.tipo");
    expect(type?.value).toBe("Tenda o veneziana");

    const prepared = buildEneaScreeningPortalScript(mapped, 0);
    expect(prepared.readyFieldIds).not.toContain("schermature.0.rsupp");
    expect(prepared.runtime.fields.some((field) => field.portalId === "id-rsup")).toBe(false);
    expect(prepared.script).not.toContain("id-rsup");
  });
});
