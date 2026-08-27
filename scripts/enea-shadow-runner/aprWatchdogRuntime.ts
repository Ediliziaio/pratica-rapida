import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AprWatchdogObservation, AprWatchdogTarget } from "./aprWatchdog";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
const items = (value: unknown) => Array.isArray(value) ? value.map(object).filter((item): item is JsonObject => Boolean(item)) : [];

function read(root: string, relative: string): JsonObject | null {
  const target = path.join(path.resolve(root), relative);
  if (!existsSync(target)) return null;
  try { return object(JSON.parse(readFileSync(target, "utf8"))); } catch { return null; }
}

function latestAt(state: JsonObject | null) {
  const audit = state && Array.isArray(state.audit) ? state.audit.map(object).filter((event): event is JsonObject => Boolean(event)) : [];
  return text(audit.at(-1)?.at) ?? null;
}

function activeItem(state: JsonObject | null, actionableStates: string[]) {
  const currentKey = text(state?.currentCustomerKey) ?? text(state?.currentDocumentKey) ?? text(state?.activeGateId);
  const regularItems = items(state?.items); const all = regularItems.length ? regularItems : items(state?.gates);
  return all.find((item) => currentKey && (text(item.customerKey) === currentKey || text(item.documentKey) === currentKey || text(item.gateId) === currentKey))
    ?? all.find((item) => actionableStates.includes(text(item.state) ?? ""))
    ?? null;
}

