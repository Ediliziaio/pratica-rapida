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

describe("invoice request policy", () => {
  it("mantiene la fattura obbligatoria per i clienti finali CF", () => {
    expect(customerMustUploadInvoice("cliente_finale")).toBe(true);
    expect(applyInvoiceRequestPolicy(schema, true)).toBe(schema);
    expect(validateDocumenti(emptyFormData(), true)).toHaveProperty("documenti.fattura_url");
  });

  it("rimuove soltanto la fattura per le pratiche fatturate al rivenditore", () => {
    expect(customerMustUploadInvoice("rivenditore")).toBe(false);
    const filtered = applyInvoiceRequestPolicy(schema, false);
    expect(filtered.steps[0].fields.map((field) => field.key)).toEqual(["bonifico_url"]);
    expect(validateDocumenti(emptyFormData(), false)).not.toHaveProperty("documenti.fattura_url");
  });
});
