import { describe, expect, it } from "vitest";
import { buildCommercialSupervisorQueue } from "./supervisorQueue";

describe("commercial supervisor queue", () => {
  it("mostra solo situazioni che richiedono attenzione e ordina le più urgenti", () => {
    const queue = buildCommercialSupervisorQueue([
      {
        id: "stable",
        label: "Cliente Stabile",
        healthStatus: "stabile",
        practicesLast30d: 8,
        practicesPrev30d: 8,
        lastPracticeDaysAgo: 2,
        attentionScore: 20,
      },
      {
        id: "risk",
        label: "Cliente a rischio",
        healthStatus: "a_rischio",
        practicesLast30d: 1,
        practicesPrev30d: 8,
        lastPracticeDaysAgo: 12,
        attentionScore: 100,
      },
    ], [
      {
        id: "lead-late",
        label: "Lead senza risposta",
        stageId: "lead",
        ageHours: 30,
        contacted: false,
      },
      {
        id: "lead-demo",
        label: "Lead in demo",
        stageId: "demo",
        ageHours: 120,
        contacted: true,
        hoursSinceContact: 100,
      },
    ]);

    expect(queue.map(({ id }) => id)).toEqual([
      "customer:risk",
      "lead:lead-late",
    ]);
    expect(queue.every(({ requiresHumanApproval }) => requiresHumanApproval)).toBe(true);
  });

  it("non trasforma crescita o stabilità in lavoro inutile", () => {
    expect(buildCommercialSupervisorQueue([
      {
        id: "growth",
        label: "Cliente in crescita",
        healthStatus: "in_crescita",
        practicesLast30d: 12,
        practicesPrev30d: 6,
        lastPracticeDaysAgo: 1,
        attentionScore: 10,
      },
    ], [])).toEqual([]);
  });

  it("non mette in coda un lead nuovo ancora entro la finestra del primo contatto", () => {
    expect(buildCommercialSupervisorQueue([], [
      {
        id: "lead-fresh",
        label: "Lead appena arrivato",
        stageId: "lead",
        ageHours: 2,
        contacted: false,
      },
    ])).toEqual([]);
  });
});
