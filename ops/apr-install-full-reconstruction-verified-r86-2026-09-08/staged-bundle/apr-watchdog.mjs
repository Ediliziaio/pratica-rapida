#!/usr/bin/env node

// scripts/enea-shadow-runner/apr-watchdog-cli.ts
import { spawnSync } from "node:child_process";
import path3 from "node:path";

// scripts/enea-shadow-runner/aprWatchdog.ts
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
var APR_WATCHDOG_VERSION = "apr-watchdog-v1";
var APR_WATCHDOG_STALL_MS = 3e5;
var APR_WATCHDOG_RECOVERY_TIMEOUT_MS = 6e4;
var RULE_IDS = ["system-apr-independent-runtime", "system-atomic-checkpoint-resume", "system-single-active-practice"];
function atomicWrite(target, contents) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 448 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 384);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
function milliseconds(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function initialState(instanceId, processPid, now) {
  const at = now.toISOString();
  return {
    version: APR_WATCHDOG_VERSION,
    revision: 0,
    status: "IDLE",
    instanceId,
    processPid,
    heartbeatAt: at,
    currentCustomerKey: null,
    currentDisplayName: null,
    currentPhase: "coda_vuota",
    phaseStartedAt: null,
    lastProgressAt: null,
    progressToken: "none",
    nextAction: "Attendere una nuova coda APR persistente.",
    supervisorPid: null,
    workerPid: null,
    pendingRecovery: null,
    recoveryCount: 0,
    reason: "IDLE \u2014 coda vuota.",
    audit: [{ revision: 0, at, type: "watchdog_initialized", reason: "Watchdog APR inizializzato in stato fail-safe.", target: null, commandId: "watchdog:init", appliedRuleIds: [...RULE_IDS] }]
  };
}
var PersistentAprWatchdog = class {
  constructor(rootDirectory2, options = {}) {
    this.rootDirectory = rootDirectory2;
    this.options = options;
    this.directory = path.join(path.resolve(rootDirectory2), "watchdog");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }
  directory;
  checkpointPath;
  now() {
    return this.options.now?.() ?? /* @__PURE__ */ new Date();
  }
  instanceId() {
    return this.options.instanceId ?? `apr-watchdog-${process.pid}-${crypto.randomUUID()}`;
  }
  processPid() {
    return this.options.processPid ?? process.pid;
  }
  load(now = this.now()) {
    if (!existsSync(this.checkpointPath)) return initialState(this.instanceId(), this.processPid(), now);
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8"));
    if (value.version !== APR_WATCHDOG_VERSION || !value.audit.every((event) => event.appliedRuleIds.length > 0)) throw new Error("apr_watchdog_checkpoint_invalid");
    return value;
  }
  write(state) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}
`);
    return state;
  }
  event(state, at, type, reason, target, commandId) {
    state.revision += 1;
    state.audit.push({ revision: state.revision, at, type, reason, target, commandId, appliedRuleIds: [...RULE_IDS] });
    if (state.audit.length > 500) state.audit = [state.audit[0], ...state.audit.slice(-499)];
  }
  tick(observation) {
    const now = new Date(observation.observedAt);
    if (!Number.isFinite(now.getTime())) throw new Error("apr_watchdog_observation_time_invalid");
    const current = this.load(now);
    const next = structuredClone(current);
    next.instanceId = this.instanceId();
    next.processPid = this.processPid();
    next.heartbeatAt = observation.observedAt;
    next.supervisorPid = observation.supervisor.pid;
    next.workerPid = observation.worker.pid;
    if (next.pendingRecovery) {
      const target = next.pendingRecovery.target;
      const processState = observation[target];
      const heartbeat = milliseconds(processState.heartbeatAt);
      const requested = Date.parse(next.pendingRecovery.requestedAt);
      const recovered = processState.alive && (processState.pid !== null && processState.pid !== next.pendingRecovery.priorPid || heartbeat !== null && heartbeat > requested);
      if (recovered) {
        const recovery = next.pendingRecovery;
        next.pendingRecovery = null;
        next.recoveryCount += 1;
        next.currentCustomerKey = observation.work.customerKey;
        next.currentDisplayName = observation.work.displayName;
        next.currentPhase = observation.work.phase;
        next.phaseStartedAt = observation.work.phaseStartedAt;
        next.lastProgressAt = observation.observedAt;
        next.progressToken = observation.work.progressToken;
        next.nextAction = observation.work.nextAction;
        next.status = observation.work.actionable ? "WORKING" : observation.work.operatorRequired ? "OPERATOR_REQUIRED" : observation.work.technicalBlock ? "TECHNICAL_BLOCK" : "IDLE";
        next.reason = next.status === "WORKING" ? `WORKING \u2014 ripresa verificata per ${observation.work.displayName ?? "coda APR"} \xB7 ${observation.work.phase}.` : next.status === "OPERATOR_REQUIRED" ? "OPERATOR_REQUIRED \u2014 ripresa verificata; restano soltanto interventi per-pratica." : next.status === "TECHNICAL_BLOCK" ? `TECHNICAL_BLOCK \u2014 processo ripristinato; resta il safety gate ${observation.work.phase}.` : "IDLE \u2014 coda vuota.";
        this.event(next, observation.observedAt, "recovery_verified", `${target} ripristinato con heartbeat/PID successivo alla richiesta; checkpoint preservato.`, target, `${recovery.commandId}:verified`);
        return { state: this.write(next), recovery: null };
      } else if (now.getTime() - requested >= APR_WATCHDOG_RECOVERY_TIMEOUT_MS) {
        const recovery = next.pendingRecovery;
        next.pendingRecovery = null;
        next.status = "TECHNICAL_BLOCK";
        next.reason = `TECHNICAL_BLOCK \u2014 ${target} non ripristinato entro 60 secondi.`;
        next.nextAction = "Controllare il LaunchAgent e i log del processo; nessuna pratica viene modificata.";
        this.event(next, observation.observedAt, "recovery_failed", next.reason, target, `${recovery.commandId}:failed`);
        return { state: this.write(next), recovery: null };
      } else return { state: this.write(next), recovery: null };
    }
    const missingTarget = !observation.supervisor.alive ? "supervisor" : !observation.worker.alive ? "worker" : null;
    const observedProgressAt = milliseconds(observation.work.lastProgressAt) ?? milliseconds(observation.work.phaseStartedAt) ?? now.getTime();
    const watchdogProgressAt = current.progressToken === observation.work.progressToken ? milliseconds(current.lastProgressAt) : null;
    const progressAt = Math.max(observedProgressAt, watchdogProgressAt ?? Number.NEGATIVE_INFINITY);
    const stalledTarget = observation.work.actionable && now.getTime() - progressAt >= APR_WATCHDOG_STALL_MS ? observation.work.target : null;
    const recoveryTarget = missingTarget ?? stalledTarget;
    if (recoveryTarget) {
      const reason = missingTarget ? `${recoveryTarget} non attivo.` : `${observation.work.phase} non avanza da almeno cinque minuti.`;
      const commandId = `watchdog:recover:${recoveryTarget}:${observation.work.progressToken}`;
      const recovery = { target: recoveryTarget, requestedAt: observation.observedAt, priorPid: observation[recoveryTarget].pid, reason, commandId, attemptCount: 1 };
      next.currentCustomerKey = observation.work.customerKey;
      next.currentDisplayName = observation.work.displayName;
      next.currentPhase = observation.work.phase;
      next.phaseStartedAt = observation.work.phaseStartedAt;
      next.lastProgressAt = observation.work.lastProgressAt;
      next.progressToken = observation.work.progressToken;
      next.pendingRecovery = recovery;
      next.status = "TECHNICAL_BLOCK";
      next.reason = `Ripresa sicura richiesta: ${reason}`;
      next.nextAction = `Riavviare ${recoveryTarget} una sola volta e verificare PID/heartbeat prima di riprendere.`;
      this.event(next, observation.observedAt, "recovery_requested", next.reason, recoveryTarget, commandId);
      return { state: this.write(next), recovery };
    }
    const progressChanged = current.progressToken !== observation.work.progressToken;
    next.currentCustomerKey = observation.work.customerKey;
    next.currentDisplayName = observation.work.displayName;
    next.currentPhase = observation.work.phase;
    next.phaseStartedAt = progressChanged ? observation.work.phaseStartedAt ?? observation.observedAt : current.phaseStartedAt;
    next.lastProgressAt = progressChanged ? observation.work.lastProgressAt ?? observation.observedAt : current.lastProgressAt;
    next.progressToken = observation.work.progressToken;
    next.nextAction = observation.work.nextAction;
    next.status = observation.work.actionable ? "WORKING" : observation.work.technicalBlock ? "TECHNICAL_BLOCK" : observation.work.operatorRequired ? "OPERATOR_REQUIRED" : "IDLE";
    next.reason = next.status === "WORKING" ? `WORKING \u2014 ${observation.work.displayName ?? "coda APR"} \xB7 ${observation.work.phase}.` : next.status === "OPERATOR_REQUIRED" ? "OPERATOR_REQUIRED \u2014 nessun caso eseguibile; interventi per-pratica registrati." : next.status === "TECHNICAL_BLOCK" ? "TECHNICAL_BLOCK \u2014 il runtime ha registrato un blocco tecnico globale." : "IDLE \u2014 coda vuota.";
    if (progressChanged || current.status !== next.status || current.currentPhase !== next.currentPhase) this.event(next, observation.observedAt, progressChanged ? "progress_observed" : "status_changed", next.reason, null, `watchdog:observe:${observation.work.progressToken}`);
    return { state: this.write(next), recovery: null };
  }
};

// scripts/enea-shadow-runner/aprWatchdogRuntime.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import path2 from "node:path";
var object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
var text = (value) => typeof value === "string" ? value : null;
var number = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
var items = (value) => Array.isArray(value) ? value.map(object).filter((item) => Boolean(item)) : [];
function read(root, relative) {
  const target = path2.join(path2.resolve(root), relative);
  if (!existsSync2(target)) return null;
  try {
    return object(JSON.parse(readFileSync2(target, "utf8")));
  } catch {
    return null;
  }
}
function latestAt(state) {
  const audit = state && Array.isArray(state.audit) ? state.audit.map(object).filter((event) => Boolean(event)) : [];
  return text(audit.at(-1)?.at) ?? null;
}
function activeItem(state, actionableStates) {
  const currentKey = text(state?.currentCustomerKey) ?? text(state?.currentDocumentKey) ?? text(state?.activeGateId);
  const regularItems = items(state?.items);
  const all = regularItems.length ? regularItems : items(state?.gates);
  return all.find((item) => currentKey && (text(item.customerKey) === currentKey || text(item.documentKey) === currentKey || text(item.gateId) === currentKey)) ?? all.find((item) => actionableStates.includes(text(item.state) ?? "")) ?? null;
}
function blockedItems(states) {
  const blocked = states.flatMap((state) => items(state?.items)).filter((item) => /^(blocked|operator_intervention)/.test(text(item.state) ?? ""));
  const unique = /* @__PURE__ */ new Map();
  for (const [index, item] of blocked.entries()) {
    const key = text(item.customerKey) ?? text(item.practiceId) ?? text(item.documentKey) ?? `anonymous-${index}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}
