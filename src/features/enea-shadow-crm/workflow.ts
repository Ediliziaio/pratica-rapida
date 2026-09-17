import type { LocalImportedPractice } from "./importBridge";
import type { TripleFinancialReconciliation } from "./financialReconciliation";
import { isCompleteReadyPreflight, type EneaPreflightRun } from "./preflightContract";

export const ENEA_SHADOW_CRM_STORAGE_KEY = "enea-shadow-crm:workflow:v1";

export type ShadowCrmStage = "received" | "assigned" | "processing" | "review" | "completed";
export type ShadowCrmAssignee = "operatore-demo-anna" | "operatore-demo-luca";
export type ShadowCrmPriority = "low" | "normal" | "high";
export type ShadowCrmAttachmentTemplate = "invoice" | "bank-transfer";
export type ShadowCrmDraftTemplate = "status-update" | "missing-documents";

export function protectedWindowSurface(
  product: "zanzariera" | "altra_schermatura",
  identity: { practiceId: string; rowId: string },
  dimensions?: { widthCm: number; heightCm: number },
  verifiedSurfaceM2?: number | null,
): number | null {
  if (typeof verifiedSurfaceM2 === "number" && Number.isFinite(verifiedSurfaceM2) && verifiedSurfaceM2 > 0) return verifiedSurfaceM2;
  if (product !== "zanzariera") return deterministicProtectedWindowSurface(identity.practiceId, identity.rowId)?.value ?? null;
  if (!dimensions || !Number.isFinite(dimensions.widthCm) || !Number.isFinite(dimensions.heightCm)
    || dimensions.widthCm <= 0 || dimensions.heightCm <= 0) return null;
  return Math.round((dimensions.widthCm * dimensions.heightCm / 10_000) * 100) / 100;
}

export type ShadowPlantDistribution =
  | { strategy: "first_available"; value: null }
  | { strategy: "explicit"; value: "orizzontale ad anello" };

export function shadowPlantDistribution(terminal: "caloriferi" | "riscaldamento_pavimento" | "split" | ""): ShadowPlantDistribution {
  return terminal === "riscaldamento_pavimento"
    ? { strategy: "explicit", value: "orizzontale ad anello" }
    : { strategy: "first_available", value: null };
}

export type ShadowGeneratorEfficiency =
  | { source: "verified" | "indicative_fallback"; value: number }
  | { source: "operator_required"; value: null; reason: "missing_reseller" | "ideal_sistem" };

