import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { disposeAprStoppedCase, type AprStopCaseInput, type AprStopDisposition } from "./aprStopDisposition";
import type { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { activeResponseForQuestion, questionRetirementReason, type AprQuestionLifecycleCaseState } from "./operatorQuestionLifecycle";
import { operatorQuestionEvidenceAroundLabel } from "./operatorQuestionEvidence";
import { PersistentAprOperatorResponseLedger } from "./operatorResponseLedger";

export const APR_OPERATOR_QUESTIONS_VERSION = "apr-operator-questions-v1" as const;
export type OperatorAnswerValue = "millimeters" | "centimeters" | "yes" | "no" | "cannot_determine";

export interface AprOperatorQuestion {
  id: string;
  customerKey: string;
  practiceId?: string | null;
  displayName: string;
  field: string;
  prompt: string;
  evidenceText: string;
  sourceIds: string[];
  choices: Array<{ value: OperatorAnswerValue; label: string }>;
  payload: { rawWidth: number | null; rawHeight: number | null; reportedUnit: "cm" | "mm" | null; description: string; blockerCode?: string };
  // "unit_confirmation" (l'unico tipo storico, campo assente sui checkpoint
  // precedenti = trattato come tale): il parser ha gia' trovato due numeri
  // nel testo, l'operatore conferma solo l'unita'. "missing_measurement"
  // (Regola generale Giuliano 2026-09-08, MISSING_SCREENING_MEASUREMENT_
  // OPERATOR_QUESTION): nessun numero e' stato trovato in alcun documento
  // originario verificato; l'operatore inserisce larghezza e altezza reali,
  // non conferma soltanto un'unita' su un valore gia' individuato.
  kind?: "unit_confirmation" | "missing_measurement" | "case_decision";
  status: "open" | "answered" | "applied" | "retired";
  answer: null | { value: OperatorAnswerValue; note: string; operatorId: string; commandId: string; answeredAt: string };
  requestedAt: string;
  appliedAt: string | null;
  appliedRuleIds: string[];
  classification?: "operator_required";
  exactCause?: string;
  missingDocumentType?: string | null;
  onboardingGap?: string;
}

export interface AprOperatorQuestionsState {
  version: typeof APR_OPERATOR_QUESTIONS_VERSION;
  revision: number;
  questions: AprOperatorQuestion[];
  audit: Array<{ revision: number; at: string; type: "initialized" | "question_opened" | "answer_recorded" | "answer_applied" | "question_retired"; questionId: string | null; reason: string; appliedRuleIds: string[] }>;
}

/**
 * Contesto minimo del preflight Infissi. Rimane strutturalmente disaccoppiato
 * dallo store completo per evitare che il generatore di domande diventi
 * proprietario del routing prodotti.
 */
export interface AprInfissiOperatorQuestionContext {
  items: ReadonlyArray<{
    customerKey: string;
    displayName?: string;
    practiceId?: string;
    productModule?: "infissi" | "mixed";
    state?: "queued" | "ready_local_plan" | "blocked_case";
    report?: null | {
      blockers?: ReadonlyArray<{
        code: string;
        field: string;
        sourceIds: string[];
        classification?: "operator_required" | "technical_block";
        exactCause?: string;
        missingDocumentType?: string | null;
        operatorQuestion?: string;
        onboardingGap?: string | null;
      }>;
    };
  }>;
}

export type AprStoppedCaseQuestionInput = Omit<AprStopCaseInput, "displayName"> & {
  displayName: string;
  practiceId?: string | null;
  sourceIds: readonly string[];
};

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
const MISSING_MEASUREMENT_RULE_IDS = [
  ...RULE_IDS,
  USER_AUTHORIZED_RULE_IDS.missingScreeningMeasurementOperatorQuestion,
  USER_AUTHORIZED_RULE_IDS.missingMeasurementNullPayload,
];
const INFISSI_CLOSURE_NO_MEASUREMENT_RULE_IDS = [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable];
const INFISSI_CLOSURE_DESCRIPTION = /\b(?:persian[ae]|zanzarier[ae]|avvolgibil[ei]|tapparell[ae]|scur[io]|chiusur[ae]\s+oscurant[ei])\b/iu;

function isInfissiCustomer(customerKey: string, context?: AprInfissiOperatorQuestionContext) {
  return Boolean(context?.items.some((item) => item.customerKey === customerKey && (item.productModule === "infissi" || item.productModule === "mixed")));
}

function isInfissiClosureMeasurementQuestion(question: AprOperatorQuestion, context?: AprInfissiOperatorQuestionContext) {
  return question.kind === "missing_measurement"
    && question.field.startsWith("screenings.")
    && isInfissiCustomer(question.customerKey, context)
    && INFISSI_CLOSURE_DESCRIPTION.test(question.payload.description);
}

function initialState(now: Date): AprOperatorQuestionsState {
  return { version: APR_OPERATOR_QUESTIONS_VERSION, revision: 0, questions: [], audit: [{ revision: 0, at: now.toISOString(), type: "initialized", questionId: null, reason: "Registro domande operatore inizializzato.", appliedRuleIds: RULE_IDS }] };
}

function directOperatorPrompt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.endsWith("?")) return normalized;
  const action = normalized.match(/(?:^|[.:!?]\s+)(Indica|Conferma|Allega|Fornisci)\s+([^.!?]+)[.!?]?$/i);
  if (action) {
    const verb = ({ indica: "indicare", conferma: "confermare", allega: "allegare", fornisci: "fornire" } as const)[action[1].toLocaleLowerCase("it") as "indica" | "conferma" | "allega" | "fornisci"];
    return `Puoi ${verb} ${action[2].trim()}?`;
  }
  return `Puoi fornire il dato o la decisione richiesta descritta qui: ${normalized.replace(/[.]$/, "")}?`;
}

