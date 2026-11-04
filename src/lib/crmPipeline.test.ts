import { describe, expect, it } from "vitest";
import {
  CLIENTI_50_STAGE_ID,
  NEW_LEAD_STAGE_ID,
  containsFiftyEuroPrice,
  defaultCrmStageId,
  isFiftyEuroAudienceSafe,
  isFiftyEuroLead,
  normalizeCrmStages,
} from "./crmPipeline";

describe("CRM €50 pipeline safety", () => {
  const legacyStages = [
    { id: "lead", name: "Nuovo Lead", color: "#6366f1", order: 0 },
    { id: "attivo", name: "Cliente Attivo", color: "#10b981", order: 1 },
  ];

  it("pins the incoming and contacted €50 stages as the first two columns", () => {
    const stages = normalizeCrmStages(legacyStages);
    expect(stages.map(stage => stage.id)).toEqual(["lead", CLIENTI_50_STAGE_ID, "attivo"]);
    expect(stages.map(stage => stage.order)).toEqual([0, 1, 2]);
    expect(stages[0].name).toBe("Lead €50 in entrata");
    expect(stages[1].name).toBe("Lead €50 contattati");
  });

  it("keeps the €50 visual marker after a lead leaves the contacted column", () => {
    expect(isFiftyEuroLead({ stage_id: "attivo", commercial_price_eur: 50 })).toBe(true);
    expect(isFiftyEuroLead({ stage_id: CLIENTI_50_STAGE_ID })).toBe(true);
    expect(isFiftyEuroLead({ stage_id: "attivo", commercial_price_eur: 65 })).toBe(false);
  });

  it("keeps Nuovo Lead as the default even when Clienti €50 is first", () => {
    const stages = normalizeCrmStages(legacyStages);
    expect(defaultCrmStageId(stages)).toBe(NEW_LEAD_STAGE_ID);
  });

  it("recognizes the common ways of writing the fifty euro price", () => {
    expect(containsFiftyEuroPrice("Pratiche a €50", "")).toBe(true);
    expect(containsFiftyEuroPrice("Offerta", "<p>50 euro + IVA</p>")).toBe(true);
    expect(containsFiftyEuroPrice("Offerta", "<p>50,00 €</p>")).toBe(true);
    expect(containsFiftyEuroPrice("Aggiornamento", "<p>48 ore lavorative</p>")).toBe(false);
  });

  it("allows a €50 communication only to the dedicated pipeline", () => {
    expect(isFiftyEuroAudienceSafe([CLIENTI_50_STAGE_ID], false)).toBe(true);
    expect(isFiftyEuroAudienceSafe([CLIENTI_50_STAGE_ID, "lead"], false)).toBe(false);
    expect(isFiftyEuroAudienceSafe(["lead"], false)).toBe(false);
    expect(isFiftyEuroAudienceSafe([CLIENTI_50_STAGE_ID], true)).toBe(false);
  });
});