function normalizedReseller(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

/**
 * Il fallback resta stabile per pratica (non casuale a ogni render) ma varia tra
 * pratiche. Ideal Sistem e i casi senza rivenditore verificato richiedono sempre
 * l'operatore quando manca il dato reale.
 */
export function shadowGeneratorEfficiency(
  practiceKey: string,
  reseller: string,
  verifiedEfficiency?: number | null,
): ShadowGeneratorEfficiency {
  if (typeof verifiedEfficiency === "number" && Number.isFinite(verifiedEfficiency)
    && verifiedEfficiency > 0 && verifiedEfficiency <= 100) {
    return { source: "verified", value: verifiedEfficiency };
  }
  const normalized = normalizedReseller(reseller);
  if (!normalized) return { source: "operator_required", value: null, reason: "missing_reseller" };
  if (normalized === "ideal sistem") return { source: "operator_required", value: null, reason: "ideal_sistem" };

  return { source: "indicative_fallback", value: indicativeGeneratorEfficiency(practiceKey) };
}

export function shadowGeneratorPower(
  practiceKey: string,
  buildingFingerprint?: string | null,
  verifiedPower?: number | null,
): { source: "verified" | "building_fallback" | "practice_fallback"; value: number } {
  if (typeof verifiedPower === "number" && Number.isFinite(verifiedPower) && verifiedPower > 0) {
    return { source: "verified", value: verifiedPower };
  }
  return {
    source: buildingFingerprint ? "building_fallback" : "practice_fallback",
    value: indicativeGeneratorPower(practiceKey, buildingFingerprint),
  };
}

export function hasOperationalRule(field: string): boolean {
  return operationalRuleFor(field) !== null;
}

export const OFFICIAL_PILOT_FIXTURE_IDS: readonly string[] = Object.freeze(["lab-schermature-001", "lab-schermature-002"]);
export const INTERNAL_PILOT_PROCEDURE = Object.freeze([
  Object.freeze({ order: 1, role: "Operatore demo", action: "Seleziona la pratica fixture, allega i due documenti DEMO e verifica i controlli." }),
  Object.freeze({ order: 2, role: "Istruttore demo", action: "Assegna priorità, avvia la lavorazione e porta la pratica in revisione." }),
  Object.freeze({ order: 3, role: "Revisore demo", action: "Prepara almeno una bozza locale, verifica la readiness e conclude la pratica." }),
  Object.freeze({ order: 4, role: "Responsabile pilot", action: "Esporta il riepilogo fixture prima di autorizzare la pulizia locale." }),
]);

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

export function recordNonSubmittableShadowWindowSimulation(
  state: ShadowCrmPracticeState,
  assumptions: ShadowWindowTestAssumptions,
  now = new Date(),
): ShadowCrmPracticeState {
  if (assumptions.mode !== "test_not_submittable" || assumptions.suppliedBy !== "user") return state;
  return appendAudit(state, "shadowindow-test-assumptions-non-submittable", now);
}

export function recordNonSubmittableShadowWindowResult(
  state: ShadowCrmPracticeState,
  totalKwhYear: number,
  now = new Date(),
): ShadowCrmPracticeState {
  if (!Number.isFinite(totalKwhYear) || totalKwhYear < 0) return state;
  const auditValue = totalKwhYear.toFixed(2).replace(".", "-");
  return appendAudit(state, `shadowindow-test-result-${auditValue}`, now);
}

const ENEA_PREVIEW_OPENED = "enea-description-preview-opened";
const ENEA_PREVIEW_CONFIRMED = "enea-description-preview-confirmed-closed";
const ENEA_SUBMIT_CLICKED = "enea-submit-clicked-once";
const ENEA_NATIVE_CONFIRM_ACCEPTED = "enea-native-confirm-accepted";
const ENEA_SERVER_SUBMITTED = "enea-server-submitted-cpid-verified";
const ENEA_SERVER_OUTCOME_UNCERTAIN = "enea-server-outcome-uncertain-no-retry";

export function recordEneaDescriptionPreviewOpened(
  state: ShadowCrmPracticeState,
  now = new Date(),
): ShadowCrmPracticeState {
  return appendAudit(state, ENEA_PREVIEW_OPENED, now);
}

export function recordEneaDescriptionPreviewConfirmed(
  state: ShadowCrmPracticeState,
  now = new Date(),
): ShadowCrmPracticeState {
  const opened = state.audit.some((event) => event.type === ENEA_PREVIEW_OPENED);
  const alreadyConfirmed = state.audit.some((event) => event.type === ENEA_PREVIEW_CONFIRMED);
  return opened && !alreadyConfirmed ? appendAudit(state, ENEA_PREVIEW_CONFIRMED, now) : state;
}

export function canConfirmAndSubmitEnea(state: ShadowCrmPracticeState): boolean {
  return canAdvanceFromPreflightToEnea(state)
    && state.audit.some((event) => event.type === ENEA_PREVIEW_CONFIRMED)
    && !state.audit.some((event) => event.type === ENEA_SUBMIT_CLICKED);
}

/** Fail-closed: nessuna apertura/compilazione/invio ENEA senza tripla riconciliazione. */
export function canAdvanceFromPreflightToEnea(state: ShadowCrmPracticeState): boolean {
  return state.operatorStatus === "active"
    && isCompleteReadyPreflight(state.preflightRuns.at(-1));
}

export function recordEneaPreflightRun(state: ShadowCrmPracticeState, run: EneaPreflightRun): ShadowCrmPracticeState {
  const next = { ...state, preflightRuns: [...state.preflightRuns, run].slice(-20) };
  if (run.outcome === "ready") return appendAudit(next, "enea-preflight-ready", new Date(run.at));
  const failed = run.steps.find((step) => !step.ok);
  return requestOperatorIntervention(next, {
    field: `preflight.${failed?.step ?? "unknown"}`,
    sources: [failed?.source || "preflight contract"],
    reason: failed?.reason || "Preflight incompleto.",
    options: [failed?.nextAction || "Completare il preflight", "Assegnare a lavorazione manuale"],
  }, new Date(run.at));
}

export function recordEneaSubmitClick(
  state: ShadowCrmPracticeState,
  now = new Date(),
): ShadowCrmPracticeState {
  return canConfirmAndSubmitEnea(state) ? appendAudit(state, ENEA_SUBMIT_CLICKED, now) : state;
}

export function recordEneaNativeConfirmAccepted(
  state: ShadowCrmPracticeState,
  now = new Date(),
): ShadowCrmPracticeState {
  const clicked = state.audit.some((event) => event.type === ENEA_SUBMIT_CLICKED);
  const alreadyAccepted = state.audit.some((event) => event.type === ENEA_NATIVE_CONFIRM_ACCEPTED);
  return clicked && !alreadyAccepted ? appendAudit(state, ENEA_NATIVE_CONFIRM_ACCEPTED, now) : state;
}

export function recordEneaServerOutcome(
  state: ShadowCrmPracticeState,
  outcome: { status: "submitted"; cpid: string } | { status: "uncertain" },
  now = new Date(),
): ShadowCrmPracticeState {
  const confirmed = state.audit.some((event) => event.type === ENEA_NATIVE_CONFIRM_ACCEPTED);
  if (!confirmed) return state;
  if (outcome.status === "submitted" && outcome.cpid.trim()) {
    return appendAudit(state, ENEA_SERVER_SUBMITTED, now);
  }
  return appendAudit(state, ENEA_SERVER_OUTCOME_UNCERTAIN, now);
}

export function recordValidatedFiscalCodePrecedence(
  state: ShadowCrmPracticeState,
  now = new Date(),
): ShadowCrmPracticeState {
  return appendAudit(state, "valid-document-cf-over-invalid-form", now);
}

export function applyFiscalCodeResolutionGate(
  state: ShadowCrmPracticeState,
  resolution: FiscalCodeResolution,
  now = new Date(),
): ShadowCrmPracticeState {
  if (resolution.source === "original_document") {
    return recordValidatedFiscalCodePrecedence(state, now);
  }
  if (resolution.source === "operator_required") {
    return requestOperatorIntervention(state, {
      field: "beneficiario.cf",
      sources: ["modulo cliente", "documenti originari", "dati anagrafici locali"],
      reason: resolution.reason === "identity_conflict"
        ? "Il codice fiscale documentale è formalmente valido, ma la coerenza con i dati anagrafici non è stata verificata localmente."
        : "Il codice fiscale non è risolvibile con validazione locale e documenti originari.",
      options: ["Verificare i dati anagrafici e il documento originario", "Assegnare a lavorazione manuale"],
    }, now);
  }
  return state;
}

export function recordScreeningExposurePolicy(
  state: ShadowCrmPracticeState,
  source: "explicit_per_row" | "user_confirmed_case" | "south_fallback",
  now = new Date(),
): ShadowCrmPracticeState {
  return appendAudit(state, `screening-exposure-${source}`, now);
}

export interface ShadowCrmExceptionTicket {
  id: string;
  field: string;
  sources: string[];
  reason: string;
  options: string[];
  status: "requested_operator" | "rule_defined" | "manual_work";
  resolutionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ShadowCrmPracticeState {
  stage: ShadowCrmStage;
  assignee: string | null;
  priority: ShadowCrmPriority;
  emailDrafted: boolean;
  attachments: ShadowCrmAttachment[];
  drafts: ShadowCrmEmailDraft[];
  outcome: "pending" | "review_required" | "completed";
  operatorStatus: "active" | "requested_operator" | "manual_work";
  exceptions: ShadowCrmExceptionTicket[];
  audit: ShadowCrmAuditEvent[];
  preflightRuns: EneaPreflightRun[];
}

export const EMPTY_SHADOW_CRM_STATE: ShadowCrmPracticeState = {
  stage: "received",
  assignee: null,
  priority: "normal",
  emailDrafted: false,
  attachments: [],
  drafts: [],
  outcome: "pending",
  operatorStatus: "active",
  exceptions: [],
  audit: [],
  preflightRuns: [],
};

const ALLOWED_STAGES = new Set<ShadowCrmStage>(["received", "assigned", "processing", "review", "completed"]);

function fixtureId(id: string): boolean {
  return /^lab-[a-z0-9-]+$/.test(id);
}

function importedPracticeId(id: string): boolean {
  return /^local-import-[0-9a-f]{8}$/.test(id);
}

function localPracticeId(id: string): boolean {
  return fixtureId(id) || importedPracticeId(id);
}

export function pilotSessionId(practiceId: string): string | null {
  if (OFFICIAL_PILOT_FIXTURE_IDS.includes(practiceId)) return `PILOT-CRM-ENEA-V1-${practiceId.toUpperCase()}`;
  return importedPracticeId(practiceId) ? `PILOT-CRM-ENEA-LOCAL-${practiceId.slice(-8).toUpperCase()}` : null;
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
  const exceptions = Array.isArray(candidate.exceptions) ? candidate.exceptions.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const status = item.status === "rule_defined" || item.status === "manual_work" ? item.status : "requested_operator";
    return typeof item.id === "string" && /^exception-[0-9]+$/.test(item.id)
      && typeof item.field === "string" && /^[a-z0-9_.-]{1,80}$/.test(item.field)
      && Array.isArray(item.sources) && item.sources.every((source) => typeof source === "string" && source.length <= 100)
      && typeof item.reason === "string" && item.reason.length > 0 && item.reason.length <= 500
      && Array.isArray(item.options) && item.options.every((option) => typeof option === "string" && option.length <= 200)
      && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
      ? [{ ...item, status, resolutionReason: typeof item.resolutionReason === "string" ? item.resolutionReason : null, resolvedAt: typeof item.resolvedAt === "string" && Number.isFinite(Date.parse(item.resolvedAt)) ? item.resolvedAt : null } as ShadowCrmExceptionTicket]
      : [];
  }).slice(-20) : [];
  const operatorStatus = exceptions.some((ticket) => ticket.status === "requested_operator")
    ? "requested_operator"
    : exceptions.some((ticket) => ticket.status === "manual_work") ? "manual_work" : "active";
  const preflightRuns = Array.isArray(candidate.preflightRuns) ? candidate.preflightRuns.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const run = entry as EneaPreflightRun;
    return run.version === "enea-preflight-v1" && (run.outcome === "ready" || run.outcome === "requested_operator")
      && typeof run.id === "string" && typeof run.at === "string" && Number.isFinite(Date.parse(run.at))
      && Array.isArray(run.steps) ? [run] : [];
  }).slice(-20) : [];
  return { stage, assignee, priority, emailDrafted: candidate.emailDrafted === true || drafts.length > 0, attachments, drafts, outcome, operatorStatus, exceptions, audit, preflightRuns };
}

