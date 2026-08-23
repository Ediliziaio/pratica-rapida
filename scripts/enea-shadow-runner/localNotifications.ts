import { execFile } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExecutionPlan } from "./executionPlan";
import type { PersistentAprPilotSample } from "./pilotSample";

export const APR_LOCAL_NOTIFICATIONS_VERSION = "apr-local-notifications-v1" as const;

export interface AprLocalNotificationEvent {
  key: string;
  at: string;
  title: string;
  message: string;
  severity: "info" | "attention" | "completed";
  delivery: "macos_notification_center" | "durable_inbox_only";
  deliveryError: string | null;
  appliedRuleIds: string[];
}

export interface AprLocalNotificationState {
  version: typeof APR_LOCAL_NOTIFICATIONS_VERSION;
  revision: number;
  events: AprLocalNotificationEvent[];
  processedKeys: string[];
}

export interface AprLocalNotificationSink {
  notify(title: string, message: string): Promise<void>;
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

function normalizedText(value: string, maximum: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function appleScriptString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export class MacOsNotificationCenterSink implements AprLocalNotificationSink {
  notify(title: string, message: string) {
    const script = `display notification ${appleScriptString(normalizedText(message, 240))} with title ${appleScriptString(normalizedText(title, 80))}`;
    return new Promise<void>((resolve, reject) => {
      execFile("/usr/bin/osascript", ["-e", script], { timeout: 10_000 }, (error) => error ? reject(error) : resolve());
    });
  }
}

type PilotSampleSnapshot = ReturnType<PersistentAprPilotSample["snapshot"]>;

interface PendingNotification {
  key: string;
  title: string;
  message: string;
  severity: AprLocalNotificationEvent["severity"];
  appliedRuleIds: string[];
}

export class PersistentAprLocalNotifications {
  readonly file: string;
  private observeInFlight = false;

  constructor(readonly rootDirectory: string, readonly sink: AprLocalNotificationSink = new MacOsNotificationCenterSink()) {
    this.file = path.join(path.resolve(rootDirectory), "notifications", "checkpoint.json");
  }

  initialize() {
    const existing = this.load();
    if (existing) return existing;
    const initial: AprLocalNotificationState = { version: APR_LOCAL_NOTIFICATIONS_VERSION, revision: 0, events: [], processedKeys: [] };
    writeDurable(this.file, `${JSON.stringify(initial, null, 2)}\n`);
    return initial;
  }

  load(): AprLocalNotificationState | null {
    if (!existsSync(this.file)) return null;
    try {
      const value = JSON.parse(readFileSync(this.file, "utf8")) as AprLocalNotificationState;
      return value.version === APR_LOCAL_NOTIFICATIONS_VERSION && Array.isArray(value.events) && Array.isArray(value.processedKeys) ? value : null;
    } catch { return null; }
  }

  snapshot() {
    const state = this.initialize();
    return {
      version: state.version,
      revision: state.revision,
      deliveryMode: "macos_notification_center_with_durable_inbox" as const,
      eventCount: state.events.length,
      lastEvent: state.events.at(-1) ?? null,
      recentEvents: state.events.slice(-20),
      codexRequiredForDelivery: false,
    };
  }

  private pending(plan: ExecutionPlan | null, pilot: PilotSampleSnapshot | null): PendingNotification[] {
    const result: PendingNotification[] = [];
    if (plan) {
      for (const item of plan.items.filter((candidate) => candidate.state === "blocked")) {
        result.push({
          key: `plan:${plan.id}:item:${item.id}:blocked`, title: `APR: ${item.displayName} richiede attenzione`,
          message: item.note ?? "Blocco registrato senza perdita della coda.", severity: "attention",
          appliedRuleIds: ["system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
        });
      }
      if (plan.status === "blocked_global") result.push({
        key: `plan:${plan.id}:global-block:${plan.revision}`, title: "APR: coda in attesa",
        message: plan.reason, severity: "attention", appliedRuleIds: ["system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
      });
      if (plan.status === "completed") result.push({
        key: `plan:${plan.id}:completed`, title: "APR: coda completata",
        message: `${plan.items.filter((item) => item.state === "completed").length} completate, ${plan.items.filter((item) => item.state === "blocked").length} bloccate, ${plan.items.filter((item) => item.state === "duplicate_input").length} duplicate.`,
        severity: "completed", appliedRuleIds: ["system-atomic-checkpoint-resume"],
      });
    }
    if (pilot?.status === "awaiting_candidates") result.push({
      key: `pilot:awaiting-candidates:${pilot.createdAt}`, title: "APR: servirà aprire il CRM",
      message: "APR è in attesa dell'elenco reale delle 15 pratiche. ENEA non deve ancora essere aperta.", severity: "attention",
      appliedRuleIds: ["user-2026-08-15-random-pilot-five-of-fifteen", "system-atomic-checkpoint-resume"],
    });
    if (pilot?.status === "selected") result.push({
      key: `pilot:selected:${pilot.candidateFingerprint}`, title: "APR: campione di 5 selezionato",
      message: "Le cinque pratiche sono state congelate nel checkpoint persistente; APR può preparare la coda.", severity: "info",
      appliedRuleIds: ["user-2026-08-15-random-pilot-five-of-fifteen", "system-atomic-checkpoint-resume"],
    });
    return result;
  }

  async observe(plan: ExecutionPlan | null, pilot: PilotSampleSnapshot | null, now = new Date()) {
    if (this.observeInFlight) return this.snapshot();
    this.observeInFlight = true;
    try {
      for (const pending of this.pending(plan, pilot)) {
        const before = this.initialize();
        if (before.processedKeys.includes(pending.key)) continue;
        let delivery: AprLocalNotificationEvent["delivery"] = "macos_notification_center";
        let deliveryError: string | null = null;
        try { await this.sink.notify(pending.title, pending.message); }
        catch (error) {
          delivery = "durable_inbox_only";
          deliveryError = error instanceof Error ? error.message : String(error);
        }
        const current = this.initialize();
        if (current.processedKeys.includes(pending.key)) continue;
        const event: AprLocalNotificationEvent = {
          ...pending, at: now.toISOString(), delivery, deliveryError,
        };
        const next: AprLocalNotificationState = {
          ...current, revision: current.revision + 1,
          processedKeys: [...current.processedKeys, pending.key].slice(-500),
          events: [...current.events, event].slice(-200),
        };
        writeDurable(this.file, `${JSON.stringify(next, null, 2)}\n`);
      }
      return this.snapshot();
    } finally { this.observeInFlight = false; }
  }
}
