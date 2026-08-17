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
    expect(preparation.script).not.toContain('\"value\":\"29\"');
    expect(preparation.script).not.toContain('\"value\":\"0,132\"');
  });

  it("non prepara superfici nulle anche se il mapping stale le marca ready", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "schermature.0.superficie");
    const protectedSurface = fields.find((field) => field.id === "schermature.0.superficie_finestrata");

    expect(surface).toBeDefined();
    expect(protectedSurface).toBeDefined();

    surface!.status = "ready";
    surface!.value = "1 m²";
    surface!.testOnly = false;
    protectedSurface!.status = "ready";
    protectedSurface!.value = "1 m²";
    protectedSurface!.testOnly = false;

    const validPreparation = buildEneaScreeningPortalScript(mapped, 0);
    expect(validPreparation.readyFieldIds).toEqual(expect.arrayContaining([
      "schermature.0.superficie",
      "schermature.0.superficie_finestrata",
    ]));

    surface!.value = "0 m²";
    protectedSurface!.value = "0 m²";

    const preparation = buildEneaScreeningPortalScript(mapped, 0);

    expect(preparation.readyFieldIds).not.toContain("schermature.0.superficie");
    expect(preparation.readyFieldIds).not.toContain("schermature.0.superficie_finestrata");
    expect(preparation.skippedFieldIds).toEqual(expect.arrayContaining([
      "schermature.0.superficie",
      "schermature.0.superficie_finestrata",
    ]));
  });

  it("normalizza i separatori italiani delle migliaia nelle superfici verificate", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "schermature.0.superficie");
    const protectedSurface = fields.find((field) => field.id === "schermature.0.superficie_finestrata");

    expect(surface).toBeDefined();
    expect(protectedSurface).toBeDefined();

    surface!.status = "ready";
    surface!.value = "1.234,5 m²";
    surface!.testOnly = false;
    protectedSurface!.status = "ready";
    protectedSurface!.value = "1.234,5 mq";
    protectedSurface!.testOnly = false;

    const preparation = buildEneaScreeningPortalScript(mapped, 0);
    const surfaceRuntime = preparation.runtime.fields.find((field) => field.portalId === "id-sup_s");
    const protectedSurfaceRuntime = preparation.runtime.fields.find((field) => field.portalId === "id-sup_f");

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "schermature.0.superficie",
      "schermature.0.superficie_finestrata",
    ]));
    expect(surfaceRuntime?.value).toBe("1234,5");
    expect(protectedSurfaceRuntime?.value).toBe("1234,5");
  });

  it("non scambia la virgola decimale italiana con un separatore delle migliaia", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const fields = mapped.sections.flatMap((section) => section.fields);
    const surface = fields.find((field) => field.id === "schermature.0.superficie");
    const protectedSurface = fields.find((field) => field.id === "schermature.0.superficie_finestrata");

    expect(surface).toBeDefined();
    expect(protectedSurface).toBeDefined();

    surface!.status = "ready";
    surface!.value = "1,234 m²";
    surface!.testOnly = false;
    protectedSurface!.status = "ready";
    protectedSurface!.value = "2,345 mq";
    protectedSurface!.testOnly = false;

    const preparation = buildEneaScreeningPortalScript(mapped, 0);
    const surfaceRuntime = preparation.runtime.fields.find((field) => field.portalId === "id-sup_s");
    const protectedSurfaceRuntime = preparation.runtime.fields.find((field) => field.portalId === "id-sup_f");

    expect(preparation.readyFieldIds).toEqual(expect.arrayContaining([
      "schermature.0.superficie",
      "schermature.0.superficie_finestrata",
    ]));
    expect(surfaceRuntime?.value).toBe("1,234");
    expect(protectedSurfaceRuntime?.value).toBe("2,345");
  });
});