function appendAudit(state: ShadowCrmPracticeState, type: string, now: Date): ShadowCrmPracticeState {
  return { ...state, audit: [...state.audit, { id: `${now.getTime()}-${state.audit.length}`, type, at: now.toISOString() }] };
}

export function requestOperatorIntervention(
  state: ShadowCrmPracticeState,
  ticket: Pick<ShadowCrmExceptionTicket, "field" | "sources" | "reason" | "options">,
  now = new Date(),
): ShadowCrmPracticeState {
  if (!/^[a-z0-9_.-]{1,80}$/.test(ticket.field)
    || !ticket.reason.trim()
    || ticket.sources.length === 0
    || ticket.options.length === 0
    || state.exceptions.some((entry) => entry.field === ticket.field && entry.status === "requested_operator")) return state;
  const exception: ShadowCrmExceptionTicket = {
    id: `exception-${now.getTime()}`,
    field: ticket.field,
    sources: ticket.sources.slice(0, 10),
    reason: ticket.reason.slice(0, 500),
    options: ticket.options.slice(0, 10),
    status: "requested_operator",
    resolutionReason: null,
    createdAt: now.toISOString(),
    resolvedAt: null,
  };
  return appendAudit({ ...state, operatorStatus: "requested_operator", exceptions: [...state.exceptions, exception] }, "operator-intervention-requested", now);
}

