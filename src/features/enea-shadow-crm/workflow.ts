export const ENEA_SHADOW_CRM_STORAGE_KEY = "enea-shadow-crm:workflow:v1";

export type ShadowCrmStage = "received" | "assigned" | "processing" | "review" | "completed";
export type ShadowCrmAssignee = "operatore-demo-anna" | "operatore-demo-luca";
export type ShadowCrmPriority = "low" | "normal" | "high";
export type ShadowCrmAttachmentTemplate = "invoice" | "bank-transfer";
export type ShadowCrmDraftTemplate = "status-update" | "missing-documents";

export interface ShadowCrmAttachment {
  id: string;
  name: string;
  mimeType: "application/pdf";
  size: number;
  validation: "valid";
  checks: string[];
}

export interface ShadowCrmEmailDraft {
  id: string;
  template: ShadowCrmDraftTemplate;
  version: number;
  subject: string;
  body: string;
}

export interface ShadowCrmAuditEvent {
  id: string;
  type: string;
  at: string;
}

export interface ShadowCrmPracticeState {
  stage: ShadowCrmStage;
  assignee: string | null;
  priority: ShadowCrmPriority;
  emailDrafted: boolean;
  attachments: ShadowCrmAttachment[];
  drafts: ShadowCrmEmailDraft[];
  outcome: "pending" | "review_required" | "completed";
  audit: ShadowCrmAuditEvent[];
}

export const EMPTY_SHADOW_CRM_STATE: ShadowCrmPracticeState = {
  stage: "received",
  assignee: null,
  priority: "normal",
  emailDrafted: false,
  attachments: [],
  drafts: [],
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
  const priority = candidate.priority === "low" || candidate.priority === "high" ? candidate.priority : "normal";
  const attachments = Array.isArray(candidate.attachments) ? candidate.attachments.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return typeof item.id === "string" && /^synthetic-[a-z0-9-]+$/.test(item.id)
      && typeof item.name === "string" && /^DEMO-[A-Z0-9-]+\.pdf$/.test(item.name)
      && item.mimeType === "application/pdf" && typeof item.size === "number" && item.size <= 200_000
      && item.validation === "valid" && Array.isArray(item.checks) && item.checks.every((check) => typeof check === "string")
      ? [item as unknown as ShadowCrmAttachment] : [];
  }).slice(0, 10) : [];
  const drafts = Array.isArray(candidate.drafts) ? candidate.drafts.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return typeof item.id === "string" && /^draft-[a-z0-9-]+$/.test(item.id)
      && (item.template === "status-update" || item.template === "missing-documents")
      && (item.version === undefined || (typeof item.version === "number" && item.version >= 1 && item.version <= 100))
      && typeof item.subject === "string" && item.subject.startsWith("[DEMO LOCALE]")
      && typeof item.body === "string" && item.body.includes("non inviata")
      ? [{ ...item, version: typeof item.version === "number" ? item.version : 1 } as unknown as ShadowCrmEmailDraft] : [];
  }).slice(0, 10) : [];
  return { stage, assignee, priority, emailDrafted: candidate.emailDrafted === true || drafts.length > 0, attachments, drafts, outcome, audit };
}

function appendAudit(state: ShadowCrmPracticeState, type: string, now: Date): ShadowCrmPracticeState {
  return { ...state, audit: [...state.audit, { id: `${now.getTime()}-${state.audit.length}`, type, at: now.toISOString() }] };
}

export function assignShadowCrm(
  state: ShadowCrmPracticeState,
  assignee: ShadowCrmAssignee,
  now = new Date(),
): ShadowCrmPracticeState {
  if (state.stage === "completed" || state.assignee === assignee) return state;
  const stage = state.stage === "received" ? "assigned" : state.stage;
  return appendAudit({ ...state, stage, assignee }, `assign-${assignee.replace("operatore-demo-", "")}`, now);
}

export function prioritizeShadowCrm(
  state: ShadowCrmPracticeState,
  priority: ShadowCrmPriority,
  now = new Date(),
): ShadowCrmPracticeState {
  if (state.stage === "completed" || state.priority === priority) return state;
  return appendAudit({ ...state, priority }, `priority-${priority}`, now);
}

