import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveDashboardOperationalStatus, writeLocalDashboard } from "./dashboard";
import type { SupervisorSnapshot } from "./supervisor";
import { PersistentEneaRunner } from "./runner";
import { PersistentAprWatchdog } from "./aprWatchdog";

const now = new Date("2026-08-25T10:00:00.000Z");
const legacy: SupervisorSnapshot = {
  health: "runner_off",
  state: "off",
  reason: "Runner non ancora avviato.",
  nextAction: "Avviare il runner locale.",
  currentPracticeId: null,
  runnerOwnerId: null,
  runnerLeaseUntil: null,
  lastEvent: {
    id: "event-1",
    revision: 0,
    at: now.toISOString(),
    type: "state_initialized",
    practiceId: null,
    idempotencyKey: "system:init",
    appliedRuleIds: ["system-atomic-checkpoint-resume"],
    reason: "Fixture.",
    nextAction: "Fixture.",
    ownerId: null,
  },
  revision: 0,
  observedAt: now.toISOString(),
};

describe("verità operativa dashboard APR", () => {
  it("preferisce il watchdog vivo al runner storico spento", () => {
    const result = deriveDashboardOperationalStatus(legacy, now, null, {
      version: "apr-watchdog-v1",
      revision: 7,
      status: "OPERATOR_REQUIRED",
      instanceId: "watchdog-fixture",
      processPid: 123,
      heartbeatAt: "2026-08-25T09:59:55.000Z",
      currentCustomerKey: null,
      currentDisplayName: null,
      currentPhase: "intervento_operatore",
      phaseStartedAt: now.toISOString(),
      lastProgressAt: now.toISOString(),
      progressToken: "operator:1:completed",
      nextAction: "Gestire il caso isolato.",
      supervisorPid: 121,
      workerPid: 122,
      pendingRecovery: null,
      recoveryCount: 0,
      reason: "OPERATOR_REQUIRED — intervento registrato.",
      audit: [],
    });
    expect(result).toMatchObject({ publicStatus: "OPERATOR_REQUIRED", source: "watchdog", health: "operator_intervention", reason: "OPERATOR_REQUIRED — intervento registrato." });
  });

  it("non usa un watchdog con heartbeat scaduto", () => {
    const result = deriveDashboardOperationalStatus(legacy, now, null, {
      version: "apr-watchdog-v1",
      revision: 7,
      status: "WORKING",
      instanceId: "watchdog-stale",
      processPid: 123,
      heartbeatAt: "2026-08-25T09:58:00.000Z",
      currentCustomerKey: "fixture",
      currentDisplayName: "Fixture",
      currentPhase: "bozza_enea",
      phaseStartedAt: now.toISOString(),
      lastProgressAt: now.toISOString(),
      progressToken: "working",
      nextAction: "Non autorevole.",
      supervisorPid: 121,
      workerPid: 122,
      pendingRecovery: null,
      recoveryCount: 0,
      reason: "WORKING stale.",
      audit: [],
    });
    expect(result).toMatchObject({ publicStatus: null, source: "legacy_runner", health: "runner_off" });
  });

  it("non lascia WORKING quando lo stop worker e' successivo all'ultimo heartbeat watchdog", () => {
    const result = deriveDashboardOperationalStatus(legacy, now, {
      service: {
        status: "stopped",
        processPid: 0,
        heartbeatAt: "2026-08-25T09:59:59.000Z",
        reason: "Worker arrestato in sicurezza.",
        nextAction: "Riprendere dal checkpoint.",
      },
    } as never, {
      version: "apr-watchdog-v1",
      revision: 7,
      status: "WORKING",
      instanceId: "watchdog-stale-after-worker-stop",
      processPid: 123,
      heartbeatAt: "2026-08-25T09:59:58.000Z",
      currentCustomerKey: "fixture",
      currentDisplayName: "Fixture",
      currentPhase: "bozza_enea",
      phaseStartedAt: now.toISOString(),
      lastProgressAt: now.toISOString(),
      progressToken: "working",
      nextAction: "Continuare.",
      supervisorPid: 121,
      workerPid: 122,
      pendingRecovery: null,
      recoveryCount: 0,
      reason: "WORKING non piu' autorevole.",
      audit: [],
    }, {
      items: [{ customerKey: "fixture", displayName: "Fixture", state: "operator_intervention", reason: "Timeout tecnico isolato.", nextAction: "Revisionare il caso." }],
    } as never);

    expect(result).toMatchObject({ publicStatus: "OPERATOR_REQUIRED", source: "worker", health: "operator_intervention", currentPracticeId: "fixture" });
    expect(result.reason).toBe("Timeout tecnico isolato.");
  });

  it("dichiara TECHNICAL_BLOCK se APR e' fermo con lavoro ancora eseguibile", () => {
    const result = deriveDashboardOperationalStatus(legacy, now, {
      service: { status: "stopped", processPid: 0, heartbeatAt: now.toISOString(), reason: "Worker fermo.", nextAction: "Riprendere." },
    } as never, null, {
      items: [{ customerKey: "fixture", displayName: "Fixture", state: "filling", reason: "Compilazione parziale.", nextAction: "Continuare." }],
    } as never);

    expect(result).toMatchObject({ publicStatus: "TECHNICAL_BLOCK", source: "worker", health: "technical_block", currentPracticeId: "fixture" });
  });

  it("scrive status.json dalla verità watchdog invece del journal storico", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-dashboard-truth-"));
    try {
      const runnerState = new PersistentEneaRunner(directory).initialize([], now);
      const watchdog = new PersistentAprWatchdog(directory, { instanceId: "watchdog-persisted", processPid: 456, now: () => now });
      const watchdogState = watchdog.tick({
        observedAt: now.toISOString(),
        supervisor: { pid: 454, alive: true, heartbeatAt: now.toISOString() },
        worker: { pid: 455, alive: true, heartbeatAt: now.toISOString() },
        work: {
          actionable: false,
          target: "worker",
          customerKey: null,
          displayName: null,
          phase: "intervento_operatore",
          phaseStartedAt: now.toISOString(),
          lastProgressAt: now.toISOString(),
          progressToken: "operator:1:completed",
          nextAction: "Gestire il caso isolato.",
          operatorRequired: true,
          technicalBlock: false,
        },
      }).state;
      writeLocalDashboard(directory, runnerState, now, null, null, null, null, undefined, undefined, null, null, null, null, null, null, null, null, null, null, null, watchdogState);
      const persisted = JSON.parse(readFileSync(path.join(directory, "dashboard", "status.json"), "utf8"));
      expect(persisted).toMatchObject({
        publicStatus: "OPERATOR_REQUIRED",
        statusSource: "watchdog",
        health: "operator_intervention",
        state: "OPERATOR_REQUIRED",
        legacyRunner: { health: "run_completed" },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
