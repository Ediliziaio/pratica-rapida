import type { EneaLabMappedPractice } from "./types";
import { validateOperatorOverride } from "./operatorValidation";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalRuntimeField,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface GeneratorPortalFieldDefinition {
  fieldId: string;
  portalId: string;
}

export interface EneaGeneratorPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

const GENERATOR_PORTAL_FIELDS: readonly GeneratorPortalFieldDefinition[] = [
  { fieldId: "impianto.numero_generatori", portalId: "id-num" },
  { fieldId: "impianto.rendimento", portalId: "id-n" },
  { fieldId: "impianto.potenza", portalId: "id-pn" },
] as const;

function numericValue(value: string): string {
  const token = value.trim().match(/[+-]?\d+(?:[.,]\d+)*/)?.[0] ?? "";
  const tokenMatch = token.match(/^([+-]?)(\d+(?:[.,]\d+)*)$/);
  if (!tokenMatch) return "";
  const [, sign, body] = tokenMatch;

  // Mantieni le frazioni con zero iniziale (0.080 = 0,08), ma applica la
  // stessa convenzione del validatore ai separatori italiani delle migliaia.
  if (/^0\.\d+$/.test(body)) return `${sign}${body}`;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(body)) {
    return `${sign}${body.replace(/\./g, "")}`;
  }
  return `${sign}${body}`;
}

function isValidGeneratorValue(fieldId: string, value: string): boolean {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return false;
  if (fieldId === "impianto.numero_generatori") return Number.isInteger(parsed) && parsed > 0;
  if (fieldId === "impianto.rendimento") return parsed > 0 && parsed <= 100;
  if (fieldId === "impianto.potenza") return parsed > 0;
  return false;
}

/** Compila soltanto la finestra del generatore gia aperta dall'operatore. */
export function buildEneaGeneratorPortalScript(
  mapped: EneaLabMappedPractice,
  includeTestValues = false,
): EneaGeneratorPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const readyFields = GENERATOR_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    const usableOfficialValue = field?.status === "ready" && !field.testOnly;
    const usableTestValue = includeTestValues
      && Boolean(field?.value)
      && Boolean(field?.testOnly || field?.status === "review" || usableOfficialValue);
    if (!field || (!usableOfficialValue && !usableTestValue)) return [];

    // Difesa indipendente del builder: non reinterpretare un mapping stale/alterato
    // concatenando piu numeri (es. "25 x 2 kW" -> "252"). Usa la stessa
    // validazione fail-closed degli override prima di normalizzare il valore.
    const validation = validateOperatorOverride(definition.fieldId, field.value);
    if (!validation.valid) return [];
    const value = numericValue(validation.value);
    if (!value || !isValidGeneratorValue(definition.fieldId, value)) return [];
    const prepared: EneaPortalRuntimeField = {
      portalId: definition.portalId,
      control: "input",
      value,
    };
    return [{ ...definition, prepared }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = GENERATOR_PORTAL_FIELDS
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const runtime: EneaPortalScriptOptions = {
    fields: readyFields.map(({ prepared }) => prepared),
    pageName: "Generatore dell'impianto termico",
    markerIds: ["id-num", "id-n", "id-pn"],
    successMessage: "ENEA Lab: generatore compilato. Nessun salvataggio o invio eseguito.",
  };

  return {
    script: buildEneaPortalRuntimeScript(runtime),
    readyFieldIds,
    skippedFieldIds,
    runtime,
  };
}
