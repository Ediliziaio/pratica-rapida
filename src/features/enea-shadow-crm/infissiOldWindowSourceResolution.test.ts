import { describe, expect, it } from "vitest";
import { resolveAprInfissiOldWindowSources } from "./infissiOldWindowSourceResolution";

describe("APR Infissi · precedenza fattura sul form per il vecchio serramento", () => {
  it("usa materiale e vetro espliciti della fattura sopra valori discordanti del form", () => {
    expect(resolveAprInfissiOldWindowSources({
      formMaterial: "legno", formGlazing: "singolo", formSourceId: "form-cliente",
      sources: [{ sourceId: "fattura-1", kind: "invoice", text: "Serramenti smontati in legno\ndoppio vetro" }],
    })).toMatchObject({ material: "legno", glazing: "doppio", hasDoubt: false, sourceKind: "invoice_over_form", sourceIds: ["fattura-1", "form-cliente"] });
  });

  it("mantiene il form quando la fattura non descrive il vecchio serramento", () => {
    expect(resolveAprInfissiOldWindowSources({
      formMaterial: "pvc", formGlazing: "triplo", formSourceId: "form-cliente",
      sources: [{ sourceId: "fattura-1", kind: "invoice", text: "Nuovi serramenti PVC con vetro doppio" }],
    })).toMatchObject({ material: "pvc", glazing: "triplo", sourceKind: "customer_form", sourceIds: ["form-cliente"] });
  });

  it("non sceglie arbitrariamente tra fatture esplicite discordanti", () => {
    expect(resolveAprInfissiOldWindowSources({
      formMaterial: "legno", formGlazing: "singolo", formSourceId: "form-cliente",
      sources: [
        { sourceId: "fattura-1", kind: "invoice", text: "Infissi rimossi in legno con vetro doppio" },
        { sourceId: "fattura-2", kind: "invoice", text: "Infissi preesistenti in PVC con vetro triplo" },
      ],
    })).toMatchObject({ material: undefined, glazing: undefined, hasDoubt: true, sourceKind: "conflicting_invoices" });
  });
});
