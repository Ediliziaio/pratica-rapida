import { PersistentExecutionPlanStore, type ExecutionPlan, type ExecutionPlanItem } from "./executionPlan";

export type LocalExecutionOutcome = { state: "completed" | "blocked"; note: string };
export type LocalExecutionHandler = (item: Readonly<ExecutionPlanItem>) => Promise<LocalExecutionOutcome> | LocalExecutionOutcome;
export type LocalExecutionGate = () => { allowed: boolean; reason: string };
export type LocalExecutionErrorHandler = (error: unknown) => void;
export type LocalExecutionObserver = (plan: ExecutionPlan | null) => void;

/**
 * Durable queue driver. It knows nothing about ChatGPT or a Codex task; the
 * caller injects the local browser/preflight implementation when that adapter
 * is verified. A handler failure becomes a recorded item block, never an
 * untracked stop of the complete plan.
 */
export class AutonomousExecutionLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickInFlight = false;
  constructor(
    readonly store: PersistentExecutionPlanStore,
    readonly executorId: string,
    readonly handler: LocalExecutionHandler,
    readonly intervalMs = 5_000,
    readonly gate: LocalExecutionGate = () => ({ allowed: true, reason: "Gate locale disponibile." }),
    readonly onError: LocalExecutionErrorHandler = (error) => {
      process.stderr.write(`APR_EXECUTOR_ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    },
    readonly onTransition: LocalExecutionObserver = () => undefined,
  ) {
    if (!executorId.trim()) throw new Error("Identità esecutore locale obbligatoria.");
    if (!Number.isFinite(intervalMs) || intervalMs < 100) throw new Error("Intervallo esecutore non valido.");
  }

  async tick(now = new Date()) {
    const before = this.store.load();
    const gate = this.gate();
    if (!before || ["draft", "paused", "completed"].includes(before.status)) return before;
    if (before.status === "blocked_global") {
      if (!gate.allowed) return before;
      this.store.resumeGlobalBlock(now);
      return this.store.load();
    }
    if (!gate.allowed) return this.store.blockGlobal(`Blocco tecnico globale: ${gate.reason}`, now);
    this.store.heartbeat(this.executorId, now);
    const claimed = this.store.claimNext(this.executorId, now);
    const item = claimed.items.find((candidate) => candidate.state === "claimed");
    if (!item) return claimed;
    try {
      const outcome = await this.handler(structuredClone(item));
      return this.store.settleClaim(this.executorId, item.id, outcome.state, outcome.note, new Date());
    } catch (error) {
      const note = `Errore locale registrato: ${error instanceof Error ? error.message : String(error)}`;
      return this.store.settleClaim(this.executorId, item.id, "blocked", note, new Date());
    }
  }

  private async scheduledTick() {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try { this.onTransition(await this.tick()); }
    catch (error) { this.onError(error); }
    finally { this.tickInFlight = false; }
  }

  start() {
    if (this.timer) return;
    void this.scheduledTick();
    this.timer = setInterval(() => { void this.scheduledTick(); }, this.intervalMs);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
