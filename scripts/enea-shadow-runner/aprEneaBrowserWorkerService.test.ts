import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runEconomicVertical } from "./aprEconomicVertical";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { aprEneaKeepaliveInterval, aprEneaWorkerLoopFailureDisposition, isAprEneaKeepaliveDue, isAprEneaOperatorCaseSafelyResumable, PersistentAprEneaWorkerService, shouldHoldAprEneaKeepaliveState } from "./aprEneaBrowserWorkerService";
import { PersistentAprEneaOperationalBridge } from "./aprEneaOperationalBridge";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function writeServerProbeGate(root: string) {
  const directory = path.join(root, "crm-live-processing", "runtime", "apr-gate-orchestrator");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "checkpoint.json"), JSON.stringify({ gates: [{ gateId: "real_enea_server_readonly_probe", state: "completed" }] }));
}

function armVerifiedMapperBridge(root: string, customerKey: string, practiceId: string) {
  const amount = 110;
  const mappingArtifact = mapBusinessDecisionArtifactToEnea(runEconomicVertical({
    customerKey,
    practiceId,
    sourceFingerprint: canonicalSha256({ customerKey, practiceId, amount }),
    invoices: [{
      sourceId: "invoice", supplierId: "supplier", supplierName: "Supplier", documentNumber: "1", documentDate: "2026-08-01",
      kind: "invoice", taxableAmount: 100, vatAmount: 10, grossTotal: amount, referencedAdvanceIds: [], interventionGrossAmount: amount,
      extractionConfidence: "certain", extractionIssues: [], internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [],
      locator: { sourceId: "invoice", pageNumber: 1, contentSha256: canonicalSha256("invoice"), excerptSha256: canonicalSha256("excerpt") },
    }],
    bankTransfers: [],
    replacements: [],
  }).decisionsArtifact);
  const legacyPackage: AprEneaDraftPackage = {
    module: "screening", customerKey, displayName: "Fixture", practiceId,
    packageFingerprint: canonicalSha256({ customerKey, practiceId, kind: "legacy-package" }),
    workflowFingerprint: canonicalSha256({ customerKey, practiceId, kind: "legacy-workflow" }),
    workflow: {
      supportedPages: ["Calcolo costi e detrazioni"], screeningItemCount: 0,
      steps: [{ id: "calcolo", pageName: "Calcolo costi e detrazioni", markerIds: ["id-costo"], successMessage: "ok", fields: [{ portalId: "id-costo", control: "input", value: "999,99" }] }],
      screeningSteps: [],
    },
    safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
  return new PersistentAprEneaOperationalBridge(root).arm({ legacyPackage, mappingArtifact, authorizationId: "user-real-draft-only-test" });
}

describe("gate permanente del servizio browser APR", () => {
  it("persiste l'identità di autorizzazione specifica della coorte", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-authorization-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);

    expect(service.configure({ authorizationId: "user-2026-08-27-five-simple-real-drafts" })).toMatchObject({
      authorizationId: "user-2026-08-27-five-simple-real-drafts",
    });
    expect(() => service.configure({ authorizationId: "" })).toThrow("apr_enea_worker_authorization_invalid");
  });

  it("pubblica il transito SPID confermato come login richiesto e non come blocco tecnico", () => {
    expect(aprEneaWorkerLoopFailureDisposition(new Error("apr_cdp_enea_external_login_in_progress"))).toMatchObject({
      status: "login_required",
      type: "external_login_in_progress",
    });
  });

  it("mantiene fail-closed un rifiuto di origine non confermato come transito SPID", () => {
    expect(aprEneaWorkerLoopFailureDisposition(new Error("apr_cdp_enea_origin_rejected"))).toMatchObject({
      status: "technical_block",
      type: "technical_block",
      reason: "apr_cdp_enea_origin_rejected",
    });
  });

  it("disarma prima di segnalare un worker recente e conserva una ricevuta auditabile", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-emergency-stop-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const now = new Date("2026-08-27T10:00:00.000Z");
    service.configure({ setupEnabled: true, operationalEnabled: false }, now);
    service.record({ instanceId: "worker-stop-test", processPid: 43210, status: "running", type: "worker_tick", reason: "Compilazione in corso.", nextAction: "Pagina successiva." }, now);
    const signals: Array<[number, NodeJS.Signals]> = [];

    const receipt = service.emergencyStop("dashboard:stop:test", new Date("2026-08-27T10:00:01.000Z"), (pid, signal) => { signals.push([pid, signal]); });

    expect(signals).toEqual([[43210, "SIGTERM"]]);
    expect(service.loadConfig()).toMatchObject({ setupEnabled: false, operationalEnabled: false });
    expect(receipt).toMatchObject({ targetPid: 43210, signalOutcome: "sigterm_sent", setupEnabled: false, operationalEnabled: false });
    expect(service.snapshot().emergencyStop).toEqual(receipt);
  });

  it("non invia segnali a un PID con heartbeat scaduto ma mantiene il disarmo persistente", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-emergency-stop-stale-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const recordedAt = new Date("2026-08-27T10:00:00.000Z");
    service.configure({ setupEnabled: true, operationalEnabled: false }, recordedAt);
    service.record({ instanceId: "worker-stale-test", processPid: 43211, status: "running", type: "worker_tick", reason: "Vecchio heartbeat.", nextAction: "Nessuna." }, recordedAt);
    const signals: number[] = [];

    const receipt = service.emergencyStop("dashboard:stop:stale", new Date("2026-08-27T10:01:00.000Z"), (pid) => { signals.push(pid); });

    expect(signals).toEqual([]);
    expect(receipt).toMatchObject({ targetPid: null, heartbeatAgeMs: 60_000, signalOutcome: "stale_process_not_signalled" });
    expect(service.loadConfig()).toMatchObject({ setupEnabled: false, operationalEnabled: false });
  });

  it("riconcilia un checkpoint running con un PID realmente assente e persiste stopped", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-liveness-reconcile-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    service.record({ instanceId: "worker-dead", processPid: 43212, status: "running", type: "worker_tick", reason: "Compilazione in corso.", nextAction: "Pagina successiva." }, new Date("2026-08-27T10:00:00Z"));

    const snapshot = service.snapshot(new Date("2026-08-27T10:00:01Z"), () => false);

    expect(snapshot.service).toMatchObject({ status: "stopped", processPid: 0, instanceId: "worker-dead" });
    expect(snapshot.service.audit.at(-1)).toMatchObject({ type: "process_liveness_reconciled" });
    expect(JSON.parse(readFileSync(service.statePath, "utf8"))).toMatchObject({ status: "stopped", processPid: 0 });
  });

  it("riconcilia anche il checkpoint pubblico interno del worker quando il processo e' fermo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-public-checkpoint-reconcile-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const workerDirectory = path.join(root, "enea-browser-worker");
    mkdirSync(workerDirectory, { recursive: true });
    writeFileSync(path.join(workerDirectory, "checkpoint.json"), JSON.stringify({
      version: "apr-enea-browser-worker-v1", revision: 3, status: "running", instanceId: "worker-dead-public", processPid: 43215,
      driverKind: "simulated_portal", driverIdentity: "fixture", leaseUntil: "2026-08-27T10:01:00.000Z", heartbeatAt: "2026-08-27T10:00:00.000Z",
      currentCustomerKey: "case-one", currentAction: "prepare_allowlisted_page", completedCustomerKeys: [], blockedCustomerKeys: [],
      forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0,
      reason: "Compilazione in corso.", nextAction: "Pagina successiva.", processedCommandIds: ["worker:init"],
      audit: [{ revision: 0, at: "2026-08-27T10:00:00.000Z", commandId: "worker:init", event: "initialized", executorKind: "apr_browser_worker", instanceId: "worker-dead-public", processPid: 43215, driverKind: "simulated_portal", driverIdentity: "fixture", customerKey: null, action: "initialize", evidenceId: null, reason: "init", appliedRuleIds: ["system-atomic-checkpoint-resume"] }],
    }));
    service.record({ instanceId: "worker-dead-public", processPid: 43215, status: "running", type: "worker_tick", reason: "Compilazione in corso.", nextAction: "Pagina successiva." }, new Date("2026-08-27T10:00:00Z"));

    const snapshot = service.snapshot(new Date("2026-08-27T10:00:02Z"), () => false);

    expect(snapshot.service).toMatchObject({ status: "stopped", processPid: 0 });
    expect(snapshot.worker).toMatchObject({ status: "stopped", processPid: 0, currentCustomerKey: null, currentAction: "stopped" });
    expect(JSON.parse(readFileSync(path.join(workerDirectory, "checkpoint.json"), "utf8"))).toMatchObject({ status: "stopped", processPid: 0 });
  });

  it("azzera il PID storico di un servizio gia' stopped quando il processo non esiste piu'", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-stopped-pid-reconcile-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    service.record({ instanceId: "worker-stopped-old-pid", processPid: 43216, status: "stopped", type: "stopped", reason: "Worker fermato.", nextAction: "Attendere." }, new Date("2026-08-27T10:00:00Z"));

    const snapshot = service.snapshot(new Date("2026-08-27T10:00:01Z"), () => false);

    expect(snapshot.service).toMatchObject({ status: "stopped", processPid: 0 });
    expect(snapshot.service.audit.at(-1)).toMatchObject({ type: "process_liveness_reconciled" });
  });

  it("impedisce a un completamento asincrono della stessa istanza di sovrascrivere stopped", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-stop-tombstone-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const now = new Date("2026-08-27T10:00:00Z");
    service.record({ instanceId: "worker-old", processPid: 43213, status: "running", type: "worker_tick", reason: "Compilazione in corso.", nextAction: "Pagina successiva." }, now);
    service.record({ instanceId: "worker-old", processPid: 0, status: "stopped", type: "stop_signal_persisted", reason: "SIGTERM persistito.", nextAction: "Nuova istanza." }, new Date("2026-08-27T10:00:01Z"));

    service.record({ instanceId: "worker-old", processPid: 43213, status: "running", type: "late_worker_tick", reason: "Risultato asincrono tardivo.", nextAction: "Non valido." }, new Date("2026-08-27T10:00:02Z"));
    expect(service.loadState()).toMatchObject({ status: "stopped", processPid: 0, instanceId: "worker-old" });
    expect(service.loadState().audit.some((event) => event.type === "late_worker_tick")).toBe(false);

    service.record({ instanceId: "worker-new", processPid: 43214, status: "starting_browser", type: "browser_starting", reason: "Nuova istanza.", nextAction: "Ripresa." }, new Date("2026-08-27T10:00:03Z"));
    expect(service.loadState()).toMatchObject({ status: "starting_browser", processPid: 43214, instanceId: "worker-new" });
  });

  it("persiste e audita il conteggio delle connessioni CDP senza duplicare eventi invariati", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-cdp-count-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const openedAt = new Date("2026-08-24T10:00:00.000Z");
    const closedAt = new Date("2026-08-24T10:01:00.000Z");

    service.recordCdpConnections({ active: 1, opened: 1, closed: 0, targetIds: ["target-1"] }, openedAt);
    const opened = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(opened.cdpConnections).toEqual({ active: 1, opened: 1, closed: 0, targetIds: ["target-1"], observedAt: openedAt.toISOString() });
    expect(opened.audit.filter((event: { type: string }) => event.type === "cdp_connection_count")).toHaveLength(1);

    service.recordCdpConnections({ active: 1, opened: 1, closed: 0, targetIds: ["target-1"] }, new Date("2026-08-24T10:00:30.000Z"));
    const unchanged = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(unchanged.audit.filter((event: { type: string }) => event.type === "cdp_connection_count")).toHaveLength(1);

    service.recordCdpConnections({ active: 0, opened: 1, closed: 1, targetIds: [] }, closedAt);
    const closed = JSON.parse(readFileSync(service.statePath, "utf8"));
    expect(closed.cdpConnections).toEqual({ active: 0, opened: 1, closed: 1, targetIds: [], observedAt: closedAt.toISOString() });
    expect(closed.audit.filter((event: { type: string }) => event.type === "cdp_connection_count")).toHaveLength(2);
    expect(closed.audit.at(-1)).toMatchObject({ type: "cdp_connection_count" });
    expect(closed.audit.at(-1).appliedRuleIds).toContain("system-cdp-single-connection-per-target");
  });

  it("mantiene il keepalive anche con preflight bloccato senza ripeterlo prima della scadenza", () => {
    const lastKeepaliveAt = "2026-08-16T10:00:00.000Z";
    expect(isAprEneaKeepaliveDue({ lastKeepaliveAt: null, keepaliveIntervalMs: 240_000, now: new Date("2026-08-16T10:00:01.000Z") })).toBe(true);
    expect(isAprEneaKeepaliveDue({ lastKeepaliveAt, keepaliveIntervalMs: 240_000, now: new Date("2026-08-16T10:03:59.999Z") })).toBe(false);
    expect(isAprEneaKeepaliveDue({ lastKeepaliveAt, keepaliveIntervalMs: 240_000, now: new Date("2026-08-16T10:04:00.000Z") })).toBe(true);
    expect(isAprEneaKeepaliveDue({ lastKeepaliveAt: "invalid", keepaliveIntervalMs: 240_000, now: new Date("2026-08-16T10:00:01.000Z") })).toBe(true);
    expect(aprEneaKeepaliveInterval({ configuredIntervalMs: 240_000, serviceStatus: "technical_block", lastAuditType: "keepalive_inconclusive" })).toBe(30_000);
    expect(shouldHoldAprEneaKeepaliveState({ keepaliveDue: false, serviceStatus: "technical_block", lastAuditType: "keepalive_inconclusive" })).toBe(true);
    expect(shouldHoldAprEneaKeepaliveState({ keepaliveDue: true, serviceStatus: "technical_block", lastAuditType: "keepalive_inconclusive" })).toBe(false);
    expect(shouldHoldAprEneaKeepaliveState({ keepaliveDue: false, serviceStatus: "running", lastAuditType: "worker_tick" })).toBe(false);
  });

  it("preserva la prova sessione del servizio quando il checkpoint preflight non ha una lease propria", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-session-evidence-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    service.record({ instanceId: "apr-worker-test", processPid: 106, status: "running", type: "keepalive_ok", reason: "Sessione provata.", nextAction: "Attendere coda.", sessionEvidenceId: "server-proof-1" });
    service.record({ instanceId: "apr-worker-test", processPid: 106, status: "running", type: "worker_tick", reason: "Preflight bloccato.", nextAction: "Attendere coda." });
    expect(service.loadState().sessionEvidenceId).toBe("server-proof-1");
  });

  it("mantiene keepalive H24 e rifiuta l'operatività finché contratto DOM e due casi non sono provati", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const initial = service.loadConfig(new Date("2026-08-15T19:00:00.000Z"));
    expect(initial).toMatchObject({ keepaliveIntervalMs: 240_000, autoArmWhenReady: true, minimumConsecutiveCases: 2, operationalEnabled: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    service.configure({ setupEnabled: true, operationalEnabled: false });
    expect(() => service.configure({ operationalEnabled: true })).toThrow("apr_enea_worker_real_dom_contract_not_ready");

    service.record({ instanceId: "apr-worker-test", processPid: 100, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate coda." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } }));
    writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "case-one", state: "queued" }, { customerKey: "case-two", state: "queued" }, { customerKey: "beatrice-ciotta", state: "deferred_operator" }] }));
    expect(service.autoArm()).toMatchObject({ armed: true, reason: "gate_verified_and_auto_armed", config: { setupEnabled: true, operationalEnabled: true, keepaliveIntervalMs: 240_000, autoArmWhenReady: true } });
  });

  it("non arma una sola pratica né Beatrice Ciotta", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-cardinality-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 101, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate coda." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true }); writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "case-one", state: "queued" }, { customerKey: "beatrice-ciotta", state: "queued" }] }));
    expect(() => service.configure({ operationalEnabled: true })).toThrow("apr_enea_worker_minimum_queue_gate_not_ready");
  });

  it("arma una sola pratica esclusivamente quando il seed contiene la regola di regressione singola", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-single-regression-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-single", processPid: 111, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate coda." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } }));
    writeServerProbeGate(root);
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true });
    const practiceId = "00000000-0000-4000-8000-000000000111";
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({
      status: "armed_readonly",
      verifiedMapperBridgeRequired: true,
      candidates: [{ customerKey: "luca-callegari", practiceId }],
      repeatTest: { deletionProofRequired: false },
      audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }],
    }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "luca-callegari", state: "queued" }] }));
    expect(service.autoArm()).toMatchObject({ armed: false, reason: "apr_enea_worker_verified_mapper_bridge_not_ready", config: { operationalEnabled: false } });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({ status: "waiting", verifiedMapperBridgeReady: false });

    armVerifiedMapperBridge(root, "luca-callegari", practiceId);
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({ status: "armed", runnableCount: 1, cohortCount: 1, minimumRequired: 1, verifiedMapperBridgeReady: true });
  });

  it("riarma la stessa bozza dal checkpoint parziale filling senza crearne una nuova", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-partial-filling-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-partial", processPid: 113, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Riprendere la bozza." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } }));
    writeServerProbeGate(root);
    const customerKey = "case-partial";
    const practiceId = "00000000-0000-4000-8000-000000000113";
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({
      status: "armed_readonly", verifiedMapperBridgeRequired: true,
      candidates: [{ customerKey, practiceId }],
      audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }],
    }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({
      currentCustomerKey: customerKey,
      previewAllowed: false, submitAllowed: false, communicationsAllowed: false,
      items: [{
        customerKey, state: "filling", draftId: "438596", createAttemptCount: 1, saveAttemptCount: 0,
        completedPageIds: ["page:Anagrafica Beneficiario"],
        pageCheckpoints: [
          { pageId: "page:Anagrafica Beneficiario", state: "saved", saveAttemptCount: 1, recoverySaveAttemptCount: 0 },
          { pageId: "page:Immobile", state: "prepared", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
        ],
      }],
    }));
    armVerifiedMapperBridge(root, customerKey, practiceId);

    expect(service.autoArm()).toMatchObject({ armed: true, reason: "gate_verified_and_auto_armed", config: { operationalEnabled: true } });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({
      status: "armed", runnableCount: 1, verifiedMapperBridgeReady: true,
    });
    const execution = JSON.parse(readFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), "utf8"));
    expect(execution).toMatchObject({ currentCustomerKey: customerKey, items: [{ customerKey, state: "filling", draftId: "438596", createAttemptCount: 1 }] });
  });

  it("distingue l'assenza di casi riprendibili da un bridge non valido", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-no-resumable-case-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-empty", processPid: 114, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate coda." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } }));
    writeServerProbeGate(root);
    const customerKey = "case-complete";
    const practiceId = "00000000-0000-4000-8000-000000000114";
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({
      status: "armed_readonly", verifiedMapperBridgeRequired: true,
      candidates: [{ customerKey, practiceId }],
      audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }],
    }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({
      currentCustomerKey: null,
      previewAllowed: false, submitAllowed: false, communicationsAllowed: false,
      items: [{ customerKey, state: "saved", draftId: "438597", createAttemptCount: 1, saveAttemptCount: 1 }],
    }));
    armVerifiedMapperBridge(root, "different-case", "00000000-0000-4000-8000-000000000999");

    expect(service.autoArm()).toMatchObject({ armed: false, reason: "apr_enea_worker_no_resumable_case" });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({
      status: "waiting", runnableCount: 0, verifiedMapperBridgeReady: false, reason: "apr_enea_worker_no_resumable_case",
      nextAction: "Nessun caso da riprendere nel checkpoint: APR non attribuisce questa condizione al bridge verificato.",
    });
  });

  it("rifiuta un bridge L4 armato per una pratica diversa", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-bridge-mismatch-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-bridge", processPid: 112, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate bridge." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } }));
    writeServerProbeGate(root);
    const expectedPracticeId = "00000000-0000-4000-8000-000000000112";
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({
      status: "armed_readonly", verifiedMapperBridgeRequired: true,
      candidates: [{ customerKey: "case-expected", practiceId: expectedPracticeId }],
      audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }],
    }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "case-expected", state: "queued" }] }));
    armVerifiedMapperBridge(root, "other-case", "00000000-0000-4000-8000-000000000999");

    expect(service.autoArm()).toMatchObject({ armed: false, reason: "apr_enea_worker_verified_mapper_bridge_not_ready" });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({
      status: "waiting", verifiedMapperBridgeReady: false,
      nextAction: "Il caso è riprendibile, ma il bridge verificato non corrisponde alla pratica autorizzata; APR resta fail-closed.",
    });
  });

  it("arma un caso verde quando il secondo caso della coorte e' isolato e la prova GET deriva dal worker APR", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-isolated-case-")); directories.push(root);
    const now = new Date("2026-08-17T15:10:00.000Z");
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true }, now);
    service.record({ instanceId: "apr-worker-test", processPid: 109, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate coda.", sessionEvidenceId: "server-proof-direct" }, now);
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    const event = (action: string) => ({ at: now.toISOString(), action, evidenceId: "server-proof-direct", url: "https://bonusfiscali.enea.it/dashboard", targetId: "target-1", customerKey: null, draftId: null, pageId: null, domSha256: "a".repeat(64), appliedRuleIds: ["authorized-27-enea-session-readonly-keepalive"] });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true, observedAt: now.toISOString(), operationalUrl: "https://bonusfiscali.enea.it/dashboard", evidenceId: "server-proof-direct" }, events: [event("verify_session_dom_server_get"), event("inspect_portal_contract_readonly")] }));
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({ status: "armed_readonly", repeatTest: null, candidates: [{ customerKey: "case-ready" }, { customerKey: "case-blocked" }] }));
    mkdirSync(path.join(root, "crm-local-preflight"), { recursive: true });
    writeFileSync(path.join(root, "crm-local-preflight", "checkpoint.json"), JSON.stringify({ items: [{ customerKey: "case-ready", state: "ready_local_plan" }, { customerKey: "case-blocked", state: "blocked_case" }] }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "case-ready", state: "queued" }] }));

    expect(service.autoArm(now)).toMatchObject({ armed: true, config: { operationalEnabled: true } });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({ status: "armed", runnableCount: 1, cohortCount: 2, isolatedCount: 1, serverReadOnlyProbeReady: true });
    expect(JSON.parse(readFileSync(path.join(root, "enea-browser-worker", "server-readonly-proof.json"), "utf8"))).toMatchObject({ version: "apr-enea-server-readonly-proof-v1" });
  });

  it("persiste il gate coda e non arma due casi senza prova server read-only", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-server-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 108, status: "setup_ready", type: "setup_ready", reason: "Sessione pronta.", nextAction: "Gate coda." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true });
    writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "case-one", state: "queued" }, { customerKey: "case-two", state: "queued" }] }));

    expect(service.autoArm()).toMatchObject({ armed: false, reason: "apr_enea_worker_server_readonly_probe_not_ready" });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({ status: "waiting", runnableCount: 2, serverReadOnlyProbeReady: false, ciottaExcluded: true });

    writeServerProbeGate(root);
    expect(service.autoArm()).toMatchObject({ armed: true, reason: "gate_verified_and_auto_armed" });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({ status: "armed", runnableCount: 2, serverReadOnlyProbeReady: true, executionSafetyReady: true });
  });

  it("non arma un repeat-test finché la cancellazione delle vecchie bozze non è provata", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-repeat-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-repeat", processPid: 107, status: "setup_ready", type: "setup_ready", reason: "Sessione pronta.", nextAction: "Gate repeat." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true }); writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "case-one", state: "queued" }, { customerKey: "case-two", state: "queued" }, { customerKey: "case-three", state: "queued" }] }));
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true }); writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({ status: "awaiting_deletion_proof", repeatTest: { priorDrafts: [{ customerKey: "case-one", draftId: "411950" }] } }));
    expect(service.autoArm()).toMatchObject({ armed: false, reason: "apr_enea_worker_repeat_deletion_gate_not_ready" });
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({ status: "deletion_verified", repeatTest: { priorDrafts: [{ customerKey: "case-one", draftId: "411950" }] } }));
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
  });

  it("arma due casi recuperabili auditati senza azzerare contatori o duplicare bozze", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-recovery-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 102, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate recupero." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true }); writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [
      { customerKey: "case-one", state: "operator_intervention", draftId: "411581", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario"], pageCheckpoints: [{ state: "saved", saveAttemptCount: 1 }, { state: "pending", saveAttemptCount: 0 }], reason: "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-impianto_centralizzato" },
      { customerKey: "case-two", state: "operator_intervention", draftId: null, createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: [], pageCheckpoints: [{ state: "pending", saveAttemptCount: 0 }], reason: "Errore circoscritto alla pratica: enea_draft_id_duplicate" },
    ] }));
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: ["411581", "411582"].map((draftId, index) => ({
      customerKey: `case-${index + 1}`,
      state: "operator_intervention",
      draftId,
      createAttemptCount: 1,
      saveAttemptCount: 0,
      completedPageIds: ["page:Beneficiario"],
      pageCheckpoints: [{ pageId: "page:Intervento", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1 }],
      uncertainPageSave: { pageId: "page:Intervento", status: "operator_required", probes: [] },
      reason: "Anche l'unico recupero autorizzato ha esito incerto: apr_cdp_command_timeout:Runtime.evaluate",
    })) }));
    expect(service.configure({ operationalEnabled: true })).toMatchObject({ operationalEnabled: true });
  });

  it("arma un timeout pre-Salva con righe staged valide e respinge staged senza prova", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-staged-timeout-gate-")); directories.push(root);
    const practiceId = "practice-staged-timeout";
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 108, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate timeout staged." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true }); writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({ status: "prepared", candidates: [{ customerKey: "case-one", practiceId }], audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }] }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    const execution = { previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{
      customerKey: "case-one", state: "operator_intervention", draftId: "438729", createAttemptCount: 1, saveAttemptCount: 0,
      completedPageIds: ["page:Beneficiario"],
      pageCheckpoints: [
        { pageId: "page:Beneficiario", state: "saved", saveAttemptCount: 1, savedEvidenceId: "server-beneficiary" },
        { pageId: "screening:1", state: "staged", saveAttemptCount: 1, stagedEvidenceId: "staged-row-1" },
        { pageId: "screening:2", state: "pending", saveAttemptCount: 0 },
      ],
      reason: "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate",
    }] };
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify(execution));
    armVerifiedMapperBridge(root, "case-one", practiceId);
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });

    service.configure({ operationalEnabled: false });
    execution.items[0].pageCheckpoints[1].stagedEvidenceId = null as never;
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify(execution));
    expect(service.autoArm()).toMatchObject({ armed: false });
  });

  it("riconosce due checkpoint legacy con Salva incerto come coda recuperabile in sola lettura", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-legacy-save-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 103, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate recupero legacy." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true }); writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [
      { customerKey: "case-one", state: "operator_intervention", draftId: "411581", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario"], pageCheckpoints: [{ pageId: "page:Intervento", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 }], uncertainPageSave: null, reason: "Errore circoscritto alla pratica: apr_cdp_command_timeout:Runtime.evaluate" },
      { customerKey: "case-two", state: "operator_intervention", draftId: "411582", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario"], pageCheckpoints: [{ pageId: "page:Immobile", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 }], uncertainPageSave: { status: "operator_required", probes: ["server_redirect", "persisted_fields_get", "server_metadata_get"].map((method) => ({ method, outcome: "inconclusive", reason: "apr_cdp_enea_mapping_missing" })) }, reason: "Tre sonde tecniche non eseguite per mappatura locale mancante" },
    ] }));
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
  });

  it("arma due recuperi con prova GET canonica di non persistenza senza richiedere conferme per pratica", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-server-proof-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 104, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate recupero server." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true }); writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [
      { customerKey: "case-one", state: "operator_intervention", draftId: "411581", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario"], pageCheckpoints: [{ pageId: "page:Intervento", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 }], uncertainPageSave: { status: "operator_required", probes: [{ method: "persisted_fields_get", outcome: "not_saved", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/intervento/411581" }] }, reason: "Prova server conclusiva" },
      { customerKey: "case-two", state: "operator_intervention", draftId: "411582", createAttemptCount: 1, saveAttemptCount: 0, completedPageIds: ["page:Beneficiario"], pageCheckpoints: [{ pageId: "page:Immobile", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 }], uncertainPageSave: { status: "operator_required", probes: [{ method: "persisted_fields_get", outcome: "not_saved", reason: "Pagina vuota.", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/immobile/411582" }] }, reason: "Prova server conclusiva" },
    ] }));
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
  });

  it("riconosce due recuperi fermati prima del click come riprendibili", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-preclick-gate-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root); service.configure({ setupEnabled: true });
    service.record({ instanceId: "apr-worker-test", processPid: 105, status: "setup_ready", type: "setup_ready", reason: "Sessione e contratto pronti.", nextAction: "Gate ricompilazione." });
    mkdirSync(path.join(root, "enea-browser-worker"), { recursive: true }); writeFileSync(path.join(root, "enea-browser-worker", "cdp-driver.json"), JSON.stringify({ contract: { ready: true } })); writeServerProbeGate(root);
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true }); writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: ["411581", "411582"].map((draftId, index) => ({
      customerKey: `case-${index + 1}`,
      state: "operator_intervention",
      draftId,
      createAttemptCount: 1,
      saveAttemptCount: 0,
      completedPageIds: ["page:Beneficiario"],
      pageCheckpoints: [{ pageId: "page:Intervento", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 1 }],
      uncertainPageSave: { pageId: "page:Intervento", status: "recovery_authorized", probes: [] },
      reason: "Errore circoscritto alla pratica: apr_cdp_enea_unique_enabled_save_button_not_found:page:Intervento",
    })) }));
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
  });

  it("riprende una verifica Schermature dopo timeout CDP senza ripetere il Salva della riga", () => {
    expect(isAprEneaOperatorCaseSafelyResumable({
      state: "operator_intervention",
      draftId: "440136",
      createAttemptCount: 1,
      saveAttemptCount: 0,
      completedPageIds: ["page:Beneficiario"],
      pageCheckpoints: [
        { pageId: "screening:1", state: "staged", saveAttemptCount: 1, recoverySaveAttemptCount: 0, stagedEvidenceId: "row-proof" },
        { pageId: "page:Schermature solari", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
      ],
      uncertainPageSave: { status: "resolved_staged", probes: [] },
      reason: "apr_cdp_command_timeout:Runtime.evaluate",
    })).toBe(true);
  });

  it("ammette solo la verifica server dell'outer Save incerto e non un secondo recupero mutativo", () => {
    const item = {
      state: "operator_intervention",
      draftId: "440212",
      createAttemptCount: 1,
      saveAttemptCount: 0,
      completedPageIds: ["page:Beneficiario"],
      pageCheckpoints: [
        { pageId: "screening:1", state: "staged", saveAttemptCount: 1, recoverySaveAttemptCount: 1, stagedEvidenceId: "row-1" },
        { pageId: "screening:2", state: "staged", saveAttemptCount: 1, recoverySaveAttemptCount: 1, stagedEvidenceId: "row-2" },
        { pageId: "page:Schermature solari", state: "save_intent_recorded", saveAttemptCount: 1, recoverySaveAttemptCount: 0 },
      ],
      uncertainPageSave: { status: "resolved_staged", probes: [] },
      reason: "apr_enea_nested_page_not_persisted_after_outer_save:screening:2",
    };
    expect(isAprEneaOperatorCaseSafelyResumable(item)).toBe(true);
    expect(isAprEneaOperatorCaseSafelyResumable({ ...item, reason: "documento mancante" })).toBe(false);
  });

  it("riprende una verifica pre-Salva di piu campi senza creare una nuova bozza", () => {
    expect(isAprEneaOperatorCaseSafelyResumable({
      state: "operator_intervention",
      draftId: "440237",
      createAttemptCount: 1,
      saveAttemptCount: 0,
      completedPageIds: [],
      pageCheckpoints: [
        { pageId: "page:Anagrafica Beneficiario", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
        { pageId: "page:Immobile", state: "pending", saveAttemptCount: 0, recoverySaveAttemptCount: 0 },
      ],
      reason: "Errore circoscritto alla pratica: apr_cdp_enea_field_verification_failed:id-nome,id-cognome,id-codice_fiscale,id-comune_nascita",
    })).toBe(true);
  });

  it("migra e persiste il keepalive nelle configurazioni installate prima del gate H24", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-worker-service-migration-")); directories.push(root);
    const service = new PersistentAprEneaWorkerService(root);
    const legacy = service.loadConfig(new Date("2026-08-15T19:00:00.000Z"));
    const { keepaliveIntervalMs: _removedKeepalive, autoArmWhenReady: _removedAutoArm, ...legacyConfig } = legacy;
    writeFileSync(service.configPath, `${JSON.stringify(legacyConfig, null, 2)}\n`);

    expect(service.loadConfig()).toMatchObject({ keepaliveIntervalMs: 240_000, autoArmWhenReady: true });
    expect(JSON.parse(readFileSync(service.configPath, "utf8"))).toMatchObject({ keepaliveIntervalMs: 240_000, autoArmWhenReady: true });
  });
});
