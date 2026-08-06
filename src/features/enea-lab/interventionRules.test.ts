import { describe, expect, it } from "vitest";
import {
  ENEA_INTERVENTION_SCOPE,
  ENEA_INTERVENTION_TYPE,
  centralizedPlantFromType,
  interventionScopeFromUnitCount,
  interventionTypeFromProduct,
} from "./interventionRules";

describe("regole sezione Intervento ENEA", () => {
  it("instrada ciascun form nel comma corretto", () => {
    expect(interventionTypeFromProduct("infissi")).toBe(ENEA_INTERVENTION_TYPE.envelope);
    expect(interventionTypeFromProduct("insufflaggio")).toBe(ENEA_INTERVENTION_TYPE.envelope);
    expect(interventionTypeFromProduct("schermature")).toBe(ENEA_INTERVENTION_TYPE.screening);
    expect(interventionTypeFromProduct("impianto_termico")).toBe(ENEA_INTERVENTION_TYPE.heatPump);
  });

  it("distingue edificio singolo e unità in edificio plurimo", () => {
    expect(interventionScopeFromUnitCount("1")).toBe(ENEA_INTERVENTION_SCOPE.singleUnitBuilding);
    expect(interventionScopeFromUnitCount("12")).toBe(ENEA_INTERVENTION_SCOPE.unitInMultiUnitBuilding);
    expect(interventionScopeFromUnitCount("")).toBe("");
  });

  it("ricava il carattere centralizzato dal modulo cliente", () => {
    expect(centralizedPlantFromType("autonomo")).toBe("No");
    expect(centralizedPlantFromType("centralizzato")).toBe("Sì");
    expect(centralizedPlantFromType("centralizzato_con_termostato")).toBe("Sì");
    expect(centralizedPlantFromType("")).toBe("");
  });
});
