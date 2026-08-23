import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_READY_PIPELINE, type AprCrmInboundPracticeEvent } from "../../src/features/enea-shadow-crm/aprCrmIntegrationContract";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";
import type { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";

export const APR_CRM_INCOMING_READONLY_VERSION = "apr-crm-incoming-readonly-v1" as const;
const READY_STAGE_TYPE = "pronte_da_fare";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const RULE_IDS = [
  "system-apr-crm-dedicated-auth",
  "system-apr-crm-readonly-adapter-contract",
  "system-apr-crm-integration-boundary",
  "system-readonly-adapter-contract",
  "system-atomic-checkpoint-resume",
] as const;

interface IncomingRow {
  id?: unknown;
  cliente_nome?: unknown;
  cliente_cognome?: unknown;
  updated_at?: unknown;
  form_compilato_at?: unknown;
  current_stage_id?: unknown;
  pipeline_stages?: unknown;
}

export interface AprCrmIncomingItem {
  eventId: string;
  practiceId: string | null;
  displayName: string;
  state: "pending_dispatch" | "dispatched" | "excluded" | "blocked_invalid";
  event: AprCrmInboundPracticeEvent | null;
  reason: string;
  firstObservedAt: string;
  dispatchedAt: string | null;
  responseSha256: string;
}

export interface AprCrmIncomingAuditEvent {
  revision: number;
  at: string;
  type: "initialized" | "poll_completed" | "event_staged" | "event_dispatched" | "row_excluded" | "row_blocked" | "login_required" | "technical_block";
  eventId: string | null;
  reason: string;
  appliedRuleIds: string[];
}

export interface AprCrmIncomingState {
  version: typeof APR_CRM_INCOMING_READONLY_VERSION;
  revision: number;
  status: "idle" | "working" | "operator_required" | "login_required" | "technical_block";
  items: AprCrmIncomingItem[];
  lastResponseSha256: string | null;
  lastSuccessfulPollAt: string | null;
  externalActionAllowed: false;
  mutationAllowed: false;
  transport: "authenticated_get_only";
  sourcePipeline: typeof APR_READY_PIPELINE;
  reason: string;
  nextAction: string;
  audit: AprCrmIncomingAuditEvent[];
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function hasReadyStage(value: unknown) {
  if (Array.isArray(value)) return value.some(hasReadyStage);
  return Boolean(value && typeof value === "object" && (value as { stage_type?: unknown }).stage_type === READY_STAGE_TYPE);
}

function summarize(state: AprCrmIncomingState) {
  const pending = state.items.filter((item) => item.state === "pending_dispatch").length;
  const blocked = state.items.filter((item) => item.state === "blocked_invalid").length;
  if (state.status === "login_required" || state.status === "technical_block") return;
  if (pending) {
    state.status = "working";
    state.reason = `${pending} eventi CRM persistiti e pronti per l'inoltro idempotente.`;
    state.nextAction = "Inoltrare gli eventi persistiti alla coda APR locale, uno alla volta.";
  } else if (blocked) {
    state.status = "operator_required";
    state.reason = `${blocked} righe CRM non valide isolate; le altre pratiche sono state inoltrate.`;
    state.nextAction = "Mostrare le righe non valide in Richiesto intervento operatore quando il gate CRM mutativo sarà autorizzato tecnicamente.";
  } else {
    state.status = "idle";
    state.reason = "IDLE — nessun nuovo evento CRM da inoltrare.";
    state.nextAction = "Continuare il polling GET della pipeline Pronte da fare.";
  }
}

function initialState(now: Date): AprCrmIncomingState {
  const reason = "Ingresso CRM read-only inizializzato; nessuna lettura ancora eseguita.";
  return {
    version: APR_CRM_INCOMING_READONLY_VERSION, revision: 0, status: "idle", items: [],
    lastResponseSha256: null, lastSuccessfulPollAt: null, externalActionAllowed: false,
    mutationAllowed: false, transport: "authenticated_get_only", sourcePipeline: APR_READY_PIPELINE,
    reason, nextAction: "Eseguire un GET autenticato della pipeline Pronte da fare.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", eventId: null, reason, appliedRuleIds: [...RULE_IDS] }],
  };
}

