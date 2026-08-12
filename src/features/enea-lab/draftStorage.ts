import type { EneaLabOverrides, EneaLabPreparedSnapshot } from "./types";

export const ENEA_LAB_DRAFT_STORAGE_KEY = "enea-lab:draft:v1";
export const ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY = "enea-lab:preview:draft:v1";
export const ENEA_LAB_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type EneaLabDraftScope = "crm" | "preview";

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

function draftStorageKey(scope: EneaLabDraftScope): string {
  return scope === "preview" ? ENEA_LAB_PREVIEW_DRAFT_STORAGE_KEY : ENEA_LAB_DRAFT_STORAGE_KEY;
}

function allowedPracticeId(practiceId: string, scope: EneaLabDraftScope): boolean {
  return scope === "crm" || /^lab-[a-z0-9-]+$/.test(practiceId);
}

function allowedFieldId(fieldId: string, scope: EneaLabDraftScope): boolean {
  return scope === "crm" || /^(beneficiario|immobile|intervento|impianto|schermature|documenti)\.[a-z0-9_.]+$/.test(fieldId);
}

function stringRecord(value: unknown, scope: EneaLabDraftScope): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      allowedFieldId(entry[0], scope)
      && typeof entry[1] === "string"
      && (scope === "crm" || entry[1].length <= 500)),
  );
}

function overridesRecord(value: unknown, scope: EneaLabDraftScope): Record<string, EneaLabOverrides> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([practiceId]) => allowedPracticeId(practiceId, scope))
      .map(([practiceId, overrides]) => [practiceId, stringRecord(overrides, scope)]),
  );
}

function confirmationsRecord(value: unknown, scope: EneaLabDraftScope): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([practiceId]) => allowedPracticeId(practiceId, scope))
      .map(([practiceId, fieldIds]) => [
        practiceId,
        Array.isArray(fieldIds)
          ? fieldIds.filter((fieldId): fieldId is string =>
            typeof fieldId === "string" && allowedFieldId(fieldId, scope))
          : [],
      ]),
  );
}

function preparedSnapshotsRecord(
  value: unknown,
  scope: EneaLabDraftScope,
  now: Date,
): Record<string, EneaLabPreparedSnapshot> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([practiceId, snapshot]) => {
      if (!allowedPracticeId(practiceId, scope)) return [];
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
      const candidate = snapshot as Record<string, unknown>;
      const generatedAtValue = typeof candidate.generatedAt === "string" ? candidate.generatedAt : null;
      const generatedAt = generatedAtValue ? Date.parse(generatedAtValue) : Number.NaN;
      return typeof candidate.fingerprint === "string"
        && candidate.fingerprint.length > 0
        && generatedAtValue !== null
        && Number.isFinite(generatedAt)
        && generatedAt <= now.getTime()
        ? [[practiceId, { fingerprint: candidate.fingerprint, generatedAt: generatedAtValue }]]
        : [];
    }),
  );
}

function sanitizeDraft(draft: EneaLabDraftState, scope: EneaLabDraftScope, now: Date): EneaLabDraftState {
  return {
    overridesByPractice: overridesRecord(draft.overridesByPractice, scope),
    confirmedByPractice: confirmationsRecord(draft.confirmedByPractice, scope),
    preparedIds: Array.isArray(draft.preparedIds)
      ? [...new Set(draft.preparedIds.filter((practiceId): practiceId is string =>
        typeof practiceId === "string" && allowedPracticeId(practiceId, scope)))]
      : [],
    preparedSnapshotsByPractice: preparedSnapshotsRecord(draft.preparedSnapshotsByPractice, scope, now),
  };
}

type ReadableDraftStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">>;

export function loadEneaLabDraft(
  storage: ReadableDraftStorage,
  now = new Date(),
  scope: EneaLabDraftScope = "crm",
): EneaLabDraftState {
  const storageKey = draftStorageKey(scope);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return EMPTY_ENEA_LAB_DRAFT;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      storage.removeItem?.(storageKey);
      return EMPTY_ENEA_LAB_DRAFT;
    }
    const candidate = parsed as Record<string, unknown>;
    if ((scope === "preview" && candidate.schemaVersion !== 1)
      || (candidate.schemaVersion !== undefined && candidate.schemaVersion !== 1)) {
      storage.removeItem?.(storageKey);
      return EMPTY_ENEA_LAB_DRAFT;
    }
    const savedAt = typeof candidate.savedAt === "string" ? Date.parse(candidate.savedAt) : Number.NaN;
    if (!Number.isFinite(savedAt) || savedAt > now.getTime() || now.getTime() - savedAt > ENEA_LAB_DRAFT_TTL_MS) {
      storage.removeItem?.(storageKey);
      return EMPTY_ENEA_LAB_DRAFT;
    }
    return sanitizeDraft(candidate as unknown as EneaLabDraftState, scope, now);
  } catch {
    try {
      storage.removeItem?.(storageKey);
    } catch {
      // Anche la rimozione può essere vietata: si degrada comunque alla memoria vuota.
    }
    return EMPTY_ENEA_LAB_DRAFT;
  }
}

export function saveEneaLabDraft(
  storage: Pick<Storage, "setItem">,
  draft: EneaLabDraftState,
  now = new Date(),
  scope: EneaLabDraftScope = "crm",
): void {
  try {
    storage.setItem(draftStorageKey(scope), JSON.stringify({
      schemaVersion: 1,
      ...sanitizeDraft(draft, scope, now),
      savedAt: now.toISOString(),
    }));
  } catch {
    // Storage disabilitato o pieno: il laboratorio continua a funzionare in memoria.
  }
}
