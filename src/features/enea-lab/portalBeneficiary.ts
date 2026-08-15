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

const FISCAL_CODE_OMOCODIA_DIGITS: Record<string, string> = {
  L: "0",
  M: "1",
  N: "2",
  P: "3",
  Q: "4",
  R: "5",
  S: "6",
  T: "7",
  U: "8",
  V: "9",
};
const FISCAL_CODE_MONTHS: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  H: 6,
  L: 7,
  M: 8,
  P: 9,
  R: 10,
  S: 11,
  T: 12,
};
const BENEFICIARY_IDENTITY_FIELD_IDS = new Set([
  "beneficiario.cf",
  "beneficiario.data_nascita",
  "beneficiario.sesso",
]);

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

function fiscalCodeNumericPair(value: string): number | null {
  const decoded = [...value.toUpperCase()]
    .map((character) => FISCAL_CODE_OMOCODIA_DIGITS[character] ?? character)
    .join("");
  return /^\d{2}$/.test(decoded) ? Number(decoded) : null;
}

function birthDateParts(value: string): { year: number; month: number; day: number } | null {
  const italian = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (italian) {
    return { year: Number(italian[3]), month: Number(italian[2]), day: Number(italian[1]) };
  }
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  return null;
}

function hasCoherentBeneficiaryIdentity(
  fieldsById: Map<string, EneaLabMappedPractice["sections"][number]["fields"][number]>,
): boolean {
  const fiscalCode = fieldsById.get("beneficiario.cf");
  const birthDate = fieldsById.get("beneficiario.data_nascita");
  const sex = fieldsById.get("beneficiario.sesso");

  if (
    !fiscalCode
    || !birthDate
    || !sex
    || fiscalCode.status !== "ready"
    || birthDate.status !== "ready"
    || sex.status !== "ready"
    || fiscalCode.testOnly
    || birthDate.testOnly
    || sex.testOnly
  ) return true;

  const normalizedFiscalCode = fiscalCode.value.replace(/\s/g, "").toUpperCase();
  if (normalizedFiscalCode.length !== 16) return false;

  const fiscalYear = fiscalCodeNumericPair(normalizedFiscalCode.slice(6, 8));
  const fiscalMonth = FISCAL_CODE_MONTHS[normalizedFiscalCode[8]];
  const fiscalDayCode = fiscalCodeNumericPair(normalizedFiscalCode.slice(9, 11));
  const parsedBirthDate = birthDateParts(birthDate.value);
  if (fiscalYear === null || fiscalMonth === undefined || fiscalDayCode === null || !parsedBirthDate) return false;

  const fiscalSex = fiscalDayCode >= 41 && fiscalDayCode <= 71
    ? "F"
    : fiscalDayCode >= 1 && fiscalDayCode <= 31
      ? "M"
      : null;
  if (!fiscalSex) return false;
  const fiscalDay = fiscalSex === "F" ? fiscalDayCode - 40 : fiscalDayCode;

  return parsedBirthDate.year % 100 === fiscalYear
    && parsedBirthDate.month === fiscalMonth
    && parsedBirthDate.day === fiscalDay
    && sex.value.trim().toUpperCase() === fiscalSex;
}

export function buildEneaBeneficiaryPortalScript(
  mapped: EneaLabMappedPractice,
): EneaBeneficiaryPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const coherentIdentity = hasCoherentBeneficiaryIdentity(fieldsById);
  const readyFields = ENEA_BENEFICIARY_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (!field || field.status !== "ready" || field.testOnly || isInternalPlaceholder(field.value)) return [];

    // Difesa indipendente del builder: CF, data e sesso possono essere validi
    // singolarmente ma descrivere persone diverse. Se la terna e incoerente,
    // non prepariamo nessuno dei tre valori nel runtime della pagina.
    if (BENEFICIARY_IDENTITY_FIELD_IDS.has(definition.fieldId) && !coherentIdentity) return [];

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
