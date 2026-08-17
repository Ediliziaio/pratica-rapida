import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { buildEneaGeneratorPortalScript } from "./portalGenerator";

describe("builder generatore ENEA · coerenza unità fisiche", () => {
  it("non prepara una potenza ready espressa esplicitamente come superficie", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const power = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "impianto.potenza");

    expect(power).toBeDefined();
    if (!power) throw new Error("Campo potenza assente");
    power.value = "25 m²";
    power.status = "ready";
    power.testOnly = false;

    const prepared = buildEneaGeneratorPortalScript(mapped);

    expect(prepared.readyFieldIds).not.toContain("impianto.potenza");
    expect(prepared.skippedFieldIds).toContain("impianto.potenza");
    expect(prepared.runtime.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ portalId: "id-pn" })]),
    );
  });

  it("mantiene compilabile una potenza verificata con separatore italiano delle migliaia", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const power = mapped.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "impianto.potenza");

    expect(power).toBeDefined();
    if (!power) throw new Error("Campo potenza assente");
    power.value = "1.234,5 kW";
    power.status = "ready";
    power.testOnly = false;

    const prepared = buildEneaGeneratorPortalScript(mapped);

    expect(prepared.readyFieldIds).toContain("impianto.potenza");
    expect(prepared.runtime.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ portalId: "id-pn", value: "1234,5" }),
      ]),
    );
  });
});
