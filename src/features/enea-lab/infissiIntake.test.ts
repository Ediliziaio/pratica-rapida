import { describe, expect, it } from "vitest";
import { emptyFormData } from "@/types/form-cliente";
import { buildAprInfissiIntake } from "./infissiIntake";

function completeInfissiForm() {
  const form = emptyFormData();
  form.prodotto = {
    tipo: "infissi",
    vecchi_materiale: "legno",
    vecchi_vetro: "singolo",
    nuovi_materiale: "pvc",
    nuovi_vetro: "doppio",
    zanzariere_tapparelle: false,
  };
  return form;
}

describe("APR infissi intake", () => {
  it("estrae soltanto i dati prodotto già strutturati nel CRM senza dichiarare il prodotto shadow-ready", () => {
    const intake = buildAprInfissiIntake(completeInfissiForm(), {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.productType).toBe("infissi");
    expect(intake.fields).toEqual({
      oldMaterial: "legno",
      oldGlass: "singolo",
      newMaterial: "pvc",
      newGlass: "doppio",
      hasAccessories: false,
    });
    expect(intake.structuredIntakeComplete).toBe(true);
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
    expect(intake.blockers).toContain("infissi-portal-technical-contract-unobserved");
  });

  it("rimuove solo il blocker del contratto dopo osservazione reale, senza abilitare da solo il mapping", () => {
    const intake = buildAprInfissiIntake(completeInfissiForm(), {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
      technicalPortalContractObserved: true,
    });

    expect(intake.blockers).not.toContain("infissi-portal-technical-contract-unobserved");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("resta fail-closed se mancano dati strutturati, fattura o PDF ENEA conclusivo", () => {
    const form = completeInfissiForm();
    if (form.prodotto.tipo !== "infissi") throw new Error("Fixture infissi non valida");
    form.prodotto.nuovi_vetro = "";

    const intake = buildAprInfissiIntake(form, {
      hasInvoice: false,
      hasCompletedEneaPdf: false,
    });

    expect(intake.structuredIntakeComplete).toBe(false);
    expect(intake.blockers).toEqual(expect.arrayContaining([
      "infissi-product-data-incomplete",
      "infissi-invoice-missing",
      "infissi-completed-enea-ground-truth-missing",
      "infissi-portal-technical-contract-unobserved",
    ]));
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("rifiuta un prodotto diverso invece di riusare il modello infissi", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "insufflaggio" };

    const intake = buildAprInfissiIntake(form, {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.structuredIntakeComplete).toBe(false);
    expect(intake.blockers).toContain("infissi-product-mismatch");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("normalizza la struttura infissi del modulo dinamico storico", () => {
    const form = emptyFormData();
    form.prodotto = {
      materiale_vecchi: "legno",
      vetro_vecchi: "doppio",
      materiale_nuovi: "pvc",
      vetro_nuovi: "triplo",
      zanzariere_tapparelle_persiane: false,
    } as unknown as typeof form.prodotto;

    const intake = buildAprInfissiIntake(form, {
      hasInvoice: true,
      hasCompletedEneaPdf: true,
    });

    expect(intake.fields).toEqual({
      oldMaterial: "legno",
      oldGlass: "doppio",
      newMaterial: "pvc",
      newGlass: "triplo",
      hasAccessories: false,
    });
    expect(intake.structuredIntakeComplete).toBe(true);
    expect(intake.blockers).not.toContain("infissi-product-mismatch");
  });
});
