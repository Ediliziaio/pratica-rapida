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

  it("mantiene il follow-up lead al punteggio 70 della vista read-only", () => {
    const queue = buildCommercialSupervisorQueue([
      {
        id: "never-activated",
        label: "Azienda mai attivata",
        healthStatus: "mai_attivato",
        practicesLast30d: 0,
        practicesPrev30d: 0,
        lastPracticeDaysAgo: null,
        attentionScore: 60,
      },
    ], [
      {
        id: "lead-followup",
        label: "Lead da ricontattare",
        stageId: "lead",
        ageHours: 120,
        contacted: true,
        hoursSinceContact: 80,
      },
    ]);

    expect(queue.map(({ id, score }) => ({ id, score }))).toEqual([
      { id: "lead:lead-followup", score: 70 },
      { id: "customer:never-activated", score: 60 },
    ]);
  });

  it("non riapre lavoro commerciale per una azienda amministrativamente disattivata", () => {
    const disabledCustomer = {
      id: "disabled",
      label: "Azienda disattivata",
      healthStatus: "inattivo" as const,
      practicesLast30d: 0,
      practicesPrev30d: 0,
      lastPracticeDaysAgo: 120,
      attentionScore: 90,
      isActive: false,
    };

    expect(buildCommercialSupervisorQueue([disabledCustomer], [])).toEqual([]);
  });

  it("non riapre lavoro commerciale per una azienda bloccata", () => {
    const blockedCustomer = {
      id: "blocked",
      label: "Azienda bloccata",
      healthStatus: "inattivo" as const,
      practicesLast30d: 0,
      practicesPrev30d: 0,
      lastPracticeDaysAgo: 120,
      attentionScore: 90,
      isActive: true,
      blockedAt: "2026-08-10T10:00:00.000Z",
    };

    expect(buildCommercialSupervisorQueue([blockedCustomer], [])).toEqual([]);
  });

  it("non suggerisce WhatsApp a un lead urgente senza numero di telefono", () => {
    const queue = buildCommercialSupervisorQueue([], [
      {
        id: "lead-no-phone",
        label: "Lead senza telefono",
        stageId: "lead",
        ageHours: 30,
        contacted: false,
        telefono: null,
      },
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0].channel).toBe("none");
  });

  it("non suggerisce WhatsApp a un cliente da recuperare senza numero di telefono", () => {
    const queue = buildCommercialSupervisorQueue([
      {
        id: "customer-no-phone",
        label: "Cliente senza telefono",
        healthStatus: "inattivo",
        practicesLast30d: 0,
        practicesPrev30d: 0,
        lastPracticeDaysAgo: 120,
        attentionScore: 90,
        telefono: null,
      },
    ], []);

    expect(queue).toHaveLength(1);
    expect(queue[0].channel).toBe("none");
  });

  it("porta una fase lead personalizzata in revisione senza proporre un contatto", () => {
    const queue = buildCommercialSupervisorQueue([], [
      {
        id: "lead-custom-stage",
        label: "Lead in fase personalizzata",
        stageId: "f7f36e26-35e0-4e4a-8b7f-stage-custom",
        ageHours: 200,
        contacted: true,
        hoursSinceContact: 100,
        telefono: "+39 333 1234567",
      },
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(expect.objectContaining({
      action: "needs_stage_review",
      channel: "none",
      score: 70,
      requiresHumanApproval: true,
    }));
  });

  it("porta una cronologia lead incoerente in revisione senza proporre un contatto", () => {
    const queue = buildCommercialSupervisorQueue([], [
      {
        id: "lead-bad-timing",
        label: "Lead con cronologia incoerente",
        stageId: "lead",
        ageHours: 48,
        contacted: true,
        hoursSinceContact: 60,
        telefono: "+39 333 1234567",
      },
    ]);

    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(expect.objectContaining({
      action: "needs_data_review",
      channel: "none",
      score: 70,
      requiresHumanApproval: true,
    }));
  });

  it("porta una cronologia cliente futura in revisione senza proporre alcun contatto", () => {
    const queue = buildCommercialSupervisorQueue([
      {
        id: "customer-bad-timing",
        label: "Cliente con cronologia incoerente",
        healthStatus: "needs_data_review",
        practicesLast30d: 2,
        practicesPrev30d: 1,
        lastPracticeDaysAgo: -3,
        attentionScore: 80,
        telefono: "+39 333 1234567",
      },
    ], []);

    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(expect.objectContaining({
      action: "review_data",
      channel: "none",
      score: 80,
      requiresHumanApproval: true,
    }));
  });
});