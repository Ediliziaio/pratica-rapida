import type { EneaLabOverrides } from "./types";

export const ENEA_LAB_DRAFT_STORAGE_KEY = "enea-lab:draft:v1";

export interface EneaLabDraftState {
  overridesByPractice: Record<string, EneaLabOverrides>;
  confirmedByPractice: Record<string, string[]>;
  preparedIds: string[];
}

export const EMPTY_ENEA_LAB_DRAFT: EneaLabDraftState = {
  overridesByPractice: {},
  confirmedByPractice: {},
  preparedIds: [],
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

export function loadEneaLabDraft(storage: Pick<Storage, "getItem">): EneaLabDraftState {
  try {
    const raw = storage.getItem(ENEA_LAB_DRAFT_STORAGE_KEY);
    if (!raw) return EMPTY_ENEA_LAB_DRAFT;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      overridesByPractice: overridesRecord(parsed.overridesByPractice),
      confirmedByPractice: confirmationsRecord(parsed.confirmedByPractice),
      preparedIds: Array.isArray(parsed.preparedIds)
        ? parsed.preparedIds.filter((practiceId): practiceId is string => typeof practiceId === "string")
        : [],
    };
  } catch {
    return EMPTY_ENEA_LAB_DRAFT;
  }
}

export function saveEneaLabDraft(
  storage: Pick<Storage, "setItem">,
  draft: EneaLabDraftState,
): void {
  try {
    storage.setItem(ENEA_LAB_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage disabilitato o pieno: il laboratorio continua a funzionare in memoria.
  }
}
