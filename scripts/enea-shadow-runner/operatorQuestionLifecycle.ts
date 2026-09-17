import { createHash } from "node:crypto";
import type { AprOperatorResponseEntry } from "./operatorResponseLedger";

export const APR_OPERATOR_QUESTION_LIFECYCLE_VERSION = "apr-operator-question-lifecycle-v1" as const;

export interface AprQuestionLifecycleIdentity {
  id: string;
  customerKey: string;
  practiceId?: string | null;
  field: string;
  prompt: string;
  status: "open" | "answered" | "applied" | "retired";
  blockerCode?: string | null;
  requestedAt?: string | null;
  documentKeys?: readonly string[];
}

export interface AprQuestionLifecycleCaseState {
  customerKey: string;
  state: string;
  blockerCodes: readonly string[];
}

export interface AprRepeatedOperatorQuestion {
  customerKey: string;
  field: string;
  currentQuestionId: string;
  originatingQuestionId: string;
  responseId: string;
  documentFingerprint: string;
  reason: string;
}

const safeIdPart = (value: string) => value.toLocaleLowerCase("it").replace(/[^a-z0-9._:-]+/g, "-");
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

export function aprQuestionDocumentFingerprint(documentKeys: readonly string[]) {
  const keys = [...new Set(documentKeys.map((key) => key.trim()).filter(Boolean))].sort();
  return keys.length ? createHash("sha256").update(keys.join("|")).digest("hex") : null;
}

function payloadFieldCompatibility(entry: AprOperatorResponseEntry, field: string) {
  const payload = entry.payload;
  if (payload.kind === "case_decision") return payload.field === field;
  if (payload.kind === "operator_required" && payload.field) return payload.field === field;
  if (payload.kind === "screening_products") {
    return /^screenings\.\d+\.dimensions(?:\.unit)?$/.test(field)
      || field === "infissi.dimensioni_e_numero"
      || field === "operator.pendingData";
  }
  if (payload.kind === "cadastral_identifiers") return field === "cadastral.sheet_and_parcel" || field === "catastali.foglio_particella";
  if (payload.kind === "old_window_characteristics") return field === "infissi.old_window_characteristics";
  if (payload.kind === "physical_product_count") return field === "infissi.dimensioni_e_numero" || field === "products.count";
  if (payload.kind === "document_refresh") return field.startsWith("documents.");
  if (payload.kind === "case_disposition") return field === "case.disposition" || field === "operator.requiredData";
  return false;
}

function responseIdFieldCompatibility(responseId: string, field: string) {
  const tokens: Record<string, readonly string[]> = {
    shading_closures: ["shading-closures", "chiusure-oscuranti"],
    completionDate: ["completion-date", "fine-lavori"],
    "economic.invoiceTotal": ["invoice-total", "totale-fattura", "totale-ordine"],
    "infissi.dimensioni_e_numero": ["infissi-dimensioni-e-numero", "dimensions", "misure-serramenti"],
    "operator.pendingData": ["pending-data", "pending"],
  };
  return (tokens[field] ?? []).some((token) => responseId.includes(token));
}

/**
 * Collega una risposta alla domanda senza affidarsi al solo nome cliente.
 * La corrispondenza richiede pratica coerente e, in ordine di forza:
 * origine esplicita, ID domanda incorporato, prompt identico o campo tipizzato.
 */
export function activeResponseForQuestion(
  question: AprQuestionLifecycleIdentity,
  entries: readonly AprOperatorResponseEntry[],
) {
  const questionId = safeIdPart(question.id);
  return [...entries]
    .filter((entry) => entry.status === "active"
      && entry.customerKey === question.customerKey
      && (!entry.practiceId || (Boolean(question.practiceId) && entry.practiceId === question.practiceId)))
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    .find((entry) => {
      if (entry.payload.kind === "case_decision"
        && entry.payload.originatingQuestionId === question.id
        && entry.payload.field === question.field) return true;
      if (entry.payload.kind === "operator_required"
        && entry.payload.originatingQuestionId === question.id
        && (!entry.payload.field || entry.payload.field === question.field)) return true;
      if (entry.responseId.includes(`:${questionId}:`)) return true;
      if (normalized(entry.question) === normalized(question.prompt)) return true;
      return payloadFieldCompatibility(entry, question.field)
        || responseIdFieldCompatibility(entry.responseId, question.field);
    }) ?? null;
}

export function questionRetirementReason(
  question: AprQuestionLifecycleIdentity,
  caseState: AprQuestionLifecycleCaseState | null,
  entries: readonly AprOperatorResponseEntry[],
) {
  const response = activeResponseForQuestion(question, entries);
  if (response) return { kind: "active_response" as const, responseId: response.responseId };
  if (!caseState) return null;
  if (caseState.state === "saved") return { kind: "case_saved" as const, responseId: null };
  if (question.blockerCode && ["blocked_case", "operator_required", "technical_block"].includes(caseState.state)
    && !caseState.blockerCodes.includes(question.blockerCode)) {
    return { kind: "blocker_resolved" as const, responseId: null };
  }
  if (["ready_local_plan", "ready"].includes(caseState.state)) return { kind: "blocker_resolved" as const, responseId: null };
  return null;
}

export function detectRepeatedOperatorQuestions(
  current: readonly AprQuestionLifecycleIdentity[],
  history: readonly AprQuestionLifecycleIdentity[],
  activeResponses: readonly AprOperatorResponseEntry[],
): AprRepeatedOperatorQuestion[] {
  const repeated: AprRepeatedOperatorQuestion[] = [];
  for (const question of current) {
    if (question.status !== "open" && question.status !== "answered") continue;
    const currentFingerprint = aprQuestionDocumentFingerprint(question.documentKeys ?? []);
    if (!currentFingerprint) continue;
    const response = activeResponseForQuestion(question, activeResponses);
    if (!response) continue;
    const origin = history.find((candidate) => {
      if (candidate.customerKey !== question.customerKey || candidate.field !== question.field) return false;
      if (candidate.requestedAt && candidate.requestedAt > response.receivedAt) return false;
      if (activeResponseForQuestion(candidate, [response]) === null) return false;
      return aprQuestionDocumentFingerprint(candidate.documentKeys ?? []) === currentFingerprint;
    });
    if (!origin) continue;
    repeated.push({
      customerKey: question.customerKey,
      field: question.field,
      currentQuestionId: question.id,
      originatingQuestionId: origin.id,
      responseId: response.responseId,
      documentFingerprint: currentFingerprint,
      reason: "La stessa domanda e' stata riaperta nonostante una risposta attiva e documenti invariati.",
    });
  }
  return repeated.sort((left, right) => left.customerKey.localeCompare(right.customerKey) || left.field.localeCompare(right.field));
}
