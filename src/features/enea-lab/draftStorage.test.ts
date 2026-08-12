import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_ENEA_LAB_DRAFT,
  ENEA_LAB_DRAFT_STORAGE_KEY,
  ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY,
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
      preparedSnapshotsByPractice: {
        "practice-1": { fingerprint: "abc123", generatedAt: "2026-08-05T12:00:00.000Z" },
      },
    };

    const now = new Date("2026-08-05T12:00:00.000Z");
    saveEneaLabDraft(storage, draft, now);

    expect(values.has(ENEA_LAB_DRAFT_STORAGE_KEY)).toBe(true);
    expect(loadEneaLabDraft(storage, now)).toEqual(draft);
  });

  it("elimina automaticamente una bozza locale piu vecchia di sette giorni", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    saveEneaLabDraft(storage, {
      ...EMPTY_ENEA_LAB_DRAFT,
      overridesByPractice: { "practice-1": { "beneficiario.email": "demo@example.test" } },
    }, new Date("2026-08-01T09:00:00.000Z"));

    expect(loadEneaLabDraft(storage, new Date("2026-08-09T09:00:01.000Z"))).toEqual(EMPTY_ENEA_LAB_DRAFT);
    expect(values.has(ENEA_LAB_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it("ignora contenuti corrotti e indisponibilita dello storage", () => {
    expect(loadEneaLabDraft({ getItem: () => "{" })).toEqual(EMPTY_ENEA_LAB_DRAFT);
    expect(() => saveEneaLabDraft({ setItem: () => { throw new Error("quota"); } }, EMPTY_ENEA_LAB_DRAFT)).not.toThrow();
    expect(loadEneaLabDraft({ getItem: vi.fn(() => null) })).toEqual(EMPTY_ENEA_LAB_DRAFT);
  });

  it("separa la preview dalla persistenza CRM senza importare la chiave reale", () => {
    const values = new Map<string, string>([[
      ENEA_LAB_DRAFT_STORAGE_KEY,
      JSON.stringify({
        overridesByPractice: { "crm-real-id": { "beneficiario.email": "persona@azienda.example" } },
        confirmedByPractice: {},
        preparedIds: ["crm-real-id"],
        preparedSnapshotsByPractice: {},
        savedAt: "2026-08-05T12:00:00.000Z",
      }),
    ]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const now = new Date("2026-08-05T12:00:00.000Z");

    expect(loadEneaLabDraft(storage, now, "preview")).toEqual(EMPTY_ENEA_LAB_DRAFT);
    saveEneaLabDraft(storage, {
      overridesByPractice: {
        "lab-schermature-001": { "beneficiario.nome": "Cliente Demo" },
        "crm-real-id": { "beneficiario.email": "persona@azienda.example" },
      },
      confirmedByPractice: {
        "lab-schermature-001": ["immobile.foglio", "campo.non-previsto"],
        "crm-real-id": ["beneficiario.email"],
      },
      preparedIds: ["lab-schermature-001", "crm-real-id"],
      preparedSnapshotsByPractice: {
        "lab-schermature-001": { fingerprint: "fixture123", generatedAt: now.toISOString() },
        "crm-real-id": { fingerprint: "real123", generatedAt: now.toISOString() },
      },
    }, now, "preview");

    expect(values.get(ENEA_LAB_DRAFT_STORAGE_KEY)).toContain("crm-real-id");
    expect(values.get(ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY)).not.toContain("crm-real-id");
    expect(loadEneaLabDraft(storage, now, "preview")).toEqual({
      overridesByPractice: { "lab-schermature-001": { "beneficiario.nome": "Cliente Demo" } },
      confirmedByPractice: { "lab-schermature-001": ["immobile.foglio"] },
      preparedIds: ["lab-schermature-001"],
      preparedSnapshotsByPractice: {
        "lab-schermature-001": { fingerprint: "fixture123", generatedAt: now.toISOString() },
      },
    });
  });

  it("rimuove bozze senza timestamp valido, future o con JSON corrotto", () => {
    for (const raw of [
      "{",
      "null",
      JSON.stringify({ overridesByPractice: {} }),
      JSON.stringify({ savedAt: "data-non-valida" }),
      JSON.stringify({ schemaVersion: 2, savedAt: "2026-08-05T12:00:00.000Z" }),
      JSON.stringify({ savedAt: "2026-08-05T12:00:00.001Z" }),
    ]) {
      const removeItem = vi.fn();
      expect(loadEneaLabDraft({ getItem: () => raw, removeItem }, new Date("2026-08-05T12:00:00.000Z"), "preview"))
        .toEqual(EMPTY_ENEA_LAB_DRAFT);
      expect(removeItem).toHaveBeenCalledWith(ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY);
    }
  });
});
