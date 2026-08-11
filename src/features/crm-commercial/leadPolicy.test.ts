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
});
