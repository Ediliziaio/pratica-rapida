import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaBuildingPortalScript } from "./portalBuilding";

describe("builder immobile ENEA - numeri ambigui", () => {
  it("non porta al runtime una superficie ready contenente piu numeri", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const surface = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "immobile.superficie");

    expect(surface?.status).toBe("ready");

    surface!.value = "2 x 9 m²";
    surface!.testOnly = false;

    const preparation = buildEneaBuildingPortalScript(mapped);

    expect(preparation.readyFieldIds).not.toContain("immobile.superficie");
    expect(preparation.skippedFieldIds).toContain("immobile.superficie");
    expect(preparation.runtime.fields).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ portalId: "id-sup_utile" }),
    ]));
    expect(preparation.script).not.toContain('"value":"2 x 9"');
  });

  it("non porta al runtime una superficie utile nulla anche se il mapping e ready", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const surface = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "immobile.superficie");

    expect(surface?.status).toBe("ready");

    surface!.value = "0 m²";
    surface!.testOnly = false;

    const preparation = buildEneaBuildingPortalScript(mapped);

    expect(preparation.readyFieldIds).not.toContain("immobile.superficie");
    expect(preparation.skippedFieldIds).toContain("immobile.superficie");
    expect(preparation.runtime.fields).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ portalId: "id-sup_utile" }),
    ]));
  });
});