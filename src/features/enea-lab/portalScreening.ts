import type { EneaLabMappedPractice } from "./types";
import {
  ENEA_SCREENING_CALCULATION,
  ENEA_SCREENING_INSTALLATION,
  ENEA_SCREENING_MATERIAL,
  ENEA_SCREENING_REGULATION,
  ENEA_SCREENING_TYPE,
} from "./screeningRules";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalControl,
  type EneaPortalRuntimeField,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface ScreeningPortalFieldDefinition {
  fieldSuffix: string;
  portalId: string;
  control: EneaPortalControl;
  selectValues?: Readonly<Record<string, string>>;
  numeric?: boolean;
}

export interface EneaScreeningPortalPreparation {
  script: string;
  itemIndex: number;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

const TYPE_VALUES = {
  [ENEA_SCREENING_TYPE.awning]: "127",
  [ENEA_SCREENING_TYPE.otherSolarScreening]: "169",
} as const;

const INSTALLATION_VALUES = {
  [ENEA_SCREENING_INSTALLATION.external]: "192",
} as const;

const EXPOSURE_VALUES = {
  Nord: "128",
  "Nord-Est": "129",
  Est: "130",
  "Sud-Est": "131",
  Sud: "132",
  "Sud-Ovest": "133",
  Ovest: "134",
  "Nord-Ovest": "135",
  "P-orizzontale": "311",
} as const;

const CALCULATION_VALUES = {
  [ENEA_SCREENING_CALCULATION.supplierDeclared]: "193",
} as const;

const MATERIAL_VALUES = {
  [ENEA_SCREENING_MATERIAL.fabric]: "136",
  [ENEA_SCREENING_MATERIAL.wood]: "137",
  [ENEA_SCREENING_MATERIAL.plastic]: "138",
  [ENEA_SCREENING_MATERIAL.pvc]: "139",
  [ENEA_SCREENING_MATERIAL.metal]: "140",
  [ENEA_SCREENING_MATERIAL.mixed]: "141",
  [ENEA_SCREENING_MATERIAL.other]: "142",
} as const;

const REGULATION_VALUES = {
  [ENEA_SCREENING_REGULATION.manual]: "143",
  [ENEA_SCREENING_REGULATION.automatic]: "144",
  [ENEA_SCREENING_REGULATION.servoAssisted]: "145",
} as const;

/** Identificativi e valori osservati nella finestra "Aggiungi schermatura solare" ENEA 2026. */
export const ENEA_SCREENING_PORTAL_FIELDS: readonly ScreeningPortalFieldDefinition[] = [
  { fieldSuffix: "tipo", portalId: "id-tipo", control: "select", selectValues: TYPE_VALUES },
  { fieldSuffix: "installazione", portalId: "id-inst", control: "select", selectValues: INSTALLATION_VALUES },
  { fieldSuffix: "superficie", portalId: "id-sup_s", control: "input", numeric: true },
  { fieldSuffix: "superficie_finestrata", portalId: "id-sup_f", control: "input", numeric: true },
  { fieldSuffix: "esposizione", portalId: "id-esp", control: "select", selectValues: EXPOSURE_VALUES },
  { fieldSuffix: "modalita_calcolo", portalId: "id-calc", control: "select", selectValues: CALCULATION_VALUES },
  { fieldSuffix: "gtot", portalId: "id-gtot", control: "input", numeric: true },
  { fieldSuffix: "materiale", portalId: "id-mat", control: "select", selectValues: MATERIAL_VALUES },
  { fieldSuffix: "regolazione", portalId: "id-mec", control: "select", selectValues: REGULATION_VALUES },
] as const;

function numericValue(value: string): string {
  return value.trim().replace(/[^0-9,.-]/g, "");
}

function isVerifiedGTot(fieldId: string, source: string): boolean {
  if (!fieldId.endsWith(".gtot")) return true;
  return source === "Fattura" || source === "Inserimento operatore";
}

export function buildEneaScreeningPortalScript(
  mapped: EneaLabMappedPractice,
  itemIndex = 0,
): EneaScreeningPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const prefix = `schermature.${itemIndex}.`;
  const readyFields = ENEA_SCREENING_PORTAL_FIELDS.flatMap((definition) => {
    const fieldId = `${prefix}${definition.fieldSuffix}`;
    const field = fieldsById.get(fieldId);
    if (
      !field
      || field.status !== "ready"
      || field.testOnly
      || field.value === "Non indicato"
      || field.value === "Intervento umano richiesto"
      || !isVerifiedGTot(fieldId, field.source)
    ) return [];
    const value = definition.numeric ? numericValue(field.value) : field.value;
    const selectValue = definition.selectValues?.[value];
    if (!value || (definition.control === "select" && definition.selectValues && !selectValue)) return [];
    const prepared: EneaPortalRuntimeField = {
      portalId: definition.portalId,
      control: definition.control,
      value,
      ...(selectValue ? { selectValue } : {}),
    };
    return [{ fieldId, prepared }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = ENEA_SCREENING_PORTAL_FIELDS
    .map(({ fieldSuffix }) => `${prefix}${fieldSuffix}`)
    .filter((fieldId) => !readySet.has(fieldId));
  const runtime: EneaPortalScriptOptions = {
    fields: readyFields.map(({ prepared }) => prepared),
    pageName: "Aggiungi schermatura solare",
    markerIds: ["id-tipo", "id-sup_s", "id-gtot"],
    successMessage: `ENEA Lab: schermatura ${itemIndex + 1} compilata. Nessun salvataggio o invio eseguito.`,
  };
  const script = buildEneaPortalRuntimeScript(runtime);

  return { script, itemIndex, readyFieldIds, skippedFieldIds, runtime };
}
