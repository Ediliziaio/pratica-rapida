import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APR_SHADOW_AUDIT_RULE_IDS,
  APR_SHADOW_OPERATING_MODEL_VERSION,
  aprShadowOperatingPlanSnapshot,
  buildAprShadowDailyReport,
  buildAprShadowMetrics,
  compareAprShadowCase,
  type AprProductModule,
  type AprShadowCaseInput,
  type AprShadowFieldValue,
  type AprShadowTerminalResult,
} from "../../src/features/enea-shadow-crm/shadowOperatingModel";

export const APR_SHADOW_COMPARISON_STORE_VERSION = "apr-shadow-comparison-store-v1" as const;

export interface AprShadowStoreAuditEvent {
  revision: number;
  at: string;
  type: "initialized" | "apr_result_sealed" | "apr_result_deduplicated" | "human_result_released" | "human_result_deduplicated" | "daily_report_generated";
  caseId: string | null;
  commandId: string | null;
  reason: string;
  appliedRuleIds: readonly string[];
}

export interface AprShadowComparisonCheckpoint {
  version: typeof APR_SHADOW_COMPARISON_STORE_VERSION;
  modelVersion: typeof APR_SHADOW_OPERATING_MODEL_VERSION;
  revision: number;
  items: AprShadowCaseInput[];
  processedCommandIds: string[];
  externalMutationAllowed: false;
  eneaSubmitAllowed: false;
  productionAuthorized: false;
  audit: AprShadowStoreAuditEvent[];
}

export interface RecordAprShadowResultInput {
  caseId: string;
  displayName: string;
  product: AprProductModule;
  receivedAt: string;
  originalSources: readonly AprShadowFieldValue[];
  result: AprShadowTerminalResult;
  commandId: string;
}

