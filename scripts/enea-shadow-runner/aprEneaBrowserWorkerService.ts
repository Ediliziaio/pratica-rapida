import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateAprEneaServerReadOnlyProbe } from "./aprEneaServerReadOnlyProbe";
import { PersistentAprEneaOperationalBridge } from "./aprEneaOperationalBridge";
import { reconcileStoppedAprEneaBrowserWorkerCheckpoint } from "./aprEneaBrowserWorker";

export const APR_ENEA_WORKER_SERVICE_VERSION = "apr-enea-worker-service-v1" as const;
export const APR_ENEA_EMERGENCY_STOP_VERSION = "apr-enea-emergency-stop-v1" as const;

export interface AprEneaEmergencyStopReceipt {
  version: typeof APR_ENEA_EMERGENCY_STOP_VERSION;
  commandId: string;
  requestedAt: string;
  targetPid: number | null;
  heartbeatAgeMs: number | null;
  signalOutcome: "sigterm_sent" | "process_not_running" | "stale_process_not_signalled";
  setupEnabled: false;
  operationalEnabled: false;
  reason: string;
  appliedRuleIds: string[];
}

export function isAprEneaKeepaliveDue(input: {
  lastKeepaliveAt: string | null;
  keepaliveIntervalMs: number;
  now?: Date;
}) {
  if (!input.lastKeepaliveAt) return true;
  const lastKeepaliveMs = Date.parse(input.lastKeepaliveAt);
  if (!Number.isFinite(lastKeepaliveMs)) return true;
  return (input.now ?? new Date()).getTime() - lastKeepaliveMs >= input.keepaliveIntervalMs;
}

export function aprEneaKeepaliveInterval(input: {
  configuredIntervalMs: number;
  serviceStatus: AprEneaWorkerServiceState["status"];
  lastAuditType: string | null;
}) {
  return input.serviceStatus === "login_required" || (input.serviceStatus === "technical_block" && input.lastAuditType === "keepalive_inconclusive")
    ? 30_000
    : input.configuredIntervalMs;
}

export function shouldHoldAprEneaKeepaliveState(input: {
  keepaliveDue: boolean;
  serviceStatus: AprEneaWorkerServiceState["status"];
  lastAuditType: string | null;
}) {
  return !input.keepaliveDue && (input.serviceStatus === "login_required" || (input.serviceStatus === "technical_block" && input.lastAuditType === "keepalive_inconclusive"));
}

export function aprEneaWorkerLoopFailureDisposition(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  if (reason === "apr_cdp_enea_external_login_in_progress") {
    return {
      status: "login_required" as const,
      type: "external_login_in_progress",
      reason: "Autenticazione SPID in corso nella scheda esistente: APR sospende i controlli ENEA senza pubblicare un falso blocco tecnico.",
      nextAction: "Completare SPID nella stessa scheda; APR riprenderà automaticamente dopo il ritorno al dominio ENEA.",
    };
  }
  return {
    status: "technical_block" as const,
    type: "technical_block",
    reason,
    nextAction: "Il servizio ritenterà soltanto operazioni idempotenti; nessun submit o retry mutativo alla cieca.",
  };
}

export interface AprEneaWorkerConfig {
  version: typeof APR_ENEA_WORKER_SERVICE_VERSION;
  setupEnabled: boolean;
  operationalEnabled: boolean;
  chromeExecutable: string;
  profileDirectory: string;
  remoteDebuggingPort: number;
  keepaliveIntervalMs: number;
  autoArmWhenReady: true;
  allowedOrigin: "https://bonusfiscali.enea.it";
  dashboardUrl: "https://bonusfiscali.enea.it/";
  minimumConsecutiveCases: 2;
  previewAllowed: false;
  submitAllowed: false;
  communicationsAllowed: false;
  authorizationId: string;
  updatedAt: string;
}

