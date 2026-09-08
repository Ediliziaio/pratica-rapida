import { OFFICIAL_MUNICIPALITIES, OFFICIAL_MUNICIPALITIES_SOURCE } from "./officialMunicipalities.generated";

export const OFFICIAL_MUNICIPALITY_CANONICAL_IDENTITY_RULE_ID = "user-2026-09-05-official-municipality-canonical-identity-v1" as const;

export interface OfficialMunicipalityCanonicalResolution {
  ruleId: typeof OFFICIAL_MUNICIPALITY_CANONICAL_IDENTITY_RULE_ID;
  originalName: string;
  originalProvince: string;
  canonicalName: string;
  provinceName: string;
  provinceCode: string;
  istatCode: string;
  cadastralCode: string;
  effectiveDate: string;
  officialSourceUrl: string;
  officialSourceSha256: string;
}

function fold(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`´]/g, "'")
    .trim()
    .toLocaleLowerCase("it");
}

function compactMunicipality(value: string): string {
  return fold(value)
    .replace(/\b(?:comune\s+di|citta\s+di)\b/g, " ")
    .replace(/\bs\.?\s+/g, "san ")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedProvince(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "");
}

function splitInlineProvince(name: string): { name: string; province: string | null } {
  const match = name.trim().match(/^(.*?)\s*\(\s*([A-Za-z]{2})\s*\)\s*$/);
  return match ? { name: match[1].trim(), province: match[2].toUpperCase() } : { name: name.trim(), province: null };
}

/**
 * Risolve una grafia del Comune verso l'entita corrente ISTAT. Non usa
 * distanza, contenimento o ordine dei risultati: nome compatto e provincia
 * devono produrre una sola identita ufficiale.
 */
export function resolveOfficialMunicipalityCanonicalIdentity(input: { name: string; province: string }): OfficialMunicipalityCanonicalResolution | null {
  const parsed = splitInlineProvince(input.name);
  const explicitProvince = normalizedProvince(input.province);
  const inlineProvince = parsed.province ? normalizedProvince(parsed.province) : "";
  if (inlineProvince && explicitProvince && inlineProvince !== explicitProvince && explicitProvince.length === 2) return null;
  const municipalityKey = compactMunicipality(parsed.name);
  if (!municipalityKey) return null;
  const provinceKey = inlineProvince || explicitProvince;
  const matches = OFFICIAL_MUNICIPALITIES.filter((entry) => {
    if (compactMunicipality(entry.name) !== municipalityKey) return false;
    if (!provinceKey) return true;
    return normalizedProvince(entry.provinceCode) === provinceKey || normalizedProvince(entry.provinceName) === provinceKey;
  });
  if (matches.length !== 1) return null;
  const [match] = matches;
  return {
    ruleId: OFFICIAL_MUNICIPALITY_CANONICAL_IDENTITY_RULE_ID,
    originalName: input.name,
    originalProvince: input.province,
    canonicalName: match.name,
    provinceName: match.provinceName,
    provinceCode: match.provinceCode,
    istatCode: match.istatCode,
    cadastralCode: match.cadastralCode,
    effectiveDate: OFFICIAL_MUNICIPALITIES_SOURCE.effectiveDate,
    officialSourceUrl: OFFICIAL_MUNICIPALITIES_SOURCE.sourceUrl,
    officialSourceSha256: OFFICIAL_MUNICIPALITIES_SOURCE.sourceSha256,
  };
}

export function officialMunicipalityCatalogSize(): number {
  return OFFICIAL_MUNICIPALITIES.length;
}
