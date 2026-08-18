import type {
  Combustibile,
  FormClienteData,
  ImpiantoTipo,
  Terminali,
  TipoCaldaia,
} from "@/types/form-cliente";

export type AprImpiantoTermicoIntakeBlocker =
  | "impianto-termico-product-mismatch"
  | "impianto-termico-plant-data-incomplete"
  | "impianto-termico-system-booklet-missing"
  | "impianto-termico-invoice-missing"
  | "impianto-termico-completed-enea-ground-truth-missing"
  | "impianto-termico-portal-technical-contract-unobserved";

export interface AprImpiantoTermicoIntakeFields {
  systemType: ImpiantoTipo | "";
  terminals: Terminali | "";
  fuel: Combustibile | "";
  generatorType: TipoCaldaia | "";
  hasCooling: boolean | null;
  hasSystemBooklet: boolean;
}

export interface AprImpiantoTermicoIntakeContext {
  hasInvoice: boolean;
  hasCompletedEneaPdf: boolean;
}

export interface AprImpiantoTermicoIntake {
  productType: "impianto_termico";
  fields: AprImpiantoTermicoIntakeFields;
  structuredIntakeComplete: boolean;
  blockers: AprImpiantoTermicoIntakeBlocker[];
  shadowTechnicalMappingAllowed: false;
  officialSubmissionAllowed: false;
}

const EMPTY_FIELDS: AprImpiantoTermicoIntakeFields = {
  systemType: "",
  terminals: "",
  fuel: "",
  generatorType: "",
  hasCooling: null,
  hasSystemBooklet: false,
};

/**
 * Adapter APR intake-only per gli interventi sull'impianto termico.
 * Riusa soltanto dati già strutturati nel CRM e la presenza del libretto;
 * non deduce prestazioni del nuovo generatore, COP/PER, potenze, risparmi,
 * campi 347A o selettori del portale non ancora osservati.
 */
export function buildAprImpiantoTermicoIntake(
  form: FormClienteData,
  context: AprImpiantoTermicoIntakeContext,
): AprImpiantoTermicoIntake {
  const productMatches = form.prodotto.tipo === "impianto_termico";
  const fields: AprImpiantoTermicoIntakeFields = productMatches
    ? {
        systemType: form.impianto.tipo,
        terminals: form.impianto.terminali,
        fuel: form.impianto.combustibile,
        generatorType: form.impianto.tipo_caldaia,
        hasCooling: form.impianto.aria_condizionata,
        hasSystemBooklet: Boolean(form.impianto.libretto_url?.trim()),
      }
    : { ...EMPTY_FIELDS };

  const plantDataComplete = Boolean(
    productMatches
    && fields.systemType
    && fields.terminals
    && fields.fuel
    && fields.generatorType
    && fields.hasCooling !== null,
  );
  const structuredIntakeComplete = plantDataComplete && fields.hasSystemBooklet;

  const blockers: AprImpiantoTermicoIntakeBlocker[] = [];
  if (!productMatches) {
    blockers.push("impianto-termico-product-mismatch");
  } else {
    if (!plantDataComplete) blockers.push("impianto-termico-plant-data-incomplete");
    if (!fields.hasSystemBooklet) blockers.push("impianto-termico-system-booklet-missing");
  }
  if (!context.hasInvoice) blockers.push("impianto-termico-invoice-missing");
  if (!context.hasCompletedEneaPdf) {
    blockers.push("impianto-termico-completed-enea-ground-truth-missing");
  }

  // Hard gate: il Comma 347A è osservato nel selettore intervento, ma non la
  // pagina tecnica specifica del nuovo impianto/generatore. Nessun mapping
  // shadow tecnico viene promosso finché quel contratto non è congelato.
  blockers.push("impianto-termico-portal-technical-contract-unobserved");

  return {
    productType: "impianto_termico",
    fields,
    structuredIntakeComplete,
    blockers,
    shadowTechnicalMappingAllowed: false,
    officialSubmissionAllowed: false,
  };
}
