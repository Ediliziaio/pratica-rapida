import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APR_WATCHDOG_STALL_MS, PersistentAprWatchdog, type AprWatchdogObservation } from "./aprWatchdog";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const observation = (overrides: Partial<AprWatchdogObservation["work"]> = {}, at = "2026-08-16T10:00:00.000Z"): AprWatchdogObservation => ({
  observedAt: at,
  supervisor: { pid: 10, alive: true, heartbeatAt: at },
  worker: { pid: 20, alive: true, heartbeatAt: at },
  work: { actionable: false, target: "supervisor", customerKey: null, displayName: null, phase: "coda_vuota", phaseStartedAt: null, lastProgressAt: null, progressToken: "empty:0", nextAction: "Attendere una coda.", operatorRequired: false, technicalBlock: false, ...overrides },
});

describe("watchdog APR persistente", () => {
  it("distingue IDLE da WORKING e rende visibili pratica, fase e prossima azione", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-status-")); directories.push(root);
    const watchdog = new PersistentAprWatchdog(root, { instanceId: "watchdog-test", processPid: 30 });
    expect(watchdog.tick(observation()).state).toMatchObject({ status: "IDLE", reason: "IDLE — coda vuota.", currentCustomerKey: null });
    const working = watchdog.tick(observation({ actionable: true, customerKey: "case-one", displayName: "Caso Uno", phase: "preflight", phaseStartedAt: "2026-08-16T10:00:01.000Z", lastProgressAt: "2026-08-16T10:00:02.000Z", progressToken: "preflight:2", nextAction: "Validare il dossier." }, "2026-08-16T10:00:03.000Z")).state;
    expect(working).toMatchObject({ status: "WORKING", currentCustomerKey: "case-one", currentDisplayName: "Caso Uno", currentPhase: "preflight", nextAction: "Validare il dossier." });
  });

  it("richiede un solo riavvio dopo cinque minuti senza avanzamento e ne verifica la ripresa", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-stall-")); directories.push(root);
    const watchdog = new PersistentAprWatchdog(root, { instanceId: "watchdog-test", processPid: 31 });
    const stalled = watchdog.tick(observation({ actionable: true, target: "worker", customerKey: "case-one", displayName: "Caso Uno", phase: "salvataggio_bozza", phaseStartedAt: "2026-08-16T10:00:00.000Z", lastProgressAt: "2026-08-16T10:00:00.000Z", progressToken: "draft:5", nextAction: "Riprendere dal checkpoint." }, new Date(Date.parse("2026-08-16T10:00:00.000Z") + APR_WATCHDOG_STALL_MS).toISOString()));
    expect(stalled.recovery).toMatchObject({ target: "worker", priorPid: 20, attemptCount: 1 });
    const pendingObservation = observation({ actionable: true, target: "worker", phase: "salvataggio_bozza", progressToken: "draft:5", lastProgressAt: "2026-08-16T10:00:00.000Z" }, "2026-08-16T10:05:10.000Z");
    pendingObservation.worker = { pid: 20, alive: true, heartbeatAt: "2026-08-16T10:04:59.000Z" };
    const pending = watchdog.tick(pendingObservation);
    expect(pending.recovery).toBeNull(); expect(pending.state.pendingRecovery).not.toBeNull();
    const recoveredObservation = observation({ actionable: true, target: "worker", phase: "salvataggio_bozza", progressToken: "draft:5", lastProgressAt: "2026-08-16T10:00:00.000Z" }, "2026-08-16T10:05:20.000Z");
    recoveredObservation.worker = { pid: 21, alive: true, heartbeatAt: "2026-08-16T10:05:19.000Z" };
    const recovered = watchdog.tick(recoveredObservation);
    expect(recovered.state).toMatchObject({ pendingRecovery: null, recoveryCount: 1, status: "WORKING" });
    expect(recovered.state.audit.filter((event) => event.type === "recovery_requested")).toHaveLength(1);
  });

  it("isola OPERATOR_REQUIRED e recupera un processo morto anche con coda vuota", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-process-")); directories.push(root);
    const watchdog = new PersistentAprWatchdog(root, { instanceId: "watchdog-test", processPid: 32 });
    expect(watchdog.tick(observation({ operatorRequired: true, progressToken: "operator:1" })).state.status).toBe("OPERATOR_REQUIRED");
    const dead = observation({}, "2026-08-16T10:01:00.000Z"); dead.supervisor = { pid: 10, alive: false, heartbeatAt: "2026-08-16T10:00:00.000Z" };
    expect(watchdog.tick(dead).recovery).toMatchObject({ target: "supervisor" });
  });

  it("dopo il riavvio conserva TECHNICAL_BLOCK e la prossima azione del safety gate", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-watchdog-technical-recovery-")); directories.push(root);
    const watchdog = new PersistentAprWatchdog(root, { instanceId: "watchdog-test", processPid: 33 });
    const dead = observation({ technicalBlock: true, phase: "blocco_tecnico_gate", progressToken: "technical:3", nextAction: "Verificare admission read-only." }, "2026-08-16T10:00:00.000Z");
    dead.supervisor = { pid: 10, alive: false, heartbeatAt: "2026-08-16T09:59:59.000Z" };
    expect(watchdog.tick(dead).recovery).toMatchObject({ target: "supervisor" });
    const recovered = observation({ technicalBlock: true, phase: "blocco_tecnico_gate", progressToken: "technical:3", nextAction: "Verificare admission read-only." }, "2026-08-16T10:00:02.000Z");
    recovered.supervisor = { pid: 11, alive: true, heartbeatAt: "2026-08-16T10:00:01.000Z" };
    expect(watchdog.tick(recovered).state).toMatchObject({ status: "TECHNICAL_BLOCK", reason: "TECHNICAL_BLOCK — processo ripristinato; resta il safety gate blocco_tecnico_gate.", nextAction: "Verificare admission read-only.", pendingRecovery: null });
  });
});
