import { describe, expect, it } from "vitest";
import { OFFICIAL_MUNICIPALITY_NAME_CHANGE_RULE_ID, resolveOfficialMunicipalityIdentity, resolveOfficialMunicipalityNameChange } from "./officialMunicipalityChanges";

describe("official municipality name changes", () => {
  it("risolve Godiasco soltanto con provincia ufficialmente concordante", () => {
    expect(resolveOfficialMunicipalityNameChange({ name: "Godiasco", province: "Pavia" })).toMatchObject({
      ruleId: OFFICIAL_MUNICIPALITY_NAME_CHANGE_RULE_ID,
      currentName: "Godiasco Salice Terme",
      provinceCode: "PV",
      currentIstatCode: "018073",
      cadastralCode: "E072",
      effectiveDate: "2012-06-12",
    });
  });

  it("resta fail-closed se la provincia non coincide", () => {
    expect(resolveOfficialMunicipalityNameChange({ name: "Godiasco", province: "MI" })).toBeNull();
  });

  it("non trasforma per somiglianza un nome non presente nel catalogo ufficiale", () => {
    expect(resolveOfficialMunicipalityNameChange({ name: "Godiasco Terme", province: "PV" })).toBeNull();
  });

  it("restituisce la sigla ufficiale anche sul nome corrente gia mappato", () => {
    expect(resolveOfficialMunicipalityIdentity({ name: "Godiasco Salice Terme", province: "Pavia" })?.provinceCode).toBe("PV");
  });
});
