import { describe, expect, it } from "vitest";
import { isStaffCfIntake, withCfCustomerDate } from "./cfCustomerEvidence";
import { applyInvoiceRequestPolicy } from "@/components/form-cliente/invoiceRequestPolicy";
import { validateAllDynamicSteps } from "@/components/form-cliente/dynamicValidation";
import type { FormSchema } from "@/types/form-module";

const base: FormSchema = { steps: [{ key: "richiedente", label: "Richiedente", fields: [] }] };

describe("pratiche CF: fattura e fine lavori dal cliente", () => {
  it("esenta solo lo staff che apre Servizio Completo CF", () => {
    const input = { isInternal: true, publicMode: false, isFgasOnly: false, tipoServizio: "servizio_completo", tipoFatturazione: "cliente_finale" };
    expect(isStaffCfIntake(input)).toBe(true);
    expect(isStaffCfIntake({ ...input, tipoFatturazione: "rivenditore" })).toBe(false);
    expect(isStaffCfIntake({ ...input, tipoServizio: "documenti_forniti" })).toBe(false);
    expect(isStaffCfIntake({ ...input, isInternal: false })).toBe(false);
    expect(isStaffCfIntake({ ...input, isFgasOnly: true })).toBe(false);
  });

  it("chiede al cliente CF sia la fattura sia la fine lavori anche con modulo DB incompleto", () => {
    const schema = withCfCustomerDate(applyInvoiceRequestPolicy(base, true), true);
    expect(Object.keys(validateAllDynamicSteps(schema, {}))).toContain("documenti.data_fine_lavori");
    expect(Object.keys(validateAllDynamicSteps(schema, {}))).toContain("documenti.fattura_url");
    const fields = schema.steps.find((step) => step.key === "documenti")?.fields ?? [];
    expect(fields.filter((field) => field.key === "data_fine_lavori")).toHaveLength(1);
    expect(withCfCustomerDate(base, false)).toBe(base);
  });
});