const ATTACHMENT_TEMPLATES: Record<ShadowCrmAttachmentTemplate, Omit<ShadowCrmAttachment, "id">> = {
  invoice: { name: "DEMO-FATTURA.pdf", mimeType: "application/pdf", size: 24_000, validation: "valid", checks: ["tipo PDF consentito", "dimensione entro 200 KB", "marcatore sintetico DEMO"] },
  "bank-transfer": { name: "DEMO-BONIFICO.pdf", mimeType: "application/pdf", size: 18_000, validation: "valid", checks: ["tipo PDF consentito", "dimensione entro 200 KB", "marcatore sintetico DEMO"] },
};

export function addSyntheticAttachment(state: ShadowCrmPracticeState, template: ShadowCrmAttachmentTemplate, now = new Date()): ShadowCrmPracticeState {
  if (state.stage === "completed" || state.attachments.length >= 10 || state.attachments.some((item) => item.name === ATTACHMENT_TEMPLATES[template].name)) return state;
  const attachment = { ...ATTACHMENT_TEMPLATES[template], id: `synthetic-${template}-${now.getTime()}` };
  return appendAudit({ ...state, attachments: [...state.attachments, attachment] }, `attachment-${template}`, now);
}

export function removeSyntheticAttachment(state: ShadowCrmPracticeState, attachmentId: string, now = new Date()): ShadowCrmPracticeState {
  if (state.stage === "completed" || !/^synthetic-[a-z0-9-]+$/.test(attachmentId)) return state;
  const attachments = state.attachments.filter((item) => item.id !== attachmentId);
  if (attachments.length === state.attachments.length) return state;
  return appendAudit({ ...state, attachments }, "attachment-removed", now);
}

export function addFixtureEmailDraft(state: ShadowCrmPracticeState, template: ShadowCrmDraftTemplate, practiceCode: string, now = new Date()): ShadowCrmPracticeState {
  if (state.stage !== "review" || state.drafts.length >= 10 || !/^LAB-[A-Z0-9-]+$/.test(practiceCode)) return state;
  const subject = template === "status-update" ? `Aggiornamento pratica ${practiceCode}` : `Documenti mancanti per ${practiceCode}`;
  const body = template === "status-update" ? "La pratica sintetica è in revisione." : "Occorrono esclusivamente documenti fixture aggiuntivi.";
  const version = state.drafts.filter((draft) => draft.template === template).length + 1;
  const draft: ShadowCrmEmailDraft = { id: `draft-${template}-${now.getTime()}`, template, version, subject: `[DEMO LOCALE] ${subject}`, body: `${body} Questa bozza è locale e non inviata.` };
  return appendAudit({ ...state, drafts: [...state.drafts, draft], emailDrafted: true }, `draft-${template}`, now);
}

export function internalPilotCriteria(state: ShadowCrmPracticeState): { ready: boolean; checks: Array<{ label: string; ok: boolean }> } {
  const checks = [
    { label: "assegnatario demo selezionato", ok: state.assignee !== null },
    { label: "almeno due allegati sintetici validi", ok: state.attachments.length >= 2 && state.attachments.every((item) => item.validation === "valid") },
    { label: "almeno una bozza locale non inviata", ok: state.drafts.length > 0 },
    { label: "istruttoria arrivata in revisione o conclusa", ok: state.stage === "review" || state.stage === "completed" },
    { label: "audit locale disponibile", ok: state.audit.length > 0 },
  ];
  return { ready: checks.every((check) => check.ok), checks };
}

export function serializeShadowCrmAudit(practiceId: string, state: ShadowCrmPracticeState): string | null {
  if (!fixtureId(practiceId)) return null;
  return JSON.stringify({ fixture: true, practiceId, exportedAt: new Date().toISOString(), audit: state.audit }, null, 2);
}

export function serializeShadowCrmPractice(practiceId: string, state: ShadowCrmPracticeState): string | null {
  if (!fixtureId(practiceId)) return null;
  return JSON.stringify({ fixture: true, practiceId, exportedAt: new Date().toISOString(), state: sanitize(state), pilot: internalPilotCriteria(state) }, null, 2);
}

export function clearShadowCrmState(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, practiceId: string): boolean {
  if (!fixtureId(practiceId)) return false;
  try {
    const raw = storage.getItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      storage.removeItem(ENEA_SHADOW_CRM_STORAGE_KEY);
      return true;
    }
    const remaining = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([id]) => fixtureId(id) && id !== practiceId));
    if (Object.keys(remaining).length === 0) storage.removeItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    else storage.setItem(ENEA_SHADOW_CRM_STORAGE_KEY, JSON.stringify(remaining));
    return true;
  } catch {
    return false;
  }
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
  return appendAudit(next, action, now);
}
