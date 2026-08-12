export const ENEA_SHADOW_WORKFLOW_STORAGE_KEY = "enea-lab:preview:shadow-workflow:v1";

export type EneaShadowConsent = "pending" | "accepted" | "declined";
export type EneaShadowOutcome = "idle" | "ready" | "review_required";

export interface EneaShadowWorkflowState {
  consent: EneaShadowConsent;
  outcome: EneaShadowOutcome;
  audit: Array<{ event: string; at: string }>;
}

export const EMPTY_ENEA_SHADOW_WORKFLOW: EneaShadowWorkflowState = {
  consent: "pending",
  outcome: "idle",
  audit: [],
};

type ShadowWorkflowStore = Record<string, EneaShadowWorkflowState>;

function isFixtureId(value: string): boolean {
  return /^lab-[a-z0-9-]+$/.test(value);
}

function sanitizeState(value: unknown): EneaShadowWorkflowState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_ENEA_SHADOW_WORKFLOW;
  const candidate = value as Record<string, unknown>;
  const consent = candidate.consent === "accepted" || candidate.consent === "declined"
    ? candidate.consent
    : "pending";
  const outcome = candidate.outcome === "ready" || candidate.outcome === "review_required"
    ? candidate.outcome
    : "idle";
  const audit = Array.isArray(candidate.audit)
    ? candidate.audit.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const event = (entry as Record<string, unknown>).event;
      const at = (entry as Record<string, unknown>).at;
      return typeof event === "string"
        && /^[a-z-]{1,40}$/.test(event)
        && typeof at === "string"
        && Number.isFinite(Date.parse(at))
        ? [{ event, at }]
        : [];
    }).slice(-20)
    : [];
  return { consent, outcome, audit };
}

export function loadEneaShadowWorkflow(storage: Pick<Storage, "getItem">, practiceId: string): EneaShadowWorkflowState {
  if (!isFixtureId(practiceId)) return EMPTY_ENEA_SHADOW_WORKFLOW;
  try {
    const raw = storage.getItem(ENEA_SHADOW_WORKFLOW_STORAGE_KEY);
    if (!raw) return EMPTY_ENEA_SHADOW_WORKFLOW;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_ENEA_SHADOW_WORKFLOW;
    return sanitizeState((parsed as Record<string, unknown>)[practiceId]);
  } catch {
    return EMPTY_ENEA_SHADOW_WORKFLOW;
  }
}

export function saveEneaShadowWorkflow(
  storage: Pick<Storage, "getItem" | "setItem">,
  practiceId: string,
  state: EneaShadowWorkflowState,
): void {
  if (!isFixtureId(practiceId)) return;
  try {
    const raw = storage.getItem(ENEA_SHADOW_WORKFLOW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const fixtureOnly = Object.fromEntries(
      Object.entries(current).filter(([id]) => isFixtureId(id)),
    );
    storage.setItem(ENEA_SHADOW_WORKFLOW_STORAGE_KEY, JSON.stringify({
      ...fixtureOnly,
      [practiceId]: sanitizeState(state),
    }));
  } catch {
    // La demo continua in memoria se lo storage non è disponibile.
  }
}

export function recordEneaShadowEvent(
  state: EneaShadowWorkflowState,
  event: string,
  now = new Date(),
): EneaShadowWorkflowState {
  return {
    ...state,
    audit: [...state.audit, { event, at: now.toISOString() }].slice(-20),
  };
}
