import { describe, expect, it } from "vitest";
import { validateOperatorOverride } from "./operatorValidation";
import { ENEA_SCREENING_PORTAL_FIELDS } from "./portalScreening";
import { ENEA_SCREENING_MATERIAL, screeningRules } from "./screeningRules";

describe("contratto osservato materiali schermature ENEA 2026", () => {
  it("mappa tutti i materiali osservati sui relativi valori portale", () => {
    const material = ENEA_SCREENING_PORTAL_FIELDS.find(({ portalId }) => portalId === "id-mat");

    expect(material?.selectValues).toMatchObject({
      [ENEA_SCREENING_MATERIAL.fabric]: "136",
      [ENEA_SCREENING_MATERIAL.wood]: "137",
      [ENEA_SCREENING_MATERIAL.plastic]: "138",
      [ENEA_SCREENING_MATERIAL.pvc]: "139",
      [ENEA_SCREENING_MATERIAL.metal]: "140",
      [ENEA_SCREENING_MATERIAL.mixed]: "141",
      [ENEA_SCREENING_MATERIAL.other]: "142",
    });
  });

  it("riconosce legno e plastica quando sono dichiarati esplicitamente nel documento", () => {
    expect(screeningRules("altro", "Tapparella in legno", 0.13).material).toBe(ENEA_SCREENING_MATERIAL.wood);
    expect(screeningRules("tende_da_sole", "Tenda da sole in plastica", 0.13).material).toBe(ENEA_SCREENING_MATERIAL.plastic);
  });

  it("consente Altro solo come valore ENEA esplicitamente verificato dall'operatore", () => {
    expect(validateOperatorOverride("schermature.0.materiale", "Altro")).toMatchObject({
      valid: true,
      value: ENEA_SCREENING_MATERIAL.other,
    });
    expect(screeningRules("altro", "Tapparella", 0.13).material).toBe("");
  });
});
