export const ENEA_SHADOW_CRM_STORAGE_KEY = "enea-shadow-crm:workflow:v1";

export type ShadowCrmStage = "received" | "assigned" | "processing" | "review" | "completed";

export interface ShadowCrmAuditEvent {
  id: string;
  type: string;
  at: string;
}

export interface ShadowCrmPracticeState {
  stage: ShadowCrmStage;
  assignee: string | null;
  emailDrafted: boolean;
  outcome: "pending" | "review_required" | "completed";
  audit: ShadowCrmAuditEvent[];
}

export const EMPTY_SHADOW_CRM_STATE: ShadowCrmPracticeState = {
  stage: "received",
  assignee: null,
  emailDrafted: false,
  outcome: "pending",
  audit: [],
};

const ALLOWED_STAGES = new Set<ShadowCrmStage>(["received", "assigned", "processing", "review", "completed"]);

function fixtureId(id: string): boolean {
  return /^lab-[a-z0-9-]+$/.test(id);
}

function sanitize(value: unknown): ShadowCrmPracticeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_SHADOW_CRM_STATE;
  const candidate = value as Record<string, unknown>;
  const stage = typeof candidate.stage === "string" && ALLOWED_STAGES.has(candidate.stage as ShadowCrmStage)
    ? candidate.stage as ShadowCrmStage
    : "received";
  const assignee = candidate.assignee === "operatore-demo-anna" || candidate.assignee === "operatore-demo-luca"
    ? candidate.assignee
    : null;
  const outcome = candidate.outcome === "review_required" || candidate.outcome === "completed"
    ? candidate.outcome
    : "pending";
  const audit = Array.isArray(candidate.audit) ? candidate.audit.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const event = entry as Record<string, unknown>;
    return typeof event.id === "string"
      && typeof event.type === "string"
      && /^[a-z-]{1,40}$/.test(event.type)
      && typeof event.at === "string"
      && Number.isFinite(Date.parse(event.at))
      ? [{ id: event.id, type: event.type, at: event.at }]
      : [];
  }).slice(-100) : [];
  return { stage, assignee, emailDrafted: candidate.emailDrafted === true, outcome, audit };
}

export function loadShadowCrmState(storage: Pick<Storage, "getItem">, practiceId: string): ShadowCrmPracticeState {
  if (!fixtureId(practiceId)) return EMPTY_SHADOW_CRM_STATE;
  try {
    const raw = storage.getItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    if (!raw) return EMPTY_SHADOW_CRM_STATE;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_SHADOW_CRM_STATE;
    return sanitize((parsed as Record<string, unknown>)[practiceId]);
  } catch {
    return EMPTY_SHADOW_CRM_STATE;
  }
}

export function saveShadowCrmState(
  storage: Pick<Storage, "getItem" | "setItem">,
  practiceId: string,
  state: ShadowCrmPracticeState,
): void {
  if (!fixtureId(practiceId)) return;
  try {
    const raw = storage.getItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    storage.setItem(ENEA_SHADOW_CRM_STORAGE_KEY, JSON.stringify({
      ...Object.fromEntries(Object.entries(current).filter(([id]) => fixtureId(id))),
      [practiceId]: sanitize(state),
    }));
  } catch {
    // Il CRM ombra continua in memoria se lo storage browser non è disponibile.
  }
}

export function transitionShadowCrm(
  state: ShadowCrmPracticeState,
  action: "assign" | "start" | "review" | "draft-email" | "complete",
  now = new Date(),
): ShadowCrmPracticeState {
  const allowed = (action === "assign" && state.stage === "received")
    || (action === "start" && state.stage === "assigned")
    || (action === "review" && state.stage === "processing")
    || (action === "draft-email" && state.stage === "review" && !state.emailDrafted)
    || (action === "complete" && state.stage === "review" && state.emailDrafted);
  if (!allowed) return state;
  const next: ShadowCrmPracticeState = {
    ...state,
    assignee: action === "assign" ? "operatore-demo-anna" : state.assignee,
    stage: action === "assign" ? "assigned"
      : action === "start" ? "processing"
        : action === "review" || action === "draft-email" ? "review"
          : "completed",
    emailDrafted: action === "draft-email" ? true : state.emailDrafted,
    outcome: action === "review" ? "review_required"
      : action === "complete" ? "completed"
        : state.outcome,
  };
  return {
    ...next,
    audit: [...state.audit, {
      id: `${now.getTime()}-${state.audit.length}`,
      type: action,
      at: now.toISOString(),
    }],
  };
}
