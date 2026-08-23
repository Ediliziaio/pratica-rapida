import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_SHADOW_AUDIT_RULE_IDS } from "../../src/features/enea-shadow-crm/shadowOperatingModel";

export const APR_SHADOW_CONTROL_VERSION = "apr-shadow-control-v1" as const;

export interface AprShadowControlState {
  version: typeof APR_SHADOW_CONTROL_VERSION;
  revision: number;
  status: "stopped" | "armed" | "paused";
  intakeAllowed: boolean;
  startedAt: string | null;
  pausedAt: string | null;
  externalMutationAllowed: false;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  processedCommandIds: string[];
  reason: string;
  nextAction: string;
  audit: Array<{ revision: number; at: string; type: "initialized" | "shadow_armed" | "shadow_paused"; commandId: string | null; reason: string; appliedRuleIds: readonly string[] }>;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

function initialState(now: Date): AprShadowControlState {
  return {
    version: APR_SHADOW_CONTROL_VERSION,
    revision: 0,
    status: "stopped",
    intakeAllowed: false,
    startedAt: null,
    pausedAt: null,
    externalMutationAllowed: false,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    processedCommandIds: [],
    reason: "APR SHADOW installato ma non ancora avviato dall'utente.",
    nextAction: "Premere Avvia APR quando si desidera acquisire le nuove pratiche dalla pipeline Pronte da fare.",
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", commandId: null, reason: "Gate di presa in carico inizializzato chiuso.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
  };
}

export class PersistentAprShadowControl {
  readonly directory: string;
  readonly checkpointFile: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "shadow-control");
    this.checkpointFile = path.join(this.directory, "checkpoint.json");
  }

  initialize(now = new Date()) {
    const current = this.load();
    if (current) return current;
    const state = initialState(now);
    this.save(state);
    return state;
  }

  load(): AprShadowControlState | null {
    if (!existsSync(this.checkpointFile)) return null;
    try {
      const state = JSON.parse(readFileSync(this.checkpointFile, "utf8")) as AprShadowControlState;
      return state.version === APR_SHADOW_CONTROL_VERSION
        && state.externalMutationAllowed === false
        && state.previewAllowed === false
        && state.submitAllowed === false
        && state.communicationsAllowed === false
        && Array.isArray(state.audit)
        && Array.isArray(state.processedCommandIds)
        ? state : null;
    } catch { return null; }
  }

  private save(state: AprShadowControlState) {
    atomicWrite(this.checkpointFile, `${JSON.stringify(state, null, 2)}\n`);
  }

  arm(commandId: string, now = new Date()) {
    if (!commandId.trim()) throw new Error("shadow_control_command_required");
    const state = this.initialize(now);
    if (state.processedCommandIds.includes(commandId)) return state;
    const next: AprShadowControlState = {
      ...state,
      revision: state.revision + 1,
      status: "armed",
      intakeAllowed: true,
      startedAt: state.startedAt ?? now.toISOString(),
      pausedAt: null,
      processedCommandIds: [...state.processedCommandIds, commandId],
      reason: "APR SHADOW attivo: nuove pratiche ENEA in Pronte da fare possono essere prese in carico una alla volta.",
      nextAction: "Attendere nuove pratiche; i blocker vengono isolati e la coda prosegue.",
      audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "shadow_armed", commandId, reason: "Presa in carico SHADOW autorizzata; invio e produzione restano vietati.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
    };
    this.save(next);
    return next;
  }

  pause(commandId: string, now = new Date()) {
    if (!commandId.trim()) throw new Error("shadow_control_command_required");
    const state = this.initialize(now);
    if (state.processedCommandIds.includes(commandId)) return state;
    const next: AprShadowControlState = {
      ...state,
      revision: state.revision + 1,
      status: "paused",
      intakeAllowed: false,
      pausedAt: now.toISOString(),
      processedCommandIds: [...state.processedCommandIds, commandId],
      reason: "Nuove prese in carico SHADOW sospese; checkpoint e risultati esistenti restano conservati.",
      nextAction: "Premere Riprendi APR per acquisire nuove pratiche dalla pipeline.",
      audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "shadow_paused", commandId, reason: "Nuove prese in carico sospese senza cancellare coda, risultati o confronti.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
    };
    this.save(next);
    return next;
  }

  snapshot(now = new Date()) {
    const state = this.load() ?? this.initialize(now);
    return { ...state, observedAt: now.toISOString(), lastEvent: state.audit.at(-1)! };
  }
}
