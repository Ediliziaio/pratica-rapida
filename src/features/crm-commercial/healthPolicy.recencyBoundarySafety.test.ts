import { describe, expect, it } from "vitest";
import { classifyCommercialHealth } from "./healthPolicy";

describe("commercial health recency boundary safety", () => {
  it("porta in revisione una recenza esattamente a 30 giorni se il bucket recente e' vuoto", () => {
    expect(classifyCommercialHealth({
      totalPractices: 5,
      practicesLast30d: 0,
      practicesPrev30d: 0,
      firstPracticeDaysAgo: 180,
      lastPracticeDaysAgo: 30,
    })).toEqual({ status: "needs_data_review", attentionScore: 80 });
  });

  it("porta in revisione un cliente oltre 60 giorni se i bucket recenti dichiarano ancora attivita'", () => {
    expect(classifyCommercialHealth({
      totalPractices: 5,
      practicesLast30d: 0,
      practicesPrev30d: 1,
      firstPracticeDaysAgo: 180,
      lastPracticeDaysAgo: 75,
    })).toEqual({ status: "needs_data_review", attentionScore: 80 });
  });
});
