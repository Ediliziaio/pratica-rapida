import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aprEneaKeepaliveInterval, isAprEneaKeepaliveDue, PersistentAprEneaWorkerService, shouldHoldAprEneaKeepaliveState } from "./aprEneaBrowserWorkerService";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function writeServerProbeGate(root: string) {
  const directory = path.join(root, "crm-live-processing", "runtime", "apr-gate-orchestrator");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "checkpoint.json"), JSON.stringify({ gates: [{ gateId: "real_enea_server_readonly_probe", state: "completed" }] }));
}

describe("gate permanente del servizio browser APR", () => {
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
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({
      status: "armed_readonly",
      candidates: [{ customerKey: "luca-callegari" }],
      repeatTest: { deletionProofRequired: false },
      audit: [{ appliedRuleIds: ["user-2026-08-18-single-case-regression-test"] }],
    }));
    mkdirSync(path.join(root, "enea-draft-execution"), { recursive: true });
    writeFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), JSON.stringify({ previewAllowed: false, submitAllowed: false, communicationsAllowed: false, items: [{ customerKey: "luca-callegari", state: "queued" }] }));
    expect(service.autoArm()).toMatchObject({ armed: true, config: { operationalEnabled: true } });
    expect(JSON.parse(readFileSync(service.queueGatePath, "utf8"))).toMatchObject({ status: "armed", runnableCount: 1, cohortCount: 1, minimumRequired: 1 });
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
