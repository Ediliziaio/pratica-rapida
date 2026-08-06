import type { EneaLabMappedPractice } from "./types";

type PortalControl = "input" | "select";

interface BeneficiaryPortalFieldDefinition {
  fieldId: string;
  portalId: string;
  control: PortalControl;
}

export interface EneaBeneficiaryPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
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
  { fieldId: "beneficiario.comune_nascita", portalId: "id-comune_nascita", control: "input" },
  { fieldId: "beneficiario.nazione_residenza", portalId: "id-nazione_residenza", control: "select" },
  { fieldId: "beneficiario.comune_residenza", portalId: "id-comune_residenza", control: "input" },
  { fieldId: "beneficiario.indirizzo_residenza", portalId: "id-indirizzo_residenza", control: "input" },
  { fieldId: "beneficiario.civico_residenza", portalId: "id-civico_residenza", control: "input" },
  { fieldId: "beneficiario.cap_residenza", portalId: "id-cap_residenza", control: "input" },
  { fieldId: "beneficiario.telefono", portalId: "id-telefono", control: "input" },
] as const;

export function buildEneaBeneficiaryPortalScript(
  mapped: EneaLabMappedPractice,
): EneaBeneficiaryPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const readyFields = ENEA_BENEFICIARY_PORTAL_FIELDS.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    if (!field || field.status !== "ready" || field.testOnly) return [];
    return [{ ...definition, value: field.value }];
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

  const script = `(()=>{const data=${data};const result={compiled:[],notFound:[],notAvailable:[]};if(!/(^|\\.)enea\\.it$/i.test(location.hostname)){throw new Error("Aprire la pagina Anagrafica Beneficiario del portale ENEA prima di eseguire la compilazione.");}const setValue=(element,value)=>{const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,"value")?.set;if(setter)setter.call(element,value);else element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));};for(const item of data){const element=document.getElementById(item.portalId);if(!element){result.notFound.push(item.portalId);continue;}if(item.control==="select"){const wanted=item.value.trim().toLocaleLowerCase("it");const option=[...element.options].find(candidate=>candidate.value.toLocaleLowerCase("it")===wanted||candidate.text.trim().toLocaleLowerCase("it")===wanted);if(!option){result.notAvailable.push(item.portalId);continue;}setValue(element,option.value);}else{setValue(element,item.value);}result.compiled.push(item.portalId);}console.info("ENEA Lab: compilazione anagrafica conclusa. Nessun salvataggio o invio eseguito.",result);return result;})()`;

  return { script, readyFieldIds, skippedFieldIds };
}
