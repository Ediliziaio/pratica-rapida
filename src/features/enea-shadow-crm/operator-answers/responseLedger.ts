import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Ledger risposte operatore: state/operator-responses/checkpoint.json.
// La forma, l'hash e il lock sono quelli di APR (operatorResponseLedger.ts nel
// bundle canonico): se anche uno solo non torna, APR rifiuta l'intero ledger e
// si fermano tutte le pratiche, non una. Qui non si inventa niente.
export const OPERATOR_RESPONSE_LEDGER_VERSION = "apr-operator-response-ledger-v1" as const;
export const OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID = "user-2026-09-11-operator-response-runtime-consumption-v1" as const;
export const RESPONSE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{7,200}$/;

export type OperatorResponsePayload =
  | { kind: "screening_products"; products: Array<{ description: string; quantity: number; widthMm: number; heightMm: number }> }
  | { kind: "cadastral_identifiers"; sheet: string; parcel: string }
  | { kind: "old_window_characteristics"; material: "metal" | "wood" | "pvc"; glazing: "double" | "single"; appliesToCount: number }
  | { kind: "physical_product_count"; count: number }
  | { kind: "document_refresh"; documentTypes: string[] }
  | { kind: "case_disposition"; disposition: string; reason: string }
  | { kind: "operator_required"; operatorQuestion: string; missingDocumentType: string | null }
  | { kind: "general_rule_confirmation"; ruleIds: string[] };

// Ordine delle chiavi identico ai record già presenti nel file.
export interface OperatorResponseRecord {
  responseId: string;
  customerKey: string;
  displayName: string;
  practiceId: string | null;
  receivedAt: string;
  source: string;
  question: string;
  answer: string;
  payload: OperatorResponsePayload;
  status: "active" | "superseded";
  supersedesResponseId: string | null;
  appliedRuleIds: string[];
}

export interface OperatorResponseLedger {
  version: typeof OPERATOR_RESPONSE_LEDGER_VERSION;
  revision: number;
  responses: OperatorResponseRecord[];
  applications: unknown[];
  updatedAt: string;
  contentSha256: string;
}

const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

// Stesso ordine di chiavi usato da APR: JSON.stringify è sensibile all'ordine.
export function ledgerContentHash(state: Omit<OperatorResponseLedger, "contentSha256">): string {
  return sha256({ version: state.version, revision: state.revision, responses: state.responses, applications: state.applications, updatedAt: state.updatedAt });
}

export function withContentHash(state: Omit<OperatorResponseLedger, "contentSha256"> & { contentSha256?: string }): OperatorResponseLedger {
  const { contentSha256: _ignored, ...withoutHash } = state;
  return { ...withoutHash, contentSha256: ledgerContentHash(withoutHash) };
}

export function emptyLedger(now: Date): OperatorResponseLedger {
  return withContentHash({ version: OPERATOR_RESPONSE_LEDGER_VERSION, revision: 0, responses: [], applications: [], updatedAt: now.toISOString() });
}

export function ledgerProblem(value: unknown): string | null {
  const state = value as OperatorResponseLedger;
  if (!state || typeof state !== "object") return "ledger non è un oggetto";
  if (state.version !== OPERATOR_RESPONSE_LEDGER_VERSION) return `versione ledger inattesa: ${String(state.version)}`;
  if (!Number.isInteger(state.revision) || state.revision < 0) return "revision non valida";
  if (!Array.isArray(state.responses) || !Array.isArray(state.applications)) return "responses/applications non sono liste";
  if (state.contentSha256 !== ledgerContentHash(state)) return "contentSha256 non corrisponde al contenuto";
  return null;
}