export class PersistentAprOperatorQuestions {
  readonly checkpointPath: string;
  readonly operatorResponses: PersistentAprOperatorResponseLedger;
  constructor(readonly rootDirectory: string) {
    this.checkpointPath = path.join(path.resolve(rootDirectory), "operator-questions", "checkpoint.json");
    this.operatorResponses = new PersistentAprOperatorResponseLedger(rootDirectory);
  }
  load(now = new Date()): AprOperatorQuestionsState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprOperatorQuestionsState;
      return value.version === APR_OPERATOR_QUESTIONS_VERSION ? value : initialState(now);
    } catch { return initialState(now); }
  }
  private write(state: AprOperatorQuestionsState) { writeDurable(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  private activeResponse(input: Pick<AprOperatorQuestion, "id" | "customerKey" | "practiceId" | "field" | "prompt" | "status">, now: Date) {
    const response = activeResponseForQuestion(input, this.operatorResponses.projection(input.customerKey, input.practiceId, now).entries);
    return response && this.operatorResponses.hasEffectiveApplication(response.responseId, input.customerKey, input.practiceId, now)
      ? response
      : null;
  }
  private suppressAnsweredQuestion(input: Pick<AprOperatorQuestion, "id" | "customerKey" | "practiceId" | "field" | "prompt" | "status">, current: AprOperatorQuestionsState, now: Date) {
    const response = this.activeResponse(input, now);
    if (!response) return null;
    const next = structuredClone(current);
    const existing = next.questions.find((question) => question.id === input.id);
    if (existing && existing.status !== "retired" && existing.status !== "applied") {
      next.revision += 1;
      existing.status = "retired";
      existing.appliedAt = now.toISOString();
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_retired", questionId: input.id, reason: `Domanda chiusa dalla risposta attiva ${response.responseId}; non viene riaperta.`, appliedRuleIds: RULE_IDS });
      return this.write(next);
    }
    if (!existing) {
      next.revision += 1;
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_retired", questionId: input.id, reason: `Domanda non aperta: esiste gia' la risposta attiva ${response.responseId}.`, appliedRuleIds: RULE_IDS });
      return this.write(next);
    }
    return current;
  }
  persistStoppedCaseDisposition(input: AprStoppedCaseQuestionInput, now = new Date()): { state: AprOperatorQuestionsState; disposition: AprStopDisposition } {
    const provisional = disposeAprStoppedCase({ ...input, displayName: input.displayName, persistedQuestionCount: 0 });
    const current = this.initialize(now);
    if (provisional.kind === "guasto_apr" || !provisional.blockerCode) return { state: current, disposition: provisional };

    const alreadyPersisted = current.questions.some((question) => question.customerKey === input.customerKey
      && question.payload.blockerCode === provisional.blockerCode);
    const disposition = disposeAprStoppedCase({ ...input, displayName: input.displayName, persistedQuestionCount: alreadyPersisted ? 1 : 0 });
    if (alreadyPersisted) return { state: current, disposition };

    const stableSuffix = createHash("sha256").update(`${input.customerKey}\0${provisional.blockerCode}`).digest("hex").slice(0, 24);
    const safeCustomerKey = input.customerKey.toLocaleLowerCase("it").replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "practice";
    const sourceIds = [...new Set(input.sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
    const state = this.requestCaseDecisionQuestion({
      id: `stop:${safeCustomerKey}:${stableSuffix}`,
      customerKey: input.customerKey,
      practiceId: input.practiceId ?? null,
      displayName: input.displayName,
      field: provisional.field ?? "operator.requiredData",
      prompt: directOperatorPrompt(provisional.text),
      evidenceText: provisional.text,
      sourceIds: sourceIds.length ? sourceIds : [`stopped-case:${input.customerKey}:${provisional.blockerCode}`],
      payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: provisional.field ?? provisional.blockerCode, blockerCode: provisional.blockerCode },
      classification: "operator_required",
      exactCause: provisional.text,
      missingDocumentType: provisional.blockerCode === "customer_form_missing" ? "modulo cliente compilato" : null,
      onboardingGap: `Raccogliere in forma strutturata il dato ${provisional.field ?? provisional.blockerCode} prima della lavorazione APR.`,
    }, now);
    return { state, disposition };
  }
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
          practiceId: item.practiceId ?? null,
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
    const suppressed = this.suppressAnsweredQuestion({ ...input, status: "open" }, current, now);
    if (suppressed) return suppressed;
    const existing = current.questions.find((question) => question.id === input.id);
    if (existing) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(input.id) || input.sourceIds.length < 1
      || typeof input.payload.rawWidth !== "number" || input.payload.rawWidth <= 0
      || typeof input.payload.rawHeight !== "number" || input.payload.rawHeight <= 0
      || input.payload.reportedUnit === null) throw new Error("operator_question_invalid");
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
  discoverMissingMeasurementQuestions(preflight: ReturnType<PersistentAprCrmLocalPreflight["snapshot"]>, analysis: ReturnType<PersistentAprCrmDocumentAnalysis["snapshot"]>, now = new Date(), infissiContext?: AprInfissiOperatorQuestionContext) {
    let state = this.initialize(now);
    for (const item of preflight.items) {
      if (item.state !== "blocked_case" || (item.report?.products.length ?? 0) > 0 || !item.report?.blockers.some((blocker) => blocker.code === "screenings_missing")) continue;
      if (state.questions.some((question) => question.customerKey === item.customerKey)) continue;
      const documents = analysis.items.filter((document) => document.customerKey === item.customerKey && document.textPath && existsSync(document.textPath));
      if (!documents.length) continue;
      const sourceIds: string[] = [];
      let description = "il prodotto di schermatura solare";
      let descriptionResolved = false;
      let protectedWindowMeasurementEvidence: string | null = null;
      const formatContexts: string[] = [];
      for (const document of documents) {
        const sourceText = readFileSync(document.textPath!, "utf8");
        if (!/pergola|pergotenda|tenda|schermatura|persian[ae]|zanzarier[ae]|avvolgibil[ei]|tapparell[ae]|venezian/i.test(sourceText)) continue;
        sourceIds.push(document.documentKey);
        const context = operatorQuestionEvidenceAroundLabel(sourceText, /\b(?:misur[ae]?|dimension[ei]|largh\.?|altezza|alt\.?|q(?:uan)?t(?:ita|a)?)\b/iu);
        if (context) formatContexts.push(`${document.documentKey}, contesto etichetta (max 15 righe):\n${context.rendered}`);
        const protectedWindowMatch = sourceText.match(/Dimensioni\s+finestra\s+protetta[\s\S]{0,220}?(\d{2,5}\s*[x/×]\s*\d{2,5}(?:\s*(?:mm|cm|m))?)/i);
        if (protectedWindowMatch) protectedWindowMeasurementEvidence = protectedWindowMatch[1].replace(/\s+/g, " ").trim();
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
      // Regola generale Giuliano 2026-09-11: persiane, zanzariere,
      // avvolgibili/tapparelle e altre chiusure associate agli Infissi sono
      // esclusivamente flag ENEA. Non possiedono campi dimensionali nel
      // portale e non possono entrare nel generatore Schermature. Una
      // zanzariera/persiana autonoma, invece, resta un prodotto Schermature
      // misurabile e continua a seguire il gate storico.
      if (isInfissiCustomer(item.customerKey, infissiContext) && INFISSI_CLOSURE_DESCRIPTION.test(description)) continue;
      const questionId = `measure:${item.customerKey}:${sourceIds[0].slice(0, 16)}`;
      state = this.requestMissingMeasurementQuestion({
        id: questionId, customerKey: item.customerKey, displayName: item.displayName, field: "screenings.1.dimensions",
        practiceId: item.practiceId ?? null,
        prompt: protectedWindowMeasurementEvidence
          ? `Vuoi usare per ${description} le misure scritte a mano nello spazio "Dimensioni finestra protetta" (${protectedWindowMeasurementEvidence}), oppure richiederne di nuove?`
          : `Mancano le misure del prodotto (${description}) in tutti i documenti originari verificati. Inseriscile per far riprendere la pratica.`,
        evidenceText: protectedWindowMeasurementEvidence
          ? `Misure manoscritte trovate esclusivamente nello spazio finestra protetta: ${protectedWindowMeasurementEvidence}; non applicate automaticamente al prodotto.`
          : `Documenti verificati privi di misura: ${sourceIds.join(", ")}.${formatContexts.length ? `\n${formatContexts.join("\n---\n")}` : ""}`, sourceIds,
        payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description },
        classification: "operator_required",
        exactCause: protectedWindowMeasurementEvidence ? "Misure presenti soltanto nello spazio manoscritto della finestra protetta; serve decidere se coincidono con il prodotto." : "Misure fisiche del prodotto assenti dalle fonti originarie verificate.",
        missingDocumentType: protectedWindowMeasurementEvidence ? null : "scheda o documento con larghezza e altezza del prodotto",
        onboardingGap: "Il modulo iniziale deve richiedere separatamente e in formato strutturato larghezza e altezza del prodotto, distinguendole dalla finestra protetta.",
      }, now);
    }
    return state;
  }
  retireInfissiClosureMeasurementQuestions(infissiContext: AprInfissiOperatorQuestionContext, now = new Date()) {
    const current = this.initialize(now);
    const retireIds = new Set(current.questions
      .filter((question) => question.status === "open" && isInfissiClosureMeasurementQuestion(question, infissiContext))
      .map((question) => question.id));
    if (retireIds.size === 0) return current;
    const next = structuredClone(current);
    for (const question of next.questions) {
      if (!retireIds.has(question.id)) continue;
      next.revision += 1;
      question.status = "retired";
      question.appliedAt = now.toISOString();
      question.appliedRuleIds = [...new Set([...question.appliedRuleIds, ...INFISSI_CLOSURE_NO_MEASUREMENT_RULE_IDS])];
      next.audit.push({
        revision: next.revision,
        at: now.toISOString(),
        type: "question_retired",
        questionId: question.id,
        reason: "Domanda ritirata: la chiusura oscurante nella pratica Infissi e' un flag ENEA privo di larghezza/altezza.",
        appliedRuleIds: INFISSI_CLOSURE_NO_MEASUREMENT_RULE_IDS,
      });
    }
    return this.write(next);
  }
  requestMissingMeasurementQuestion(input: Omit<AprOperatorQuestion, "status" | "answer" | "requestedAt" | "appliedAt" | "appliedRuleIds" | "choices" | "kind">, now = new Date(), ruleIds: string[] = MISSING_MEASUREMENT_RULE_IDS) {
    const current = this.initialize(now);
    const suppressed = this.suppressAnsweredQuestion({ ...input, status: "open" }, current, now);
    if (suppressed) return suppressed;
    const existing = current.questions.find((question) => question.id === input.id);
    if (existing) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(input.id) || input.sourceIds.length < 1
      || input.payload.rawWidth !== null || input.payload.rawHeight !== null || input.payload.reportedUnit !== null) throw new Error("operator_question_invalid");
    const next = structuredClone(current); next.revision += 1;
    next.questions.push({ ...input, classification: input.classification ?? "operator_required", exactCause: input.exactCause ?? `Dato mancante o ambiguo per ${input.field}.`, missingDocumentType: input.missingDocumentType ?? null, onboardingGap: input.onboardingGap ?? `Richiedere ${input.field} in forma strutturata durante l'onboarding.`, kind: "missing_measurement", choices: [{ value: "millimeters", label: "Millimetri" }, { value: "centimeters", label: "Centimetri" }, { value: "cannot_determine", label: "Non disponibile" }], status: "open", answer: null, requestedAt: now.toISOString(), appliedAt: null, appliedRuleIds: ruleIds });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_opened", questionId: input.id, reason: `${input.displayName}: richiesta misura mancante per ${input.field}.`, appliedRuleIds: ruleIds });
    return this.write(next);
  }
  discoverInfissiBlockerQuestions(context: AprInfissiOperatorQuestionContext, now = new Date()) {
    let state = this.initialize(now);
    for (const item of context.items) {
      if (item.state !== "blocked_case" || !item.report?.blockers?.length
        || state.questions.some((question) => question.customerKey === item.customerKey && question.status === "open")) continue;
      const blocker = item.report.blockers.find((candidate) => candidate.classification === "operator_required" || Boolean(candidate.operatorQuestion))
        ?? item.report.blockers.find((candidate) => candidate.code === "infissi_shading_closures_form_answer_missing_or_ambiguous");
      if (!blocker) continue;
      const prompt = blocker.operatorQuestion?.trim()
        || (blocker.code === "infissi_shading_closures_form_answer_missing_or_ambiguous"
          ? "Confermi se sono state installate chiusure oscuranti insieme agli infissi?"
          : `Puoi fornire la decisione richiesta per ${blocker.field}?`);
      const sourceIds = blocker.sourceIds.length ? [...blocker.sourceIds] : [`infissi:${item.customerKey}`];
      const id = `infissi:${item.customerKey}:${blocker.code}`.slice(0, 160);
      state = this.requestCaseDecisionQuestion({
        id,
        customerKey: item.customerKey,
        practiceId: item.practiceId ?? null,
        displayName: item.displayName ?? item.customerKey,
        field: blocker.field,
        prompt,
        evidenceText: blocker.exactCause?.trim() || `Blocco Infissi persistito: ${blocker.code}.`,
        sourceIds,
        payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: blocker.field, blockerCode: blocker.code },
        classification: "operator_required",
        exactCause: blocker.exactCause ?? `Decisione operatore richiesta dal percorso Infissi: ${blocker.code}.`,
        missingDocumentType: blocker.missingDocumentType ?? null,
        onboardingGap: blocker.onboardingGap ?? `Raccogliere in forma strutturata il dato ${blocker.field} durante l'onboarding.`,
      }, now);
    }
    return state;
  }
  requestCaseDecisionQuestion(input: Omit<AprOperatorQuestion, "status" | "answer" | "requestedAt" | "appliedAt" | "appliedRuleIds" | "choices" | "kind">, now = new Date()) {
    const current = this.initialize(now);
    const suppressed = this.suppressAnsweredQuestion({ ...input, status: "open" }, current, now);
    if (suppressed) return suppressed;
    if (current.questions.some((question) => question.id === input.id)) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(input.id) || input.sourceIds.length < 1
      || input.payload.rawWidth !== null || input.payload.rawHeight !== null || input.payload.reportedUnit !== null
      || !input.payload.blockerCode) throw new Error("operator_question_invalid");
    const ruleIds = [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.infissiBlockerQuestionPersistence];
    const next = structuredClone(current); next.revision += 1;
    next.questions.push({ ...input, kind: "case_decision", choices: [{ value: "yes", label: "Sì" }, { value: "no", label: "No" }, { value: "cannot_determine", label: "Non determinabile" }], status: "open", answer: null, requestedAt: now.toISOString(), appliedAt: null, appliedRuleIds: ruleIds });
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "question_opened", questionId: input.id, reason: `${input.displayName}: domanda del percorso Infissi persistita per ${input.field}.`, appliedRuleIds: ruleIds });
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
          practiceId: item.practiceId ?? null,
          prompt: `La fonte riporta due letture candidate per la misura: "${w1}×${h1}" e "${w2}×${h2}". ${!firstPlausible && !secondPlausible ? "Nessuna delle due sembra plausibile come misura del prodotto." : !firstPlausible ? `Solo "${w2}×${h2}" sembra plausibile.` : `Solo "${w1}×${h1}" sembra plausibile.`} Quale (se una) e' la misura reale? Inserisci larghezza e altezza corrette.`,
          evidenceText: `Fonte ${document.documentKey}: valore riportato "${match[0]}".`, sourceIds: [document.documentKey],
          payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: item.displayName },
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
        practiceId: item.practiceId ?? null,
        prompt: `La fattura non riporta alcuna misura. Sono stati trovati piu' documenti tecnici di fornitori/posizioni diversi (${complexDocumentIds.join(", ")}). Conferma quale prodotto/posizione e' quello corretto per questa pratica e indica larghezza e altezza esatte.`,
        evidenceText: `Documenti tecnici multi-fornitore trovati: ${complexDocumentIds.join(", ")}.`, sourceIds: complexDocumentIds,
        payload: { rawWidth: null, rawHeight: null, reportedUnit: null, description: item.displayName },
      }, now, [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.complexMultiVendorTechnicalFormOperatorQuestion]);
    }
    return state;
  }
  answer(questionId: string, value: OperatorAnswerValue, note: string, operatorId: string, commandId: string, now = new Date(), explicitMeasurement?: { rawWidth: number; rawHeight: number }) {
    if (!(["millimeters", "centimeters", "yes", "no", "cannot_determine"] as string[]).includes(value) || !operatorId.trim() || !/^[a-z0-9][a-z0-9._:-]{7,160}$/.test(commandId)) throw new Error("operator_answer_invalid");
    if (explicitMeasurement && (!(explicitMeasurement.rawWidth > 0) || !(explicitMeasurement.rawHeight > 0))) throw new Error("operator_answer_measurement_invalid");
    const current = this.initialize(now); const target = current.questions.find((question) => question.id === questionId);
    if (!target) throw new Error("operator_question_not_found");
    if (target.answer?.commandId === commandId) return current;
    if (target.status !== "open") throw new Error("operator_question_already_answered");
    if (target.kind === "missing_measurement" && value !== "cannot_determine" && !explicitMeasurement) throw new Error("operator_answer_measurement_required");
    if (target.kind === "case_decision" && !["yes", "no", "cannot_determine"].includes(value)) throw new Error("operator_answer_choice_invalid");
    if (target.kind !== "case_decision" && ["yes", "no"].includes(value)) throw new Error("operator_answer_choice_invalid");
    const next = structuredClone(current); const question = next.questions.find((item) => item.id === questionId)!; next.revision += 1;
    question.status = "answered"; question.answer = { value, note: note.replace(/\s+/g, " ").trim().slice(0, 500), operatorId: operatorId.trim().slice(0, 120), commandId, answeredAt: now.toISOString() };
    if (explicitMeasurement) question.payload = { ...question.payload, rawWidth: explicitMeasurement.rawWidth, rawHeight: explicitMeasurement.rawHeight, reportedUnit: value === "centimeters" ? "cm" : "mm" };
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
  retireResolvedQuestions(context: AprInfissiOperatorQuestionContext, savedCustomerKeys: readonly string[] = [], now = new Date()) {
    const current = this.initialize(now);
    const saved = new Set(savedCustomerKeys);
    const next = structuredClone(current);
    let changed = false;
    for (const question of next.questions) {
      if (question.status !== "open" && question.status !== "answered") continue;
      const item = context.items.find((candidate) => candidate.customerKey === question.customerKey);
      const practiceId = question.practiceId ?? item?.practiceId ?? null;
      const live: AprQuestionLifecycleCaseState | null = saved.has(question.customerKey)
        ? { customerKey: question.customerKey, state: "saved", blockerCodes: [] }
        : item ? {
          customerKey: item.customerKey,
          state: item.state ?? "unknown",
          blockerCodes: (item.report?.blockers ?? []).map((blocker) => blocker.code),
        } : null;
      const identity = { ...question, practiceId, blockerCode: question.payload.blockerCode ?? null };
      const entries = this.operatorResponses.projection(question.customerKey, practiceId, now).entries
        .filter((entry) => this.operatorResponses.hasEffectiveApplication(entry.responseId, question.customerKey, practiceId, now));
      const reason = questionRetirementReason(identity, live, entries);
      if (!reason) continue;
      next.revision += 1;
      question.status = "retired";
      question.appliedAt = now.toISOString();
      next.audit.push({
        revision: next.revision,
        at: now.toISOString(),
        type: "question_retired",
        questionId: question.id,
        reason: reason.kind === "active_response"
          ? `Domanda chiusa dalla risposta attiva ${reason.responseId}.`
          : reason.kind === "case_saved" ? "Domanda chiusa: la pratica risulta salvata."
            : "Domanda chiusa: il blocker originario non e' piu' presente.",
        appliedRuleIds: RULE_IDS,
      });
      changed = true;
    }
    return changed ? this.write(next) : current;
  }
  snapshot(now = new Date()) { const state = this.initialize(now); return { ...state, openCount: state.questions.filter((question) => question.status === "open").length, pendingApplicationCount: state.questions.filter((question) => question.status === "answered" && question.answer?.value !== "cannot_determine").length, observedAt: now.toISOString(), lastEvent: state.audit.at(-1)! }; }
}
