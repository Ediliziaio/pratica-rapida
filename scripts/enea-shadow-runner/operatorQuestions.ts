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
  // "unit_confirmation" (l'unico tipo storico, campo assente sui checkpoint
  // precedenti = trattato come tale): il parser ha gia' trovato due numeri
  // nel testo, l'operatore conferma solo l'unita'. "missing_measurement"
  // (Regola generale Giuliano 2026-09-08, MISSING_SCREENING_MEASUREMENT_
  // OPERATOR_QUESTION): nessun numero e' stato trovato in alcun documento
  // originario verificato; l'operatore inserisce larghezza e altezza reali,
  // non conferma soltanto un'unita' su un valore gia' individuato.
  kind?: "unit_confirmation" | "missing_measurement";
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
const MISSING_MEASUREMENT_RULE_IDS = [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.missingScreeningMeasurementOperatorQuestion];

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
    next.questions.push({ ...input, kind: "unit_confirmation", choices: [{ value: "millimeters", label: "Sì, sono millimetri" }, { value: "centimeters", label: "No, sono centimetri" }, { value: "cannot_determine", label: "Non determinabile" }], status: "open", answer: null, requestedAt: now.toISOString(), appliedAt: null, appliedRuleIds: RULE_IDS });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_opened", questionId: input.id, reason: `${input.displayName}: richiesta decisione strutturata per ${input.field}.`, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  // Regola generale (Giuliano, 2026-09-08): quando "screenings_missing" e'
  // l'unico blocco residuo e nessun candidato numerico e' stato trovato in
  // alcun documento originario del cliente (a differenza di
  // discoverMeasurementUnitAmbiguities, che richiede due numeri gia'
  // presenti), generare una domanda diretta ("Mancano le misure del
  // prodotto X, inseriscile") invece di lasciare la pratica con un blocco
  // generico senza alcun modo per l'operatore di risolverlo. Una sola
  // domanda per cliente: non ne crea una seconda se ne esiste gia' una di
  // qualunque tipo, per non generare richieste duplicate o in conflitto.
  discoverMissingMeasurementQuestions(preflight: ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>, analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>, now = new Date()) {
    let state = this.initialize(now);
    for (const item of preflight.items) {
      if (item.state !== "blocked_case" || (item.report?.products.length ?? 0) > 0 || !item.report?.blockers.some((blocker) => blocker.code === "screenings_missing")) continue;
      if (state.questions.some((question) => question.customerKey === item.customerKey)) continue;
      const documents = analysis.items.filter((document) => document.customerKey === item.customerKey && document.textPath && existsSync(document.textPath));
      if (!documents.length) continue;
      const sourceIds: string[] = [];
      let description = "il prodotto di schermatura solare";
      let descriptionResolved = false;
      for (const document of documents) {
        const sourceText = readFileSync(document.textPath!, "utf8");
        if (!/pergola|pergotenda|tenda|schermatura|persian[ae]|zanzarier[ae]|avvolgibil[ei]|tapparell[ae]|venezian/i.test(sourceText)) continue;
        sourceIds.push(document.documentKey);
        if (!descriptionResolved) {
          description = /pergotenda/i.test(sourceText) ? "la pergotenda"
            : /pergola/i.test(sourceText) ? "la pergola"
              : /venezian/i.test(sourceText) ? "la veneziana"
                : /persian[ae]/i.test(sourceText) ? "la persiana"
                  : /zanzarier[ae]/i.test(sourceText) ? "la zanzariera"
                    : /avvolgibil[ei]|tapparell[ae]/i.test(sourceText) ? "l'avvolgibile"
                      : /tenda/i.test(sourceText) ? "la tenda da sole"
                        : "il prodotto di schermatura solare";
          descriptionResolved = true;
        }
      }
      if (!sourceIds.length) continue;
      const questionId = `measure:${item.customerKey}:${sourceIds[0].slice(0, 16)}`;
      state = this.requestMissingMeasurementQuestion({
        id: questionId, customerKey: item.customerKey, displayName: item.displayName, field: "screenings.1.dimensions",
        prompt: `Mancano le misure del prodotto (${description}) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.`,
        evidenceText: `Documenti verificati privi di misura: ${sourceIds.join(", ")}.`, sourceIds,
        payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "cm", description },
      }, now);
    }
    return state;
  }
  requestMissingMeasurementQuestion(input: Omit<AprOperatorQuestion, "status" | "answer" | "requestedAt" | "appliedAt" | "appliedRuleIds" | "choices" | "kind">, now = new Date(), ruleIds: string[] = MISSING_MEASUREMENT_RULE_IDS) {
    const current = this.initialize(now);
    const existing = current.questions.find((question) => question.id === input.id);
    if (existing) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(input.id) || input.sourceIds.length < 1) throw new Error("operator_question_invalid");
    const next = structuredClone(current); next.revision += 1;
    next.questions.push({ ...input, kind: "missing_measurement", choices: [{ value: "millimeters", label: "Millimetri" }, { value: "centimeters", label: "Centimetri" }, { value: "cannot_determine", label: "Non disponibile" }], status: "open", answer: null, requestedAt: now.toISOString(), appliedAt: null, appliedRuleIds: ruleIds });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_opened", questionId: input.id, reason: `${input.displayName}: richiesta misura mancante per ${input.field}.`, appliedRuleIds: ruleIds });
    return this.write(next);
  }
  // Regressione Berneri (2026-09-08): la fattura riporta due letture
  // candidate separate da "/" (es. "2400X2500/12300X2000"); nessuna delle
  // due viene mai scelta automaticamente quando almeno una eccede i limiti
  // ampi di plausibilita' gia' autorizzati. La domanda riporta entrambe le
  // letture per esteso.
  discoverAmbiguousDualDimensionQuestions(preflight: ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>, analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>, now = new Date()) {
    let state = this.initialize(now);
    const dualReadingPattern = /\b(\d{3,5})\s*[Xx×]\s*(\d{3,5})\s*\/\s*(\d{3,5})\s*[Xx×]\s*(\d{3,5})\b/;
    const plausibleMm = (value: number) => value >= 300 && value <= 6000;
    for (const item of preflight.items) {
      if (item.state !== "blocked_case" || (item.report?.products.length ?? 0) > 0 || !item.report?.blockers.some((blocker) => blocker.code === "screenings_missing")) continue;
      if (state.questions.some((question) => question.customerKey === item.customerKey)) continue;
      const documents = analysis.items.filter((document) => document.customerKey === item.customerKey && document.textPath && existsSync(document.textPath));
      for (const document of documents) {
        const sourceText = readFileSync(document.textPath!, "utf8");
        const match = sourceText.match(dualReadingPattern);
        if (!match) continue;
        const [, w1, h1, w2, h2] = match.map(Number) as unknown as [number, number, number, number, number];
        const firstPlausible = plausibleMm(w1) && plausibleMm(h1);
        const secondPlausible = plausibleMm(w2) && plausibleMm(h2);
        if (firstPlausible && secondPlausible) continue; // entrambe plausibili: nessuna ambiguita' da segnalare qui.
        const questionId = `dual-dimension:${item.customerKey}:${document.documentKey.slice(0, 16)}`;
        state = this.requestMissingMeasurementQuestion({
          id: questionId, customerKey: item.customerKey, displayName: item.displayName, field: "screenings.1.dimensions",
          prompt: `La fonte riporta due letture candidate per la misura: "${w1}×${h1}" e "${w2}×${h2}". ${!firstPlausible && !secondPlausible ? "Nessuna delle due sembra plausibile come misura del prodotto." : !firstPlausible ? `Solo "${w2}×${h2}" sembra plausibile.` : `Solo "${w1}×${h1}" sembra plausibile.`} Quale (se una) e' la misura reale? Inserisci larghezza e altezza corrette.`,
          evidenceText: `Fonte ${document.documentKey}: valore riportato "${match[0]}".`, sourceIds: [document.documentKey],
          payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "mm", description: item.displayName },
        }, now, [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.ambiguousDualDimensionReadingOperatorQuestion]);
        break;
      }
    }
    return state;
  }
  // Casi Maeschi e Munafo (2026-09-08): fattura priva di misure con documenti
  // tecnici multi-fornitore/multi-posizione (Punto Finestre/Punto Persiane;
  // Sunroom + C3 Systems per posizione) non riconciliabili in modo univoco
  // con un solo campione osservato. Nessuna estrazione automatica: la
  // domanda elenca i documenti tecnici trovati e chiede conferma di
  // prodotto/posizione e misura esatta.
  discoverComplexMultiVendorQuestions(preflight: ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>, analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>, now = new Date()) {
    let state = this.initialize(now);
    const complexVendorMarkers = /\bC3\s*SYSTEMS\b|\bSUNROOM\b|\bPUNTO\s+FINESTRE\b|\bPUNTO\s+PERSIANE\b/i;
    for (const item of preflight.items) {
      if (item.state !== "blocked_case" || (item.report?.products.length ?? 0) > 0 || !item.report?.blockers.some((blocker) => blocker.code === "screenings_missing")) continue;
      if (state.questions.some((question) => question.customerKey === item.customerKey)) continue;
      const documents = analysis.items.filter((document) => document.customerKey === item.customerKey && document.textPath && existsSync(document.textPath));
      const complexDocumentIds: string[] = [];
      for (const document of documents) {
        const sourceText = readFileSync(document.textPath!, "utf8");
        if (complexVendorMarkers.test(sourceText)) complexDocumentIds.push(document.documentKey);
      }
      if (!complexDocumentIds.length) continue;
      const questionId = `complex-vendor:${item.customerKey}:${complexDocumentIds[0].slice(0, 16)}`;
      state = this.requestMissingMeasurementQuestion({
        id: questionId, customerKey: item.customerKey, displayName: item.displayName, field: "screenings.1.dimensions",
        prompt: `La fattura non riporta alcuna misura. Sono stati trovati piu' documenti tecnici di fornitori/posizioni diversi (${complexDocumentIds.join(", ")}). Conferma quale prodotto/posizione e' quello corretto per questa pratica e indica larghezza e altezza esatte.`,
        evidenceText: `Documenti tecnici multi-fornitore trovati: ${complexDocumentIds.join(", ")}.`, sourceIds: complexDocumentIds,
        payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "mm", description: item.displayName },
      }, now, [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.complexMultiVendorTechnicalFormOperatorQuestion]);
    }
    return state;
  }
  answer(questionId: string, value: OperatorAnswerValue, note: string, operatorId: string, commandId: string, now = new Date(), explicitMeasurement?: { rawWidth: number; rawHeight: number }) {
    if (!(["millimeters", "centimeters", "cannot_determine"] as string[]).includes(value) || !operatorId.trim() || !/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(commandId)) throw new Error("operator_answer_invalid");
    if (explicitMeasurement && (!(explicitMeasurement.rawWidth > 0) || !(explicitMeasurement.rawHeight > 0))) throw new Error("operator_answer_measurement_invalid");
    const current = this.initialize(now); const target = current.questions.find((question) => question.id === questionId);
    if (!target) throw new Error("operator_question_not_found");
    if (target.answer?.commandId === commandId) return current;
    if (target.status !== "open") throw new Error("operator_question_already_answered");
    if (target.kind === "missing_measurement" && value !== "cannot_determine" && !explicitMeasurement) throw new Error("operator_answer_measurement_required");
    const next = structuredClone(current); const question = next.questions.find((item) => item.id === questionId)!; next.revision += 1;
    question.status = "answered"; question.answer = { value, note: note.replace(/\s+/g, " ").trim().slice(0, 500), operatorId: operatorId.trim().slice(0, 120), commandId, answeredAt: now.toISOString() };
    if (explicitMeasurement) question.payload = { ...question.payload, rawWidth: explicitMeasurement.rawWidth, rawHeight: explicitMeasurement.rawHeight };
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