function validState(value: AprCrmIncomingState) {
  return value.version === APR_CRM_INCOMING_READONLY_VERSION
    && value.externalActionAllowed === false
    && value.mutationAllowed === false
    && value.transport === "authenticated_get_only"
    && value.sourcePipeline === APR_READY_PIPELINE
    && Number.isInteger(value.revision)
    && Array.isArray(value.items)
    && value.audit.every((entry) => entry.appliedRuleIds.length > 0 && entry.appliedRuleIds.every((ruleId) => registryRule(ruleId)));
}

function rowIdentity(row: IncomingRow) {
  return sha256(JSON.stringify(row));
}

function mapRow(row: IncomingRow, responseSha256: string, observedAt: string): AprCrmIncomingItem {
  const rawId = typeof row.id === "string" ? row.id.trim() : "";
  const firstName = typeof row.cliente_nome === "string" ? row.cliente_nome.trim() : "";
  const lastName = typeof row.cliente_cognome === "string" ? row.cliente_cognome.trim() : "";
  const displayName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
  const revision = Date.parse(updatedAt);
  const fallbackId = `invalid:${rowIdentity(row)}`;
  if (!/^[a-f0-9-]{36}$/i.test(rawId) || !displayName || !Number.isSafeInteger(revision) || revision < 0 || !hasReadyStage(row.pipeline_stages)) {
    return { eventId: fallbackId, practiceId: rawId || null, displayName: displayName || "Riga CRM non identificata", state: "blocked_invalid", event: null,
      reason: "Riga Pronte da fare priva di identità, revisione o stage verificabile; nessun valore è stato inventato.", firstObservedAt: observedAt, dispatchedAt: null, responseSha256 };
  }
  const eventId = `crm-ready:${rawId}:${revision}`;
  if (normalizeName(displayName) === "beatrice ciotta") {
    return { eventId, practiceId: rawId, displayName, state: "excluded", event: null,
      reason: "Beatrice Ciotta esclusa per regola permanente del pilot.", firstObservedAt: observedAt, dispatchedAt: null, responseSha256 };
  }
  const event: AprCrmInboundPracticeEvent = {
    eventId, practiceId: rawId, customerId: rawId, module: "ENEA", crmRevision: revision,
    currentPipeline: APR_READY_PIPELINE, currentStatus: "CRM · Pronte da fare",
    dossierLocator: `/rest/v1/enea_practices_public?id=eq.${rawId}`,
  };
  return { eventId, practiceId: rawId, displayName, state: "pending_dispatch", event,
    reason: "Evento Pronte da fare persistito prima dell'inoltro alla coda APR locale.", firstObservedAt: observedAt, dispatchedAt: null, responseSha256 };
}

