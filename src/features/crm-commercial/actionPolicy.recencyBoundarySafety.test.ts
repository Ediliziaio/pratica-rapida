import { describe, expect, it } from "vitest";
import { suggestCommercialAction } from "./actionPolicy";

describe("commercial action recency boundary safety", () => {
  it("non suggerisce un contatto se l'ultima pratica e' a 30 giorni ma il bucket recente e' vuoto", () => {
    expect(suggestCommercialAction({
      healthStatus: "a_rischio",
      practicesLast30d: 0,
      practicesPrev30d: 2,
      lastPracticeDaysAgo: 30,
    })).toEqual({
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
      reason: "Stato salute e cronologia recente non sono coerenti: verificare i dati prima di qualsiasi azione commerciale.",
    });
  });
});
