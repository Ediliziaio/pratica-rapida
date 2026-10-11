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
    expect(applyInvoiceRequestPolicy(schema, true).steps[0].fields.find((field) => field.key === "fattura_url")).toMatchObject({
      key: "fattura_url",
      required: true,
    });
    expect(validateDocumenti(emptyFormData(), true)).toHaveProperty("documenti.fattura_url");
  });

  it("mantiene la richiesta fattura come fail-safe per pratiche legacy non classificate", () => {
    expect(customerMustUploadInvoice(null)).toBe(true);
    expect(customerMustUploadInvoice(undefined)).toBe(true);
    expect(customerMustUploadInvoice("valore_sconosciuto")).toBe(true);
    expect(applyInvoiceRequestPolicy(schema, customerMustUploadInvoice(null)).steps[0].fields.find((field) => field.key === "fattura_url")).toMatchObject({
      key: "fattura_url",
      required: true,
    });
  });

  it("aggiunge una sola fattura obbligatoria ai moduli CF che non la prevedono", () => {
    const infissiSchema: FormSchema = {
      steps: [{
        key: "prodotto",
        label: "Infissi",
        fields: [{ key: "materiale", label: "Materiale", type: "text", required: true }],
      }],
    };

    const guarded = applyInvoiceRequestPolicy(infissiSchema, true);
    expect(guarded.steps.map((step) => step.key)).toEqual(["prodotto", "documenti"]);
    expect(guarded.steps[1].fields.find((field) => field.key === "fattura_url")).toEqual(expect.objectContaining({
      key: "fattura_url",
      type: "upload",
      required: true,
    }));
  });

  it("riusa la sezione documenti esistente senza duplicarla", () => {
    const withoutInvoice: FormSchema = {
      steps: [{
        key: "documenti",
        label: "Documenti",
        fields: [{ key: "bonifico_url", label: "Bonifico", type: "upload" }],
      }],
    };

    const guarded = applyInvoiceRequestPolicy(withoutInvoice, true);
    expect(guarded.steps).toHaveLength(1);
    expect(guarded.steps[0].fields.map((field) => field.key)).toEqual([
      "finanziamento",
      "bonifico_url",
      "fattura_url",
    ]);
  });

  it("rende obbligatoria la fattura CF già presente ma facoltativa", () => {
    const guarded = applyInvoiceRequestPolicy(productionLikeSchema, true);
    const vepaInvoice = guarded.steps[1].fields.find((field) => field.key === "fattura_url");
    expect(vepaInvoice?.required).toBe(true);
    expect(guarded.steps.flatMap((step) => step.fields).filter((field) => field.key === "fattura_url")).toHaveLength(1);
  });

  it("rimuove soltanto la fattura per le pratiche fatturate al rivenditore", () => {
    expect(customerMustUploadInvoice("rivenditore")).toBe(false);
    const filtered = applyInvoiceRequestPolicy(schema, false);
    expect(filtered.steps[0].fields.map((field) => field.key)).toEqual(["finanziamento", "bonifico_url"]);
    expect(validateDocumenti(emptyFormData(), false)).not.toHaveProperty("documenti.fattura_url");
  });

  it("aggiunge la richiesta bonifici ai moduli dinamici che prima la annunciavano soltanto", () => {
    const schermatureSchema: FormSchema = {
      steps: [{
        key: "fatture",
        label: "Fatture",
        fields: [{ key: "fattura", label: "Inserisci fatture", type: "upload", required: true }],
      }],
    };

    const filtered = applyInvoiceRequestPolicy(schermatureSchema, false);
    expect(filtered.steps).toHaveLength(1);
    expect(filtered.steps[0].label).toBe("Documenti di pagamento");
    expect(filtered.steps[0].fields.map((field) => field.key)).toEqual([
      "finanziamento",
      "bonifico_url",
    ]);
    expect(filtered.steps[0].fields[1]).toMatchObject({
      required: true,
      multiple: true,
      visible_if: { path: "fatture.finanziamento", not_equals: "si" },
    });
  });

  it("copre gli schemi reali Schermature e VEPA senza eliminare altri campi", () => {
    const filtered = applyInvoiceRequestPolicy(productionLikeSchema, false);

    expect(filtered.steps.map((step) => step.key)).toEqual(["fatture", "prodotto"]);
    expect(filtered.steps[0].fields.map((field) => field.key)).toEqual([
      "finanziamento",
      "bonifico_url",
    ]);
    expect(filtered.steps[1].fields.map((field) => field.key)).toEqual([
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

    const guarded = applyInvoiceRequestPolicy(nonUploadSchema, false);
    expect(guarded.steps[0]).toEqual(nonUploadSchema.steps[0]);
    expect(guarded.steps[1].fields.map((field) => field.key)).toEqual([
      "finanziamento",
      "bonifico_url",
    ]);
  });
});
