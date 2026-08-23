import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";

export const APR_OPERATOR_QUESTIONS_VERSION = "apr-operator-questions-v1" as const;
export type OperatorAnswerValue = "millimeters" | "centimeters" | "cannot_determine";

export interface AprOperatorQuestion {
  id: string;
  customerKey: string;
  displayName: string;
  field: string;
  prompt: string;
  evidenceText: string;
  sourceIds: string[];
  choices: Array<{ value: OperatorAnswerValue; label: string }>;
  payload: { rawWidth: number; rawHeight: number; reportedUnit: "cm" | "mm"; description: string };
  status: "open" | "answered" | "applied";
  answer: null | { value: OperatorAnswerValue; note: string; operatorId: string; commandId: string; answeredAt: string };
  requestedAt: string;
  appliedAt: string | null;
  appliedRuleIds: string[];
}

export interface AprOperatorQuestionsState {
  version: typeof APR_OPERATOR_QUESTIONS_VERSION;
  revision: number;
  questions: AprOperatorQuestion[];
  audit: Array<{ revision: number; at: string; type: "initialized" | "question_opened" | "answer_recorded" | "answer_applied"; questionId: string | null; reason: string; appliedRuleIds: string[] }>;
}

function writeDurable(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

const RULE_IDS = [USER_AUTHORIZED_RULE_IDS.operatorStructuredQuestionResume, "system-apr-operator-intervention-routing", "system-atomic-checkpoint-resume"];

function initialState(now: Date): AprOperatorQuestionsState {
  return { version: APR_OPERATOR_QUESTIONS_VERSION, revision: 0, questions: [], audit: [{ revision: 0, at: now.toISOString(), type: "initialized", questionId: null, reason: "Registro domande operatore inizializzato.", appliedRuleIds: RULE_IDS }] };
}

export class PersistentAprOperatorQuestions {
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string) { this.checkpointPath = path.join(path.resolve(rootDirectory), "operator-questions", "checkpoint.json"); }
  load(now = new Date()): AprOperatorQuestionsState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprOperatorQuestionsState;
      return value.version === APR_OPERATOR_QUESTIONS_VERSION ? value : initialState(now);
    } catch { return initialState(now); }
  }
  private write(state: AprOperatorQuestionsState) { writeDurable(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  discoverMeasurementUnitAmbiguities(preflight: ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>, analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>, now = new Date()) {
    let state = this.initialize(now);
    for (const item of preflight.items) {
      if (item.state !== "blocked_case" || (item.report?.products.length ?? 0) > 0 || !item.report?.blockers.some((blocker) => blocker.code === "screenings_missing")) continue;
      for (const document of analysis.items) {
        if (document.customerKey !== item.customerKey || !document.textPath || !existsSync(document.textPath)) continue;
        const sourceText = readFileSync(document.textPath, "utf8");
        if (!/pergola|pergotenda|tenda|schermatura/i.test(sourceText)) continue;
        const values = [...sourceText.matchAll(/\bCm\s+([1-9][0-9]{3,4})\b/gi)].map((match) => Number(match[1]));
        if (values.length < 2) continue;
        const rawWidth = values.at(-1)!; const rawHeight = values.at(-2)!;
        const questionId = `unit:${item.customerKey}:${document.documentKey.slice(0, 16)}`;
        state = this.requestMeasurementUnit({
          id: questionId, customerKey: item.customerKey, displayName: item.displayName, field: "screenings.1.dimensions.unit",
          prompt: `La fonte riporta “Cm ${rawWidth}” e “Cm ${rawHeight}”, ma i valori possono essere espressi in millimetri. Confermi l'unita' reale?`,
          evidenceText: `Fonte ${document.documentKey}: valori etichettati Cm ${rawWidth} × Cm ${rawHeight}.`, sourceIds: [document.documentKey],
          payload: { rawWidth, rawHeight, reportedUnit: "cm", description: /pergotenda/i.test(sourceText) ? "Pergotenda" : /pergola/i.test(sourceText) ? "Pergola" : "Schermatura solare" },
        }, now);
        break;
      }
    }
    return state;
  }
  requestMeasurementUnit(input: Omit<AprOperatorQuestion, "status" | "answer" | "requestedAt" | "appliedAt" | "appliedRuleIds" | "choices">, now = new Date()) {
    const current = this.initialize(now);
    const existing = current.questions.find((question) => question.id === input.id);
    if (existing) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(input.id) || input.sourceIds.length < 1 || input.payload.rawWidth <= 0 || input.payload.rawHeight <= 0) throw new Error("operator_question_invalid");
    const next = structuredClone(current); next.revision += 1;
    next.questions.push({ ...input, choices: [{ value: "millimeters", label: "Sì, sono millimetri" }, { value: "centimeters", label: "No, sono centimetri" }, { value: "cannot_determine", label: "Non determinabile" }], status: "open", answer: null, requestedAt: now.toISOString(), appliedAt: null, appliedRuleIds: RULE_IDS });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_opened", questionId: input.id, reason: `${input.displayName}: richiesta decisione strutturata per ${input.field}.`, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  answer(questionId: string, value: OperatorAnswerValue, note: string, operatorId: string, commandId: string, now = new Date()) {
    if (!(["millimeters", "centimeters", "cannot_determine"] as string[]).includes(value) || !operatorId.trim() || !/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(commandId)) throw new Error("operator_answer_invalid");
    const current = this.initialize(now); const target = current.questions.find((question) => question.id === questionId);
    if (!target) throw new Error("operator_question_not_found");
    if (target.answer?.commandId === commandId) return current;
    if (target.status !== "open") throw new Error("operator_question_already_answered");
    const next = structuredClone(current); const question = next.questions.find((item) => item.id === questionId)!; next.revision += 1;
    question.status = "answered"; question.answer = { value, note: note.replace(/\s+/g, " ").trim().slice(0, 500), operatorId: operatorId.trim().slice(0, 120), commandId, answeredAt: now.toISOString() };
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "answer_recorded", questionId, reason: value === "cannot_determine" ? "Risposta non determinabile: il caso resta in intervento operatore." : `Risposta ${value} persistita; pronta per riaccodamento caso-specifico.`, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  markApplied(questionId: string, now = new Date()) {
    const current = this.initialize(now); const target = current.questions.find((question) => question.id === questionId);
    if (!target || !target.answer || target.answer.value === "cannot_determine") throw new Error("operator_answer_not_applicable");
    if (target.status === "applied") return current;
    const next = structuredClone(current); const question = next.questions.find((item) => item.id === questionId)!; next.revision += 1; question.status = "applied"; question.appliedAt = now.toISOString();
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "answer_applied", questionId, reason: "Override caso-specifico applicato e pratica riaccodata dal checkpoint.", appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  snapshot(now = new Date()) { const state = this.initialize(now); return { ...state, openCount: state.questions.filter((question) => question.status === "open").length, pendingApplicationCount: state.questions.filter((question) => question.status === "answered" && question.answer?.value !== "cannot_determine").length, observedAt: now.toISOString(), lastEvent: state.audit.at(-1)! }; }
}