export function applyFinalPrintedInvoiceTotalGate(
  state: ShadowCrmPracticeState,
  reconciliation: TripleFinancialReconciliation,
  now = new Date(),
): ShadowCrmPracticeState {
  if (reconciliation.usable && reconciliation.total !== null) {
    const duplicateAudited = reconciliation.discardedDuplicateSourceIds.reduce(
      (current, sourceId) => appendAudit(current, `financial-duplicate-discarded:${sourceId}`, now),
      state,
    );
    const audited = reconciliation.auditNotes.reduce(
      (current, note) => appendAudit(current, `financial-internal-adjustment-noted:${note}`, now), duplicateAudited,
    );
    return appendAudit(audited, "financial-final-printed-total-verified", now);
  }
  const methodSummary = reconciliation.methods.map((method) => `${method.method}=${method.ok ? method.total : method.reason}`).join("; ");
  return requestOperatorIntervention(state, {
    field: "economico.totale_finale_fatture",
    sources: [...new Set(reconciliation.methods.flatMap((method) => [...method.sources]))],
    reason: `Totale finale stampato delle fatture non verificabile (${reconciliation.policyVersion}): ${methodSummary}`,
    options: ["Indicare o acquisire il totale finale stampato", "Assegnare a lavorazione manuale"],
  }, now);
}

