import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAprWatchdogObservation } from "./aprWatchdogRuntime";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function write(root: string, relative: string, value: unknown) { const target = path.join(root, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value)); }

describe("osservazione runtime watchdog APR", () => {
  it("classifica coda vuota, lavoro preflight e blocchi operatore senza confonderli", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-runtime-")); directories.push(root);
    write(root, "supervisor/checkpoint.json", { instanceId: "supervisor-10-test", pid: 10, heartbeatAt: "2026-08-16T10:00:00.000Z" });
    write(root, "enea-browser-worker/service.json", { processPid: 20, status: "idle", heartbeatAt: "2026-08-16T10:00:00.000Z" });
    let result = buildAprWatchdogObservation(root, () => true, new Date("2026-08-16T10:00:01.000Z"));
    expect(result.work).toMatchObject({ actionable: false, phase: "coda_vuota", operatorRequired: false });
    write(root, "crm-local-preflight/checkpoint.json", { revision: 3, status: "running", currentCustomerKey: "case-one", nextAction: "Validare.", items: [{ customerKey: "case-one", displayName: "Caso Uno", state: "processing", startedAt: "2026-08-16T10:00:00.000Z" }], audit: [{ at: "2026-08-16T10:00:02.000Z" }] });
    result = buildAprWatchdogObservation(root, () => true, new Date("2026-08-16T10:00:03.000Z"));
    expect(result.work).toMatchObject({ actionable: true, target: "supervisor", customerKey: "case-one", displayName: "Caso Uno", phase: "preflight_locale", lastProgressAt: "2026-08-16T10:00:02.000Z" });
    write(root, "crm-local-preflight/checkpoint.json", { revision: 4, status: "completed", currentCustomerKey: null, items: [{ customerKey: "case-one", state: "blocked_case" }], audit: [{ at: "2026-08-16T10:00:04.000Z" }] });
    write(root, "crm-document-analysis/checkpoint.json", { revision: 5, status: "completed", currentCustomerKey: null, items: [{ customerKey: "case-one", state: "blocked" }], audit: [{ at: "2026-08-16T10:00:04.000Z" }] });
    result = buildAprWatchdogObservation(root, () => true, new Date("2026-08-16T10:00:05.000Z"));
    expect(result.work).toMatchObject({ actionable: false, operatorRequired: true, phase: "intervento_operatore", progressToken: "operator:1:idle" });
  });

  it("non conserva un vecchio blocco operatore quando la stessa pratica ha poi una bozza salvata", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-saved-supersedes-block-")); directories.push(root);
    write(root, "supervisor/checkpoint.json", { instanceId: "supervisor-10-test", pid: 10, heartbeatAt: "2026-08-18T10:00:00.000Z" });
    write(root, "enea-browser-worker/service.json", { processPid: 20, status: "completed", heartbeatAt: "2026-08-18T10:00:00.000Z", nextAction: "Consultare il report." });
    write(root, "crm-local-preflight/checkpoint.json", { revision: 4, status: "completed", currentCustomerKey: null, items: [{ customerKey: "case-one", state: "blocked_case" }] });
    write(root, "crm-document-analysis/checkpoint.json", { revision: 5, status: "completed", currentCustomerKey: null, items: [{ customerKey: "case-one", state: "blocked" }] });
    write(root, "enea-draft-execution/checkpoint.json", { revision: 20, status: "completed", currentCustomerKey: null, items: [{ customerKey: "case-one", state: "saved" }] });

    const result = buildAprWatchdogObservation(root, () => true, new Date("2026-08-18T10:00:01.000Z"));
    expect(result.work).toMatchObject({ actionable: false, operatorRequired: false, technicalBlock: false, phase: "coda_vuota", progressToken: "empty:0" });
  });

  it("osserva il gate successivo come lavoro e rende il safety gate esterno un blocco tecnico esplicito", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-gates-")); directories.push(root);
    write(root, "supervisor/checkpoint.json", { instanceId: "supervisor-10-test", pid: 10, heartbeatAt: "2026-08-17T10:00:00.000Z" });
    write(root, "enea-browser-worker/service.json", { processPid: 20, status: "idle", heartbeatAt: "2026-08-17T10:00:00.000Z" });
    write(root, "crm-live-processing/runtime/apr-gate-orchestrator/checkpoint.json", {
      revision: 2, status: "working_local", activeGateId: "local_enea_browser_bridge_contract", nextAction: "Validare il manifest.",
      gates: [{ gateId: "local_enea_browser_bridge_contract", state: "active", startedAt: "2026-08-17T10:00:01.000Z" }], audit: [{ at: "2026-08-17T10:00:02.000Z" }],
    });
    let result = buildAprWatchdogObservation(root, () => true, new Date("2026-08-17T10:00:03.000Z"));
    expect(result.work).toMatchObject({ actionable: true, target: "supervisor", phase: "orchestrazione_gate", progressToken: "orchestrazione_gate:2:queue:active", nextAction: "Validare il manifest." });
    write(root, "crm-live-processing/runtime/apr-gate-orchestrator/checkpoint.json", {
      revision: 3, status: "waiting_external_safety_gate", activeGateId: null, nextAction: "Verificare admission ENEA read-only.",
      gates: [{ gateId: "external_enea_readiness_admission", state: "waiting_safety_gate" }], audit: [{ at: "2026-08-17T10:00:04.000Z" }],
    });
    result = buildAprWatchdogObservation(root, () => true, new Date("2026-08-17T10:00:05.000Z"));
    expect(result.work).toMatchObject({ actionable: false, technicalBlock: true, operatorRequired: false, phase: "blocco_tecnico_gate", progressToken: "technical:0:3", nextAction: "Verificare admission ENEA read-only." });
  });

  it("osserva l'admission readiness locale come lavoro autonomo prima del safety gate operativo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-readiness-admission-")); directories.push(root);
    const admissionDirectory = path.join(root, "crm-live-processing/runtime/apr-enea-readiness-admission"); mkdirSync(admissionDirectory, { recursive: true });
    writeFileSync(path.join(admissionDirectory, "checkpoint.json"), JSON.stringify({ status: "working_local", revision: 4, phase: "keepalive_verified", nextAction: "Simulare scadenza.", audit: [{ at: "2026-08-17T12:00:04.000Z" }] }));
    const observation = buildAprWatchdogObservation(root, () => true, new Date("2026-08-17T12:00:05.000Z"));
    expect(observation.work).toMatchObject({ actionable: true, target: "supervisor", phase: "enea_readiness_admission", nextAction: "Simulare scadenza.", technicalBlock: false, progressToken: "enea_readiness_admission:4:queue:unknown" });
  });

  it("considera chiuso il blocco tecnico quando il gate server read-only e' completato", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-server-probe-")); directories.push(root);
    write(root, "supervisor/checkpoint.json", { instanceId: "supervisor-10-test", pid: 10, heartbeatAt: "2026-08-17T10:00:00.000Z" });
    write(root, "enea-browser-worker/service.json", { processPid: 20, status: "setup_ready", heartbeatAt: "2026-08-17T10:00:00.000Z" });
    write(root, "crm-live-processing/runtime/apr-gate-orchestrator/checkpoint.json", {
      revision: 11, status: "waiting_external_safety_gate", activeGateId: null, nextAction: "Attendere nuova coda.",
      gates: [{ gateId: "real_enea_server_readonly_probe", state: "completed" }], audit: [{ at: "2026-08-17T10:00:01.000Z" }],
    });
    const observation = buildAprWatchdogObservation(root, () => true, new Date("2026-08-17T10:00:02.000Z"));
    expect(observation.work).toMatchObject({ actionable: false, technicalBlock: false, operatorRequired: false, phase: "coda_vuota", nextAction: "Attendere una nuova coda APR persistente." });
  });

  it("osserva il piano discovery read-only come lavoro autonomo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-readonly-discovery-")); directories.push(root);
    write(root, "crm-live-processing/runtime/apr-enea-readonly-discovery/checkpoint.json", { status: "working_local", revision: 3, phase: "surface_plan_verified", nextAction: "Verificare keepalive.", audit: [{ at: "2026-08-17T13:00:03.000Z" }] });
    const observation = buildAprWatchdogObservation(root, () => true, new Date("2026-08-17T13:00:04.000Z"));
    expect(observation.work).toMatchObject({ actionable: true, target: "supervisor", phase: "enea_readonly_discovery", nextAction: "Verificare keepalive.", technicalBlock: false, progressToken: "enea_readonly_discovery:3:queue:unknown" });
  });

  it("non riapre il vecchio blocco schermature quando il modulo Infissi canonico e READY", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-infissi-ready-")); directories.push(root);
    write(root, "supervisor/checkpoint.json", { instanceId: "supervisor-101-test", pid: 101, heartbeatAt: "2026-08-19T10:00:00.000Z" });
    write(root, "enea-browser-worker/service.json", { processPid: 102, status: "disabled", heartbeatAt: "2026-08-19T10:00:00.000Z" });
    write(root, "crm-local-preflight/checkpoint.json", { status: "completed", items: [{ customerKey: "cristina-fabbro", state: "blocked_case" }] });
    write(root, "infissi-local-mapping/checkpoint.json", { status: "ready_for_portal_mapping", nextAction: "Mappare la pagina tecnica Infissi.", item: { customerKey: "cristina-fabbro", caseTruth: "READY", report: { outcome: "ready_local_plan", blockers: [] } } });
    const observation = buildAprWatchdogObservation(root, (pid) => pid === 101 || pid === 102, new Date("2026-08-19T10:00:01.000Z"));
    expect(observation.work).toMatchObject({ actionable: false, operatorRequired: false, technicalBlock: false, phase: "coda_vuota", nextAction: "Mappare la pagina tecnica Infissi." });
  });
});
