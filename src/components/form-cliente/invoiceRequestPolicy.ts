import type { FormSchema } from "@/types/form-module";

const INVOICE_FIELD_KEYS = new Set([
  "fattura",
  "fattura_url",
  "fattura_installatore",
  "fattura_lavori",
]);

/**
 * La fattura viene richiesta al cliente soltanto nelle pratiche CF, cioè
 * quando il costo della pratica è a carico del cliente finale.
 */
export function customerMustUploadInvoice(tipoFatturazione: string | null | undefined): boolean {
  return tipoFatturazione === "cliente_finale";
}

/**
 * I moduli dinamici arrivano dal DB: per le pratiche fatturate al rivenditore
 * rimuoviamo esclusivamente il campo fattura, lasciando invariati tutti gli
 * altri documenti e tutte le altre regole dello schema.
 */
export function applyInvoiceRequestPolicy(
  schema: FormSchema,
  requireCustomerInvoice: boolean,
): FormSchema {
  if (requireCustomerInvoice) return schema;

  return {
    ...schema,
    steps: (schema.steps ?? []).map((step) => ({
      ...step,
      fields: (step.fields ?? []).filter((field) =>
        !(step.key === "documenti" && INVOICE_FIELD_KEYS.has(field.key.toLowerCase()))
      ),
    })),
  };
}
