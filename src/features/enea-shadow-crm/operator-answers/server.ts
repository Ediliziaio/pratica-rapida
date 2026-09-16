import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAnswerRecord } from "./answerRecord.ts";
import { readCurrentRun } from "./currentRun.ts";
import { isPendingDataQuestion, readOpenQuestions, type OpenQuestion } from "./openQuestions.ts";
import { RUNNER_ROOT, operatorResponsesPath } from "./paths.ts";
import { activeResponsesFor, appendResponseToLedger, readLedger } from "./responseLedger.ts";

// CRM ombra, vista sui dati di APR. Ascolta SOLO su 127.0.0.1, legge SOLO file
// locali sotto RUNNER_ROOT, scrive SOLO il ledger risposte. Nessuna richiesta
// in uscita verso alcun host: qui non esiste fetch, non esistono credenziali.
//
//   node src/features/enea-shadow-crm/operator-answers/server.ts
//   CRM_OMBRA_PORT=8790 CRM_OMBRA_ROOT=/altra/radice node ...

const HOST = "127.0.0.1";
const PORT = Number(process.env.CRM_OMBRA_PORT ?? 8790);
const ROOT = process.env.CRM_OMBRA_ROOT ?? RUNNER_ROOT;
const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "page.html");

const jsonBase = (response: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders });
  response.end(`${JSON.stringify(body)}\n`);
};

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error("body troppo grande");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Possono leggere e scrivere solo la pagina servita da qui e l'app CRM ombra
// in esecuzione su questo Mac (loopback, qualunque porta). Nessun'altra
// origine può registrare risposte a nome di Giuliano.
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return !origin || LOOPBACK_ORIGIN.test(origin);
}
function corsHeaders(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin || !LOOPBACK_ORIGIN.test(origin)) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" };
}

// Per le domande "dato mancante" la pagina deve dire QUALE dato: è la richiesta
// operator_required ancora attiva nel ledger per quel cliente. Sola lettura.
function withPendingRequests(questions: OpenQuestion[], now: Date): OpenQuestion[] {
  if (!questions.some(isPendingDataQuestion)) return questions;
  let ledger;
  try { ledger = readLedger(operatorResponsesPath(ROOT), now); } catch { return questions; }
  return questions.map((question) => {
    if (!isPendingDataQuestion(question)) return question;
    const pending = activeResponsesFor(ledger, question.customerKey, question.practiceId).filter((entry) => entry.payload.kind === "operator_required").at(-1);
    if (!pending || pending.payload.kind !== "operator_required") return question;
    return { ...question, pendingRequest: { responseId: pending.responseId, requestedAt: pending.receivedAt, question: pending.payload.operatorQuestion, missingDocumentType: pending.payload.missingDocumentType, previousAnswer: pending.answer } };
  });
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const cors = corsHeaders(request);
  const json = (response: ServerResponse, status: number, body: unknown) => jsonBase(response, status, body, cors);

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(readFileSync(PAGE, "utf8"));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/open-questions") {
    // Solo il giro corrente. Senza un run leggibile la lista è vuota, non "tutto".
    const run = readCurrentRun(ROOT);
    const now = new Date();
    const questions = run ? withPendingRequests(readOpenQuestions(ROOT, run.cohorts), now) : [];
    json(response, 200, { root: ROOT, readAt: now.toISOString(), run, count: questions.length, questions });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/answers") {
    if (!sameOrigin(request)) return json(response, 403, { ok: false, reason: "origine non ammessa" });
    let input: { questionId?: unknown; answer?: unknown };
    try { input = JSON.parse(await readBody(request)); } catch { return json(response, 400, { ok: false, reason: "JSON non valido" }); }
    if (typeof input.questionId !== "string" || typeof input.answer !== "string") return json(response, 400, { ok: false, reason: "servono questionId e answer" });

    // La domanda viene riletta da disco: il browser non decide cliente né pratica.
    const run = readCurrentRun(ROOT);
    const question = run ? readOpenQuestions(ROOT, run.cohorts).find((item) => item.id === input.questionId) : undefined;
    if (!question) return json(response, 404, { ok: false, reason: "domanda non più aperta o inesistente" });

    const now = new Date();
    const built = buildAnswerRecord(question, input.answer, now);
    if (!built.ok) return json(response, 422, built);
    try {
      const written = await appendResponseToLedger(operatorResponsesPath(ROOT), built.record, now);
      // Segnalazione voluta dal titolare: se la nuova risposta ha superato una
      // conferma di regola generale, la pagina lo deve dire in modo visibile.
      const supersededRuleConfirmations = written.superseded.filter((entry) => entry.kind === "general_rule_confirmation");
      return json(response, 200, { ok: true, responseId: built.record.responseId, supersededResponseIds: written.supersededResponseIds, superseded: written.superseded, supersededRuleConfirmations, revision: written.ledger.revision, note: built.note });
    } catch (error) {
      return json(response, 409, { ok: false, reason: (error as Error).message });
    }
  }

  json(response, 404, { ok: false, reason: "non trovato" });
}

createServer((request, response) => {
  handle(request, response).catch((error: Error) => jsonBase(response, 500, { ok: false, reason: error.message }));
}).listen(PORT, HOST, () => {
  console.log(`CRM ombra su http://${HOST}:${PORT}  (radice: ${ROOT})`);
});