/**
 * @deprecated Alias di compatibilita per chiamanti e checkpoint storici. Il
 * runtime non esegue piu alcuna riconciliazione tripla: delega al solo gate
 * del totale finale stampato.
 */
export const applyTripleFinancialReconciliationGate = applyFinalPrintedInvoiceTotalGate;

export function applyShadowWindowInputGate(
  state: ShadowCrmPracticeState,
  input: {
    glassType?: ShadowWindowGlassType | null;
    cooling: CoolingPerformanceInput;
    eneaDraft: "preserved_not_submitted";
  },
  now = new Date(),
): ShadowCrmPracticeState {
  const glass = verifiedShadowWindowGlassType(input.glassType);
  const cooling = resolveCoolingPerformance(input.cooling);
  if (glass.source === "user_confirmed_operational_policy" || cooling.source === "user_confirmed_operational_policy") {
    return appendAudit(state, "shadowindow-user-confirmed-operational-policy-applied", now);
  }
  return state;
}

export type ScreeningSourceKind = "customer_form" | "invoice" | "technical_attachment";
export type ScreeningExposure = "nord" | "nord_est" | "est" | "sud_est" | "sud" | "sud_ovest" | "ovest" | "nord_ovest";

export interface ScreeningSourceRow {
  sourceKind: ScreeningSourceKind;
  sourceDocumentId: string;
  sourceRowId: string;
  areaM2: number;
  protectedWindowAreaM2: number;
  exposure: ScreeningExposure;
  mechanism: "manuale" | "automatico";
}

export interface ReconciledScreeningRow {
  rowId: string;
  sourceKind: ScreeningSourceKind;
  sourceDocumentId: string;
  sourceRowId: string;
  areaM2: number;
  protectedWindowAreaM2: number;
  exposure: ScreeningExposure;
  mechanism: "manuale" | "automatico";
}

export function screeningReconciliationIssues(
  sources: readonly ScreeningSourceRow[],
  rows: readonly ReconciledScreeningRow[],
): string[] {
  const allowedSources = new Set<ScreeningSourceKind>(["customer_form", "invoice", "technical_attachment"]);
  const sourceKey = (row: Pick<ScreeningSourceRow, "sourceKind" | "sourceDocumentId" | "sourceRowId">) =>
    `${row.sourceKind}:${row.sourceDocumentId}:${row.sourceRowId}`;
  const issues: string[] = [];
  const sourceMap = new Map<string, ScreeningSourceRow>();
  for (const source of sources) {
    const key = sourceKey(source);
    if (!allowedSources.has(source.sourceKind) || !source.sourceDocumentId.trim() || !source.sourceRowId.trim()
      || !Number.isFinite(source.areaM2) || source.areaM2 <= 0 || sourceMap.has(key)) {
      issues.push(`fonte-non-valida:${key}`);
      continue;
    }
    sourceMap.set(key, source);
  }
  if (sources.length !== rows.length) issues.push(`quantita:${sources.length}:${rows.length}`);
  const used = new Set<string>();
  for (const row of rows) {
    const key = sourceKey(row);
    const source = sourceMap.get(key);
    if (!row.rowId.trim() || !source || used.has(key)) {
      issues.push(`associazione:${row.rowId || "senza-id"}:${key}`);
      continue;
    }
    used.add(key);
    if (!Number.isFinite(row.areaM2) || Math.abs(row.areaM2 - source.areaM2) > 0.01) {
      issues.push(`area:${row.rowId}`);
    }
    if (row.exposure !== source.exposure) issues.push(`esposizione:${row.rowId}`);
    if (!Number.isFinite(row.protectedWindowAreaM2)
      || Math.abs(row.protectedWindowAreaM2 - source.protectedWindowAreaM2) > 0.01) {
      issues.push(`superficie-finestrata:${row.rowId}`);
    }
    if (row.mechanism !== source.mechanism) issues.push(`meccanismo:${row.rowId}`);
  }
  for (const key of sourceMap.keys()) if (!used.has(key)) issues.push(`fonte-non-usata:${key}`);
  return [...new Set(issues)];
}

