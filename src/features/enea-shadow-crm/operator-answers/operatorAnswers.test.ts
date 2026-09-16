import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAnswerRecord } from "./answerRecord.ts";
import { cohortDirectoryName, readCurrentRun, selectCurrentRun } from "./currentRun.ts";
import { readOpenQuestions, selectOpenQuestions, type CohortQuestionSource, type OpenQuestion, type OperatorQuestionRecord } from "./openQuestions.ts";
import { RUNNER_ROOT, operatorResponsesPath } from "./paths.ts";
import {
  OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID,
  activeResponsesFor,
  appendResponseToLedger,
  emptyLedger,
  ledgerContentHash,
  ledgerProblem,
  recordResponse,
  type OperatorResponseLedger,
  type OperatorResponseRecord,
} from "./responseLedger.ts";

const NOW = new Date("2026-09-13T20:00:00.000Z");

const question = (overrides: Partial<OperatorQuestionRecord> = {}): OperatorQuestionRecord => ({
  id: "measure:rossella-munafo:dc3e55c0489de4e3",
  customerKey: "rossella-munafo",
  displayName: "Rossella Munafo'",
  field: "screenings.1.dimensions",
  prompt: "La fattura non riporta alcuna misura. Indica larghezza e altezza esatte.",
  evidenceText: "Documenti tecnici multi-fornitore trovati.",
  kind: "missing_measurement",
  payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "mm", description: "Rossella Munafo'" },
  status: "open",
  requestedAt: "2026-09-12T10:00:00.000Z",
  ...overrides,
});

const source = (cohort: string, questions: OperatorQuestionRecord[], seed = true): CohortQuestionSource => ({
  cohort,
  checkpoint: { version: "apr-operator-questions-v1", revision: 1, questions, audit: [] },
  seedCandidates: seed ? [{ customerKey: "rossella-munafo", displayName: "Rossella Munafò", practiceId: "92f0a811-6199-494e-bc12-dafefe1a37b2" }] : [],
});

const response = (overrides: Partial<OperatorResponseRecord>): OperatorResponseRecord => ({
  responseId: "response:test:rossella-munafo:20260911",
  customerKey: "rossella-munafo",
  displayName: "Rossella Munafò",
  practiceId: "92f0a811-6199-494e-bc12-dafefe1a37b2",
  receivedAt: "2026-09-11T09:37:00.000Z",
  source: "giuliano_chat_decision",
  question: "Domanda",
  answer: "Risposta",
  payload: { kind: "operator_required", operatorQuestion: "Domanda", missingDocumentType: null },
  status: "active",
  supersedesResponseId: null,
  appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
  ...overrides,
});

const ledgerWith = (responses: OperatorResponseRecord[]): OperatorResponseLedger => {
  const base = { ...emptyLedger(NOW), responses, revision: responses.length };
  return { ...base, contentSha256: ledgerContentHash(base) };
};

describe("lettura domande aperte", () => {
  it("prende solo le open e, a parità di id, la richiesta più recente", () => {
    const older = question({ prompt: "vecchia", requestedAt: "2026-09-02T00:00:00.000Z" });
    const newer = question({ prompt: "nuova", requestedAt: "2026-09-06T00:00:00.000Z" });
    const answered = question({ id: "unit:altro:1", customerKey: "altro", displayName: "Altro", status: "answered" });
    const selected = selectOpenQuestions([source("c1", [older, answered]), source("c2", [newer])]);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ prompt: "nuova", cohort: "c2", displayName: "Rossella Munafò", practiceId: "92f0a811-6199-494e-bc12-dafefe1a37b2" });
  });

  it("ignora checkpoint assenti o di versione diversa e resta senza practiceId se manca il seed", () => {
    const selected = selectOpenQuestions([
      { cohort: "vuota", checkpoint: null, seedCandidates: [] },
      { cohort: "altra-versione", checkpoint: { version: "x", revision: 0, questions: [question()], audit: [] }, seedCandidates: [] },
      source("senza-seed", [question()], false),
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ cohort: "senza-seed", practiceId: null, displayName: "Rossella Munafo'" });
  });
});

