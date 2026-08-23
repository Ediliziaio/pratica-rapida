import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The plan is the only authority that may start a long run.  Chat, the
 * dashboard and a Codex turn are observers: losing any of them must not
 * change this file or stop an already armed run.
 */
export const EXECUTION_PLAN_VERSION = "enea-local-execution-plan-v1" as const;
export type ExecutionPlanStatus = "draft" | "armed" | "running" | "paused" | "blocked_global" | "completed";

export interface ExecutionPlanItem {
  id: string;
  displayName: string;
  inputOrdinal: number;
  state: "queued" | "claimed" | "blocked" | "completed" | "duplicate_input";
  note: string | null;
}

export interface ExecutionPlan {
  version: typeof EXECUTION_PLAN_VERSION;
  revision: number;
  id: string;
  status: ExecutionPlanStatus;
  createdAt: string;
  updatedAt: string;
  executorHeartbeatAt: string | null;
  executorId: string | null;
  bridgeRequired: false;
  stopAt: "saved_draft";
  items: ExecutionPlanItem[];
  reason: string;
  processedIdempotencyKeys?: string[];
}

const EXECUTOR_LEASE_MS = 15_000;
const STORE_LOCK_STALE_MS = 10_000;
export class ExecutionPlanBusyError extends Error { constructor() { super("Piano locale occupato da un'altra transizione."); this.name = "ExecutionPlanBusyError"; } }