function buildAprWatchdogObservation(rootDirectory2, processAlive2, now = /* @__PURE__ */ new Date()) {
  const supervisor = read(rootDirectory2, "supervisor/checkpoint.json");
  const worker = read(rootDirectory2, "enea-browser-worker/service.json");
  const acquisition = read(rootDirectory2, "crm-acquisition/checkpoint.json");
  const documents = read(rootDirectory2, "crm-original-documents/checkpoint.json");
  const analysis = read(rootDirectory2, "crm-document-analysis/checkpoint.json");
  const preflight = read(rootDirectory2, "crm-local-preflight/checkpoint.json");
  const infissiMapping = read(rootDirectory2, "infissi-local-mapping/checkpoint.json");
  const draft = read(rootDirectory2, "enea-draft-execution/checkpoint.json");
  const gateOrchestrator = read(rootDirectory2, "crm-live-processing/runtime/apr-gate-orchestrator/checkpoint.json");
  const minimumQueueGate = read(rootDirectory2, "enea-browser-worker/minimum-queue-gate.json");
  const readinessAdmission = read(rootDirectory2, "crm-live-processing/runtime/apr-enea-readiness-admission/checkpoint.json");
  const readOnlyDiscovery = read(rootDirectory2, "crm-live-processing/runtime/apr-enea-readonly-discovery/checkpoint.json");
  const readOnlyAttach = read(rootDirectory2, "crm-live-processing/runtime/apr-enea-real-readonly-attach/checkpoint.json");
  const supervisorInstanceMatch = text(supervisor?.instanceId)?.match(/^supervisor-(\d+)-/) ?? null;
  const supervisorPid = number(supervisor?.pid) ?? number(supervisorInstanceMatch ? Number(supervisorInstanceMatch[1]) : null);
  const workerPid = number(worker?.processPid);
  const workerStatus = text(worker?.status);
  const phases = [
    { id: "enea_readonly_discovery", state: readOnlyDiscovery, statuses: ["working_local"], itemStates: [], target: "supervisor", allowWithoutItem: true },
    { id: "enea_readiness_admission", state: readinessAdmission, statuses: ["working_local"], itemStates: [], target: "supervisor", allowWithoutItem: true },
    { id: "orchestrazione_gate", state: gateOrchestrator, statuses: ["working_local"], itemStates: ["queued", "active"], target: "supervisor" },
    { id: "acquisizione_crm", state: acquisition, statuses: ["queued", "running"], itemStates: ["queued", "acquiring"], target: "supervisor" },
    { id: "allegati_originari", state: documents, statuses: ["queued", "running"], itemStates: ["queued", "downloading"], target: "supervisor" },
    { id: "analisi_documenti", state: analysis, statuses: ["queued", "running"], itemStates: ["queued", "analyzing"], target: "supervisor" },
    { id: "preflight_locale", state: preflight, statuses: ["queued", "running"], itemStates: ["queued", "processing"], target: "supervisor" },
    { id: "bozza_enea", state: draft, statuses: ["ready", "running", "operator_intervention"], itemStates: ["queued", "recovery_queued", "create_intent_recorded", "created", "filling", "save_intent_recorded"], target: "worker" }
  ];
  const active = phases.find((phase2) => phase2.statuses.includes(text(phase2.state?.status) ?? "") && !(phase2.target === "worker" && workerStatus === "login_required") && (phase2.allowWithoutItem || Boolean(activeItem(phase2.state, phase2.itemStates))));
  const activePractice = active ? activeItem(active.state, active.itemStates) : null;
  const savedDraftKeys = new Set(items(draft?.items).filter((item) => text(item.state) === "saved").map((item) => text(item.customerKey) ?? text(item.practiceId) ?? text(item.documentKey)).filter((key) => Boolean(key)));
  const infissiItem = object(infissiMapping?.item);
  const infissiReport = object(infissiItem?.report);
  const infissiReadyKeys = new Set(infissiItem && text(infissiItem.caseTruth) === "READY" && text(infissiReport?.outcome) === "ready_local_plan" ? [text(infissiItem.customerKey) ?? text(infissiItem.practiceId)].filter((key) => Boolean(key)) : []);
  const blocked = blockedItems([acquisition, documents, analysis, preflight, draft]).filter((item) => {
    const key = text(item.customerKey) ?? text(item.practiceId) ?? text(item.documentKey) ?? "";
    return !savedDraftKeys.has(key) && !infissiReadyKeys.has(key);
  });
  const gateOrchestratorStatus = text(gateOrchestrator?.status);
  const readinessAdmissionStatus = text(readinessAdmission?.status);
  const readOnlyDiscoveryStatus = text(readOnlyDiscovery?.status);
  const readOnlyAttachStatus = text(readOnlyAttach?.status);
  const serverReadOnlyProbeCompleted = items(gateOrchestrator?.gates).some((gate) => text(gate.gateId) === "real_enea_server_readonly_probe" && text(gate.state) === "completed");
  const directServerReadOnlyProbeCompleted = minimumQueueGate?.serverReadOnlyProbeReady === true;
  const technicalBlock = !active && (workerStatus === "technical_block" || readinessAdmissionStatus === "technical_block" || readOnlyDiscoveryStatus === "technical_block" || readOnlyAttachStatus === "technical_block" || gateOrchestratorStatus === "waiting_external_safety_gate" && !serverReadOnlyProbeCompleted && !directServerReadOnlyProbeCompleted || gateOrchestratorStatus === "technical_block");
  const operatorRequired = !active && !technicalBlock && (blocked.length > 0 || workerStatus === "login_required" || text(acquisition?.status) === "waiting_auth" || text(documents?.status) === "waiting_auth");
  const activeRevision = active ? Number(active.state?.revision ?? 0) : 0;
  const customerKey = text(activePractice?.customerKey) ?? null;
  const displayName = text(activePractice?.displayName) ?? customerKey;
  const phaseStartedAt = text(activePractice?.startedAt) ?? text(activePractice?.createIntentAt) ?? text(activePractice?.createdAt) ?? latestAt(active?.state ?? null);
  const lastProgressAt = latestAt(active?.state ?? null);
  const phase = active ? active.id : technicalBlock ? "blocco_tecnico_gate" : operatorRequired ? "intervento_operatore" : "coda_vuota";
  const progressToken = active ? `${active.id}:${activeRevision}:${customerKey ?? text(activePractice?.documentKey) ?? "queue"}:${text(activePractice?.state) ?? "unknown"}` : technicalBlock ? `technical:${Number(worker?.revision ?? 0)}:${Number(gateOrchestrator?.revision ?? 0)}${readinessAdmission ? `:${Number(readinessAdmission.revision ?? 0)}` : ""}${readOnlyDiscovery ? `:${Number(readOnlyDiscovery.revision ?? 0)}` : ""}${readOnlyAttach ? `:${Number(readOnlyAttach.revision ?? 0)}` : ""}` : operatorRequired ? `operator:${blocked.length}:${workerStatus ?? "none"}` : "empty:0";
  return {
    observedAt: now.toISOString(),
    supervisor: { pid: supervisorPid, alive: processAlive2(supervisorPid), heartbeatAt: text(supervisor?.heartbeatAt) },
    worker: { pid: workerPid, alive: processAlive2(workerPid), heartbeatAt: text(worker?.heartbeatAt) },
    work: {
      actionable: Boolean(active),
      target: active?.target ?? "supervisor",
      customerKey,
      displayName,
      phase,
      phaseStartedAt,
      lastProgressAt,
      progressToken,
      nextAction: text(active?.state?.nextAction) ?? (technicalBlock ? text(readOnlyAttach?.nextAction) ?? text(readOnlyDiscovery?.nextAction) ?? text(readinessAdmission?.nextAction) ?? text(gateOrchestrator?.nextAction) ?? text(worker?.nextAction) ?? "Consultare il blocco tecnico in dashboard." : operatorRequired ? "Gestire i casi nella pipeline Richiesto intervento operatore; APR riprender\xE0 gli altri automaticamente." : text(infissiMapping?.nextAction) ?? "Attendere una nuova coda APR persistente."),
      operatorRequired,
      technicalBlock
    }
  };
}

