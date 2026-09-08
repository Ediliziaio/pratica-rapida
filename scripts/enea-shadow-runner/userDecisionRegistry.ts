import crypto from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprBusinessDecisionStatus } from "../../src/features/enea-shadow-crm/businessDecisionLedger";
import { assertGeneralRuleSemanticInputs } from "./aprRuleRuntimeRevision";

export const APR_USER_DECISION_REGISTRY_VERSION = "apr-user-decision-registry-v1" as const;

export interface AprUserDecisionCandidate {
  decisionId: string;
  status: AprBusinessDecisionStatus;
  statement: string;
  normalizedPattern: string;
  semanticInputs: string[];
  answer: string;
  source: { kind: "operator_answer" | "historical_conversation"; sourceId: string; observedAt: string };
  caseEvidence: { practiceId: string | null; customerKey: string | null; generationId: string | null };
  linkedRuleIds: string[];
  transitionReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface AprUserDecisionRegistryState {
  version: typeof APR_USER_DECISION_REGISTRY_VERSION;
  revision: number;
  decisions: AprUserDecisionCandidate[];
  audit: Array<{ revision: number; at: string; type: "initialized" | "candidate_recorded" | "status_changed" | "duplicate_ignored"; decisionId: string | null; reason: string }>;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprUserDecisionRegistryState {
  return { version: APR_USER_DECISION_REGISTRY_VERSION, revision: 0, decisions: [], audit: [{ revision: 0, at: now.toISOString(), type: "initialized", decisionId: null, reason: "Registro decisioni utente inizializzato; ogni nuova risposta riutilizzabile nasce come candidata generale." }] };
}

function validState(value: unknown): value is AprUserDecisionRegistryState {
  if (!value || typeof value !== "object") return false;
  const state = value as AprUserDecisionRegistryState;
  const statuses: AprBusinessDecisionStatus[] = ["case_only", "candidate", "certified_deployed", "rejected", "superseded"];
  return state.version === APR_USER_DECISION_REGISTRY_VERSION && Number.isInteger(state.revision)
    && Array.isArray(state.decisions) && new Set(state.decisions.map((item) => item.decisionId)).size === state.decisions.length
    && state.decisions.every((item) => statuses.includes(item.status) && item.statement.trim().length > 0 && item.normalizedPattern.trim().length > 0 && item.semanticInputs.length > 0)
    && Array.isArray(state.audit);
}

export class PersistentAprUserDecisionRegistry {
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string) { this.checkpointPath = path.join(path.resolve(rootDirectory), "user-decisions", "checkpoint.json"); }
  load(now = new Date()): AprUserDecisionRegistryState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8"));
      if (!validState(value)) throw new Error("apr_user_decision_registry_state_invalid");
      return value;
    } catch (error) {
      if (error instanceof Error && error.message === "apr_user_decision_registry_state_invalid") throw error;
      throw new Error("apr_user_decision_registry_checkpoint_corrupt");
    }
  }
  private write(state: AprUserDecisionRegistryState) { if (!validState(state)) throw new Error("apr_user_decision_registry_state_invalid"); atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  recordCandidate(input: Omit<AprUserDecisionCandidate, "decisionId" | "status" | "linkedRuleIds" | "transitionReason" | "createdAt" | "updatedAt">, now = new Date()) {
    assertGeneralRuleSemanticInputs(input.semanticInputs);
    const normalizedPattern = input.normalizedPattern.replace(/\s+/g, " ").trim().toLowerCase();
    if (!input.statement.trim() || !normalizedPattern || !input.answer.trim() || !input.source.sourceId.trim()) throw new Error("apr_user_decision_candidate_invalid");
    const decisionId = `decision-candidate-${crypto.createHash("sha256").update(JSON.stringify({ source: input.source.sourceId, pattern: normalizedPattern, answer: input.answer.trim() })).digest("hex").slice(0, 24)}`;
    const current = this.initialize(now);
    if (current.decisions.some((item) => item.decisionId === decisionId)) {
      const next = structuredClone(current); next.revision += 1;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "duplicate_ignored", decisionId, reason: "La stessa risposta era già registrata; nessuna seconda candidata creata." });
      return this.write(next);
    }
    const next = structuredClone(current); next.revision += 1;
    next.decisions.push({ ...input, normalizedPattern, decisionId, status: "candidate", linkedRuleIds: [], transitionReason: "Default obbligatorio: ogni risposta potenzialmente riutilizzabile nasce general_rule_candidate.", createdAt: now.toISOString(), updatedAt: now.toISOString() });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "candidate_recorded", decisionId, reason: "Risposta registrata come candidata generale; non ancora applicabile finché non certificata." });
    return this.write(next);
  }
  transition(decisionId: string, input: { status: Exclude<AprBusinessDecisionStatus, "candidate">; reason: string; linkedRuleIds?: string[]; explicitCaseOnly?: boolean }, now = new Date()) {
    const current = this.initialize(now); const existing = current.decisions.find((item) => item.decisionId === decisionId);
    if (!existing) throw new Error("apr_user_decision_not_found");
    if (existing.status !== "candidate" && !(existing.status === "certified_deployed" && input.status === "superseded")) throw new Error("apr_user_decision_transition_invalid");
    if (!input.reason.trim()) throw new Error("apr_user_decision_transition_reason_missing");
    if (input.status === "case_only" && input.explicitCaseOnly !== true) throw new Error("apr_user_decision_case_only_requires_explicit_authority");
    if (input.status === "certified_deployed" && !(input.linkedRuleIds?.length)) throw new Error("apr_user_decision_certification_missing_rules");
    const next = structuredClone(current); next.revision += 1;
    const target = next.decisions.find((item) => item.decisionId === decisionId)!;
    target.status = input.status; target.transitionReason = input.reason.trim(); target.linkedRuleIds = [...new Set(input.linkedRuleIds ?? target.linkedRuleIds)]; target.updatedAt = now.toISOString();
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "status_changed", decisionId, reason: `${existing.status} -> ${input.status}: ${input.reason.trim()}` });
    return this.write(next);
  }
  snapshot(now = new Date()) { const state = this.initialize(now); return { ...state, counts: Object.fromEntries((["case_only", "candidate", "certified_deployed", "rejected", "superseded"] as const).map((status) => [status, state.decisions.filter((item) => item.status === status).length])), observedAt: now.toISOString() }; }
}
