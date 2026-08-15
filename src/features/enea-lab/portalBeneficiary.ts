import type { EneaLabMappedPractice } from "./types";
import { validateOperatorOverride } from "./operatorValidation";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalControl,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface BeneficiaryPortalFieldDefinition {
  fieldId: string;
  portalId: string;
  control: EneaPortalControl;
  validate?: boolean;
}

export interface EneaBeneficiaryPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

/**
 * Identificativi rilevati in sola lettura sul portale Bonus Fiscali ENEA 2026.
 * La lista riguarda esclusivamente la pagina "Anagrafica Beneficiario".
 */
export const ENEA_BENEFICIARY_PORTAL_FIELDS: readonly BeneficiaryPortalFieldDefinition[] = [
  { fieldId: "beneficiario.nome", portalId: "id-nome", control: "input" },
  { fieldId: "beneficiario.cognome", portalId: "id-cognome", control: "input" },
  { fieldId: "beneficiario.cf", portalId: "id-codice_fiscale", control: "input", validate: true },
  { fieldId: "beneficiario.data_nascita", portalId: "id-data_nascita", control: "input", validate: true },
  { fieldId: "beneficiario.sesso", portalId: "id-sesso", control: "select", validate: true },
  { fieldId: "beneficiario.nazione_nascita", portalId: "id-nazione_nascita", control: "select" },
  { fieldId: "beneficiario.comune_nascita", portalId: "id-comune_nascita", control: "autocomplete" },
  { fieldId: "beneficiario.nazione_residenza", portalId: "id-nazione_residenza", control: "select" },
  { fieldId: "beneficiario.comune_residenza", portalId: "id-comune_residenza", control: "autocomplete" },
  { fieldId: "beneficiario.indirizzo_residenza", portalId: "id-indirizzo_residenza", control: "input" },
  { fieldId: "beneficiario.civico_residenza", portalId: "id-civico_residenza", control: "input" },
  { fieldId: "beneficiario.cap_residenza", portalId: "id-cap_residenza", control: "input", validate: true },
  { fieldId: "beneficiario.telefono", portalId: "id-telefono", control: "input", validate: true },
] as const;

function isInternalPlaceholder(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("it");
  return normalized === "non indicato" || normalized === "intervento umano richiesto";
}

export function buildEneaBeneficiaryPortalScript(
  mapped: EneaLabMappedPractice,
): EneaBeneficiaryPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const readyFields = ENEA_BENEFICIARY_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (!field || field.status !== "ready" || field.testOnly || isInternalPlaceholder(field.value)) return [];

    // Difesa indipendente del builder: i campi strutturati gia ready vengono
    // rivalidati prima del runtime, cosi un mapping stale/alterato non puo
    // portare al portale CF, date, sesso, CAP o telefono formalmente invalidi.
    const validation = definition.validate
      ? validateOperatorOverride(definition.fieldId, field.value)
      : null;
    if (validation && !validation.valid) return [];

    return [{ ...definition, value: validation?.value ?? field.value }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = ENEA_BENEFICIARY_PORTAL_FIELDS
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const data = JSON.stringify(readyFields.map(({ portalId, control, value }) => ({
    portalId,
    control,
    value,
  })));

  const runtime: EneaPortalScriptOptions = {
    fields: JSON.parse(data),
    pageName: "Anagrafica Beneficiario",
    markerIds: ["id-nome", "id-codice_fiscale"],
    successMessage: "ENEA Lab: compilazione anagrafica conclusa. Nessun salvataggio o invio eseguito.",
  };
  const script = buildEneaPortalRuntimeScript(runtime);

  return { script, readyFieldIds, skippedFieldIds, runtime };
}