// scripts/enea-shadow-runner/apr-watchdog-cli.ts
function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : void 0;
}
var mode = process.argv[2] ?? "status";
var rootDirectory = path3.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
var intervalMs = Number(option("--interval-ms") ?? "15000");
var labels = {
  supervisor: option("--supervisor-label") ?? "com.praticarapida.enea-shadow-supervisor",
  worker: option("--worker-label") ?? "com.praticarapida.apr-enea-worker"
};
for (const label of Object.values(labels)) if (!/^com\.praticarapida\.[a-z0-9.-]+$/.test(label)) throw new Error("apr_watchdog_launch_agent_label_invalid");
if (!Number.isInteger(intervalMs) || intervalMs < 1e3 || intervalMs > 6e4) throw new Error("apr_watchdog_interval_invalid");
var watchdog = new PersistentAprWatchdog(rootDirectory, { instanceId: `apr-watchdog-service-${process.pid}-${crypto.randomUUID()}`, processPid: process.pid });
function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function recover(recovery) {
  const domain = `gui/${process.getuid?.() ?? 501}/${labels[recovery.target]}`;
  const result = spawnSync("/bin/launchctl", ["kickstart", "-k", domain], { encoding: "utf8", timeout: 3e4 });
  if (result.error || result.status !== 0) throw new Error(`apr_watchdog_kickstart_failed:${recovery.target}:${result.error?.message ?? result.stderr.trim()}`);
}
function snapshot() {
  const observation = buildAprWatchdogObservation(rootDirectory, processAlive);
  return { observation, watchdog: watchdog.load() };
}
async function serve() {
  let running = true;
  process.once("SIGINT", () => {
    running = false;
  });
  process.once("SIGTERM", () => {
    running = false;
  });
  while (running) {
    try {
      const result = watchdog.tick(buildAprWatchdogObservation(rootDirectory, processAlive));
      if (result.recovery) recover(result.recovery);
    } catch (error) {
      process.stderr.write(`APR_WATCHDOG_ERROR: ${error instanceof Error ? error.message : String(error)}
`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
if (mode === "status") process.stdout.write(`${JSON.stringify(snapshot(), null, 2)}
`);
else if (mode === "once") {
  const result = watchdog.tick(buildAprWatchdogObservation(rootDirectory, processAlive));
  if (result.recovery) recover(result.recovery);
  process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
} else if (mode === "serve") await serve();
else throw new Error("Comando watchdog non valido: status, once, serve.");
