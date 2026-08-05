import type { EneaLabOverrides, EneaLabPreparedSnapshot } from "./types";

export const ENEA_LAB_DRAFT_STORAGE_KEY = "enea-lab:draft:v1";
export const ENEA_LAB_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface EneaLabDraftState {
  overridesByPractice: Record<string, EneaLabOverrides>;
  confirmedByPractice: Record<string, string[]>;
  preparedIds: string[];
  preparedSnapshotsByPractice: Record<string, EneaLabPreparedSnapshot>;
}

export const EMPTY_ENEA_LAB_DRAFT: EneaLabDraftState = {
  overridesByPractice: {},
  confirmedByPractice: {},
  preparedIds: [],
  preparedSnapshotsByPractice: {},
};

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function overridesRecord(value: unknown): Record<string, EneaLabOverrides> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([practiceId, overrides]) => [practiceId, stringRecord(overrides)]),
  );
}

function confirmationsRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([practiceId, fieldIds]) => [
      practiceId,
      Array.isArray(fieldIds) ? fieldIds.filter((fieldId): fieldId is string => typeof fieldId === "string") : [],
    ]),
  );
}

function preparedSnapshotsRecord(value: unknown): Record<string, EneaLabPreparedSnapshot> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([practiceId, snapshot]) => {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
      const candidate = snapshot as Record<string, unknown>;
      return typeof candidate.fingerprint === "string" && typeof candidate.generatedAt === "string"
        ? [[practiceId, { fingerprint: candidate.fingerprint, generatedAt: candidate.generatedAt }]]
        : [];
    }),
  );
}

type ReadableDraftStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">>;

export function loadEneaLabDraft(
  storage: ReadableDraftStorage,
  now = new Date(),
): EneaLabDraftState {
  try {
    const raw = storage.getItem(ENEA_LAB_DRAFT_STORAGE_KEY);
    if (!raw) return EMPTY_ENEA_LAB_DRAFT;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = typeof parsed.savedAt === "string" ? Date.parse(parsed.savedAt) : Number.NaN;
    if (Number.isFinite(savedAt) && now.getTime() - savedAt > ENEA_LAB_DRAFT_TTL_MS) {
      storage.removeItem?.(ENEA_LAB_DRAFT_STORAGE_KEY);
      return EMPTY_ENEA_LAB_DRAFT;
    }
    return {
      overridesByPractice: overridesRecord(parsed.overridesByPractice),
      confirmedByPractice: confirmationsRecord(parsed.confirmedByPractice),
      preparedIds: Array.isArray(parsed.preparedIds)
        ? parsed.preparedIds.filter((practiceId): practiceId is string => typeof practiceId === "string")
        : [],
      preparedSnapshotsByPractice: preparedSnapshotsRecord(parsed.preparedSnapshotsByPractice),
    };
  } catch {
    return EMPTY_ENEA_LAB_DRAFT;
  }
}

export function saveEneaLabDraft(
  storage: Pick<Storage, "setItem">,
  draft: EneaLabDraftState,
  now = new Date(),
): void {
  try {
    storage.setItem(ENEA_LAB_DRAFT_STORAGE_KEY, JSON.stringify({
      ...draft,
      savedAt: now.toISOString(),
    }));
  } catch {
    // Storage disabilitato o pieno: il laboratorio continua a funzionare in memoria.
  }
}
