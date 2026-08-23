import type { EneaLabMappedPractice } from "./types";
import { resolveForeignBirthCountryFromFiscalCode } from "@/features/enea-shadow-crm/operationalRules";
import {
  buildEneaPortalRuntimeScript,
  type EneaCoBeneficiaryPerson,
  type EneaPortalControl,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface BeneficiaryPortalFieldDefinition {
  fieldId: string;
  portalId: string;
  control: EneaPortalControl;
}

export interface EneaBeneficiaryPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

function coBeneficiaryPerson(fieldsById: Map<string, EneaLabMappedPractice["sections"][number]["fields"][number]>): EneaCoBeneficiaryPerson | undefined {
  const name = fieldsById.get("beneficiario.cointestatario_nome");
  const surname = fieldsById.get("beneficiario.cointestatario_cognome");
  const taxCode = fieldsById.get("beneficiario.cointestatario_cf");
  if (![name, surname, taxCode].every((field) => field?.status === "ready" && !field.testOnly && !isInternalPlaceholder(field.value))) return undefined;
  return {
    name: name!.value,
    surname: surname!.value,
    taxCode: taxCode!.value.replace(/\s+/g, "").toUpperCase(),
    sourceIds: [...new Set([name!.source, surname!.source, taxCode!.source].filter(Boolean))],
    appliedRuleIds: [...new Set([...(name!.appliedRuleIds ?? []), ...(surname!.appliedRuleIds ?? []), ...(taxCode!.appliedRuleIds ?? [])])],
  };
}

/**
 * Identificativi rilevati in sola lettura sul portale Bonus Fiscali ENEA 2026.
 * La lista riguarda esclusivamente la pagina "Anagrafica Beneficiario".
 */
export const ENEA_BENEFICIARY_PORTAL_FIELDS: readonly BeneficiaryPortalFieldDefinition[] = [
  { fieldId: "beneficiario.nome", portalId: "id-nome", control: "input" },
  { fieldId: "beneficiario.cognome", portalId: "id-cognome", control: "input" },
  { fieldId: "beneficiario.cf", portalId: "id-codice_fiscale", control: "input" },
  { fieldId: "beneficiario.data_nascita", portalId: "id-data_nascita", control: "input" },
  { fieldId: "beneficiario.sesso", portalId: "id-sesso", control: "select" },
  { fieldId: "beneficiario.nazione_nascita", portalId: "id-nazione_nascita", control: "select" },
  { fieldId: "beneficiario.comune_nascita", portalId: "id-comune_nascita", control: "autocomplete" },
  { fieldId: "beneficiario.nazione_residenza", portalId: "id-nazione_residenza", control: "select" },
  { fieldId: "beneficiario.comune_residenza", portalId: "id-comune_residenza", control: "autocomplete" },
  { fieldId: "beneficiario.indirizzo_residenza", portalId: "id-indirizzo_residenza", control: "input" },
  { fieldId: "beneficiario.civico_residenza", portalId: "id-civico_residenza", control: "input" },
  { fieldId: "beneficiario.cap_residenza", portalId: "id-cap_residenza", control: "input" },
  { fieldId: "beneficiario.telefono", portalId: "id-telefono", control: "input" },
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
  const verifiedForeignBirth = resolveForeignBirthCountryFromFiscalCode(fieldsById.get("beneficiario.cf")?.value);
  const nationIsItaly = (fieldId: string) =>
    fieldsById.get(fieldId)?.value.trim().toLocaleLowerCase("it") === "italia";
  const readyFields = ENEA_BENEFICIARY_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (!field || field.status !== "ready" || field.testOnly || isInternalPlaceholder(field.value)) return [];
    // Sul portale ENEA il Comune italiano richiede una scelta dalla lista,
    // mentre il luogo estero e' un testo libero validato insieme alla Nazione.
    // Trattarlo comunque come autocomplete produce un falso blocco anche con
    // valore esatto e aria-invalid=false (caso reale Tychy/Polonia).
    const control = definition.fieldId === "beneficiario.comune_nascita"
      && !nationIsItaly("beneficiario.nazione_nascita")
      ? "input"
      : definition.fieldId === "beneficiario.comune_residenza"
        && !nationIsItaly("beneficiario.nazione_residenza")
        ? "input"
        : definition.control;
    const selectValue = definition.fieldId === "beneficiario.nazione_nascita"
      ? (nationIsItaly("beneficiario.nazione_nascita") ? "ita" : verifiedForeignBirth?.selectValue)
      : definition.fieldId === "beneficiario.nazione_residenza" && nationIsItaly("beneficiario.nazione_residenza")
        ? "ita"
        : undefined;
    const autocompleteQualifier = definition.fieldId === "beneficiario.comune_nascita"
      && nationIsItaly("beneficiario.nazione_nascita")
      && fieldsById.get("beneficiario.provincia_nascita")?.status === "ready"
      ? fieldsById.get("beneficiario.provincia_nascita")!.value.trim().toUpperCase()
      : undefined;
    return [{
      ...definition,
      control,
      value: field.value,
      ...(selectValue ? { selectValue } : {}),
      ...(autocompleteQualifier ? { autocompleteQualifier } : {}),
    }];
  });
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = ENEA_BENEFICIARY_PORTAL_FIELDS
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const data = JSON.stringify(readyFields.map(({ portalId, control, value, selectValue, autocompleteQualifier }) => ({
    portalId,
    control,
    value,
    ...(selectValue ? { selectValue } : {}),
    ...(autocompleteQualifier ? { autocompleteQualifier } : {}),
  })));
  const coBeneficiary = coBeneficiaryPerson(fieldsById);

  const runtime: EneaPortalScriptOptions = {
    fields: JSON.parse(data),
    pageName: "Anagrafica Beneficiario",
    markerIds: ["id-nome", "id-codice_fiscale"],
    successMessage: "ENEA Lab: compilazione anagrafica conclusa. Nessun salvataggio o invio eseguito.",
    ...(coBeneficiary ? { coBeneficiary } : {}),
  };
  const script = buildEneaPortalRuntimeScript(runtime);

  return {
    script,
    readyFieldIds: coBeneficiary ? [...readyFieldIds, "beneficiario.cointestatario_nome", "beneficiario.cointestatario_cognome", "beneficiario.cointestatario_cf"] : readyFieldIds,
    skippedFieldIds,
    runtime,
  };
}