export function applyScreeningReconciliationGate(
  state: ShadowCrmPracticeState,
  sources: readonly ScreeningSourceRow[],
  rows: readonly ReconciledScreeningRow[],
  now = new Date(),
): ShadowCrmPracticeState {
  const issues = screeningReconciliationIssues(sources, rows);
  if (issues.length === 0) return appendAudit(state, "screening-rows-reconciled", now);
  return requestOperatorIntervention(state, {
    field: "schermature.righe_riconciliazione",
    sources: ["modulo cliente", "fattura pertinente", "allegato tecnico originario"],
    reason: `Righe schermature non riconciliate uno-a-uno: ${issues.join(", ")}. Verificare quantità, area, superficie finestrata, meccanismo e associazione riga-orientamento prima del pilot.`,
    options: ["Correggere la mappatura dalle fonti originarie", "Assegnare a Da lavorare a mano con motivo"],
  }, now);
}

export interface BuildingUnitInput {
  totalBuildingUnits: number | null;
  affectedUnits: number | null;
  buildingType: "single_unit" | "multi_unit" | "over_three_floors" | null;
  sources: string[];
}

export function applyBuildingUnitConsistencyGate(
  state: ShadowCrmPracticeState,
  input: BuildingUnitInput,
  now = new Date(),
): ShadowCrmPracticeState {
  const total = input.totalBuildingUnits;
  const affected = input.affectedUnits;
  const invalid = !Number.isInteger(total) || !Number.isInteger(affected) || (total ?? 0) < 1
    || (affected ?? 0) < 1 || (affected ?? 0) > (total ?? 0);
  const typeConflict = (input.buildingType === "over_three_floors" || input.buildingType === "multi_unit") && total === 1;
  if (!invalid && !typeConflict) return appendAudit(state, "building-units-reconciled", now);
  return requestOperatorIntervention(state, {
    field: "intervento.unita_edificio",
    sources: input.sources,
    reason: "Numero unità interessate e totale edificio incoerenti o incompatibili con la tipologia edilizia; i due valori devono restare distinti.",
    options: ["Verificare le fonti originarie", "Assegnare a Da lavorare a mano con motivo"],
  }, now);
}

export interface WorkDateSource {
  date: string;
  sourceDocumentId: string;
  kind: "explicit_start" | "explicit_completion" | "invoice" | "pertinent_document";
}

export function resolveWorkDates(sources: readonly WorkDateSource[]):
  | { status: "resolved"; startDate: string; completionDate: string; startSource: string; completionSource: string }
  | { status: "operator_required"; reason: string } {
  const valid = sources.filter((item) => Number.isFinite(Date.parse(item.date)) && item.sourceDocumentId.trim());
  const explicitStart = valid.find((item) => item.kind === "explicit_start");
  const explicitEnd = valid.find((item) => item.kind === "explicit_completion");
  const documents = valid.filter((item) => item.kind === "pertinent_document" || item.kind === "invoice")
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const invoices = valid.filter((item) => item.kind === "invoice")
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const start = explicitStart ?? documents[0];
  const end = explicitEnd ?? invoices.at(-1);
  if (!start || !end || Date.parse(start.date) > Date.parse(end.date)) {
    return { status: "operator_required", reason: "Date inizio/fine non risolvibili o cronologicamente incoerenti dalle fonti originarie." };
  }
  return { status: "resolved", startDate: start.date, completionDate: end.date, startSource: start.sourceDocumentId, completionSource: end.sourceDocumentId };
}

export type TechnicalValue<T> = { value: T; sourceId: string; provenance: "verified_source" | "operational_assumption" };

