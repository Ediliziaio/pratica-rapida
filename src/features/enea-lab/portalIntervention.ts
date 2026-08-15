import type { EneaLabMappedPractice } from "./types";
import { validateOperatorOverride } from "./operatorValidation";
import {
  ENEA_INTERVENTION_SCOPE,
  ENEA_INTERVENTION_TYPE,
} from "./interventionRules";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalControl,
  type EneaPortalRuntimeField,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface InterventionPortalFieldDefinition {
  fieldId: string;
  portalId?: string;
  portalIds?: Readonly<Record<string, string>>;
  control: EneaPortalControl;
  selectValues?: Readonly<Record<string, string>>;
  automatic?: boolean;
  validate?: boolean;
}

export interface EneaInterventionPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

const SCOPE_VALUES = {
  [ENEA_INTERVENTION_SCOPE.unitInMultiUnitBuilding]: "253",
  [ENEA_INTERVENTION_SCOPE.singleUnitBuilding]: "254",
  [ENEA_INTERVENTION_SCOPE.wholeBuilding]: "250",
} as const;

const YES_NO_VALUES = {
  "Sì": "S",
  No: "N",
} as const;

const INTERVENTION_BUTTON_IDS = {
  [ENEA_INTERVENTION_TYPE.envelope]: "id-comma-345a",
  [ENEA_INTERVENTION_TYPE.screening]: "id-comma-345b",
  [ENEA_INTERVENTION_TYPE.heatPump]: "id-comma-347a",
} as const;

/** Identificativi osservati sulla pagina "Intervento" ENEA 2026. */
export const ENEA_INTERVENTION_PORTAL_FIELDS: readonly InterventionPortalFieldDefinition[] = [
  { fieldId: "intervento.ambito", portalId: "id-immobile", control: "select", selectValues: SCOPE_VALUES },
  { fieldId: "intervento.unita_oggetto", portalId: "id-unita", control: "input", validate: true },
  { fieldId: "intervento.accorpamenti", portalId: "id-acc", control: "select", selectValues: YES_NO_VALUES },
  { fieldId: "intervento.data_inizio", portalId: "id-data_inizio", control: "input", validate: true },
  { fieldId: "intervento.data_fine", portalId: "id-data_fine", control: "input", validate: true },
  { fieldId: "intervento.tipo", portalIds: INTERVENTION_BUTTON_IDS, control: "button" },
  { fieldId: "intervento.impianto_centralizzato", portalId: "id-impianto_centralizzato", control: "select", selectValues: YES_NO_VALUES },
  { fieldId: "intervento.zona_urbanistica", portalId: "id-zona_urbanistica", control: "select", automatic: true },
] as const;

export function buildEneaInterventionPortalScript(
  mapped: EneaLabMappedPractice,
): EneaInterventionPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const readyFields = ENEA_INTERVENTION_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (
      definition.automatic
      || !field
      || field.status !== "ready"
      || field.testOnly
      || field.value === "Non indicato"
      || field.value === "Intervento umano richiesto"
    ) return [];
    const validation = definition.validate
      ? validateOperatorOverride(definition.fieldId, field.value)
      : null;
    if (validation && !validation.valid) return [];
    const value = validation?.value ?? field.value;
    const portalId = definition.portalIds?.[value] ?? definition.portalId;
    if (!portalId) return [];
    const selectValue = definition.selectValues?.[value];
    if (definition.control === "select" && definition.selectValues && !selectValue) return [];
    const prepared: EneaPortalRuntimeField = {
      portalId,
      control: definition.control,
      value,
      ...(selectValue ? { selectValue } : {}),
    };
    return [{ ...definition, prepared }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = ENEA_INTERVENTION_PORTAL_FIELDS
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const runtime: EneaPortalScriptOptions = {
    fields: readyFields.map(({ prepared }) => prepared),
    pageName: "Intervento",
    markerIds: ["id-immobile", "id-unita", "id-data_fine"],
    successMessage: "ENEA Lab: compilazione intervento conclusa. Nessun salvataggio o invio eseguito.",
  };
  const script = buildEneaPortalRuntimeScript(runtime);

  return { script, readyFieldIds, skippedFieldIds, runtime };
}
