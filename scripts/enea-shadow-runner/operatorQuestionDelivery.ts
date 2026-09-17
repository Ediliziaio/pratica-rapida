import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprOperatorQuestion, AprOperatorQuestionsState } from "./operatorQuestions";

export const APR_OPERATOR_QUESTION_DELIVERY_VERSION = "apr-operator-question-delivery-v1" as const;
export interface AprOperatorQuestionDeliverySink { deliver(message: string, question: AprOperatorQuestion): Promise<void>; }
interface DeliveryRecord { questionId: string; status: "pending" | "delivered"; localArtifactPath: string; attempts: number; lastAttemptAt: string | null; deliveredAt: string | null; lastError: string | null; }
interface DeliveryState { version: typeof APR_OPERATOR_QUESTION_DELIVERY_VERSION; revision: number; destination: { kind: "local_file_and_ntfy"; ntfyUrl: string }; records: DeliveryRecord[]; }

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

class NtfyOperatorQuestionSink implements AprOperatorQuestionDeliverySink {
  constructor(readonly ntfyUrl: string) {}
  async deliver(message: string) {
    const response = await fetch(this.ntfyUrl, { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: message, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`operator_question_ntfy_http_${response.status}`);
  }
}

export class PersistentAprOperatorQuestionDelivery {
  readonly directory: string; readonly checkpointPath: string; readonly ntfyUrl: string; readonly sink: AprOperatorQuestionDeliverySink;
  constructor(rootDirectory: string, options: { ntfyUrl?: string; sink?: AprOperatorQuestionDeliverySink } = {}) {
    this.directory = path.join(path.resolve(rootDirectory), "operator-question-delivery"); this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.ntfyUrl = options.ntfyUrl ?? process.env.APR_OPERATOR_QUESTION_NTFY_URL ?? "https://ntfy.sh/apr-giuliano-x7q2m9";
    this.sink = options.sink ?? new NtfyOperatorQuestionSink(this.ntfyUrl);
  }
  load(): DeliveryState {
    if (!existsSync(this.checkpointPath)) return { version: APR_OPERATOR_QUESTION_DELIVERY_VERSION, revision: 0, destination: { kind: "local_file_and_ntfy", ntfyUrl: this.ntfyUrl }, records: [] };
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as DeliveryState;
    if (value.version !== APR_OPERATOR_QUESTION_DELIVERY_VERSION || value.destination.ntfyUrl !== this.ntfyUrl || !Array.isArray(value.records)) throw new Error("operator_question_delivery_checkpoint_invalid");
    return value;
  }
  private write(state: DeliveryState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  private message(question: AprOperatorQuestion) { return `${question.displayName}: ${question.prompt}`; }
  async deliverOpen(questions: Pick<AprOperatorQuestionsState, "questions">, now = new Date()) {
    let state = this.load();
    for (const question of questions.questions.filter((item) => item.status === "open")) {
      let record = state.records.find((item) => item.questionId === question.id);
      if (record?.status === "delivered") continue;
      const localArtifactPath = path.join(this.directory, "outbox", `${question.id.replace(/[^a-z0-9._-]/gi, "_")}.json`);
      if (!existsSync(localArtifactPath)) atomicWrite(localArtifactPath, `${JSON.stringify({ version: APR_OPERATOR_QUESTION_DELIVERY_VERSION, destination: "operator_review", crmWriteAllowed: false, question }, null, 2)}\n`);
      if (!record) {
        record = { questionId: question.id, status: "pending", localArtifactPath, attempts: 0, lastAttemptAt: null, deliveredAt: null, lastError: null };
        state = { ...state, revision: state.revision + 1, records: [...state.records, record] }; this.write(state);
      }
      try {
        await this.sink.deliver(this.message(question), question);
        state = this.load(); const current = state.records.find((item) => item.questionId === question.id)!;
        Object.assign(current, { status: "delivered", attempts: current.attempts + 1, lastAttemptAt: now.toISOString(), deliveredAt: now.toISOString(), lastError: null }); state.revision += 1; this.write(state);
      } catch (error) {
        state = this.load(); const current = state.records.find((item) => item.questionId === question.id)!;
        Object.assign(current, { attempts: current.attempts + 1, lastAttemptAt: now.toISOString(), lastError: error instanceof Error ? error.message : String(error) }); state.revision += 1; this.write(state);
      }
    }
    return this.load();
  }
}
