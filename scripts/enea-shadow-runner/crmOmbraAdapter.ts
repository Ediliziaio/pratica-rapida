import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  OPERATOR_RESPONSE_LEDGER_CONCURRENCY_RULE_ID,
  OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID,
  PersistentAprOperatorResponseLedger,
  type AprOperatorResponseEntry,
  type AprOperatorResponsePayload,
} from "./operatorResponseLedger";
import {
  assertAprCrmOmbraTransportSnapshot,
  type AprCrmOmbraAuthSnapshot,
  type AprCrmOmbraPatch,
  type PersistentAprCrmOmbraAuth,
} from "./crmOmbraAuth";

export const APR_CRM_OMBRA_ADAPTER_VERSION = "apr-crm-ombra-adapter-v1" as const;
export const APR_CRM_OMBRA_QUESTION_FORMAT = "apr-crm-ombra-question-v1" as const;

export type AprCrmOmbraStageType = "pronte_da_fare" | "intervento_operatore" | "da_inviare" | "archiviate";

export interface AprCrmOmbraPractice {
  id: string;
  reseller_id: string;
  brand: string;
  current_stage_id: string;
  cliente_nome: string;
  cliente_cognome: string;
  prodotto_installato: string | null;
  fornitore: string | null;
  note_documenti_mancanti: string | null;
  documenti_mancanti: string[] | null;
  note_interne: string | null;
}

export interface AprCrmOmbraStage {
  id: string;
  reseller_id: string | null;
  brand: string;
  stage_type: AprCrmOmbraStageType;
  name: string;
}

export interface AprCrmOmbraDataTransport {
  snapshot(): AprCrmOmbraAuthSnapshot;
  readPractice(practiceId: string): Promise<AprCrmOmbraPractice | null>;
  readStages(): Promise<AprCrmOmbraStage[]>;
  patchPractice(practiceId: string, expectedStageId: string, patch: AprCrmOmbraPatch): Promise<AprCrmOmbraPractice>;
}

export class SupabaseAprCrmOmbraDataTransport implements AprCrmOmbraDataTransport {
  constructor(private readonly auth: PersistentAprCrmOmbraAuth) {}

  snapshot() { return this.auth.snapshot(); }

  async readPractice(practiceId: string) {
    const response = await this.auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
      select: "id,reseller_id,brand,current_stage_id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,note_documenti_mancanti,documenti_mancanti,note_interne",
      id: `eq.${practiceId}`,
      limit: "2",
    }));
    if (!response.ok) throw new Error(`crm_ombra_practice_read_failed:${response.status}`);
    const rows = await response.json() as AprCrmOmbraPractice[];
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("crm_ombra_practice_read_ambiguous");
    return rows[0] ?? null;
  }

  async readStages() {
    const response = await this.auth.readOnlyGet("/rest/v1/pipeline_stages", new URLSearchParams({
      select: "id,reseller_id,brand,stage_type,name",
      stage_type: "in.(pronte_da_fare,intervento_operatore,da_inviare,archiviate)",
    }));
    if (!response.ok) throw new Error(`crm_ombra_stages_read_failed:${response.status}`);
    const rows = await response.json() as AprCrmOmbraStage[];
    if (!Array.isArray(rows)) throw new Error("crm_ombra_stages_read_invalid");
    return rows;
  }

  async patchPractice(practiceId: string, expectedStageId: string, patch: AprCrmOmbraPatch) {
    return await this.auth.patchPractice(practiceId, expectedStageId, patch) as AprCrmOmbraPractice;
  }
}

interface AprCrmOmbraLearningRecord {
  signature: string;
  resellerId: string;
  productType: string;
  field: string;
  answer: string;
  originatingQuestion: string;
  recordedAt: string;
}

interface AprCrmOmbraLearningState {
  version: "apr-crm-ombra-learning-v1";
  records: AprCrmOmbraLearningRecord[];
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clean = (value: string | null | undefined) => (value ?? "").trim();
const normalize = (value: string | null | undefined) => clean(value).toLocaleLowerCase("it-IT").replace(/\s+/g, " ");
const customerKey = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

class PersistentAprCrmOmbraLearning {
  readonly checkpointPath: string;

