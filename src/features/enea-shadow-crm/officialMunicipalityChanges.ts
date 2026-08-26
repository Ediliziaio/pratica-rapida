export const OFFICIAL_MUNICIPALITY_NAME_CHANGE_RULE_ID = "user-2026-08-27-official-municipality-name-change-v1" as const;

export interface OfficialMunicipalityNameResolution {
  ruleId: typeof OFFICIAL_MUNICIPALITY_NAME_CHANGE_RULE_ID;
  originalName: string;
  currentName: string;
  provinceCode: string;
  currentIstatCode: string;
  cadastralCode: string;
  effectiveDate: string;
  officialSources: readonly string[];
}

interface OfficialMunicipalityNameChange extends OfficialMunicipalityNameResolution {
  acceptedProvinceLabels: readonly string[];
}

/**
 * Catalogo chiuso di variazioni amministrative verificate su fonti ufficiali.
 * Non e' un motore di similarita': ogni alias e provincia devono coincidere
 * esattamente dopo la sola normalizzazione grafica.
 */
const OFFICIAL_MUNICIPALITY_NAME_CHANGES: readonly OfficialMunicipalityNameChange[] = Object.freeze([
  Object.freeze({
    ruleId: OFFICIAL_MUNICIPALITY_NAME_CHANGE_RULE_ID,
    originalName: "Godiasco",
    currentName: "Godiasco Salice Terme",
    provinceCode: "PV",
    acceptedProvinceLabels: Object.freeze(["PV", "Pavia"]),
    currentIstatCode: "018073",
    cadastralCode: "E072",
    effectiveDate: "2012-06-12",
    officialSources: Object.freeze([
      "https://dait.interno.gov.it/documenti/20140616_comunicazionevariazioniterritorionazionale_06-2014.pdf",
      "https://ottomilacensus.istat.it/sottotema/018/018073/1/",
      "https://infoprecompilata.agenziaentrate.gov.it/portale/documents/10180/208302/730_2024_istruzioni.pdf",
    ]),
  }),
]);

function normalizeExact(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

export function resolveOfficialMunicipalityNameChange(input: { name: string; province: string }): OfficialMunicipalityNameResolution | null {
  const name = normalizeExact(input.name);
  const province = normalizeExact(input.province);
  const matches = OFFICIAL_MUNICIPALITY_NAME_CHANGES.filter((entry) =>
    normalizeExact(entry.originalName) === name
    && entry.acceptedProvinceLabels.some((label) => normalizeExact(label) === province));
  if (matches.length !== 1) return null;
  const { acceptedProvinceLabels: _acceptedProvinceLabels, ...resolution } = matches[0];
  return resolution;
}

/** Risolve la stessa identita ufficiale anche dopo che il mapping ha gia'
 * sostituito il nome storico, per consegnare al widget ENEA la sigla provincia
 * ufficiale anziche' un'etichetta estesa del form. */
export function resolveOfficialMunicipalityIdentity(input: { name: string; province: string }): OfficialMunicipalityNameResolution | null {
  const name = normalizeExact(input.name);
  const province = normalizeExact(input.province);
  const matches = OFFICIAL_MUNICIPALITY_NAME_CHANGES.filter((entry) =>
    [entry.originalName, entry.currentName].some((label) => normalizeExact(label) === name)
    && entry.acceptedProvinceLabels.some((label) => normalizeExact(label) === province));
  if (matches.length !== 1) return null;
  const { acceptedProvinceLabels: _acceptedProvinceLabels, ...resolution } = matches[0];
  return resolution;
}
