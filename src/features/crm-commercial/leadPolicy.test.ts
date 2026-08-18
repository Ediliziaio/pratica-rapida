import { describe, expect, it } from "vitest";
import { classifyLeadAttention } from "./leadPolicy";

describe("lead supervisor policy", () => {
  it("porta in evidenza un lead non contattato entro 24 ore", () => {
    expect(classifyLeadAttention({
      stageId: "lead",
      ageHours: 30,
      contacted: false,
    })).toEqual(expect.objectContaining({ status: "needs_first_contact", priority: "high" }));
  });

  it("non considera in ritardo un lead appena arrivato", () => {
    expect(classifyLeadAttention({
      stageId: "lead",
      ageHours: 3,
      contacted: false,
    })).toEqual(expect.objectContaining({ status: "new", priority: "medium" }));
  });

  it("segnala follow-up solo dopo una finestra ragionevole", () => {
    expect(classifyLeadAttention({
      stageId: "contatto",
      ageHours: 120,
      contacted: true,
      hoursSinceContact: 80,
    })).toEqual(expect.objectContaining({ status: "needs_followup", priority: "medium" }));
  });

  it("non disturba lead già in demo/onboarding/attivo", () => {
    for (const stageId of ["demo", "onboarding", "attivo"]) {
      expect(classifyLeadAttention({
        stageId,
        ageHours: 500,
        contacted: true,
        hoursSinceContact: 400,
      })).toEqual(expect.objectContaining({ status: "progressing", priority: "low" }));
    }
  });

  it("non interpreta automaticamente una fase personalizzata sconosciuta", () => {
    expect(classifyLeadAttention({
      stageId: "f7f36e26-35e0-4e4a-8b7f-stage-custom",
      ageHours: 200,
      contacted: true,
      hoursSinceContact: 100,
    })).toEqual(expect.objectContaining({
      status: "needs_stage_review",
      priority: "medium",
    }));
  });

  it("porta in revisione dati un lead con data di creazione futura", () => {
    expect(classifyLeadAttention({
      stageId: "lead",
      ageHours: -2,
      contacted: false,
    })).toEqual(expect.objectContaining({
      status: "needs_data_review",
      priority: "medium",
    }));
  });

  it("porta in revisione dati un contatto cronologicamente precedente alla creazione del lead", () => {
    expect(classifyLeadAttention({
      stageId: "lead",
      ageHours: 48,
      contacted: true,
      hoursSinceContact: 60,
    })).toEqual(expect.objectContaining({
      status: "needs_data_review",
      priority: "medium",
    }));
  });

  it("non nasconde un lead contattato se manca la recenza del contatto", () => {
    expect(classifyLeadAttention({
      stageId: "contatto",
      ageHours: 120,
      contacted: true,
      hoursSinceContact: null,
    })).toEqual(expect.objectContaining({
      status: "needs_data_review",
      priority: "medium",
    }));
  });

  it("porta in revisione dati un lead marcato non contattato ma con una recenza di contatto presente", () => {
    expect(classifyLeadAttention({
      stageId: "lead",
      ageHours: 48,
      contacted: false,
      hoursSinceContact: 10,
    })).toEqual(expect.objectContaining({
      status: "needs_data_review",
      priority: "medium",
    }));
  });

  it("dà precedenza alla revisione dati rispetto alla revisione di una fase personalizzata", () => {
    expect(classifyLeadAttention({
      stageId: "f7f36e26-35e0-4e4a-8b7f-stage-custom",
      ageHours: -2,
      contacted: false,
    })).toEqual(expect.objectContaining({
      status: "needs_data_review",
      priority: "medium",
    }));
  });
});