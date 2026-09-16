import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cohortSeedPath, cohortsDirectory, operatorQuestionsPath } from "./paths.ts";

export const OPERATOR_QUESTIONS_VERSION = "apr-operator-questions-v1" as const;

// Forma su disco di una domanda in cohorts/*/operator-questions/checkpoint.json.
export interface OperatorQuestionRecord {
  id: string;
  customerKey: string;
  displayName: string;
  field: string;
  prompt: string;
  evidenceText: string;
  kind?: "missing_measurement" | "unit_confirmation" | "case_decision" | string;
  payload?: { rawWidth?: number | null; rawHeight?: number | null; reportedUnit?: "cm" | "mm" | null; description?: string | null };
  missingDocumentType?: string | null;
  choices?: ReadonlyArray<{ value: string; label: string }>;
  status: "open" | "answered" | "applied" | string;
  requestedAt: string;
}

export interface OperatorQuestionsCheckpoint {
  version: string;
  revision: number;
  questions: OperatorQuestionRecord[];
  audit: unknown[];
}

export interface CohortSeedCandidate { customerKey: string; displayName?: string; practiceId?: string }

export interface CohortQuestionSource {
  cohort: string;
  checkpoint: OperatorQuestionsCheckpoint | null;
  seedCandidates: CohortSeedCandidate[];
}

// Ciò che la pagina mostra e ciò che serve alla scrittura della risposta.
export interface OpenQuestion {
  id: string;
  cohort: string;
  customerKey: string;
  displayName: string;
  practiceId: string | null;
  field: string;
  kind: string | null;
  prompt: string;
  evidenceText: string;
  payload: OperatorQuestionRecord["payload"] | null;
  missingDocumentType: string | null;
  requestedAt: string;
  // Solo per le domande "dato mancante" (field operator.pendingData): la richiesta
  // originaria ancora attiva nel ledger, altrimenti la domanda non si può capire.
  pendingRequest: { responseId: string; requestedAt: string; question: string; missingDocumentType: string | null; previousAnswer: string } | null;
}

export const PENDING_DATA_FIELD = "operator.pendingData" as const;
export const isPendingDataQuestion = (question: Pick<OpenQuestion, "field">) => question.field === PENDING_DATA_FIELD;

function toOpenQuestion(source: CohortQuestionSource, question: OperatorQuestionRecord): OpenQuestion {
  const seed = source.seedCandidates.find((candidate) => candidate.customerKey === question.customerKey);
  return {
    id: question.id,
    cohort: source.cohort,
    customerKey: question.customerKey,
    displayName: seed?.displayName?.trim() || question.displayName,
    practiceId: seed?.practiceId ?? null,
    field: question.field,
    kind: question.kind ?? null,
    prompt: question.prompt,
    evidenceText: question.evidenceText,
    payload: question.payload ?? null,
    missingDocumentType: question.missingDocumentType ?? null,
    requestedAt: question.requestedAt,
    pendingRequest: null,
  };
}

// Pura: prende solo le domande "open" delle coorti indicate (quelle del giro
// corrente); lo stesso id ricorre in più cohort (rilanci della stessa pratica),
// vince la richiesta più recente. Senza elenco coorti non filtra: serve ai test
// e a chi vuole vedere tutto lo storico, non alla pagina.
export function selectOpenQuestions(sources: ReadonlyArray<CohortQuestionSource>, cohorts: ReadonlyArray<string> | null = null): OpenQuestion[] {
  const allowed = cohorts ? new Set(cohorts) : null;
  const byId = new Map<string, OpenQuestion>();
  for (const source of sources) {
    if (allowed && !allowed.has(source.cohort)) continue;
    if (source.checkpoint?.version !== OPERATOR_QUESTIONS_VERSION) continue;
    for (const question of source.checkpoint.questions) {
      if (question.status !== "open") continue;
      const candidate = toOpenQuestion(source, question);
      const current = byId.get(candidate.id);
      if (!current || candidate.requestedAt.localeCompare(current.requestedAt) > 0) byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "it") || a.requestedAt.localeCompare(b.requestedAt));
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return null; }
}

export function readCohortQuestionSources(root: string): CohortQuestionSource[] {
  const cohortsDir = cohortsDirectory(root);
  if (!existsSync(cohortsDir)) return [];
  return readdirSync(cohortsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const cohortDir = path.join(cohortsDir, entry.name);
      const seed = readJson<{ candidates?: CohortSeedCandidate[] }>(cohortSeedPath(cohortDir));
      return {
        cohort: entry.name,
        checkpoint: readJson<OperatorQuestionsCheckpoint>(operatorQuestionsPath(cohortDir)),
        seedCandidates: Array.isArray(seed?.candidates) ? seed.candidates : [],
      };
    });
}

export function readOpenQuestions(root: string, cohorts: ReadonlyArray<string> | null = null): OpenQuestion[] {
  return selectOpenQuestions(readCohortQuestionSources(root), cohorts);
}