function writeDurable(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function validItem(item: ExecutionPlanItem) {
  return typeof item.id === "string" && item.id.length > 0
    && typeof item.displayName === "string" && item.displayName.length > 0
    && Number.isInteger(item.inputOrdinal)
    && ["queued", "claimed", "blocked", "completed", "duplicate_input"].includes(item.state);
}

function validPlan(plan: ExecutionPlan): boolean {
  return plan.version === EXECUTION_PLAN_VERSION
    && Number.isInteger(plan.revision)
    && plan.bridgeRequired === false
    && plan.stopAt === "saved_draft"
    && ["draft", "armed", "running", "paused", "blocked_global", "completed"].includes(plan.status)
    && Array.isArray(plan.items) && plan.items.every(validItem)
    && (plan.processedIdempotencyKeys === undefined || Array.isArray(plan.processedIdempotencyKeys));
}

export class PersistentExecutionPlanStore {
  readonly file: string;
  readonly lockFile: string;
  constructor(rootDirectory: string) { this.file = path.join(path.resolve(rootDirectory), "execution-plan.json"); this.lockFile = `${this.file}.lock`; }
  private withLock<T>(now: Date, action: () => T): T {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    if (existsSync(this.lockFile)) {
      try { if (now.getTime() - statSync(this.lockFile).mtimeMs > STORE_LOCK_STALE_MS) unlinkSync(this.lockFile); } catch { /* altro processo ha già risolto */ }
    }
    let descriptor: number;
    try { descriptor = openSync(this.lockFile, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ExecutionPlanBusyError(); throw error; }
    try { writeFileSync(descriptor, `${process.pid}|${now.toISOString()}\n`, "utf8"); fsyncSync(descriptor); return action(); }
    finally { closeSync(descriptor); try { unlinkSync(this.lockFile); } catch { /* lock già recuperato */ } }
  }
  load(): ExecutionPlan | null {
    if (!existsSync(this.file)) return null;
    try { const plan = JSON.parse(readFileSync(this.file, "utf8")) as ExecutionPlan; return validPlan(plan) ? plan : null; }
    catch { return null; }
  }
  create(names: readonly string[], idempotencyKey: string, now = new Date()): ExecutionPlan {
    return this.withLock(now, () => { const existing = this.load();
    if (existing?.id === idempotencyKey) return existing;
    if (existing && !["completed", "paused"].includes(existing.status)) throw new Error("Esiste già un piano locale non terminale: non sovrascrivere una coda attiva.");
    const seen = new Set<string>();
    const items = names.map((raw, inputOrdinal) => {
      const displayName = raw.trim().replace(/\s+/g, " ");
      if (!displayName) throw new Error("Nome pratica vuoto nel piano locale.");
      const key = displayName.toLocaleLowerCase("it-IT");
      const duplicate = seen.has(key); seen.add(key);
      return { id: `plan-item-${inputOrdinal + 1}-${crypto.randomUUID()}`, displayName, inputOrdinal: inputOrdinal + 1,
        state: duplicate ? "duplicate_input" as const : "queued" as const,
        note: duplicate ? "Duplicato input: nessuna seconda bozza verrà creata." : null };
    });
    const at = now.toISOString();
    const plan: ExecutionPlan = { version: EXECUTION_PLAN_VERSION, revision: 0, id: idempotencyKey, status: "draft", createdAt: at, updatedAt: at,
      executorHeartbeatAt: null, executorId: null, bridgeRequired: false, stopAt: "saved_draft", items,
      reason: "Piano locale registrato. Non è ancora armato: chat e dashboard non possono avviarlo.", processedIdempotencyKeys: [idempotencyKey] };
    writeDurable(this.file, `${JSON.stringify(plan, null, 2)}\n`);
    return plan; });
  }
  transition(idempotencyKey: string, mutate: (plan: ExecutionPlan) => void, now = new Date()) {
    return this.withLock(now, () => { const current = this.load();
    if (!current) throw new Error("Piano locale assente.");
    if (current.processedIdempotencyKeys?.includes(idempotencyKey)) return current;
    const next = structuredClone(current); next.processedIdempotencyKeys ??= []; mutate(next); next.revision += 1; next.updatedAt = now.toISOString();
    next.processedIdempotencyKeys.push(idempotencyKey);
    if (!validPlan(next)) throw new Error("Transizione piano locale non valida.");
    writeDurable(this.file, `${JSON.stringify(next, null, 2)}\n`); return next; });
  }
  arm(idempotencyKey: string, now = new Date()) { return this.transition(idempotencyKey, (plan) => {
    if (plan.status !== "draft" && plan.status !== "paused") throw new Error("Solo un piano draft/paused può essere armato.");
    plan.status = "armed"; plan.reason = "Piano armato localmente: il solo esecutore persistente può reclamarlo.";
  }, now); }
  heartbeat(executorId: string, now = new Date()) { return this.transition(`heartbeat:${executorId}:${now.getTime()}`, (plan) => {
    if (!["armed", "running"].includes(plan.status)) return;
    if (plan.status === "running" && plan.executorId && plan.executorId !== executorId && plan.executorHeartbeatAt
      && now.getTime() - Date.parse(plan.executorHeartbeatAt) <= EXECUTOR_LEASE_MS) throw new ExecutionPlanBusyError();
    plan.status = "running"; plan.executorId = executorId; plan.executorHeartbeatAt = now.toISOString();
    plan.reason = "Esecutore locale persistente attivo; il bridge chat non è nel percorso operativo.";
  }, now); }

  claimNext(executorId: string, now = new Date()) {
    return this.transition(`claim:${executorId}:${now.getTime()}`, (plan) => {
      if (plan.status !== "running" || plan.executorId !== executorId) throw new Error("Il piano può essere reclamato solo dall’esecutore che possiede il heartbeat corrente.");
      const claimed = plan.items.find((item) => item.state === "claimed");
      if (claimed) return;
      const next = plan.items.find((item) => item.state === "queued");
      if (!next) { plan.status = "completed"; plan.reason = "Tutte le pratiche del piano hanno esito persistito; nessun avvio dalla chat è previsto."; return; }
      next.state = "claimed"; next.note = `Reclamata dall’esecutore ${executorId}.`;
      plan.reason = `Esecutore locale al lavoro su ${next.displayName}; un eventuale blocco verrà registrato e la coda avanzerà.`;
    }, now);
  }

  settleClaim(executorId: string, itemId: string, outcome: "completed" | "blocked", note: string, now = new Date()) {
    if (!note.trim()) throw new Error("L’esito locale richiede una nota auditabile.");
    return this.transition(`settle:${executorId}:${itemId}:${outcome}:${now.getTime()}`, (plan) => {
      if (plan.status !== "running" || plan.executorId !== executorId) throw new Error("Esito rifiutato: esecutore non proprietario del piano.");
      const item = plan.items.find((candidate) => candidate.id === itemId);
      if (!item || item.state !== "claimed") throw new Error("Esito rifiutato: elemento non reclamato o già chiuso.");
      item.state = outcome; item.note = note.trim();
      const queued = plan.items.some((candidate) => candidate.state === "queued");
      plan.status = queued ? "running" : "completed";
      plan.reason = queued
        ? `${outcome === "blocked" ? "Blocco registrato" : "Pratica conclusa"}: l’esecutore passa automaticamente alla successiva.`
        : "Piano completato: tutti gli esiti sono persistiti localmente.";
    }, now);
  }
  blockGlobal(reason: string, now = new Date()) {
    if (!reason.trim()) throw new Error("Il blocco globale richiede un motivo.");
    return this.transition(`global-block:${now.getTime()}`, (plan) => {
      if (["draft", "completed"].includes(plan.status)) return;
      if (plan.items.some((item) => item.state === "claimed")) throw new Error("Blocco globale rifiutato: esiste una pratica reclamata senza esito persistito.");
      plan.status = "blocked_global"; plan.reason = reason.trim(); plan.executorId = null; plan.executorHeartbeatAt = null;
    }, now);
  }
  resumeGlobalBlock(now = new Date()) { return this.transition(`global-resume:${now.getTime()}`, (plan) => {
    if (plan.status !== "blocked_global") throw new Error("Solo un blocco globale verificato può essere riarmato.");
    plan.status = "armed"; plan.reason = "Gate globale nuovamente verificato: il piano è armato in attesa dell’esecutore locale.";
  }, now); }
}
