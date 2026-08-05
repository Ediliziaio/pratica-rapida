import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_ENEA_LAB_DRAFT,
  ENEA_LAB_DRAFT_STORAGE_KEY,
  loadEneaLabDraft,
  saveEneaLabDraft,
} from "./draftStorage";

describe("bozza locale ENEA Lab", () => {
  it("salva e ripristina soltanto correzioni, conferme e pacchetti locali", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const draft = {
      overridesByPractice: { "practice-1": { "immobile.foglio": "12" } },
      confirmedByPractice: { "practice-1": ["intervento.ambito"] },
      preparedIds: ["practice-1"],
    };

    saveEneaLabDraft(storage, draft);

    expect(values.has(ENEA_LAB_DRAFT_STORAGE_KEY)).toBe(true);
    expect(loadEneaLabDraft(storage)).toEqual(draft);
  });

  it("ignora contenuti corrotti e indisponibilita dello storage", () => {
    expect(loadEneaLabDraft({ getItem: () => "{" })).toEqual(EMPTY_ENEA_LAB_DRAFT);
    expect(() => saveEneaLabDraft({ setItem: () => { throw new Error("quota"); } }, EMPTY_ENEA_LAB_DRAFT)).not.toThrow();
    expect(loadEneaLabDraft({ getItem: vi.fn(() => null) })).toEqual(EMPTY_ENEA_LAB_DRAFT);
  });
});
