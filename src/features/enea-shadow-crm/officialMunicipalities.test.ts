import { describe, expect, it } from "vitest";
import { officialMunicipalityCatalogSize, resolveOfficialMunicipalityCanonicalIdentity } from "./officialMunicipalities";

describe("catalogo corrente ufficiale dei Comuni", () => {
  it("risolve una grafia senza spazio e la provincia estesa verso l'entita ISTAT", () => {
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "MONTECOMPATRI (RM)", province: "ROMA" })).toMatchObject({
      canonicalName: "Monte Compatri",
      provinceCode: "RM",
      istatCode: "058060",
      cadastralCode: "F477",
    });
    expect(officialMunicipalityCatalogSize()).toBe(7_894);
  });

  it("normalizza separatori grafici ma non usa somiglianza lessicale", () => {
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Reggio-nell Emilia", province: "RE" })?.canonicalName).toBe("Reggio nell'Emilia");
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Monte Compatr", province: "RM" })).toBeNull();
  });

  it("resta fail-closed per omonimia o provincia discordante", () => {
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Castro", province: "" })).toBeNull();
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Montecompatri (RM)", province: "MI" })).toBeNull();
  });
});
