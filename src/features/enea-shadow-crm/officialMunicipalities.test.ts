import { describe, expect, it } from "vitest";
import { officialMunicipalityCatalogSize, resolveOfficialMunicipalityCanonicalIdentity, resolveOfficialMunicipalityFromCadastralCode, resolveOfficialMunicipalityFromFiscalCode } from "./officialMunicipalities";

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

describe("officialMunicipalities: dal codice fiscale al comune di nascita", () => {
  it("officialMunicipalities: dal codice fiscale al comune di nascita, estero fail-closed", () => {
    expect(resolveOfficialMunicipalityFromFiscalCode("PDNGLR62C70A952K")).toMatchObject({ canonicalName: "Bolzano", provinceCode: "BZ", istatCode: "021008", cadastralCode: "A952" });
    expect(resolveOfficialMunicipalityFromFiscalCode("SRPDNL83A48H224F")).toMatchObject({ canonicalName: "Reggio di Calabria", provinceCode: "RC" });
    expect(resolveOfficialMunicipalityFromFiscalCode("DFLFST77R45F839T")).toMatchObject({ canonicalName: "Napoli", provinceCode: "NA" });
    expect(resolveOfficialMunicipalityFromFiscalCode("LTNNRN87R57Z129Z")).toBeNull();
    expect(resolveOfficialMunicipalityFromFiscalCode("PDNGLR62C70A952X")).toBeNull();
    expect(resolveOfficialMunicipalityFromFiscalCode("")).toBeNull();
    expect(resolveOfficialMunicipalityFromCadastralCode("ZZZZ")).toBeNull();
  });

  it("una provincia bilingue accetta una sola delle due lingue nel confronto", () => {
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Laives", province: "Bolzano" })).toMatchObject({ canonicalName: "Laives", provinceCode: "BZ" });
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Laives", province: "Bozen" })).toMatchObject({ canonicalName: "Laives", provinceCode: "BZ" });
    expect(resolveOfficialMunicipalityCanonicalIdentity({ name: "Reggio Calabria", province: "RC" })).toBeNull();
  });
});