export class PersistentAprCrmIncomingReadOnly {
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string, readonly transport: AprCrmReadOnlyTransport, readonly workflow: PersistentAprCrmIntegrationWorkflow) {
    this.checkpointPath = path.join(path.resolve(rootDirectory), "crm-incoming-readonly", "checkpoint.json");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmIncomingState;
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  private write(state: AprCrmIncomingState) {
    summarize(state);
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  private recordFailure(status: "login_required" | "technical_block", reason: string, now: Date) {
    const current = this.initialize(now);
    if (current.status === status && current.reason === reason) return current;
    const next = structuredClone(current);
    next.revision += 1;
    next.status = status;
    next.reason = reason;
    next.nextAction = status === "login_required" ? "Eseguire il login CRM dedicato dalla dashboard APR." : "Correggere il trasporto read-only e riprendere dallo stesso checkpoint.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: status, eventId: null, reason, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  async poll(now = new Date()) {
    if (this.transport.snapshot(now).status !== "authenticated") return this.recordFailure("login_required", "Sessione CRM APR non autenticata; nessuna richiesta è stata emessa.", now);
    const params = new URLSearchParams({
      select: "id,cliente_nome,cliente_cognome,updated_at,form_compilato_at,current_stage_id,pipeline_stages!inner(stage_type)",
      brand: "eq.enea",
      archived_at: "is.null",
      "pipeline_stages.stage_type": `eq.${READY_STAGE_TYPE}`,
      order: "updated_at.asc",
      limit: "100",
    });
    let response: Response;
    try { response = await this.transport.readOnlyGet("/rest/v1/enea_practices_public", params, now); }
    catch (error) { return this.recordFailure("technical_block", `GET CRM read-only fallito: ${error instanceof Error ? error.message : String(error)}`, now); }
    const body = await response.text();
    const responseSha256 = sha256(body);
    if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) return this.recordFailure("technical_block", `Risposta CRM oltre il limite consentito: ${responseSha256}`, now);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) return this.recordFailure("technical_block", `Risposta CRM non valida HTTP ${response.status}: ${responseSha256}`, now);
    let rows: IncomingRow[];
    try { rows = JSON.parse(body) as IncomingRow[]; }
    catch { return this.recordFailure("technical_block", `JSON CRM non valido: ${responseSha256}`, now); }
    if (!Array.isArray(rows)) return this.recordFailure("technical_block", `Payload CRM non è una lista: ${responseSha256}`, now);
    const current = this.initialize(now);
    if (current.lastResponseSha256 === responseSha256) return current;
    const next = structuredClone(current);
    next.status = "idle";
    next.lastResponseSha256 = responseSha256;
    next.lastSuccessfulPollAt = now.toISOString();
    for (const row of rows) {
      const item = mapRow(row, responseSha256, now.toISOString());
      if (next.items.some((existing) => existing.eventId === item.eventId)) continue;
      next.items.push(item);
      next.revision += 1;
      const type = item.state === "pending_dispatch" ? "event_staged" : item.state === "excluded" ? "row_excluded" : "row_blocked";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type, eventId: item.eventId, reason: item.reason, appliedRuleIds: [...RULE_IDS] });
    }
    next.revision += 1;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "poll_completed", eventId: null,
      reason: `GET CRM verificato: ${rows.length} righe, prova ${responseSha256}.`, appliedRuleIds: [...RULE_IDS] });
    return this.write(next);
  }

  dispatchPending(now = new Date(), maximum = Number.POSITIVE_INFINITY) {
    let state = this.initialize(now);
    let dispatched = 0;
    for (const pending of state.items.filter((item) => item.state === "pending_dispatch" && item.event)) {
      if (dispatched >= maximum) break;
      try { this.workflow.ingest({ event: pending.event!, displayName: pending.displayName }, now); }
      catch (error) { return this.recordFailure("technical_block", `Inoltro locale fallito per ${pending.eventId}: ${error instanceof Error ? error.message : String(error)}`, now); }
      const next = structuredClone(state);
      const target = next.items.find((item) => item.eventId === pending.eventId)!;
      target.state = "dispatched";
      target.dispatchedAt = now.toISOString();
      target.reason = "Evento inoltrato una sola volta alla coda APR locale; nessuna mutazione CRM eseguita.";
      next.revision += 1;
      next.status = "idle";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "event_dispatched", eventId: target.eventId, reason: target.reason, appliedRuleIds: [...RULE_IDS] });
      state = this.write(next);
      dispatched += 1;
    }
    return state;
  }

  async pollAndDispatch(now = new Date()) {
    const polled = await this.poll(now);
    if (polled.status === "login_required" || polled.status === "technical_block") return polled;
    return this.dispatchPending(now);
  }

  snapshot(now = new Date()) {
    const state = this.initialize(now);
    return {
      ...state,
      observedAt: now.toISOString(),
      progress: {
        observed: state.items.length,
        pending: state.items.filter((item) => item.state === "pending_dispatch").length,
        dispatched: state.items.filter((item) => item.state === "dispatched").length,
        excluded: state.items.filter((item) => item.state === "excluded").length,
        blocked: state.items.filter((item) => item.state === "blocked_invalid").length,
      },
      lastEvent: state.audit.at(-1)!,
    };
  }
}
