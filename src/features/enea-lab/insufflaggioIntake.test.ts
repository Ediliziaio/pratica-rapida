import { describe, expect, it } from "vitest";
import { emptyFormData } from "@/types/form-cliente";
import { buildAprInsufflaggioIntake } from "./insufflaggioIntake";

function insufflaggioForm() {
  const form = emptyFormData();
  form.prodotto = { tipo: "insufflaggio" };
  return form;
}

describe("APR insufflaggio intake", () => {
  it("tratta la fattura come sorgente tecnica senza inventare campi CRM prodotto", () => {
    const intake = buildAprInsufflaggioIntake(insufflaggioForm(), {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.productType).toBe("insufflaggio");
    expect(intake.invoiceSourceAvailable).toBe(true);
    expect(intake.technicalSourceReadyForParser).toBe(true);
    expect(intake.invoiceTechnicalExtractionAllowed).toBe(false);
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
    expect(intake.blockers).toEqual(expect.arrayContaining([
      "insufflaggio-invoice-technical-parser-unimplemented",
      "insufflaggio-portal-technical-contract-unobserved",
    ]));
  });

  it("resta fail-closed senza fattura o PDF ENEA conclusivo", () => {
    const intake = buildAprInsufflaggioIntake(insufflaggioForm(), {
      hasInvoice: false,
      hasCompletedEneaPdf: false,
    });

    expect(intake.invoiceSourceAvailable).toBe(false);
    expect(intake.technicalSourceReadyForParser).toBe(false);
    expect(intake.blockers).toEqual(expect.arrayContaining([
      "insufflaggio-invoice-missing",
      "insufflaggio-invoice-technical-parser-unimplemented",
      "insufflaggio-completed-enea-ground-truth-missing",
      "insufflaggio-portal-technical-contract-unobserved",
    ]));
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("rifiuta un prodotto diverso invece di riusare il modello insufflaggio", () => {
    const form = emptyFormData();

    const intake = buildAprInsufflaggioIntake(form, {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.technicalSourceReadyForParser).toBe(false);
    expect(intake.blockers).toContain("insufflaggio-product-mismatch");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });
});