export interface RecordHumanProductionResultInput {
  caseId: string;
  result: AprShadowTerminalResult;
  commandId: string;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprShadowComparisonCheckpoint {
  return {
    version: APR_SHADOW_COMPARISON_STORE_VERSION,
    modelVersion: APR_SHADOW_OPERATING_MODEL_VERSION,
    revision: 0,
    items: [],
    processedCommandIds: [],
    externalMutationAllowed: false,
    eneaSubmitAllowed: false,
    productionAuthorized: false,
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", caseId: null, commandId: null, reason: "Registro shadow inizializzato: APR e produzione umana restano separati fino al sigillo del risultato APR.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
  };
}

function validState(value: AprShadowComparisonCheckpoint) {
  return value.version === APR_SHADOW_COMPARISON_STORE_VERSION
    && value.modelVersion === APR_SHADOW_OPERATING_MODEL_VERSION
    && value.externalMutationAllowed === false
    && value.eneaSubmitAllowed === false
    && value.productionAuthorized === false
    && Number.isInteger(value.revision)
    && Array.isArray(value.items)
    && Array.isArray(value.processedCommandIds)
    && Array.isArray(value.audit);
}

export class PersistentAprShadowComparison {
  readonly directory: string;
  readonly checkpointFile: string;
  readonly reportsDirectory: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "shadow-comparison");
    this.checkpointFile = path.join(this.directory, "checkpoint.json");
    this.reportsDirectory = path.join(this.directory, "daily-reports");
  }

  initialize(now = new Date()) {
    const current = this.load();
    if (current) return current;
    const state = initialState(now);
    this.save(state);
    return state;
  }

  load(): AprShadowComparisonCheckpoint | null {
    if (!existsSync(this.checkpointFile)) return null;
    try {
      const value = JSON.parse(readFileSync(this.checkpointFile, "utf8")) as AprShadowComparisonCheckpoint;
      return validState(value) ? value : null;
    } catch { return null; }
  }

  private save(state: AprShadowComparisonCheckpoint) {
    atomicWrite(this.checkpointFile, `${JSON.stringify(state, null, 2)}\n`);
  }

  recordAprResult(input: RecordAprShadowResultInput, now = new Date()) {
    if (input.result.actor !== "APR") throw new Error("shadow_apr_actor_invalid");
    if (!input.commandId.trim()) throw new Error("shadow_command_id_required");
    const state = this.initialize(now);
    const existing = state.items.find((item) => item.caseId === input.caseId);
    if (state.processedCommandIds.includes(input.commandId)) return state;
    if (existing) {
      if (existing.apr.resultFingerprint !== input.result.resultFingerprint) throw new Error("shadow_apr_result_immutable");
      const next: AprShadowComparisonCheckpoint = {
        ...state,
        revision: state.revision + 1,
        processedCommandIds: [...state.processedCommandIds, input.commandId],
        audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "apr_result_deduplicated", caseId: input.caseId, commandId: input.commandId, reason: "Risultato APR gia sigillato con la stessa impronta; nessuna duplicazione.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
      };
      this.save(next);
      return next;
    }
    const item: AprShadowCaseInput = { caseId: input.caseId, displayName: input.displayName, product: input.product, receivedAt: input.receivedAt, apr: input.result, human: null, originalSources: [...input.originalSources], aprHumanResultAccessedAt: null };
    compareAprShadowCase(item);
    const next: AprShadowComparisonCheckpoint = {
      ...state,
      revision: state.revision + 1,
      items: [...state.items, item],
      processedCommandIds: [...state.processedCommandIds, input.commandId],
      audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "apr_result_sealed", caseId: input.caseId, commandId: input.commandId, reason: `Risultato APR ${input.result.state} sigillato prima di rendere disponibile il risultato umano.`, appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
    };
    this.save(next);
    return next;
  }

  recordHumanResult(input: RecordHumanProductionResultInput, now = new Date()) {
    if (input.result.actor !== "MATTEO") throw new Error("shadow_human_actor_invalid");
    if (!input.commandId.trim()) throw new Error("shadow_command_id_required");
    const state = this.initialize(now);
    if (state.processedCommandIds.includes(input.commandId)) return state;
    const index = state.items.findIndex((item) => item.caseId === input.caseId);
    if (index < 0) throw new Error("shadow_apr_result_must_be_sealed_first");
    const current = state.items[index];
    if (current.human) {
      if (current.human.resultFingerprint !== input.result.resultFingerprint) throw new Error("shadow_human_result_immutable");
      const next: AprShadowComparisonCheckpoint = {
        ...state,
        revision: state.revision + 1,
        processedCommandIds: [...state.processedCommandIds, input.commandId],
        audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "human_result_deduplicated", caseId: input.caseId, commandId: input.commandId, reason: "Risultato umano gia rilasciato con la stessa impronta; nessuna duplicazione.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
      };
      this.save(next);
      return next;
    }
    const released = { ...input.result, sealedAt: now.toISOString() };
    const updated = { ...current, human: released } satisfies AprShadowCaseInput;
    compareAprShadowCase(updated);
    const items = [...state.items];
    items[index] = updated;
    const next: AprShadowComparisonCheckpoint = {
      ...state,
      revision: state.revision + 1,
      items,
      processedCommandIds: [...state.processedCommandIds, input.commandId],
      audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "human_result_released", caseId: input.caseId, commandId: input.commandId, reason: "Risultato umano reso disponibile al comparatore soltanto dopo il sigillo APR.", appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
    };
    this.save(next);
    return next;
  }

  runScheduledDailyReport(now = new Date(), scheduleHourEuropeRome = 19) {
    if (!Number.isInteger(scheduleHourEuropeRome) || scheduleHourEuropeRome < 0 || scheduleHourEuropeRome > 23) throw new Error("shadow_daily_schedule_hour_invalid");
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const reportDate = `${part("year")}-${part("month")}-${part("day")}`;
    const localHour = Number(part("hour"));
    if (localHour < scheduleHourEuropeRome) return { status: "waiting_schedule" as const, reportDate, schedule: `${String(scheduleHourEuropeRome).padStart(2, "0")}:00 Europe/Rome`, reportPath: null };
    const reportPath = path.join(this.reportsDirectory, `${reportDate}.json`);
    if (existsSync(reportPath)) return { status: "already_generated" as const, reportDate, schedule: `${String(scheduleHourEuropeRome).padStart(2, "0")}:00 Europe/Rome`, reportPath };
    const state = this.initialize(now);
    const report = buildAprShadowDailyReport(state.items, now);
    atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const next: AprShadowComparisonCheckpoint = {
      ...state,
      revision: state.revision + 1,
      audit: [...state.audit, { revision: state.revision + 1, at: now.toISOString(), type: "daily_report_generated", caseId: null, commandId: `shadow-daily:${reportDate}`, reason: `Report shadow giornaliero ${reportDate} generato automaticamente alle ${String(scheduleHourEuropeRome).padStart(2, "0")}:00 Europe/Rome.`, appliedRuleIds: APR_SHADOW_AUDIT_RULE_IDS }],
    };
    this.save(next);
    return { status: "generated" as const, reportDate, schedule: `${String(scheduleHourEuropeRome).padStart(2, "0")}:00 Europe/Rome`, reportPath };
  }

  snapshot(now = new Date()) {
    const state = this.load() ?? this.initialize(now);
    const comparisons = state.items.map(compareAprShadowCase);
    const cumulative = buildAprShadowMetrics(state.items, comparisons);
    const rollingInputs = (size: number) => state.items.slice(-size);
    const metricsFor = (items: AprShadowCaseInput[]) => buildAprShadowMetrics(items, items.map(compareAprShadowCase));
    const rolling50 = metricsFor(rollingInputs(50));
    const rolling100 = metricsFor(rollingInputs(100));
    const plan = aprShadowOperatingPlanSnapshot();
    const sampleSufficient = cumulative.totalPractices >= plan.targetSample.minimum;
    const blockerStable = rolling100.totalPractices >= 100 && rolling100.blockerRate < plan.readinessTargets.blockerRateMaximum;
    const noUndetectedCritical = cumulative.undetectedCriticalDifferenceCount === 0;
    const persistedReports = existsSync(this.reportsDirectory) ? readdirSync(this.reportsDirectory).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort() : [];
    return {
      ...state,
      status: state.items.length ? "collecting_shadow_evidence" as const : "awaiting_shadow_cases" as const,
      currentPhase: plan.currentPhase,
      comparisons,
      dailyReport: buildAprShadowDailyReport(state.items, now),
      cumulative,
      rolling50,
      rolling100,
      promotionGate: {
        shadowToAssistedCandidate: sampleSufficient && blockerStable && noUndetectedCritical,
        sampleSufficient,
        blockerStable,
        noUndetectedCritical,
        productionAuthorized: false as const,
        reason: !sampleSufficient ? `Campione insufficiente: ${cumulative.totalPractices}/${plan.targetSample.minimum}.` : !blockerStable ? "Blocker rate rolling-100 non ancora stabilmente sotto il 15%." : !noUndetectedCritical ? "Esistono differenze critiche non intercettate." : "Candidato al gate ASSISTED; la produzione richiede comunque una futura autorizzazione esplicita.",
      },
      dailySchedule: "19:00 Europe/Rome" as const,
      persistedDailyReportCount: persistedReports.length,
      latestPersistedDailyReport: persistedReports.at(-1) ?? null,
      plan,
      observedAt: now.toISOString(),
      lastEvent: state.audit.at(-1)!,
    };
  }
}