export function technicalValueWithProvenance<T>(
  verified: { value: T; sourceId: string } | null,
  fallback: { value: T; policyId: string } | null,
): TechnicalValue<T> | null {
  if (verified?.sourceId.trim()) return { ...verified, provenance: "verified_source" };
  if (fallback?.policyId.trim()) return { value: fallback.value, sourceId: fallback.policyId, provenance: "operational_assumption" };
  return null;
}

export interface ShadowWindowAuditRecord {
  version: string;
  inputs: Readonly<Record<string, string | number>>;
  outputKwhYear: number;
  reconciledScreeningRowIds: readonly string[];
}

/** @deprecated Archivio dei pilot precedenti: non usare per nuove lavorazioni. */
export function validateShadowWindowAudit(record: ShadowWindowAuditRecord, expectedRowIds: readonly string[]): string[] {
  const required = ["province", "eerOrGue", "glassType", "protectedWindowAreaM2", "exposure", "gtot"];
  const issues = required.filter((key) => record.inputs[key] === undefined).map((key) => `input:${key}`);
  if (!record.version.trim()) issues.push("versione");
  if (!Number.isFinite(record.outputKwhYear) || record.outputKwhYear < 0) issues.push("output");
  const actual = [...record.reconciledScreeningRowIds].sort();
  const expected = [...expectedRowIds].sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) issues.push("righe-non-riconciliate");
  return issues;
}

export function applyWorkCompletionDeadline(
  state: ShadowCrmPracticeState,
  workCompletedAt: string | null,
  processingAt = new Date(),
): ShadowCrmPracticeState {
  if (!workCompletedAt || !Number.isFinite(Date.parse(workCompletedAt))) return state;
  const completed = new Date(workCompletedAt);
  const completedDay = Date.UTC(completed.getUTCFullYear(), completed.getUTCMonth(), completed.getUTCDate());
  const processingDay = Date.UTC(processingAt.getUTCFullYear(), processingAt.getUTCMonth(), processingAt.getUTCDate());
  const elapsedDays = Math.floor((processingDay - completedDay) / 86_400_000);
  if (elapsedDays <= 90 || state.exceptions.some((ticket) => ticket.field === "intervento.data_fine_lavori")) return state;
  const blocked = requestOperatorIntervention(state, {
    field: "intervento.data_fine_lavori",
    sources: ["data fine lavori verificata nelle fonti originarie", "data lavorazione CRM ombra"],
    reason: `La lavorazione avviene ${elapsedDays} giorni dopo la fine lavori: risultano superati i 90 giorni consentiti. Non proseguire automaticamente.`,
    options: ["Verifica manuale del termine e della procedibilità", "Assegnare a Da lavorare a mano con motivo"],
  }, processingAt);
  if (blocked === state) return state;
  const deadlineTicket = blocked.exceptions.at(-1)!;
  return { ...blocked, exceptions: [deadlineTicket, ...blocked.exceptions.slice(0, -1)] };
}

export function overrideHistoricalComparisonDeadline(
  state: ShadowCrmPracticeState,
  reason: string,
  scope: "historical_comparison",
  now = new Date(),
): ShadowCrmPracticeState {
  const deadlineTicket = state.exceptions.find((ticket) => ticket.field === "intervento.data_fine_lavori" && ticket.status === "requested_operator");
  if (!deadlineTicket || scope !== "historical_comparison" || !reason.trim()) return state;
  const exceptions = state.exceptions.map((ticket) => ticket.id === deadlineTicket.id ? {
    ...ticket,
    status: "rule_defined" as const,
    resolutionReason: `[OVERRIDE TEST STORICO] ${reason.slice(0, 450)}`,
    resolvedAt: now.toISOString(),
  } : ticket);
  const operatorStatus = exceptions.some((ticket) => ticket.status === "requested_operator") ? "requested_operator" : "active";
  return appendAudit({ ...state, exceptions, operatorStatus }, "historical-deadline-override", now);
}

