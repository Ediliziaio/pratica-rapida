import { describe, expect, it } from "vitest";
import { suggestCommercialAction } from "./actionPolicy";

describe("commercial supervisor action policy", () => {
  it("non disturba un cliente stabile", () => {
    expect(suggestCommercialAction({
      healthStatus: "stabile",
      practicesLast30d: 8,
      practicesPrev30d: 8,
      lastPracticeDaysAgo: 3,
    })).toEqual(expect.objectContaining({
      action: "monitor",
      channel: "none",
      priority: "low",
      requiresHumanApproval: true,
    }));
  });

  it("porta in cima un calo forte ma non autorizza contatti automatici", () => {
    const decision = suggestCommercialAction({
      healthStatus: "a_rischio",
      practicesLast30d: 2,
      practicesPrev30d: 10,
      lastPracticeDaysAgo: 12,
    });
    expect(decision.action).toBe("check_decline");
    expect(decision.priority).toBe("critical");
    expect(decision.requiresHumanApproval).toBe(true);
  });

  it("preferisce WhatsApp se esiste già una conversazione aperta", () => {
    expect(suggestCommercialAction({
      healthStatus: "a_rischio",
      practicesLast30d: 0,
      practicesPrev30d: 6,
      lastPracticeDaysAgo: 35,
      hasOpenConversation: true,
    }).channel).toBe("whatsapp");
  });

  it("facilita la prima pratica per chi non si è mai attivato", () => {
    expect(suggestCommercialAction({
      healthStatus: "mai_attivato",
      practicesLast30d: 0,
      practicesPrev30d: 0,
      lastPracticeDaysAgo: null,
    })).toEqual(expect.objectContaining({
      action: "activate_first_practice",
      channel: "whatsapp",
      priority: "medium",
    }));
  });

  it("non sollecita commercialmente un cliente in crescita", () => {
    expect(suggestCommercialAction({
      healthStatus: "in_crescita",
      practicesLast30d: 15,
      practicesPrev30d: 8,
      lastPracticeDaysAgo: 1,
    })).toEqual(expect.objectContaining({
      action: "growth_opportunity",
      channel: "none",
      priority: "low",
    }));
  });

  it("non propone contatti se la cronologia cliente richiede revisione dati", () => {
    expect(suggestCommercialAction({
      healthStatus: "needs_data_review",
      practicesLast30d: 2,
      practicesPrev30d: 1,
      lastPracticeDaysAgo: -3,
    })).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
    }));
  });

  it("blocca uno stato a rischio stale che contraddice i volumi correnti", () => {
    expect(suggestCommercialAction({
      healthStatus: "a_rischio",
      practicesLast30d: 12,
      practicesPrev30d: 4,
      lastPracticeDaysAgo: 2,
    })).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
    }));
  });

  it("blocca uno stato a rischio stale se l'ultima pratica e gia oltre la soglia inattiva", () => {
    expect(suggestCommercialAction({
      healthStatus: "a_rischio",
      practicesLast30d: 0,
      practicesPrev30d: 6,
      lastPracticeDaysAgo: 75,
    })).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
    }));
  });

  it("blocca uno stato inattivo stale se l'ultima pratica è recente", () => {
    expect(suggestCommercialAction({
      healthStatus: "inattivo",
      practicesLast30d: 1,
      practicesPrev30d: 0,
      lastPracticeDaysAgo: 10,
    })).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
    }));
  });

  it("blocca un mai attivato stale se esiste una pratica storica", () => {
    expect(suggestCommercialAction({
      healthStatus: "mai_attivato",
      practicesLast30d: 0,
      practicesPrev30d: 0,
      lastPracticeDaysAgo: 90,
    })).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
    }));
  });

  it("blocca uno snapshot stabile impossibile se l'ultima pratica cade nei 30-60 giorni ma il periodo precedente è vuoto", () => {
    expect(suggestCommercialAction({
      healthStatus: "stabile",
      practicesLast30d: 0,
      practicesPrev30d: 0,
      lastPracticeDaysAgo: 45,
    })).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
    }));
  });
});