describe("giro corrente", () => {
  it("sceglie il run con updatedAt più recente e ne ricava le coorti", () => {
    const run = selectCurrentRun([
      { runId: "vecchio", checkpoint: { updatedAt: "2026-09-13T12:00:00.000Z", status: "completed", results: [{ cohort: 1, customerKey: "a" }] } },
      { runId: "corrente", checkpoint: { updatedAt: "2026-09-13T19:25:28.156Z", status: "running", results: [{ cohort: 8102, customerKey: "rossella-munafo" }, { cohort: 8105, customerKey: "patrizia-muzzi" }, { customerKey: "senza-cohort" }] } },
      { runId: "rotto", checkpoint: null },
      { runId: "senza-data", checkpoint: { results: [] } },
    ]);
    expect(run).toEqual({ runId: "corrente", updatedAt: "2026-09-13T19:25:28.156Z", status: "running", cohorts: ["apr-pilot-8102-global-controller-rossella-munafo", "apr-pilot-8105-global-controller-patrizia-muzzi"] });
    expect(selectCurrentRun([{ runId: "x", checkpoint: null }])).toBeNull();
  });

  it("il filtro per coorte lascia fuori le domande aperte dei giri vecchi", () => {
    const current = question({ id: "stop:rossella-munafo:1", requestedAt: "2026-09-13T15:20:01.574Z" });
    const stale = question({ id: "measure:rossella-munafo:old", requestedAt: "2026-09-08T00:00:00.000Z" });
    const all = selectOpenQuestions([source(cohortDirectoryName(8102, "rossella-munafo"), [current]), source(cohortDirectoryName(4421, "rossella-munafo"), [stale])]);
    const filtered = selectOpenQuestions([source(cohortDirectoryName(8102, "rossella-munafo"), [current]), source(cohortDirectoryName(4421, "rossella-munafo"), [stale])], [cohortDirectoryName(8102, "rossella-munafo")]);
    expect(all).toHaveLength(2);
    expect(filtered.map((item) => item.id)).toEqual(["stop:rossella-munafo:1"]);
  });

  it.skipIf(!existsSync(path.join(RUNNER_ROOT, "runs")))("sul disco reale il giro corrente ha coorti esistenti", () => {
    const run = readCurrentRun(RUNNER_ROOT);
    expect(run).not.toBeNull();
    expect(run!.cohorts.length).toBeGreaterThan(0);
    expect(run!.cohorts.every((cohort) => existsSync(path.join(RUNNER_ROOT, "cohorts", cohort)))).toBe(true);
  });
});

describe("regola critica: una sola risposta attiva per pratica", () => {
  it("la nuova risposta supera quella attiva e punta a lei con supersedesResponseId", () => {
    const old = response({});
    const { ledger, supersededResponseIds } = recordResponse(ledgerWith([old]), response({ responseId: "response:test:rossella-munafo:20260913", receivedAt: NOW.toISOString() }), NOW);
    expect(supersededResponseIds).toEqual([old.responseId]);
    expect(ledger.responses[0].status).toBe("superseded");
    expect(ledger.responses[1]).toMatchObject({ status: "active", supersedesResponseId: old.responseId });
    expect(activeResponsesFor(ledger, "rossella-munafo", old.practiceId)).toHaveLength(1);
    expect(ledger.revision).toBe(2);
    expect(ledgerProblem(ledger)).toBeNull();
  });

  it("caso Munafò: se il ledger ha già due attive, la nuova le chiude entrambe", () => {
    const first = response({});
    const second = response({ responseId: "response:dimensions:rossella-munafo:20260912", receivedAt: "2026-09-12T11:53:31.000Z", payload: { kind: "screening_products", products: [{ description: "Bioclimatica", quantity: 1, widthMm: 4000, heightMm: 3000 }] } });
    const { ledger, supersededResponseIds } = recordResponse(ledgerWith([first, second]), response({ responseId: "response:test:rossella-munafo:20260913", receivedAt: NOW.toISOString() }), NOW);
    expect(supersededResponseIds).toEqual([first.responseId, second.responseId]);
    expect(ledger.responses.filter((entry) => entry.customerKey === "rossella-munafo" && entry.status === "active")).toHaveLength(1);
    expect(ledger.responses.at(-1)?.supersedesResponseId).toBe(second.responseId);
  });

  it("segnala quando la nuova risposta supera una conferma di regola generale", () => {
    const rule = response({ responseId: "response:rule:rossella-munafo:20260911", payload: { kind: "general_rule_confirmation", ruleIds: ["user-2026-09-11-screening-measurements-in-line-description-v1"] } });
    const { superseded } = recordResponse(ledgerWith([rule]), response({ responseId: "response:test:rossella-munafo:20260913" }), NOW);
    expect(superseded).toEqual([{ responseId: rule.responseId, kind: "general_rule_confirmation", receivedAt: rule.receivedAt }]);
  });

  it("non tocca le risposte attive di altri clienti o di altre pratiche", () => {
    const other = response({ responseId: "response:test:elena-depalma:20260911", customerKey: "elena-depalma", displayName: "Elena Depalma", practiceId: "aaaa" });
    const otherPractice = response({ responseId: "response:test:rossella-munafo:altra", practiceId: "bbbb" });
    const { ledger } = recordResponse(ledgerWith([other, otherPractice]), response({ responseId: "response:test:rossella-munafo:20260913" }), NOW);
    expect(ledger.responses.map((entry) => entry.status)).toEqual(["active", "active", "active"]);
  });

  it("rifiuta un ledger con hash non corrispondente e un responseId duplicato", () => {
    const broken = { ...ledgerWith([response({})]), contentSha256: "0".repeat(64) };
    expect(() => recordResponse(broken, response({ responseId: "response:test:rossella-munafo:20260913" }), NOW)).toThrow(/contentSha256/);
    expect(() => recordResponse(ledgerWith([response({})]), response({}), NOW)).toThrow(/già presente/);
  });

  it("rifiuta responseId fuori pattern APR e record senza la regola di consumo", () => {
    expect(() => recordResponse(emptyLedger(NOW), response({ responseId: "Response:Maiuscolo" }), NOW)).toThrow(/responseId/);
    expect(() => recordResponse(emptyLedger(NOW), response({ appliedRuleIds: [] }), NOW)).toThrow(/regola di consumo/);
  });
});

