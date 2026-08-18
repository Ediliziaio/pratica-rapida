import { describe, expect, it } from "vitest";
import { emptyFormData } from "@/types/form-cliente";
import { buildAprImpiantoTermicoIntake } from "./impiantoTermicoIntake";

function completeImpiantoTermicoForm() {
  const form = emptyFormData();
  form.prodotto = { tipo: "impianto_termico" };
  form.impianto = {
    tipo: "autonomo",
    terminali: "caloriferi",
    combustibile: "gas_metano",
    tipo_caldaia: "gas_a_condensazione",
    aria_condizionata: true,
    libretto_url: "documents/libretto.pdf",
  };
  return form;
}

describe("APR impianto termico intake", () => {
  it("raccoglie solo i dati impianto già presenti nel CRM e resta intake-only", () => {
    const intake = buildAprImpiantoTermicoIntake(completeImpiantoTermicoForm(), {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.productType).toBe("impianto_termico");
    expect(intake.fields).toEqual({
      systemType: "autonomo",
      terminals: "caloriferi",
      fuel: "gas_metano",
      generatorType: "gas_a_condensazione",
      hasCooling: true,
      hasSystemBooklet: true,
    });
    expect(intake.structuredIntakeComplete).toBe(true);
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
    expect(intake.blockers).toContain("impianto-termico-portal-technical-contract-unobserved");
  });

  it("resta fail-closed se mancano libretto, fattura o PDF ENEA conclusivo", () => {
    const form = completeImpiantoTermicoForm();
    form.impianto.libretto_url = "";

    const intake = buildAprImpiantoTermicoIntake(form, {
      hasInvoice: false,
      hasCompletedEneaPdf: false,
    });

    expect(intake.structuredIntakeComplete).toBe(false);
    expect(intake.blockers).toEqual(expect.arrayContaining([
      "impianto-termico-system-booklet-missing",
      "impianto-termico-invoice-missing",
      "impianto-termico-completed-enea-ground-truth-missing",
      "impianto-termico-portal-technical-contract-unobserved",
    ]));
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("rifiuta un prodotto diverso invece di riusare l'adapter impianto termico", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "infissi", vecchi_materiale: "legno", vecchi_vetro: "singolo", nuovi_materiale: "pvc", nuovi_vetro: "doppio", zanzariere_tapparelle: false };

    const intake = buildAprImpiantoTermicoIntake(form, {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.structuredIntakeComplete).toBe(false);
    expect(intake.blockers).toContain("impianto-termico-product-mismatch");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });
});
