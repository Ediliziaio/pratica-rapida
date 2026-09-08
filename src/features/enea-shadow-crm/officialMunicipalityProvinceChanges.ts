import {
  OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES,
  OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES_SOURCE,
} from "./officialMunicipalityProvinceChanges.generated";

export const OFFICIAL_MUNICIPALITY_PROVINCE_CHANGE_RULE_ID = "user-2026-09-02-official-municipality-province-lineage-v1" as const;

export interface OfficialMunicipalityProvinceResolution {
  ruleId: typeof OFFICIAL_MUNICIPALITY_PROVINCE_CHANGE_RULE_ID;
  municipalityName: string;
  historicalProvinceCode: string;
  currentProvinceCode: string;
  currentIstatCode: string;
  previousIstatCode: string;
  effectiveDate: string;
  officialSourceUrl: string;
  officialSourceZipSha256: string;
  officialSourceCsvSha256: string;
}

function normalizeExact(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // L'apostrofo tipografico e quello ASCII sono la stessa grafia
    // amministrativa. Non rimuoviamo la punteggiatura: restano esclusi nomi
    // lessicalmente diversi e la risoluzione continua a richiedere una sola
    // riga nel catalogo ufficiale.
    .replace(/[’`´]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("it");
}

/**
 * Risolve esclusivamente una transizione di provincia presente nel catalogo
 * chiuso ISTAT. Nome e sigla storica devono coincidere esattamente e il
 * risultato deve essere unico; nessuna euristica geografica e' ammessa.
 */
export function resolveOfficialMunicipalityProvinceChange(input: { name: string; province: string }): OfficialMunicipalityProvinceResolution | null {
  const name = normalizeExact(input.name);
  const province = normalizeExact(input.province);
  const matches = OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES.filter((entry) =>
    normalizeExact(entry.municipalityName) === name
    && entry.acceptedHistoricalProvinceCodes.some((code) => normalizeExact(code) === province));
  if (matches.length !== 1) return null;
  const [match] = matches;
  return {
    ruleId: OFFICIAL_MUNICIPALITY_PROVINCE_CHANGE_RULE_ID,
    municipalityName: match.municipalityName,
    historicalProvinceCode: input.province.trim().toUpperCase(),
    currentProvinceCode: match.currentProvinceCode,
    currentIstatCode: match.currentIstatCode,
    previousIstatCode: match.previousIstatCode,
    effectiveDate: OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES_SOURCE.effectiveDate,
    officialSourceUrl: OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES_SOURCE.sourceUrl,
    officialSourceZipSha256: OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES_SOURCE.sourceZipSha256,
    officialSourceCsvSha256: OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES_SOURCE.sourceCsvSha256,
  };
}

export function officialMunicipalityProvinceChangeCatalogSize() {
  return OFFICIAL_MUNICIPALITY_PROVINCE_CHANGES.length;
}
