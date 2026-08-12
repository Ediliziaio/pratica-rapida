import { describe, expect, it } from "vitest";
import {
  EMPTY_ENEA_SHADOW_WORKFLOW,
  ENEA_SHADOW_WORKFLOW_STORAGE_KEY,
  loadEneaShadowWorkflow,
  recordEneaShadowEvent,
  saveEneaShadowWorkflow,
} from "./shadowWorkflow";

describe("workflow CRM ombra ENEA", () => {
  it("persiste soltanto stato e audit per pratiche fixture", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const state = recordEneaShadowEvent({
      consent: "accepted",
      outcome: "review_required",
      audit: [],
    }, "local-review-required", new Date("2026-08-12T12:00:00.000Z"));

    saveEneaShadowWorkflow(storage, "lab-schermature-001", state);

    expect(loadEneaShadowWorkflow(storage, "lab-schermature-001")).toEqual(state);
    expect(values.get(ENEA_SHADOW_WORKFLOW_STORAGE_KEY)).not.toMatch(/cliente|email|telefono|codice.fiscale|password|otp/i);
  });

  it("rifiuta identificativi non fixture e degrada in sicurezza su dati corrotti", () => {
    const setItem = () => { throw new Error("non deve scrivere"); };
    expect(() => saveEneaShadowWorkflow({ getItem: () => null, setItem }, "crm-real-id", {
      consent: "accepted",
      outcome: "ready",
      audit: [],
    })).not.toThrow();
    expect(loadEneaShadowWorkflow({ getItem: () => "{" }, "lab-schermature-001"))
      .toEqual(EMPTY_ENEA_SHADOW_WORKFLOW);
    expect(loadEneaShadowWorkflow({ getItem: () => "{}" }, "crm-real-id"))
      .toEqual(EMPTY_ENEA_SHADOW_WORKFLOW);
  });

  it("elimina campi e record estranei durante il salvataggio", () => {
    const values = new Map<string, string>([[
      ENEA_SHADOW_WORKFLOW_STORAGE_KEY,
      JSON.stringify({ "crm-real-id": { consent: "accepted", secret: "non-fixture" } }),
    ]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    saveEneaShadowWorkflow(storage, "lab-schermature-001", {
      consent: "accepted",
      outcome: "ready",
      audit: [{ event: "local-processing-complete", at: "2026-08-12T12:00:00.000Z" }],
    });

    const serialized = values.get(ENEA_SHADOW_WORKFLOW_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain("crm-real-id");
    expect(serialized).not.toContain("secret");
  });
});