export interface AprEneaWorkerServiceState {
  version: typeof APR_ENEA_WORKER_SERVICE_VERSION;
  revision: number;
  status: "disabled" | "starting_browser" | "login_required" | "setup_ready" | "idle" | "running" | "completed" | "technical_block" | "stopped";
  instanceId: string;
  processPid: number;
  heartbeatAt: string;
  chromePid: number | null;
  profileFingerprint: string | null;
  sessionEvidenceId: string | null;
  workerRevision: number | null;
  cdpConnections: { active: number; opened: number; closed: number; targetIds: string[]; observedAt: string };
  reason: string;
  nextAction: string;
  forbiddenActionCount: 0;
  previewAttemptCount: 0;
  submitAttemptCount: 0;
  communicationAttemptCount: 0;
  audit: Array<{ revision: number; at: string; type: string; reason: string; appliedRuleIds: string[] }>;
}

export interface AprEneaMinimumQueueGateState {
  version: "apr-enea-minimum-queue-gate-v1";
  revision: number;
  status: "waiting" | "ready" | "armed";
  observedAt: string;
  runnableCount: number;
  cohortCount: number;
  isolatedCount: number;
  minimumRequired: number;
  domContractReady: boolean;
  serverReadOnlyProbeReady: boolean;
  repeatDeletionReady: boolean;
  ciottaExcluded: boolean;
  executionSafetyReady: boolean;
  verifiedMapperBridgeReady: boolean;
  reason: string;
  nextAction: string;
  appliedRuleIds: string[];
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

const RULE_IDS = [
  "authorized-19-test-stop-at-saved-draft",
  "authorized-27-enea-session-readonly-keepalive",
  "system-atomic-checkpoint-resume",
  "system-single-active-practice",
  "system-verified-mapper-bridge-before-autoarm",
  "system-public-state-process-liveness",
];

export class PersistentAprEneaWorkerService {
  readonly directory: string;
  readonly configPath: string;
  readonly statePath: string;
  readonly queueGatePath: string;
  readonly emergencyStopPath: string;
  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "enea-browser-worker");
    this.configPath = path.join(this.directory, "config.json");
    this.statePath = path.join(this.directory, "service.json");
    this.queueGatePath = path.join(this.directory, "minimum-queue-gate.json");
    this.emergencyStopPath = path.join(this.directory, "emergency-stop.json");
  }

  private recordQueueGate(input: Omit<AprEneaMinimumQueueGateState, "version" | "revision" | "observedAt" | "appliedRuleIds">, now: Date) {
    let previous: AprEneaMinimumQueueGateState | null = null;
    try { previous = JSON.parse(readFileSync(this.queueGatePath, "utf8")) as AprEneaMinimumQueueGateState; } catch { /* primo checkpoint */ }
    const materiallyChanged = !previous || (Object.keys(input) as Array<keyof typeof input>).some((key) => previous?.[key] !== input[key]);
    const next: AprEneaMinimumQueueGateState = {
      version: "apr-enea-minimum-queue-gate-v1",
      revision: (previous?.revision ?? 0) + (materiallyChanged ? 1 : 0),
      observedAt: now.toISOString(),
      ...input,
      appliedRuleIds: [...RULE_IDS, "system-readonly-adapter-contract", "system-operator-block-fail-closed"],
    };
    atomicWrite(this.queueGatePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  private defaultConfig(now: Date): AprEneaWorkerConfig {
    return { version: APR_ENEA_WORKER_SERVICE_VERSION, setupEnabled: false, operationalEnabled: false, chromeExecutable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", profileDirectory: path.join(this.directory, "chrome-profile"), remoteDebuggingPort: 9331, keepaliveIntervalMs: 240_000, autoArmWhenReady: true, allowedOrigin: "https://bonusfiscali.enea.it", dashboardUrl: "https://bonusfiscali.enea.it/", minimumConsecutiveCases: 2, previewAllowed: false, submitAllowed: false, communicationsAllowed: false, authorizationId: "user-autonomous-apr-multi-case-2026-08-15", updatedAt: now.toISOString() };
  }

  loadConfig(now = new Date()) {
    if (!existsSync(this.configPath)) { const value = this.defaultConfig(now); atomicWrite(this.configPath, `${JSON.stringify(value, null, 2)}\n`); return value; }
    const value = JSON.parse(readFileSync(this.configPath, "utf8")) as AprEneaWorkerConfig;
    const requiresMigration = value.keepaliveIntervalMs == null || value.autoArmWhenReady == null;
    value.keepaliveIntervalMs ??= 240_000;
    value.autoArmWhenReady ??= true;
    if (value.version !== APR_ENEA_WORKER_SERVICE_VERSION || value.allowedOrigin !== "https://bonusfiscali.enea.it" || value.dashboardUrl !== "https://bonusfiscali.enea.it/" || value.minimumConsecutiveCases < 2 || value.keepaliveIntervalMs < 60_000 || value.keepaliveIntervalMs > 600_000 || value.autoArmWhenReady !== true || value.previewAllowed !== false || value.submitAllowed !== false || value.communicationsAllowed !== false || !path.isAbsolute(value.chromeExecutable) || !path.isAbsolute(value.profileDirectory)) throw new Error("apr_enea_worker_config_invalid");
    if (requiresMigration) atomicWrite(this.configPath, `${JSON.stringify(value, null, 2)}\n`);
    return value;
  }

  configure(input: Partial<Pick<AprEneaWorkerConfig, "setupEnabled" | "operationalEnabled" | "chromeExecutable" | "profileDirectory" | "remoteDebuggingPort" | "authorizationId">>, now = new Date()) {
    const current = this.loadConfig(now); const next = { ...current, ...input, updatedAt: now.toISOString() };
    if (!next.authorizationId.trim()) throw new Error("apr_enea_worker_authorization_invalid");
    if (next.operationalEnabled && !next.setupEnabled) throw new Error("apr_enea_worker_operational_requires_setup");
    if (next.operationalEnabled) {
      const service = this.loadState(now);
      let driver: { contract?: { ready?: boolean } | null } = {}; let execution: { currentCustomerKey?: string | null; items?: Array<{ customerKey?: string; state?: string; draftId?: string | null; createAttemptCount?: number; saveAttemptCount?: number; completedPageIds?: string[]; pageCheckpoints?: Array<{ pageId?: string; state?: string; saveAttemptCount?: number; recoverySaveAttemptCount?: number; stagedEvidenceId?: string | null }>; uncertainPageSave?: { status?: string; probes?: Array<{ method?: string; outcome?: string; reason?: string; url?: string }> } | null; reason?: string }>; previewAllowed?: boolean; submitAllowed?: boolean; communicationsAllowed?: boolean } = {};
      type RuntimeCohortSeed = { status?: string; repeatTest?: { deletionProofRequired?: boolean } | null; candidates?: Array<{ customerKey?: string; practiceId?: string }>; audit?: Array<{ appliedRuleIds?: string[] }>; verifiedMapperBridgeRequired?: true };
      let cohortSeed: RuntimeCohortSeed | null = null;
      let preflight: { items?: Array<{ customerKey?: string; state?: string }> } = {};
      let gateOrchestrator: { gates?: Array<{ gateId?: string; state?: string }> } = {};
      try { driver = JSON.parse(readFileSync(path.join(this.directory, "cdp-driver.json"), "utf8")) as typeof driver; } catch { /* gate fallirà */ }
      try { execution = JSON.parse(readFileSync(path.join(path.resolve(this.rootDirectory), "enea-draft-execution", "checkpoint.json"), "utf8")) as typeof execution; } catch { /* gate fallirà */ }
      try { cohortSeed = JSON.parse(readFileSync(path.join(path.resolve(this.rootDirectory), "cohort-seed", "checkpoint.json"), "utf8")) as RuntimeCohortSeed; } catch { /* coorti legacy senza seed repeat */ }
      try { preflight = JSON.parse(readFileSync(path.join(path.resolve(this.rootDirectory), "crm-local-preflight", "checkpoint.json"), "utf8")) as typeof preflight; } catch { /* gate userà il checkpoint esecuzione */ }
      try { gateOrchestrator = JSON.parse(readFileSync(path.join(path.resolve(this.rootDirectory), "crm-live-processing", "runtime", "apr-gate-orchestrator", "checkpoint.json"), "utf8")) as typeof gateOrchestrator; } catch { /* gate fallirà */ }
      const runnableItems = execution.items?.filter((item) => {
        if (item.customerKey === "beatrice-ciotta") return false;
        if (item.state === "queued" || item.state === "recovery_queued") return true;
        const safelyResumablePartialState = item.customerKey === execution.currentCustomerKey
          && ["create_intent_recorded", "created", "filling", "save_intent_recorded"].includes(item.state ?? "");
        if (safelyResumablePartialState) return true;
        if (item.state !== "operator_intervention" || item.createAttemptCount !== 1 || item.saveAttemptCount !== 0) return false;
        const duplicateDiscovery = !item.draftId && item.completedPageIds?.length === 0 && /enea_draft_id_duplicate/.test(item.reason ?? "");
        const conditionalControl = Boolean(item.draftId) && /apr_cdp_enea_field_verification_failed:id-impianto_centralizzato$/.test(item.reason ?? "") && (item.pageCheckpoints ?? []).every((checkpoint) => checkpoint.state === "pending" || checkpoint.state === "saved");
        const repairableMappingProbe = item.uncertainPageSave?.status === "operator_required" && item.uncertainPageSave.probes?.length === 3 && item.uncertainPageSave.probes.every((probe) => probe.outcome === "inconclusive" && /apr_cdp_enea_mapping_missing/.test(probe.reason ?? ""));
        const serverProvenNotSaved = item.uncertainPageSave?.status === "operator_required" && item.uncertainPageSave.probes?.some((probe) => probe.method === "persisted_fields_get" && probe.outcome === "not_saved" && typeof probe.url === "string" && /^https:\/\/bonusfiscali\.enea\.it\/pratica\//.test(probe.url) && probe.url.split(/[?#]/, 1)[0].endsWith(`/${item.draftId}`));
        const legacyUncertainSave = Boolean(item.draftId) && (item.pageCheckpoints ?? []).some((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount !== 1 && !/Generatore/.test(checkpoint.pageId ?? "") && !(checkpoint.pageId ?? "").startsWith("screening:")) && (item.uncertainPageSave?.status === "probing" || repairableMappingProbe || serverProvenNotSaved || /(?:Esito salvataggio pagina|apr_cdp_command_timeout:Runtime\.evaluate)/.test(item.reason ?? ""));
        const unclickedRecovery = Boolean(item.draftId) && item.uncertainPageSave?.status === "recovery_authorized" && (item.pageCheckpoints ?? []).some((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 1) && /apr_cdp_enea_unique_enabled_save_button_not_found:/.test(item.reason ?? "");
        const recoveryTimeoutVerification = Boolean(item.draftId) && item.uncertainPageSave?.status === "operator_required" && (item.pageCheckpoints ?? []).some((checkpoint) => checkpoint.state === "save_intent_recorded" && checkpoint.saveAttemptCount === 1 && checkpoint.recoverySaveAttemptCount === 1) && /unico recupero autorizzato ha esito incerto/.test(item.reason ?? "");
        const transientPreSaveTimeout = Boolean(item.draftId)
          && /apr_cdp_(?:command_timeout:Runtime\.evaluate|connection_closed|protocol_error:-32000:(?:Promise was collected|Inspected target navigated or closed))/.test(item.reason ?? "")
          && (item.pageCheckpoints ?? []).some((checkpoint) => checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0)
          && (item.pageCheckpoints ?? []).every((checkpoint) => checkpoint.state === "saved"
            || (checkpoint.state === "staged" && checkpoint.saveAttemptCount === 1 && Boolean(checkpoint.stagedEvidenceId))
            || (checkpoint.state === "pending" && checkpoint.saveAttemptCount === 0));
        return duplicateDiscovery || conditionalControl || legacyUncertainSave || unclickedRecovery || recoveryTimeoutVerification || transientPreSaveTimeout;
      }) ?? [];
      const runnable = runnableItems.length;
      const ciottaSafe = [...(execution.items ?? []), ...(preflight.items ?? [])].every((item) => item.customerKey !== "beatrice-ciotta" || item.state === "deferred_operator");
      const domReady = service.status === "setup_ready" && driver.contract?.ready === true;
      let serverProbeReady = gateOrchestrator.gates?.some((gate) => gate.gateId === "real_enea_server_readonly_probe" && gate.state === "completed") ?? false;
      if (!serverProbeReady && current.operationalEnabled === false) {
        try {
          const proof = validateAprEneaServerReadOnlyProbe({ service, config: current, driver }, now);
          atomicWrite(path.join(this.directory, "server-readonly-proof.json"), `${JSON.stringify({ version: "apr-enea-server-readonly-proof-v1", observedAt: now.toISOString(), ...proof }, null, 2)}\n`);
          serverProbeReady = true;
        } catch { /* prova corrente non ancora completa */ }
      }
      const repeatReady = !cohortSeed?.repeatTest || cohortSeed.repeatTest.deletionProofRequired === false || cohortSeed.status === "deletion_verified";
      const executionSafetyReady = execution.previewAllowed === false && execution.submitAllowed === false && execution.communicationsAllowed === false;
      const cohortCount = cohortSeed?.candidates?.length ?? preflight.items?.length ?? execution.items?.length ?? 0;
      const singleCaseAuthorized = cohortSeed?.audit?.some((event) => event.appliedRuleIds?.includes("user-2026-08-18-single-case-regression-test")) === true;
      const bridgeRequired = cohortSeed?.verifiedMapperBridgeRequired === true || singleCaseAuthorized;
      let verifiedMapperBridgeReady = !bridgeRequired;
      if (bridgeRequired) {
        try {
          const bridge = new PersistentAprEneaOperationalBridge(this.rootDirectory).snapshot();
          const bridgeCustomerKey = runnableItems.length === 1
            ? runnableItems[0].customerKey
            : cohortSeed?.candidates?.length === 1
              ? cohortSeed.candidates[0].customerKey
              : null;
          const candidate = cohortSeed?.candidates?.find((item) => item.customerKey === bridgeCustomerKey);
          verifiedMapperBridgeReady = Boolean(bridge
            && candidate?.practiceId
            && bridge.customerKey === bridgeCustomerKey
            && bridge.customerKey === candidate.customerKey
            && bridge.practiceId === candidate.practiceId);
        } catch { verifiedMapperBridgeReady = false; }
      }
      const minimumRequired = singleCaseAuthorized ? 1 : next.minimumConsecutiveCases;
      const isolatedCount = preflight.items?.filter((item) => item.state === "blocked_case" || item.state === "deferred_operator").length ?? 0;
      const terminalPreflightCount = preflight.items?.filter((item) => ["ready_local_plan", "blocked_case", "deferred_operator"].includes(item.state ?? "")).length ?? 0;
      const cohortAccountedFor = preflight.items?.length ? terminalPreflightCount === cohortCount : (execution.items?.length ?? 0) >= cohortCount;
      const blocker = !domReady
        ? "apr_enea_worker_real_dom_contract_not_ready"
        : !serverProbeReady
          ? "apr_enea_worker_server_readonly_probe_not_ready"
          : !repeatReady
          ? "apr_enea_worker_repeat_deletion_gate_not_ready"
          : runnable < 1
            ? "apr_enea_worker_no_resumable_case"
            : !verifiedMapperBridgeReady
            ? "apr_enea_worker_verified_mapper_bridge_not_ready"
            : cohortCount < minimumRequired || !cohortAccountedFor || !ciottaSafe
              ? "apr_enea_worker_minimum_queue_gate_not_ready"
              : !executionSafetyReady
                ? "apr_enea_worker_execution_safety_gate_invalid"
                : null;
      this.recordQueueGate({
        status: blocker ? "waiting" : "armed",
        runnableCount: runnable,
        cohortCount,
        isolatedCount,
        minimumRequired,
        domContractReady: domReady,
        serverReadOnlyProbeReady: serverProbeReady,
        repeatDeletionReady: repeatReady,
        ciottaExcluded: ciottaSafe,
        executionSafetyReady,
        verifiedMapperBridgeReady,
        reason: blocker ?? "gate_verified_and_auto_armed",
        nextAction: blocker === "apr_enea_worker_no_resumable_case"
          ? "Nessun caso da riprendere nel checkpoint: APR non attribuisce questa condizione al bridge verificato."
          : blocker === "apr_enea_worker_verified_mapper_bridge_not_ready"
            ? "Il caso è riprendibile, ma il bridge verificato non corrisponde alla pratica autorizzata; APR resta fail-closed."
            : blocker
              ? "APR rivaluterà automaticamente il gate al prossimo tick persistente."
              : "Reclamare o riprendere una sola pratica alla volta dal checkpoint persistente.",
      }, now);
      if (blocker) throw new Error(blocker);
    }
    atomicWrite(this.configPath, `${JSON.stringify(next, null, 2)}\n`); return this.loadConfig(now);
  }

  autoArm(now = new Date()) {
    const current = this.loadConfig(now);
    if (!current.autoArmWhenReady || current.operationalEnabled) return { armed: current.operationalEnabled, reason: current.operationalEnabled ? "already_armed" : "auto_arm_disabled", config: current } as const;
    try {
      const config = this.configure({ operationalEnabled: true }, now);
      return { armed: true, reason: "gate_verified_and_auto_armed", config } as const;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (["apr_enea_worker_real_dom_contract_not_ready", "apr_enea_worker_server_readonly_probe_not_ready", "apr_enea_worker_repeat_deletion_gate_not_ready", "apr_enea_worker_no_resumable_case", "apr_enea_worker_verified_mapper_bridge_not_ready", "apr_enea_worker_minimum_queue_gate_not_ready", "apr_enea_worker_execution_safety_gate_invalid"].includes(reason)) return { armed: false, reason, config: current } as const;
      throw error;
    }
  }

  loadState(now = new Date()): AprEneaWorkerServiceState {
    if (existsSync(this.statePath)) {
      const value = JSON.parse(readFileSync(this.statePath, "utf8")) as AprEneaWorkerServiceState;
      value.cdpConnections ??= { active: 0, opened: 0, closed: 0, targetIds: [], observedAt: now.toISOString() };
      if (value.version === APR_ENEA_WORKER_SERVICE_VERSION && value.forbiddenActionCount === 0 && value.previewAttemptCount === 0 && value.submitAttemptCount === 0 && value.communicationAttemptCount === 0 && value.audit.every((event) => event.appliedRuleIds.length > 0)) return value;
    }
    return { version: APR_ENEA_WORKER_SERVICE_VERSION, revision: 0, status: "disabled", instanceId: "not-started", processPid: 0, heartbeatAt: now.toISOString(), chromePid: null, profileFingerprint: null, sessionEvidenceId: null, workerRevision: null, cdpConnections: { active: 0, opened: 0, closed: 0, targetIds: [], observedAt: now.toISOString() }, reason: "Servizio browser APR non ancora avviato.", nextAction: "Completare collaudo locale e abilitare soltanto il setup del profilo dedicato.", forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0, audit: [{ revision: 0, at: now.toISOString(), type: "initialized", reason: "Stato fail-closed inizializzato.", appliedRuleIds: [...RULE_IDS] }] };
  }

  record(input: { instanceId: string; processPid: number; status: AprEneaWorkerServiceState["status"]; reason: string; nextAction: string; chromePid?: number | null; profileFingerprint?: string | null; sessionEvidenceId?: string | null; workerRevision?: number | null; type: string }, now = new Date()) {
    const current = this.loadState(now);
    // A stop is a tombstone for the same process instance. An awaited browser
    // operation completing after SIGTERM must not publish RUNNING again.
    if (current.status === "stopped" && current.instanceId === input.instanceId && input.status !== "stopped") return current;
    const next = structuredClone(current); const last = next.audit.at(-1);
    const heartbeatOnly = next.status === input.status && next.reason === input.reason && last?.type === input.type;
    if (!heartbeatOnly) next.revision += 1; next.instanceId = input.instanceId; next.processPid = input.processPid; next.status = input.status; next.reason = input.reason; next.nextAction = input.nextAction; next.heartbeatAt = now.toISOString();
    if (input.chromePid !== undefined) next.chromePid = input.chromePid; if (input.profileFingerprint !== undefined) next.profileFingerprint = input.profileFingerprint; if (input.sessionEvidenceId !== undefined) next.sessionEvidenceId = input.sessionEvidenceId; if (input.workerRevision !== undefined) next.workerRevision = input.workerRevision;
    if (!heartbeatOnly) next.audit.push({ revision: next.revision, at: now.toISOString(), type: input.type, reason: input.reason, appliedRuleIds: [...RULE_IDS] });
    if (next.audit.length > 500) next.audit = [next.audit[0], ...next.audit.slice(-499)];
    atomicWrite(this.statePath, `${JSON.stringify(next, null, 2)}\n`); return next;
  }

  reconcileProcessLiveness(
    now = new Date(),
    processAlive: (pid: number) => boolean = (pid) => {
      try { process.kill(pid, 0); return true; }
      catch { return false; }
    },
  ) {
    const current = this.loadState(now);
    if (current.status === "disabled" || current.processPid <= 1 || processAlive(current.processPid)) return current;
    return this.record({
      instanceId: current.instanceId,
      processPid: 0,
      status: "stopped",
      type: "process_liveness_reconciled",
      reason: current.status === "stopped"
        ? `Worker APR fermo: il PID storico ${current.processPid} e' stato rimosso dallo stato pubblico dopo la terminazione reale.`
        : `Worker APR non attivo: il PID ${current.processPid} del checkpoint non esiste più.`,
      nextAction: "Il supervisore può avviare una nuova istanza dal checkpoint persistente; nessun lavoro è dichiarato in corso.",
      chromePid: current.chromePid,
      profileFingerprint: current.profileFingerprint,
      sessionEvidenceId: current.sessionEvidenceId,
      workerRevision: current.workerRevision,
    }, now);
  }

  recordCdpConnections(input: { active: number; opened: number; closed: number; targetIds: string[] }, now = new Date()) {
    if (![input.active, input.opened, input.closed].every((value) => Number.isInteger(value) && value >= 0)
      || input.active > input.opened
      || input.closed > input.opened
      || input.targetIds.length !== input.active
      || new Set(input.targetIds).size !== input.targetIds.length) throw new Error("apr_cdp_connection_stats_invalid");
    const current = this.loadState(now);
    const previous = current.cdpConnections;
    const changed = previous.active !== input.active
      || previous.opened !== input.opened
      || previous.closed !== input.closed
      || previous.targetIds.join("\u0000") !== input.targetIds.join("\u0000");
    if (!changed) return current;
    const next = structuredClone(current);
    next.revision += 1;
    next.cdpConnections = { ...input, targetIds: [...input.targetIds], observedAt: now.toISOString() };
    next.audit.push({
      revision: next.revision,
      at: now.toISOString(),
      type: "cdp_connection_count",
      reason: `Connessioni CDP: ${input.active} attive, ${input.opened} aperte, ${input.closed} chiuse.`,
      appliedRuleIds: [...RULE_IDS, "system-cdp-single-connection-per-target"],
    });
    if (next.audit.length > 500) next.audit = [next.audit[0], ...next.audit.slice(-499)];
    atomicWrite(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  emergencyStop(
    commandId: string,
    now = new Date(),
    signalProcess: (pid: number, signal: NodeJS.Signals) => void = (pid, signal) => process.kill(pid, signal),
  ): AprEneaEmergencyStopReceipt {
    if (!commandId.trim() || commandId.length > 300) throw new Error("apr_enea_emergency_stop_command_id_invalid");
    // The persistent re-arm controls are disabled before any signal is sent, so a
    // LaunchAgent restart cannot resume browser work after the operator presses STOP.
    this.configure({ setupEnabled: false, operationalEnabled: false }, now);
    const service = this.loadState(now);
    const heartbeatMs = Date.parse(service.heartbeatAt);
    const heartbeatAgeMs = Number.isFinite(heartbeatMs) ? now.getTime() - heartbeatMs : null;
    const freshPid = Number.isInteger(service.processPid)
      && service.processPid > 1
      && service.processPid !== process.pid
      && heartbeatAgeMs !== null
      && heartbeatAgeMs >= 0
      && heartbeatAgeMs <= 30_000;
    let signalOutcome: AprEneaEmergencyStopReceipt["signalOutcome"] = freshPid ? "sigterm_sent" : "stale_process_not_signalled";
    if (freshPid) {
      try { signalProcess(service.processPid, "SIGTERM"); }
      catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (code !== "ESRCH") throw error;
        signalOutcome = "process_not_running";
      }
    }
    const receipt: AprEneaEmergencyStopReceipt = {
      version: APR_ENEA_EMERGENCY_STOP_VERSION,
      commandId: commandId.trim(),
      requestedAt: now.toISOString(),
      targetPid: freshPid ? service.processPid : null,
      heartbeatAgeMs,
      signalOutcome,
      setupEnabled: false,
      operationalEnabled: false,
      reason: signalOutcome === "sigterm_sent"
        ? "STOP operatore persistito; SIGTERM inviato al worker APR attivo."
        : signalOutcome === "process_not_running"
          ? "STOP operatore persistito; il worker era gia' terminato."
          : "STOP operatore persistito; nessun PID worker recente e sicuro da segnalare.",
      appliedRuleIds: [...RULE_IDS, "system-operator-visible-emergency-stop"],
    };
    atomicWrite(this.emergencyStopPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  }

  snapshot(now = new Date(), processAlive?: (pid: number) => boolean) { const config = this.loadConfig(now); const service = this.reconcileProcessLiveness(now, processAlive); let worker: unknown = null; let driver: unknown = null; let minimumQueueGate: AprEneaMinimumQueueGateState | null = null; let emergencyStop: AprEneaEmergencyStopReceipt | null = null; try { worker = service.status === "stopped" ? reconcileStoppedAprEneaBrowserWorkerCheckpoint(this.rootDirectory, { instanceId: service.instanceId, reason: service.reason, now }) : JSON.parse(readFileSync(path.join(this.directory, "checkpoint.json"), "utf8")); } catch { /* non avviato */ } try { driver = JSON.parse(readFileSync(path.join(this.directory, "cdp-driver.json"), "utf8")); } catch { /* non collegato */ } try { minimumQueueGate = JSON.parse(readFileSync(this.queueGatePath, "utf8")) as AprEneaMinimumQueueGateState; } catch { /* primo tick non ancora osservato */ } try { emergencyStop = JSON.parse(readFileSync(this.emergencyStopPath, "utf8")) as AprEneaEmergencyStopReceipt; } catch { /* nessuno stop richiesto */ } return { config: { ...config, chromeExecutable: path.basename(config.chromeExecutable), profileDirectory: path.basename(config.profileDirectory) }, service, worker, driver, minimumQueueGate, emergencyStop, observedAt: now.toISOString() } as const; }
}