export function activeResponsesFor(ledger: Pick<OperatorResponseLedger, "responses">, customerKey: string, practiceId: string | null): OperatorResponseRecord[] {
  // Stesso perimetro della proiezione di APR: stesso cliente, e pratica uguale o non indicata.
  return ledger.responses
    .filter((entry) => entry.customerKey === customerKey && entry.status === "active" && (!entry.practiceId || !practiceId || entry.practiceId === practiceId))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

export function validateResponseRecord(record: OperatorResponseRecord): string | null {
  if (!RESPONSE_ID_PATTERN.test(record.responseId)) return `responseId non ammesso: ${record.responseId}`;
  if (!record.customerKey || !record.displayName || !record.question.trim() || !record.answer.trim()) return "cliente, domanda o risposta vuoti";
  if (!Number.isFinite(Date.parse(record.receivedAt))) return "receivedAt non è una data";
  if (!record.appliedRuleIds.includes(OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID)) return "manca la regola di consumo runtime";
  if (record.status !== "active") return "una risposta nuova nasce sempre active";
  return null;
}

export interface SupersededSummary { responseId: string; kind: OperatorResponsePayload["kind"]; receivedAt: string }
export interface RecordedResponse { ledger: OperatorResponseLedger; supersededResponseIds: string[]; superseded: SupersededSummary[] }

// Pura. Regola del titolare: sulla stessa pratica vince la risposta più recente,
// la vecchia va marcata superseded. Esce con UNA sola risposta attiva per la
// pratica, oppure con un errore: mai due attive (caso Munafò).
export function recordResponse(current: OperatorResponseLedger, incoming: OperatorResponseRecord, now: Date): RecordedResponse {
  const problem = ledgerProblem(current) ?? validateResponseRecord(incoming);
  if (problem) throw new Error(problem);
  if (current.responses.some((entry) => entry.responseId === incoming.responseId)) throw new Error(`responseId già presente: ${incoming.responseId}`);

  const next = structuredClone(current) as OperatorResponseLedger;
  const previous = activeResponsesFor(next, incoming.customerKey, incoming.practiceId);
  for (const entry of previous) entry.status = "superseded";
  const record: OperatorResponseRecord = { ...incoming, status: "active", supersedesResponseId: previous.at(-1)?.responseId ?? null };
  next.responses.push(record);
  next.revision += 1;
  next.updatedAt = now.toISOString();

  const stillActive = activeResponsesFor(next, incoming.customerKey, incoming.practiceId);
  if (stillActive.length !== 1 || stillActive[0].responseId !== record.responseId) throw new Error(`invariante violata: ${stillActive.length} risposte attive per ${incoming.customerKey}`);
  return {
    ledger: withContentHash(next),
    supersededResponseIds: previous.map((entry) => entry.responseId),
    superseded: previous.map((entry) => ({ responseId: entry.responseId, kind: entry.payload.kind, receivedAt: entry.receivedAt })),
  };
}

export function readLedger(file: string, now: Date): OperatorResponseLedger {
  if (!existsSync(file)) return emptyLedger(now);
  const value = JSON.parse(readFileSync(file, "utf8"));
  const problem = ledgerProblem(value);
  if (problem) throw new Error(`ledger su disco non valido, non scrivo: ${problem}`);
  return value as OperatorResponseLedger;
}

function atomicWrite(target: string, contents: string): void {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Lo stesso lock a directory di APR (`checkpoint.json.lock`): se APR sta
// scrivendo, aspettiamo; se non si libera, fallisce chiuso e il file resta com'è.
async function withLedgerLock<T>(file: string, work: () => T, timeoutMs = 5000, pollMs = 20): Promise<T> {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lockPath = `${file}.lock`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { mkdirSync(lockPath, { mode: 0o700 }); break; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("ledger occupato da APR: riprova tra qualche secondo");
      await sleep(pollMs);
    }
  }
  try { return work(); } finally { rmdirSync(lockPath); }
}

export async function appendResponseToLedger(file: string, incoming: OperatorResponseRecord, now = new Date(), lockWaitTimeoutMs = 5000): Promise<RecordedResponse> {
  return withLedgerLock(file, () => {
    const result = recordResponse(readLedger(file, now), incoming, now);
    atomicWrite(file, `${JSON.stringify(result.ledger, null, 2)}\n`);
    return result;
  }, lockWaitTimeoutMs);
}
