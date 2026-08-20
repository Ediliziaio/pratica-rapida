import { describe, expect, it } from "vitest";
import { emptyFormData } from "@/types/form-cliente";
import { buildAprProductIntake } from "./productIntake";

const context = { hasInvoice: true, hasCompletedEneaPdf: true };

describe("APR product intake dispatcher", () => {
  it("mantiene le schermature validate ma non abilita lo shadow operativo senza gate utente", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "schermature", items: [{ tipo: "tende_da_sole", direzione: "sud" }] };

    const intake = buildAprProductIntake(form, context);

    expect(intake.productType).toBe("schermature");
    expect(intake.integrationPhase).toBe("screenings-validated");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("abilita lo shadow schermature solo con il gate esplicito APR operativo ombra", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "schermature", items: [{ tipo: "tende_da_sole", direzione: "sud" }] };

    const intake = buildAprProductIntake(form, {
      ...context,
      globalShadowAuthorization: {
        source: "user",
        phrase: "APR operativo ombra",
      },
    });

    expect(intake.productType).toBe("schermature");
    expect(intake.integrationPhase).toBe("screenings-validated");
    expect(intake.shadowTechnicalMappingAllowed).toBe(true);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("non considera valide autorizzazioni shadow simili ma non canoniche", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "schermature", items: [{ tipo: "tende_da_sole", direzione: "sud" }] };

    const intake = buildAprProductIntake(form, {
      ...context,
      globalShadowAuthorization: {
        source: "user",
        phrase: "APR operativo ombra ",
      } as never,
    });

    expect(intake.productType).toBe("schermature");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("instrada gli infissi al relativo adapter intake-only", () => {
    const form = emptyFormData();
    form.prodotto = {
      tipo: "infissi",
      vecchi_materiale: "legno",
      vecchi_vetro: "singolo",
      nuovi_materiale: "pvc",
      nuovi_vetro: "doppio",
      zanzariere_tapparelle: false,
    };

    const intake = buildAprProductIntake(form, context);

    expect(intake.productType).toBe("infissi");
    expect(intake.integrationPhase).toBe("intake-only");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("instrada l'impianto termico al relativo adapter intake-only", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "impianto_termico" };

    const intake = buildAprProductIntake(form, context);

    expect(intake.productType).toBe("impianto_termico");
    expect(intake.integrationPhase).toBe("intake-only");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });

  it("instrada l'insufflaggio al relativo adapter intake-only", () => {
    const form = emptyFormData();
    form.prodotto = { tipo: "insufflaggio" };

    const intake = buildAprProductIntake(form, context);

    expect(intake.productType).toBe("insufflaggio");
    expect(intake.integrationPhase).toBe("intake-only");
    expect(intake.shadowTechnicalMappingAllowed).toBe(false);
    expect(intake.officialSubmissionAllowed).toBe(false);
  });
});
