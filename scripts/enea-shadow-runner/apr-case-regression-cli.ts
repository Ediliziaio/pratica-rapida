#!/usr/bin/env vite-node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { detectAprCaseRegressions, detectAprCasesJudgedWithoutDocuments, type AprCaseOutcomeRecord } from "./aprCaseRegressionGuard";
import { detectRepeatedOperatorQuestions, type AprQuestionLifecycleIdentity } from "./operatorQuestionLifecycle";
import type { AprOperatorResponseEntry } from "./operatorResponseLedger";

/**
 * Confronta il lotto indicato con tutta la storia precedente e dichiara quali
 * pratiche gia' salvate sono tornate ferme a documenti invariati. Sola
 * lettura: non tocca checkpoint, non rilancia nulla.
 */
const runtimeRoot = process.env.APR_REGRESSION_RUNTIME_ROOT
  ?? "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const currentRunId = process.argv[2];
if (!currentRunId) { process.stderr.write("usage: apr-case-regression-cli.ts <runId>\n"); process.exit(2); }

const readJson = (target: string): Record<string, unknown> | null => {
  try { return existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown> : null; }
  catch { return null; }
};

/** Chiavi di contenuto dei documenti originari della pratica, dalla sua coorte. */
const documentKeysByCustomer = new Map<string, string[]>();
const cohortsRoot = path.join(runtimeRoot, "cohorts");
const cohortEntries = existsSync(cohortsRoot) ? readdirSync(cohortsRoot) : [];
for (const entry of cohortEntries) {
  const analysis = readJson(path.join(cohortsRoot, entry, "crm-document-analysis", "checkpoint.json"));
  for (const item of (analysis?.items as Array<Record<string, unknown>> | undefined) ?? []) {
    const customerKey = typeof item.customerKey === "string" ? item.customerKey : null;
    const documentKey = typeof item.documentKey === "string" ? item.documentKey : null;
    if (!customerKey || !documentKey) continue;
    const bucket = documentKeysByCustomer.get(`${entry}::${customerKey}`) ?? [];
    bucket.push(documentKey);
    documentKeysByCustomer.set(`${entry}::${customerKey}`, bucket);
  }
}

const cohortFor = (cohort: unknown, customerKey: string) => `apr-pilot-${cohort}-global-controller-${customerKey}`;

const outcomes: AprCaseOutcomeRecord[] = [];
const runsRoot = path.join(runtimeRoot, "runs");
for (const runId of existsSync(runsRoot) ? readdirSync(runsRoot) : []) {
  const checkpoint = readJson(path.join(runsRoot, runId, "checkpoint.json"));
  if (!checkpoint) continue;
  const observedAt = typeof checkpoint.startedAt === "string" ? checkpoint.startedAt : "";
  for (const result of (checkpoint.results as Array<Record<string, unknown>> | undefined) ?? []) {
    const customerKey = typeof result.customerKey === "string" ? result.customerKey : null;
    if (!customerKey || !observedAt) continue;
    outcomes.push({
      customerKey, runId, observedAt,
      state: typeof result.state === "string" ? result.state : "unknown",
      documentKeys: documentKeysByCustomer.get(`${cohortFor(result.cohort, customerKey)}::${customerKey}`) ?? [],
    });
  }
}

const current = outcomes.filter((item) => item.runId === currentRunId);
if (current.length === 0) { process.stderr.write(`apr_regression_run_not_found:${currentRunId}\n`); process.exit(3); }
const regressions = detectAprCaseRegressions(current, outcomes.filter((item) => item.runId !== currentRunId));

const currentCheckpoint = readJson(path.join(runsRoot, currentRunId, "checkpoint.json"));
const currentCohortNames = new Set(((currentCheckpoint?.results as Array<Record<string, unknown>> | undefined) ?? [])
  .map((result) => typeof result.customerKey === "string" ? cohortFor(result.cohort, result.customerKey) : null)
  .filter((value): value is string => Boolean(value)));
const currentStartedAt = typeof currentCheckpoint?.startedAt === "string" ? currentCheckpoint.startedAt : "";
const questionRecords: Array<AprQuestionLifecycleIdentity & { cohortName: string }> = [];
for (const cohortName of cohortEntries) {
  const questions = readJson(path.join(cohortsRoot, cohortName, "operator-questions", "checkpoint.json"));
  if (!questions) continue;
  const preflight = readJson(path.join(cohortsRoot, cohortName, "crm-local-preflight", "checkpoint.json"));
  const preflightItems = (preflight?.items as Array<Record<string, unknown>> | undefined) ?? [];
  for (const raw of (questions.questions as Array<Record<string, unknown>> | undefined) ?? []) {
    const customerKey = typeof raw.customerKey === "string" ? raw.customerKey : null;
    const id = typeof raw.id === "string" ? raw.id : null;
    const field = typeof raw.field === "string" ? raw.field : null;
    const prompt = typeof raw.prompt === "string" ? raw.prompt : null;
    const status = typeof raw.status === "string" ? raw.status : null;
    if (!customerKey || !id || !field || !prompt || !["open", "answered", "applied", "retired"].includes(status ?? "")) continue;
    const payload = raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload as Record<string, unknown> : {};
    const practiceItem = preflightItems.find((item) => item.customerKey === customerKey);
    questionRecords.push({
      id,
      customerKey,
      practiceId: typeof raw.practiceId === "string" ? raw.practiceId : typeof practiceItem?.practiceId === "string" ? practiceItem.practiceId : null,
      field,
      prompt,
      status: status as AprQuestionLifecycleIdentity["status"],
      blockerCode: typeof payload.blockerCode === "string" ? payload.blockerCode : null,
      requestedAt: typeof raw.requestedAt === "string" ? raw.requestedAt : null,
      documentKeys: documentKeysByCustomer.get(`${cohortName}::${customerKey}`) ?? [],
      cohortName,
    });
  }
}
const responseLedger = readJson(path.join(runtimeRoot, "state", "operator-responses", "checkpoint.json"));
const activeResponses = ((responseLedger?.responses as AprOperatorResponseEntry[] | undefined) ?? []).filter((entry) => entry.status === "active");
const currentQuestions = questionRecords.filter((question) => currentCohortNames.has(question.cohortName)
  && (!currentStartedAt || !question.requestedAt || question.requestedAt >= currentStartedAt));
const historicalQuestions = questionRecords.filter((question) => !currentCohortNames.has(question.cohortName));
const repeatedQuestions = detectRepeatedOperatorQuestions(currentQuestions, historicalQuestions, activeResponses);

process.stdout.write(`${JSON.stringify({
  runId: currentRunId,
  casiEsaminati: current.length,
  regressioni: regressions.length,
  dettaglio: regressions,
  giudicateSenzaFascicolo: detectAprCasesJudgedWithoutDocuments(current),
  domandeRipetute: repeatedQuestions.length,
  dettaglioDomandeRipetute: repeatedQuestions,
}, null, 2)}\n`);