  constructor(rootDirectory: string) {
    this.checkpointPath = path.join(rootDirectory, "crm-ombra-adapter", "learning.json");
  }

  load(): AprCrmOmbraLearningState {
    if (!existsSync(this.checkpointPath)) return { version: "apr-crm-ombra-learning-v1", records: [] };
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmOmbraLearningState;
    if (value.version !== "apr-crm-ombra-learning-v1" || !Array.isArray(value.records)) throw new Error("crm_ombra_learning_invalid");
    return value;
  }

  signature(resellerId: string, productType: string, field: string) {
    return hash({ resellerId, productType: normalize(productType), field: normalize(field) });
  }

  find(resellerId: string, productType: string, field: string) {
    const signature = this.signature(resellerId, productType, field);
    return [...this.load().records].reverse().find((record) => record.signature === signature) ?? null;
  }

  record(input: Omit<AprCrmOmbraLearningRecord, "signature">) {
    const state = this.load();
    const signature = this.signature(input.resellerId, input.productType, input.field);
    const candidate = { ...input, signature };
    const existing = state.records.find((record) => record.signature === signature && record.answer === input.answer);
    if (!existing) state.records.push(candidate);
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return existing ?? candidate;
  }
}

function resolveStage(practice: AprCrmOmbraPractice, stages: AprCrmOmbraStage[], stageType: AprCrmOmbraStageType) {
  const candidates = stages.filter((stage) => stage.stage_type === stageType && stage.brand === practice.brand);
  const stage = candidates.find((candidate) => candidate.reseller_id === practice.reseller_id)
    ?? candidates.find((candidate) => candidate.reseller_id === null);
  if (!stage) throw new Error(`crm_ombra_stage_missing:${stageType}`);
  return stage;
}

function currentStageType(practice: AprCrmOmbraPractice, stages: AprCrmOmbraStage[]) {
  return stages.find((stage) => stage.id === practice.current_stage_id)?.stage_type ?? null;
}

function appendNote(existing: string | null, line: string) {
  const previous = clean(existing);
  if (previous.split("\n").some((value) => value.trim() === line.trim())) return previous;
  return previous ? `${previous}\n${line}` : line;
}

function ensureQuestion(question: string) {
  const value = clean(question);
  if (!value || value.length < 8 || !value.endsWith("?")) throw new Error("crm_ombra_operator_question_not_direct");
  return value;
}

export function formatAprCrmOmbraQuestion(input: { questionId: string; question: string; field: string; missingDocumentType?: string | null }) {
  return [
    `Domanda APR [${input.questionId}]`,
    ensureQuestion(input.question),
    `Dato richiesto: ${clean(input.field)}`,
    input.missingDocumentType ? `Documento richiesto: ${clean(input.missingDocumentType)}` : null,
    "Risposta operatore:",
  ].filter(Boolean).join("\n");
}

export function parseAprCrmOmbraQuestion(value: string | null) {
  const note = clean(value);
  const questionId = note.match(/^Domanda APR \[([^\]]+)\]/m)?.[1]?.trim() ?? "";
  const field = note.match(/^Dato richiesto:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const missingDocumentType = note.match(/^Documento richiesto:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const answer = note.match(/^Risposta operatore:\s*([\s\S]*)$/m)?.[1]?.trim() ?? "";
  const lines = note.split("\n");
  const markerIndex = lines.findIndex((line) => line.startsWith("Domanda APR ["));
  const question = markerIndex >= 0 ? clean(lines[markerIndex + 1]) : "";
  if (!questionId || !field || !question) return null;
  return { questionId, question, field, missingDocumentType, answer };
}

function answerKind(answer: string, field: string, question: string) {
  const notWorkable = answer.match(/^non\s+lavorabile\s*[:\-]\s*(.+)$/i);
  if (notWorkable) return { kind: "not_workable" as const, value: notWorkable[1].trim() };
  if (/(?:da|fare|fatta|lavorare|gestire)\s+(?:a\s+)?mano/i.test(answer)) {
    return { kind: "not_workable" as const, value: answer.trim() };
  }
  if (field === "operator.manualDisposition" && /^(?:s[iì]|corretto|confermo|confermato)\b/i.test(answer)) {
    return { kind: "not_workable" as const, value: `Lavorazione manuale confermata: ${answer.trim()}` };
  }
  const correction = answer.match(/^correzione(?:\s+generale)?\s*[:\-]\s*(.+)$/i);
  if (correction) return { kind: "correction" as const, value: correction[1].trim() };
  return { kind: "data" as const, value: answer.trim() };
}

function responsePayload(field: string, answer: string, questionId: string, question: string, missingDocumentType: string | null): AprOperatorResponsePayload {
  const knownFields = ["completionDate", "infissi.dimensioni_e_numero", "economic.invoiceTotal", "shading_closures", "operator.pendingData"] as const;
  const aliases: Record<string, typeof knownFields[number]> = {
    "completionDate.portalYear": "completionDate",
    "screenings.dimensions": "operator.pendingData",
  };
  const exactField = knownFields.find((candidate) => candidate === field) ?? aliases[field];
  if (exactField) return { kind: "case_decision", field: exactField, value: answer, originatingQuestionId: questionId };
  if (missingDocumentType && /(?:caricat|allegat|aggiunt)/i.test(answer)) {
    return { kind: "document_refresh", documentTypes: [missingDocumentType] };
  }
  return { kind: "operator_required", operatorQuestion: question, missingDocumentType, field, originatingQuestionId: questionId };
}

function responseEntry(input: {
  practice: AprCrmOmbraPractice;
  questionId: string;
  question: string;
  field: string;
  missingDocumentType: string | null;
  answer: string;
  receivedAt: Date;
  payloadOverride?: AprOperatorResponsePayload;
}) {
  const displayName = `${input.practice.cliente_nome} ${input.practice.cliente_cognome}`.trim();
  const payload = input.payloadOverride ?? responsePayload(input.field, input.answer, input.questionId, input.question, input.missingDocumentType);
  const responseId = `crm-ombra:${hash({ practiceId: input.practice.id, questionId: input.questionId, answer: input.answer }).slice(0, 48)}`;
  return {
    responseId,
    customerKey: customerKey(displayName),
    displayName,
    practiceId: input.practice.id,
    receivedAt: input.receivedAt.toISOString(),
    source: "giuliano_crm_ombra",
    question: input.question,
    answer: input.answer,
    payload,
    status: "active",
    supersedesResponseId: null,
    appliedRuleIds: [
      OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID,
      OPERATOR_RESPONSE_LEDGER_CONCURRENCY_RULE_ID,
      "system-atomic-checkpoint-resume",
    ],
  } satisfies AprOperatorResponseEntry;
}

export class AprCrmOmbraAdapter {
  private readonly learning: PersistentAprCrmOmbraLearning;

  constructor(
    private readonly transport: AprCrmOmbraDataTransport,
    private readonly responseLedger: PersistentAprOperatorResponseLedger,
    rootDirectory: string,
  ) {
    assertAprCrmOmbraTransportSnapshot(transport.snapshot());
    this.learning = new PersistentAprCrmOmbraLearning(rootDirectory);
  }

  private async context(practiceId: string) {
    const [practice, stages] = await Promise.all([this.transport.readPractice(practiceId), this.transport.readStages()]);
    if (!practice) throw new Error("crm_ombra_practice_not_found");
    return { practice, stages, stageType: currentStageType(practice, stages) };
  }

  async publishOperatorQuestion(input: {
    practiceId: string;
    questionId: string;
    question: string;
    field: string;
    missingDocumentType?: string | null;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const { practice, stages, stageType } = await this.context(input.practiceId);
    if (stageType !== "pronte_da_fare" && stageType !== "intervento_operatore") {
      throw new Error(`crm_ombra_question_transition_rejected:${stageType ?? "unknown"}`);
    }
    const question = ensureQuestion(input.question);
    const learned = this.learning.find(practice.reseller_id, practice.prodotto_installato ?? "", input.field);
    if (learned) {
      this.responseLedger.importResponses([responseEntry({
        practice,
        questionId: input.questionId,
        question,
        field: input.field,
        missingDocumentType: input.missingDocumentType ?? null,
        answer: learned.answer,
        receivedAt: now,
      })], now);
      return { status: "learned_correction_applied" as const, answer: learned.answer };
    }
    const note = formatAprCrmOmbraQuestion({ ...input, question });
    if (stageType === "intervento_operatore" && practice.note_documenti_mancanti === note) {
      return { status: "already_published" as const, note };
    }
    const target = resolveStage(practice, stages, "intervento_operatore");
    const documents = [...new Set([...(practice.documenti_mancanti ?? []), ...(input.missingDocumentType ? [input.missingDocumentType] : [])])];
    await this.transport.patchPractice(practice.id, practice.current_stage_id, {
      current_stage_id: target.id,
      note_documenti_mancanti: note,
      documenti_mancanti: documents,
    });
    return { status: "question_published" as const, note };
  }

  async recordSavedDraft(input: { practiceId: string; draftId: string; draftUrl: string; savedAt?: Date }) {
    const savedAt = input.savedAt ?? new Date();
    if (!/^\d+$/.test(input.draftId)) throw new Error("crm_ombra_draft_id_invalid");
    const url = new URL(input.draftUrl);
    if (url.protocol !== "https:" || !/(?:^|\.)enea\.it$/i.test(url.hostname)) throw new Error("crm_ombra_draft_url_invalid");
    const { practice, stages, stageType } = await this.context(input.practiceId);
    if (stageType !== "pronte_da_fare") throw new Error(`crm_ombra_saved_transition_rejected:${stageType ?? "unknown"}`);
    const target = resolveStage(practice, stages, "da_inviare");
    const note = `Bozza ENEA n. ${input.draftId}, creata da APR il ${savedAt.toISOString()}, ${url.toString()}`;
    await this.transport.patchPractice(practice.id, practice.current_stage_id, {
      current_stage_id: target.id,
      note_interne: appendNote(practice.note_interne, note),
    });
    return { status: "saved_draft_recorded" as const, note };
  }

  async consumeOperatorResponse(practiceId: string, now = new Date()) {
    const { practice, stages, stageType } = await this.context(practiceId);
    if (stageType !== "intervento_operatore") throw new Error(`crm_ombra_response_transition_rejected:${stageType ?? "unknown"}`);
    const parsed = parseAprCrmOmbraQuestion(practice.note_documenti_mancanti);
    if (!parsed) throw new Error("crm_ombra_question_record_invalid");
    if (!parsed.answer) return { status: "waiting_for_operator" as const };
    const kind = answerKind(parsed.answer, parsed.field, parsed.question);
    if (!kind.value) return { status: "waiting_for_operator" as const };
    if (kind.kind === "not_workable") {
      const entry = responseEntry({
        practice,
        ...parsed,
        answer: parsed.answer,
        receivedAt: now,
        payloadOverride: { kind: "case_disposition", disposition: "not_workable", reason: kind.value },
      });
      this.responseLedger.importResponses([entry], now);
      const target = resolveStage(practice, stages, "archiviate");
      const note = appendNote(practice.note_interne, `Non lavorabile dichiarato dall'operatore il ${now.toISOString()}: ${kind.value}`);
      await this.transport.patchPractice(practice.id, practice.current_stage_id, {
        current_stage_id: target.id,
        note_interne: note,
        note_documenti_mancanti: null,
        documenti_mancanti: [],
      });
      return { status: "archived_not_workable" as const, responseId: entry.responseId };
    }
    const answer = kind.value;
    const entry = responseEntry({ practice, ...parsed, answer, receivedAt: now });
    this.responseLedger.importResponses([entry], now);
    if (kind.kind === "correction") {
      this.learning.record({
        resellerId: practice.reseller_id,
        productType: practice.prodotto_installato ?? "",
        field: parsed.field,
        answer,
        originatingQuestion: parsed.question,
        recordedAt: now.toISOString(),
      });
    }
    const target = resolveStage(practice, stages, "pronte_da_fare");
    await this.transport.patchPractice(practice.id, practice.current_stage_id, {
      current_stage_id: target.id,
      note_documenti_mancanti: null,
      documenti_mancanti: [],
      note_interne: appendNote(practice.note_interne, `Risposta operatore importata da APR il ${now.toISOString()} (${entry.responseId}).`),
    });
    return { status: "response_imported" as const, responseId: entry.responseId, answerKind: kind.kind };
  }
}