export function resolveOperatorIntervention(
  state: ShadowCrmPracticeState,
  ticketId: string,
  resolution: "rule_defined" | "manual_work",
  reason: string,
  now = new Date(),
): ShadowCrmPracticeState {
  if (!reason.trim()) return state;
  const target = state.exceptions.find((ticket) => ticket.id === ticketId && ticket.status === "requested_operator");
  if (!target) return state;
  const exceptions = state.exceptions.map((ticket) => ticket.id === ticketId ? { ...ticket, status: resolution, resolutionReason: reason.slice(0, 500), resolvedAt: now.toISOString() } : ticket);
  const operatorStatus = resolution === "manual_work" ? "manual_work" : exceptions.some((ticket) => ticket.status === "requested_operator") ? "requested_operator" : "active";
  const stage = resolution === "rule_defined" ? (state.assignee ? "assigned" : "received") : state.stage;
  return appendAudit({ ...state, exceptions, operatorStatus, stage }, resolution === "rule_defined" ? "operator-rule-defined" : "operator-manual-work", now);
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
  if (state.stage !== "review" || state.drafts.length >= 10 || !/^(LAB|CRM)-[A-Z0-9-]+$/.test(practiceCode)) return state;
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
    { label: "tripla riconciliazione economica concorde e auditata", ok: canAdvanceFromPreflightToEnea(state) },
  ];
  return { ready: checks.every((check) => check.ok), checks };
}

export function serializeShadowCrmAudit(practiceId: string, state: ShadowCrmPracticeState): string | null {
  if (!localPracticeId(practiceId)) return null;
  return JSON.stringify({ fixture: fixtureId(practiceId), localSnapshot: importedPracticeId(practiceId), practiceId, exportedAt: new Date().toISOString(), audit: state.audit }, null, 2);
}

export function serializeShadowCrmPractice(practiceId: string, state: ShadowCrmPracticeState, source?: LocalImportedPractice): string | null {
  const sessionId = pilotSessionId(practiceId);
  if (!sessionId) return null;
  const imported = importedPracticeId(practiceId);
  if (imported && (!source
    || source.localId !== practiceId
    || source.customerLabel !== "Cliente reale mascherato"
    || Object.values(source.communicationPolicy).some((value) => value !== "blocked"))) return null;
  const minimizedSource = source ? {
    schema: source.schema,
    localId: source.localId,
    sourceFingerprint: source.sourceFingerprint,
    code: source.code,
    customerLabel: source.customerLabel,
    maskedEmail: source.maskedEmail,
    maskedPhone: source.maskedPhone,
    maskedFiscalCode: source.maskedFiscalCode,
    product: source.product,
    receivedAt: source.receivedAt,
    workCompletedAt: source.workCompletedAt,
    documentCount: source.documentCount,
    formComplete: source.formComplete,
    importedAt: source.importedAt,
    sourceMode: source.sourceMode,
    communicationPolicy: source.communicationPolicy,
  } : undefined;
  return JSON.stringify({ fixture: fixtureId(practiceId), localSnapshot: imported, practiceId, sessionId, exportedAt: new Date().toISOString(), procedure: INTERNAL_PILOT_PROCEDURE, source: minimizedSource, state: sanitize(state), pilot: internalPilotCriteria(state) }, null, 2);
}

export function clearShadowCrmState(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, practiceId: string): boolean {
  if (!localPracticeId(practiceId)) return false;
  try {
    const raw = storage.getItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      storage.removeItem(ENEA_SHADOW_CRM_STORAGE_KEY);
      return true;
    }
    const remaining = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([id]) => localPracticeId(id) && id !== practiceId));
    if (Object.keys(remaining).length === 0) storage.removeItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    else storage.setItem(ENEA_SHADOW_CRM_STORAGE_KEY, JSON.stringify(remaining));
    return true;
  } catch {
    return false;
  }
}

export function loadShadowCrmState(storage: Pick<Storage, "getItem">, practiceId: string): ShadowCrmPracticeState {
  if (!localPracticeId(practiceId)) return EMPTY_SHADOW_CRM_STATE;
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
  if (!localPracticeId(practiceId)) return;
  try {
    const raw = storage.getItem(ENEA_SHADOW_CRM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    const current = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    storage.setItem(ENEA_SHADOW_CRM_STORAGE_KEY, JSON.stringify({
      ...Object.fromEntries(Object.entries(current).filter(([id]) => localPracticeId(id))),
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
  if (state.operatorStatus !== "active") return state;
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
import { deterministicProtectedWindowSurface, indicativeGeneratorEfficiency, indicativeGeneratorPower, operationalRuleFor, resolveCoolingPerformance, verifiedShadowWindowGlassType, type CoolingPerformanceInput, type FiscalCodeResolution, type ShadowWindowGlassType, type ShadowWindowTestAssumptions } from "./operationalRules";