function blockedItems(states: Array<JsonObject | null>) {
  const blocked = states.flatMap((state) => items(state?.items)).filter((item) => /^(blocked|operator_intervention)/.test(text(item.state) ?? ""));
  const unique = new Map<string, JsonObject>();
  for (const [index, item] of blocked.entries()) {
    const key = text(item.customerKey) ?? text(item.practiceId) ?? text(item.documentKey) ?? `anonymous-${index}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function buildAprWatchdogObservation(
  rootDirectory: string,
  processAlive: (pid: number | null) => boolean,
  now = new Date(),
): AprWatchdogObservation {
  const supervisor = read(rootDirectory, "supervisor/checkpoint.json");
  const worker = read(rootDirectory, "enea-browser-worker/service.json");
  const acquisition = read(rootDirectory, "crm-acquisition/checkpoint.json");
  const documents = read(rootDirectory, "crm-original-documents/checkpoint.json");
  const analysis = read(rootDirectory, "crm-document-analysis/checkpoint.json");
  const preflight = read(rootDirectory, "crm-local-preflight/checkpoint.json");
  const infissiMapping = read(rootDirectory, "infissi-local-mapping/checkpoint.json");
  const draft = read(rootDirectory, "enea-draft-execution/checkpoint.json");
  const gateOrchestrator = read(rootDirectory, "crm-live-processing/runtime/apr-gate-orchestrator/checkpoint.json");
  const minimumQueueGate = read(rootDirectory, "enea-browser-worker/minimum-queue-gate.json");
  const readinessAdmission = read(rootDirectory, "crm-live-processing/runtime/apr-enea-readiness-admission/checkpoint.json");
  const readOnlyDiscovery = read(rootDirectory, "crm-live-processing/runtime/apr-enea-readonly-discovery/checkpoint.json");
  const readOnlyAttach = read(rootDirectory, "crm-live-processing/runtime/apr-enea-real-readonly-attach/checkpoint.json");
  const supervisorInstanceMatch = text(supervisor?.instanceId)?.match(/^supervisor-(\d+)-/) ?? null;
  const supervisorPid = number(supervisor?.pid) ?? number(supervisorInstanceMatch ? Number(supervisorInstanceMatch[1]) : null);
  const workerPid = number(worker?.processPid);

  const workerStatus = text(worker?.status);
  const phases: Array<{ id: string; state: JsonObject | null; statuses: string[]; itemStates: string[]; target: AprWatchdogTarget; allowWithoutItem?: boolean }> = [
    { id: "enea_readonly_discovery", state: readOnlyDiscovery, statuses: ["working_local"], itemStates: [], target: "supervisor", allowWithoutItem: true },
    { id: "enea_readiness_admission", state: readinessAdmission, statuses: ["working_local"], itemStates: [], target: "supervisor", allowWithoutItem: true },
    { id: "orchestrazione_gate", state: gateOrchestrator, statuses: ["working_local"], itemStates: ["queued", "active"], target: "supervisor" },
    { id: "acquisizione_crm", state: acquisition, statuses: ["queued", "running"], itemStates: ["queued", "acquiring"], target: "supervisor" },
    { id: "allegati_originari", state: documents, statuses: ["queued", "running"], itemStates: ["queued", "downloading"], target: "supervisor" },
    { id: "analisi_documenti", state: analysis, statuses: ["queued", "running"], itemStates: ["queued", "analyzing"], target: "supervisor" },
    { id: "preflight_locale", state: preflight, statuses: ["queued", "running"], itemStates: ["queued", "processing"], target: "supervisor" },
    { id: "bozza_enea", state: draft, statuses: ["ready", "running", "operator_intervention"], itemStates: ["queued", "recovery_queued", "create_intent_recorded", "created", "filling", "save_intent_recorded"], target: "worker" },
  ];
  const active = phases.find((phase) => phase.statuses.includes(text(phase.state?.status) ?? "")
    && !(phase.target === "worker" && workerStatus === "login_required")
    && (phase.allowWithoutItem || Boolean(activeItem(phase.state, phase.itemStates))));
  const activePractice = active ? activeItem(active.state, active.itemStates) : null;
  // Un blocco di una fase precedente non resta aperto per sempre: la bozza
  // salvata e la fonte terminale piu autorevole per quella stessa pratica.
  // Senza questa precedenza il watchdog mostrerebbe OPERATOR_REQUIRED anche
  // dopo un recupero concluso 11/11.
  const savedDraftKeys = new Set(items(draft?.items)
    .filter((item) => text(item.state) === "saved")
    .map((item) => text(item.customerKey) ?? text(item.practiceId) ?? text(item.documentKey))
    .filter((key): key is string => Boolean(key)));
  const infissiItem = object(infissiMapping?.item);
  const infissiReport = object(infissiItem?.report);
  const infissiReadyKeys = new Set(infissiItem && text(infissiItem.caseTruth) === "READY" && text(infissiReport?.outcome) === "ready_local_plan"
    ? [text(infissiItem.customerKey) ?? text(infissiItem.practiceId)].filter((key): key is string => Boolean(key))
    : []);
  const blocked = blockedItems([acquisition, documents, analysis, preflight, draft])
    .filter((item) => {
      const key = text(item.customerKey) ?? text(item.practiceId) ?? text(item.documentKey) ?? "";
      return !savedDraftKeys.has(key) && !infissiReadyKeys.has(key);
    });
  const gateOrchestratorStatus = text(gateOrchestrator?.status);
  const readinessAdmissionStatus = text(readinessAdmission?.status);
  const readOnlyDiscoveryStatus = text(readOnlyDiscovery?.status);
  const readOnlyAttachStatus = text(readOnlyAttach?.status);
  const serverReadOnlyProbeCompleted = items(gateOrchestrator?.gates).some((gate) => text(gate.gateId) === "real_enea_server_readonly_probe" && text(gate.state) === "completed");
  const directServerReadOnlyProbeCompleted = minimumQueueGate?.serverReadOnlyProbeReady === true;
  const technicalBlock = !active && (workerStatus === "technical_block" || readinessAdmissionStatus === "technical_block" || readOnlyDiscoveryStatus === "technical_block" || readOnlyAttachStatus === "technical_block" || (gateOrchestratorStatus === "waiting_external_safety_gate" && !serverReadOnlyProbeCompleted && !directServerReadOnlyProbeCompleted) || gateOrchestratorStatus === "technical_block");
  const operatorRequired = !active && !technicalBlock && (blocked.length > 0 || workerStatus === "login_required" || text(acquisition?.status) === "waiting_auth" || text(documents?.status) === "waiting_auth");
  const activeRevision = active ? Number(active.state?.revision ?? 0) : 0;
  const customerKey = text(activePractice?.customerKey) ?? null;
  const displayName = text(activePractice?.displayName) ?? customerKey;
  const phaseStartedAt = text(activePractice?.startedAt) ?? text(activePractice?.createIntentAt) ?? text(activePractice?.createdAt) ?? latestAt(active?.state ?? null);
  const lastProgressAt = latestAt(active?.state ?? null);
  const phase = active ? active.id : technicalBlock ? "blocco_tecnico_gate" : operatorRequired ? "intervento_operatore" : "coda_vuota";
  const progressToken = active ? `${active.id}:${activeRevision}:${customerKey ?? text(activePractice?.documentKey) ?? "queue"}:${text(activePractice?.state) ?? "unknown"}`
    : technicalBlock ? `technical:${Number(worker?.revision ?? 0)}:${Number(gateOrchestrator?.revision ?? 0)}${readinessAdmission ? `:${Number(readinessAdmission.revision ?? 0)}` : ""}${readOnlyDiscovery ? `:${Number(readOnlyDiscovery.revision ?? 0)}` : ""}${readOnlyAttach ? `:${Number(readOnlyAttach.revision ?? 0)}` : ""}` : operatorRequired ? `operator:${blocked.length}:${workerStatus ?? "none"}` : "empty:0";
  return {
    observedAt: now.toISOString(),
    supervisor: { pid: supervisorPid, alive: processAlive(supervisorPid), heartbeatAt: text(supervisor?.heartbeatAt) },
    worker: { pid: workerPid, alive: processAlive(workerPid), heartbeatAt: text(worker?.heartbeatAt) },
    work: {
      actionable: Boolean(active), target: active?.target ?? "supervisor", customerKey, displayName, phase, phaseStartedAt, lastProgressAt, progressToken,
      nextAction: text(active?.state?.nextAction) ?? (technicalBlock ? text(readOnlyAttach?.nextAction) ?? text(readOnlyDiscovery?.nextAction) ?? text(readinessAdmission?.nextAction) ?? text(gateOrchestrator?.nextAction) ?? text(worker?.nextAction) ?? "Consultare il blocco tecnico in dashboard." : operatorRequired ? "Gestire i casi nella pipeline Richiesto intervento operatore; APR riprenderà gli altri automaticamente." : text(infissiMapping?.nextAction) ?? "Attendere una nuova coda APR persistente."),
      operatorRequired, technicalBlock,
    },
  };
}
