import { describe, expect, it } from "vitest";
import {
  OFFICIAL_MUNICIPALITY_PROVINCE_CHANGE_RULE_ID,
  officialMunicipalityProvinceChangeCatalogSize,
  resolveOfficialMunicipalityProvinceChange,
} from "./officialMunicipalityProvinceChanges";

describe("official municipality province changes", () => {
  it("risolve La Maddalena da SS alla sigla corrente OT con codice ISTAT corrente", () => {
    expect(resolveOfficialMunicipalityProvinceChange({ name: "La Maddalena", province: "SS" })).toMatchObject({
      ruleId: OFFICIAL_MUNICIPALITY_PROVINCE_CHANGE_RULE_ID,
      currentProvinceCode: "OT",
      currentIstatCode: "113012",
      previousIstatCode: "090035",
    });
  });

  it("applica la stessa regola generale a un secondo Comune e a tutto il catalogo verificato", () => {
    expect(officialMunicipalityProvinceChangeCatalogSize()).toBe(131);
    expect(resolveOfficialMunicipalityProvinceChange({ name: "Armungia", province: "SU" })).toMatchObject({
      currentProvinceCode: "CA",
      currentIstatCode: "118001",
    });
  });

  it("risolve un Comune composto con apostrofo tipografico dalla provincia storica a quella corrente", () => {
    expect(resolveOfficialMunicipalityProvinceChange({
      name: "Trinità d’Agultu e Vignola",
      province: "SS",
    })).toMatchObject({
      municipalityName: "Trinità d'Agultu e Vignola",
      historicalProvinceCode: "SS",
      currentProvinceCode: "OT",
      currentIstatCode: "113026",
    });
  });

  it("resta fail-closed per provincia non storicamente collegata", () => {
    expect(resolveOfficialMunicipalityProvinceChange({ name: "La Maddalena", province: "NU" })).toBeNull();
  });

  it("non tratta come equivalente un nome composto lessicalmente incompleto", () => {
    expect(resolveOfficialMunicipalityProvinceChange({
      name: "Trinità d’Agultu",
      province: "SS",
    })).toBeNull();
  });

  it("resta fail-closed per somiglianza o nome non presente nel catalogo", () => {
    expect(resolveOfficialMunicipalityProvinceChange({ name: "Maddalena", province: "SS" })).toBeNull();
  });
});
