import type { EneaLabMappedPractice } from "./types";
import {
  ENEA_ENERGY_CARRIER,
  ENEA_PLANT_DISTRIBUTION,
  ENEA_PLANT_REGULATION,
  ENEA_PLANT_TERMINAL,
  ENEA_PLANT_TYPE,
} from "./plantRules";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalControl,
  type EneaPortalRuntimeField,
} from "./portalScript";

interface PlantPortalFieldDefinition {
  fieldId: string;
  portalId: string;
  control: EneaPortalControl;
  selectValues?: Readonly<Record<string, string>>;
}

export interface EneaPlantPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
}

const PLANT_TYPE_VALUES = {
  [ENEA_PLANT_TYPE.autonomo]: "26",
  [ENEA_PLANT_TYPE.centralizzato]: "27",
  [ENEA_PLANT_TYPE.centralizzatoConContabilizzazione]: "28",
} as const;

const TERMINAL_VALUES = {
  [ENEA_PLANT_TERMINAL.radiators]: "34",
  [ENEA_PLANT_TERMINAL.embeddedRadiantPanels]: "36",
  [ENEA_PLANT_TERMINAL.other]: "37",
} as const;

const DISTRIBUTION_VALUES = {
  [ENEA_PLANT_DISTRIBUTION]: "40",
} as const;

const REGULATION_VALUES = {
  [ENEA_PLANT_REGULATION]: "44",
} as const;

const ENERGY_CARRIER_VALUES = {
  [ENEA_ENERGY_CARRIER.naturalGas]: "45",
  [ENEA_ENERGY_CARRIER.diesel]: "46",
  [ENEA_ENERGY_CARRIER.lpg]: "47",
  [ENEA_ENERGY_CARRIER.districtHeating]: "48",
  [ENEA_ENERGY_CARRIER.electricity]: "50",
} as const;

const YES_NO_VALUES = {
  "Sì": "S",
  No: "N",
} as const;

/** Identificativi e valori osservati sulla pagina "Impianto termico esistente" ENEA 2026. */
export const ENEA_PLANT_PORTAL_FIELDS: readonly PlantPortalFieldDefinition[] = [
  { fieldId: "impianto.tipo", portalId: "id-impianto", control: "select", selectValues: PLANT_TYPE_VALUES },
  { fieldId: "impianto.terminali", portalId: "id-erogazione", control: "select", selectValues: TERMINAL_VALUES },
  { fieldId: "impianto.distribuzione", portalId: "id-distribuzione", control: "select", selectValues: DISTRIBUTION_VALUES },
  { fieldId: "impianto.regolazione", portalId: "id-regolazione", control: "select", selectValues: REGULATION_VALUES },
  { fieldId: "impianto.combustibile", portalId: "id-vettore", control: "select", selectValues: ENERGY_CARRIER_VALUES },
  { fieldId: "impianto.condizionamento", portalId: "id-estivo", control: "select", selectValues: YES_NO_VALUES },
  { fieldId: "impianto.manutenzione", portalId: "id-interventi", control: "input" },
] as const;

export function buildEneaPlantPortalScript(
  mapped: EneaLabMappedPractice,
): EneaPlantPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const readyFields = ENEA_PLANT_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (
      !field
      || field.status !== "ready"
      || field.testOnly
      || field.value === "Non indicato"
      || field.value === "Intervento umano richiesto"
    ) return [];
    const selectValue = definition.selectValues?.[field.value];
    if (definition.control === "select" && definition.selectValues && !selectValue) return [];
    const prepared: EneaPortalRuntimeField = {
      portalId: definition.portalId,
      control: definition.control,
      value: field.value,
      ...(selectValue ? { selectValue } : {}),
    };
    return [{ ...definition, prepared }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = ENEA_PLANT_PORTAL_FIELDS
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const script = buildEneaPortalRuntimeScript({
    fields: readyFields.map(({ prepared }) => prepared),
    pageName: "Impianto termico esistente",
    markerIds: ["id-impianto", "id-erogazione", "id-vettore"],
    successMessage: "ENEA Lab: compilazione impianto esistente conclusa. Nessun salvataggio o invio eseguito.",
  });

  return { script, readyFieldIds, skippedFieldIds };
}
