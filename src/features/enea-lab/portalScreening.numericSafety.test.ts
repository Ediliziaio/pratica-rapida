import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaScreeningPortalScript } from "./portalScreening";

describe("builder schermatura ENEA - numeri ambigui", () => {
  it("non concatena piu numeri nei campi tecnici ready", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "schermature.0.superficie");
    const gtot = fields.find((field) => field.id === "schermature.0.gtot");

    expect(surface?.status).toBe("ready");
    expect(gtot?.status).toBe("ready");

    surface!.value = "2 x 9 m²";
    surface!.testOnly = false;
    gtot!.value = "0,13 x 2";
    gtot!.testOnly = false;

    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(preparation.readyFieldIds).not.toContain("schermature.0.superficie");
    expect(preparation.readyFieldIds).not.toContain("schermature.0.gtot");
    expect(preparation.skippedFieldIds).toEqual(expect.arrayContaining([
      "schermature.0.superficie",
      "schermature.0.gtot",
    ]));
    expect(preparation.script).not.toContain('"value":"29"');
    expect(preparation.script).not.toContain('"value":"0,132"');
  });
});
