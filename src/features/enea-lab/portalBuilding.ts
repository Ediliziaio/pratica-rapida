import type { EneaLabMappedPractice } from "./types";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalControl,
  type EneaPortalRuntimeField,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface BuildingPortalFieldDefinition {
  fieldId: string;
  portalId: string;
  control: EneaPortalControl;
  selectValues?: Readonly<Record<string, string>>;
  normalizeValue?: (value: string) => string;
  automatic?: boolean;
}

export interface EneaBuildingPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

const POSSESSION_VALUES = {
  "Proprietario / comproprietario": "1",
  "Detentore / affittuario": "2",
  "Familiare / convivente": "3",
} as const;

const GENERAL_USE_VALUES = {
  Residenziale: "5",
  "Non residenziale": "6",
  Misto: "7",
} as const;

const PARTICULAR_USE_VALUES = {
  "Edifici adibiti a residenza e assimilabili (con carattere continuativo o saltuario)": "8",
  "Edifici adibiti a uffici e assimilabili": "9",
  "Edifici adibiti a ospedali, cliniche o case di cura e assimilabili": "10",
  "Edifici adibiti ad attività ricreative, associative o di culto e assimilabili (cinema, teatri, sale riunioni, musei, chiese e similari)": "11",
  "Edifici adibiti ad attività commerciali e assimilabili": "12",
  "Edifici adibiti ad attività sportive (piscine, palestre, servizi di supporto alle attività sportive)": "13",
  "Edifici adibiti ad attività scolastiche a tutti i livelli e assimilabili": "14",
  "Edifici adibiti ad attività industriali ed artigianali e assimilabili": "15",
} as const;

const BUILDING_TYPE_VALUES = {
  "Edificio oltre 3 piani (4+)": "16",
  "Edificio fino a 3 piani": "17",
  "Casa singola o plurifamiliare": "18",
  "Edificio industriale o commerciale": "19",
  Altro: "20",
} as const;

function numericValue(value: string): string {
  return value.replace(/\s*m²\s*$/i, "").trim();
}

/** Identificativi e valori osservati sulla pagina "Immobile" ENEA 2026. */
export const ENEA_BUILDING_PORTAL_FIELDS: readonly BuildingPortalFieldDefinition[] = [
  { fieldId: "immobile.comune", portalId: "id-comune", control: "autocomplete" },
  { fieldId: "immobile.indirizzo", portalId: "id-indirizzo", control: "input" },
  { fieldId: "immobile.civico", portalId: "id-civico", control: "input" },
  { fieldId: "immobile.cap", portalId: "id-cap", control: "input" },
  { fieldId: "immobile.scala", portalId: "id-scala", control: "input" },
  { fieldId: "immobile.interno", portalId: "id-interno", control: "input" },
  { fieldId: "immobile.gradi_giorno", portalId: "id-gg", control: "select", automatic: true },
  { fieldId: "immobile.sezione", portalId: "id-sezione", control: "input" },
  { fieldId: "immobile.foglio", portalId: "id-foglio", control: "input" },
  { fieldId: "immobile.mappale", portalId: "id-mappale", control: "input" },
  { fieldId: "immobile.subalterno", portalId: "id-sub", control: "input" },
  { fieldId: "immobile.anno", portalId: "id-anno", control: "input" },
  { fieldId: "immobile.superficie", portalId: "id-sup_utile", control: "input", normalizeValue: numericValue },
  { fieldId: "immobile.unita", portalId: "id-unita", control: "input" },
  { fieldId: "beneficiario.titolo", portalId: "id-possesso", control: "select", selectValues: POSSESSION_VALUES },
  { fieldId: "immobile.destinazione_generale", portalId: "id-destinazione_uso", control: "select", selectValues: GENERAL_USE_VALUES },
  { fieldId: "immobile.destinazione_particolare", portalId: "id-dpr412", control: "select", selectValues: PARTICULAR_USE_VALUES },
  { fieldId: "immobile.tipologia", portalId: "id-tipologia", control: "select", selectValues: BUILDING_TYPE_VALUES },
] as const;

export function buildEneaBuildingPortalScript(
  mapped: EneaLabMappedPractice,
): EneaBuildingPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const readyFields = ENEA_BUILDING_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (
      definition.automatic
      || !field
      || field.status !== "ready"
      || field.testOnly
      || field.value === "Non indicato"
      || field.value === "Intervento umano richiesto"
    ) return [];
    const value = definition.normalizeValue ? definition.normalizeValue(field.value) : field.value;
    const selectValue = definition.selectValues?.[field.value];
    if (definition.control === "select" && definition.selectValues && !selectValue) return [];
    const prepared: EneaPortalRuntimeField = {
      portalId: definition.portalId,
      control: definition.control,
      value,
      ...(selectValue ? { selectValue } : {}),
    };
    return [{ ...definition, prepared }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = ENEA_BUILDING_PORTAL_FIELDS
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const runtime: EneaPortalScriptOptions = {
    fields: readyFields.map(({ prepared }) => prepared),
    pageName: "Immobile",
    markerIds: ["id-comune", "id-indirizzo", "id-mappale"],
    successMessage: "ENEA Lab: compilazione immobile conclusa. Nessun salvataggio o invio eseguito.",
  };
  const script = buildEneaPortalRuntimeScript(runtime);

  return { script, readyFieldIds, skippedFieldIds, runtime };
}
