import { describe, expect, it } from "vitest";
import { buildCommercialSupervisorQueue } from "./supervisorQueue";

describe("commercial supervisor queue score consistency", () => {
  it("non lascia che un attentionScore stale sovrascriva la priorità deterministica dello stato salute", () => {
    const queue = buildCommercialSupervisorQueue([
      {
        id: "risk-stale-score",
        label: "Cliente a rischio",
        healthStatus: "a_rischio",
        practicesLast30d: 1,
        practicesPrev30d: 8,
        lastPracticeDaysAgo: 12,
        attentionScore: 1,
      },
      {
        id: "never-activated-stale-score",
        label: "Azienda mai attivata",
        healthStatus: "mai_attivato",
        practicesLast30d: 0,
        practicesPrev30d: 0,
        lastPracticeDaysAgo: null,
        attentionScore: 999,
      },
    ], []);

    expect(queue.map(({ id, score }) => ({ id, score }))).toEqual([
      { id: "customer:risk-stale-score", score: 100 },
      { id: "customer:never-activated-stale-score", score: 60 },
    ]);
  });
});