describe("hash e forma identici a quelli di APR", () => {
  const realLedger = operatorResponsesPath(RUNNER_ROOT);
  it.skipIf(!existsSync(realLedger))("il ledger reale su disco passa la nostra validazione (stesso hash che calcola APR)", () => {
    const value = JSON.parse(readFileSync(realLedger, "utf8"));
    expect(ledgerProblem(value)).toBeNull();
  });

  it("il record costruito ha esattamente le chiavi, nell'ordine, dei record esistenti", () => {
    const open: OpenQuestion = { ...question(), cohort: "c", practiceId: "92f0a811-6199-494e-bc12-dafefe1a37b2", kind: "missing_measurement", missingDocumentType: null, payload: question().payload, pendingRequest: null };
    const built = buildAnswerRecord(open, "Bioclimatica 400x300 cm", NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(Object.keys(built.record)).toEqual(["responseId", "customerKey", "displayName", "practiceId", "receivedAt", "source", "question", "answer", "payload", "status", "supersedesResponseId", "appliedRuleIds"]);
    expect(built.record.responseId).toBe("response:crm-ombra:measure:rossella-munafo:dc3e55c0489de4e3:20260913200000");
    expect(built.record.payload).toEqual({ kind: "screening_products", products: [{ description: "Bioclimatica", quantity: 1, widthMm: 4000, heightMm: 3000 }] });
  });
});

describe("mappatura della risposta scritta", () => {
  const open = (overrides: Partial<OpenQuestion> = {}): OpenQuestion => ({ ...question(), cohort: "c", practiceId: "92f0a811-6199-494e-bc12-dafefe1a37b2", kind: "missing_measurement", missingDocumentType: null, payload: question().payload, pendingRequest: null, ...overrides });

  it("misure senza unità: rifiuta con messaggio leggibile", () => {
    expect(buildAnswerRecord(open(), "400x300", NOW)).toMatchObject({ ok: false, reason: expect.stringContaining("unità") });
    expect(buildAnswerRecord(open(), "   ", NOW)).toMatchObject({ ok: false, reason: "La risposta è vuota." });
  });

  it("misure in mm e descrizione dalla domanda quando non è il nome del cliente", () => {
    const built = buildAnswerRecord(open({ payload: { rawWidth: 1, rawHeight: 1, reportedUnit: "mm", description: "la pergotenda" } }), "5400 × 4000 mm", NOW);
    expect(built).toMatchObject({ ok: true, record: { payload: { kind: "screening_products", products: [{ description: "pergotenda", quantity: 1, widthMm: 5400, heightMm: 4000 }] } } });
  });

  it("conferma unità: usa i valori grezzi della domanda con l'unità indicata", () => {
    const unit = open({ id: "unit:ida-gigliotti:2f127e7c184cc2c5", field: "screenings.1.dimensions.unit", kind: null, payload: { rawWidth: 2500, rawHeight: 2355, reportedUnit: "cm", description: "Pergotenda" } });
    expect(buildAnswerRecord(unit, "sono millimetri", NOW)).toMatchObject({ ok: true, record: { payload: { products: [{ description: "Pergotenda", widthMm: 2500, heightMm: 2355 }] } } });
    expect(buildAnswerRecord(unit, "cm", NOW)).toMatchObject({ ok: true, record: { payload: { products: [{ widthMm: 25000, heightMm: 23550 }] } } });
  });

  it("decisione caso: registra come dato leggibile, la pratica resta in attesa operatore", () => {
    const decision = open({ id: "infissi:luca-cigognetti:x", field: "shading_closures", kind: "case_decision", prompt: "Confermi le chiusure oscuranti?", payload: null });
    const built = buildAnswerRecord(decision, "Sì, installate insieme agli infissi", NOW);
    expect(built).toMatchObject({ ok: true, note: expect.stringContaining("attesa operatore"), record: { answer: "Sì, installate insieme agli infissi", payload: { kind: "operator_required", operatorQuestion: "Confermi le chiusure oscuranti?", missingDocumentType: null } } });
  });

  it("dato mancante risposto con misure e unità: screening_products, non operator_required (caso Munafò)", () => {
    const pending = open({ id: "stop:rossella-munafo:a18c4f92a5b9caead2ecc389", field: "operator.pendingData", kind: "case_decision", prompt: "Puoi fornire il dato mancante indicato nella richiesta?", payload: null });
    expect(buildAnswerRecord(pending, "Bioclimatica 400x300 cm dal foglio manoscritto", NOW)).toMatchObject({ ok: true, note: null, record: { payload: { kind: "screening_products", products: [{ description: "Bioclimatica", widthMm: 4000, heightMm: 3000 }] } } });
    expect(buildAnswerRecord(pending, "Il foglio non è ancora arrivato", NOW)).toMatchObject({ ok: true, record: { payload: { kind: "operator_required" } } });
  });

  it("senza practiceId non registra", () => {
    expect(buildAnswerRecord(open({ practiceId: null }), "400x300 cm", NOW)).toMatchObject({ ok: false, reason: expect.stringContaining("practiceId") });
  });
});

describe("scrittura su disco con lock e hash", () => {
  let root: string;
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it("scrive il file nella forma APR, ricalcola l'hash e rilascia il lock", async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "crm-ombra-"));
    const file = operatorResponsesPath(root);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(ledgerWith([response({})]), null, 2)}\n`);
    const result = await appendResponseToLedger(file, response({ responseId: "response:test:rossella-munafo:20260913" }), NOW);
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(ledgerProblem(onDisk)).toBeNull();
    expect(onDisk.revision).toBe(2);
    expect(onDisk.responses.map((entry: OperatorResponseRecord) => entry.status)).toEqual(["superseded", "active"]);
    expect(result.supersededResponseIds).toEqual(["response:test:rossella-munafo:20260911"]);
    expect(existsSync(`${file}.lock`)).toBe(false);
    expect(readFileSync(file, "utf8").endsWith("}\n")).toBe(true);
  });

  it("se APR tiene il lock, fallisce chiuso e il file resta com'è", async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "crm-ombra-"));
    const file = operatorResponsesPath(root);
    mkdirSync(`${file}.lock`, { recursive: true });
    await expect(appendResponseToLedger(file, response({}), NOW, 200)).rejects.toThrow(/occupato/);
    expect(existsSync(file)).toBe(false);
  });

  it("legge le domande aperte da una radice sintetica", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "crm-ombra-"));
    const cohort = path.join(root, "cohorts", "apr-pilot-1-rossella-munafo");
    mkdirSync(path.join(cohort, "operator-questions"), { recursive: true });
    mkdirSync(path.join(cohort, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(cohort, "operator-questions", "checkpoint.json"), JSON.stringify(source("x", [question()]).checkpoint));
    writeFileSync(path.join(cohort, "cohort-seed", "checkpoint.json"), JSON.stringify({ candidates: source("x", []).seedCandidates }));
    expect(readOpenQuestions(root)).toMatchObject([{ id: "measure:rossella-munafo:dc3e55c0489de4e3", cohort: "apr-pilot-1-rossella-munafo", practiceId: "92f0a811-6199-494e-bc12-dafefe1a37b2" }]);
  });
});
