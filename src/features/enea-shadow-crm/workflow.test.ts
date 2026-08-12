import { describe, expect, it, vi } from "vitest";
import { assignShadowCrm, EMPTY_SHADOW_CRM_STATE, loadShadowCrmState, prioritizeShadowCrm, saveShadowCrmState, transitionShadowCrm } from "./workflow";

describe("workflow CRM ombra", () => {
  it("consente soltanto il percorso ordinato e conserva un audit append-only", () => {
    const times = [0, 1, 2, 3, 4].map((second) => new Date(`2026-08-12T10:00:0${second}.000Z`));
    const actions = ["assign", "start", "review", "draft-email", "complete"] as const;
    const result = actions.reduce((state, action, index) => transitionShadowCrm(state, action, times[index]), EMPTY_SHADOW_CRM_STATE);

    expect(result).toMatchObject({ stage: "completed", assignee: "operatore-demo-anna", emailDrafted: true, outcome: "completed" });
    expect(result.audit.map((event) => event.type)).toEqual(actions);
    expect(transitionShadowCrm(result, "complete")).toBe(result);
  });

  it("ignora transizioni premature e bozze duplicate", () => {
    expect(transitionShadowCrm(EMPTY_SHADOW_CRM_STATE, "start")).toBe(EMPTY_SHADOW_CRM_STATE);
    const review = ["assign", "start", "review", "draft-email"].reduce(
      (state, action) => transitionShadowCrm(state, action as Parameters<typeof transitionShadowCrm>[1]),
      EMPTY_SHADOW_CRM_STATE,
    );
    expect(transitionShadowCrm(review, "draft-email")).toBe(review);
  });

  it("registra assegnazioni e priorità sintetiche senza alterare pratiche concluse", () => {
    const assigned = assignShadowCrm(EMPTY_SHADOW_CRM_STATE, "operatore-demo-luca", new Date("2026-08-12T10:00:00Z"));
    const prioritized = prioritizeShadowCrm(assigned, "high", new Date("2026-08-12T10:00:01Z"));
    expect(prioritized).toMatchObject({ stage: "assigned", assignee: "operatore-demo-luca", priority: "high" });
    expect(prioritized.audit.map((event) => event.type)).toEqual(["assign-luca", "priority-high"]);
  });

  it("legge e salva esclusivamente identificativi fixture e degrada in sicurezza", () => {
    const storage = { getItem: vi.fn(() => "{corrotto"), setItem: vi.fn() };
    expect(loadShadowCrmState(storage, "crm-reale-1")).toEqual(EMPTY_SHADOW_CRM_STATE);
    expect(loadShadowCrmState(storage, "lab-demo-1")).toEqual(EMPTY_SHADOW_CRM_STATE);
    saveShadowCrmState(storage, "crm-reale-1", EMPTY_SHADOW_CRM_STATE);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
