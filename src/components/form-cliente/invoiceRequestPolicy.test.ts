import { describe, expect, it } from "vitest";
import type { FormSchema } from "@/types/form-module";
import { emptyFormData } from "@/types/form-cliente";
import { applyInvoiceRequestPolicy, customerMustUploadInvoice } from "./invoiceRequestPolicy";
import { validateDocumenti } from "./validation";

const schema: FormSchema = {
  steps: [{
    key: "documenti",
    label: "Documenti",
    fields: [
      { key: "fattura_url", label: "Fattura", type: "upload", required: true },
      { key: "bonifico_url", label: "Bonifico", type: "upload", required: true },
    ],
  }],
};

const productionLikeSchema: FormSchema = {
  steps: [
    {
      key: "fatture",
      label: "Fatture",
      fields: [
        { key: "fattura", label: "Inserisci fatture", type: "upload", required: true },
      ],
    },
    {
      key: "prodotto",
      label: "Dati VEPA",
      fields: [
        {
          key: "fattura_riporta_mq",
          label: "La fattura riporta i metri quadrati?",
          type: "boolean",
          required: true,
        },
        {
          key: "documento_misure_url",
          label: "Documento con le misure",
          type: "upload",
          required: true,
        },
        {
          key: "fattura_url",
          label: "Fattura VEPA",
          type: "upload",
        },
      ],
    },
  ],
};

describe("invoice request policy", () => {
  it("mantiene la fattura obbligatoria per i clienti finali CF", () => {
    expect(customerMustUploadInvoice("cliente_finale")).toBe(true);
    expect(applyInvoiceRequestPolicy(schema, true)).toBe(schema);
    expect(validateDocumenti(emptyFormData(), true)).toHaveProperty("documenti.fattura_url");
  });

  it("mantiene la richiesta fattura come fail-safe per pratiche legacy non classificate", () => {
    expect(customerMustUploadInvoice(null)).toBe(true);
    expect(customerMustUploadInvoice(undefined)).toBe(true);
    expect(customerMustUploadInvoice("valore_sconosciuto")).toBe(true);
    expect(applyInvoiceRequestPolicy(schema, customerMustUploadInvoice(null))).toBe(schema);
  });

  it("rimuove soltanto la fattura per le pratiche fatturate al rivenditore", () => {
    expect(customerMustUploadInvoice("rivenditore")).toBe(false);
    const filtered = applyInvoiceRequestPolicy(schema, false);
    expect(filtered.steps[0].fields.map((field) => field.key)).toEqual(["bonifico_url"]);
    expect(validateDocumenti(emptyFormData(), false)).not.toHaveProperty("documenti.fattura_url");
  });

  it("copre gli schemi reali Schermature e VEPA senza eliminare altri campi", () => {
    const filtered = applyInvoiceRequestPolicy(productionLikeSchema, false);

    expect(filtered.steps.map((step) => step.key)).toEqual(["prodotto"]);
    expect(filtered.steps[0].fields.map((field) => field.key)).toEqual([
      "fattura_riporta_mq",
      "documento_misure_url",
    ]);
  });

  it("non elimina un campo non-upload anche se usa una chiave riservata", () => {
    const nonUploadSchema: FormSchema = {
      steps: [{
        key: "prodotto",
        label: "Prodotto",
        fields: [{ key: "fattura", label: "Riferimento fattura", type: "text", required: true }],
      }],
    };

    expect(applyInvoiceRequestPolicy(nonUploadSchema, false)).toEqual(nonUploadSchema);
  });
});
