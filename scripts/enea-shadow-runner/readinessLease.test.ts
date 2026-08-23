import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import type { SessionReadinessInput } from "../../src/features/enea-shadow-crm/sessionReadiness";
import {
  PersistentReadinessLease,
  ReadinessLeaseBusyError,
} from "./readinessLease";
import {
  PersistentEneaRunner,
  RunnerReadinessBlockedError,
} from "./runner";

const temporaryDirectories: string[] = [];
const greenReadiness: SessionReadinessInput = {
  authorizedChromeVisible: true,
  crmDedicatedSessionVisible: true,
  crmAuthenticated: true,
  crmReadOnlyPageReachable: true,
  eneaSessionVisible: true,
  eneaAuthenticated: true,
  crmOriginAllowlisted: true,
  attachmentReadCapabilityVerified: true,
  eneaLeaseActive: true,
  persistentBrowserIdentityVerified: true,
};

function temporaryStateDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "enea-shadow-readiness-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("readiness/lease persistente e solo simulata", () => {
  it("persiste il keepalive autenticato, ne rende idempotente il replay e lo riprende dopo riavvio", () => {
    const directory = temporaryStateDirectory();
    const firstProcess = new PersistentReadinessLease(directory);
    const input = {
      authenticated: true,
      ok: true,
      serverVerified: true,
      method: "HEAD",
      surface: "summary" as const,
      action: "read_existing_summary",
      hasBody: false,
      mutativeIntent: false,
      readiness: greenReadiness,
    };
    const keptAlive = firstProcess.recordAuthenticatedKeepalive("keeper-a", input, "authenticated:1", new Date("2026-08-14T10:00:00.000Z"));
    const replay = firstProcess.recordAuthenticatedKeepalive("keeper-a", input, "authenticated:1", new Date("2026-08-14T10:00:01.000Z"));

    expect(keptAlive).toMatchObject({ status: "authenticated_active", safeKeepaliveCount: 1, leaseUntil: "2026-08-14T10:05:00.000Z" });
    expect(keptAlive.checks).toHaveLength(10);
    expect(keptAlive.audit.at(-1)).toMatchObject({ type: "readiness_authenticated_keepalive_ok", ownerId: "keeper-a" });
    expect(keptAlive.audit.at(-1)?.appliedRuleIds).toContain("user-2026-08-14-authenticated-enea-periodic-readonly-keepalive");
    expect(replay.revision).toBe(keptAlive.revision);
    expect(new PersistentReadinessLease(directory).load()).toEqual(keptAlive);
    expect(new PersistentReadinessLease(directory).snapshot(new Date("2026-08-14T10:04:59.000Z"))).toMatchObject({ leaseState: "active_authenticated", queueMayRun: false });
  });

  it("classifica un timeout come lease scaduta senza inferire logout né creare o perdere job", () => {
    const directory = temporaryStateDirectory();
    const runner = new PersistentEneaRunner(directory);
    const before = runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE, new Date("2026-08-14T09:59:00.000Z"));
    const firstProcess = new PersistentReadinessLease(directory);
    firstProcess.recordAuthenticatedKeepalive("keeper-a", {
      authenticated: true, ok: true, serverVerified: true, method: "GET", surface: "dashboard", action: "read_existing_dashboard", readiness: greenReadiness,
    }, "authenticated:timeout", new Date("2026-08-14T10:00:00.000Z"));
    const expired = new PersistentReadinessLease(directory).expireIfNeeded(new Date("2026-08-14T10:05:00.000Z"));

    expect(expired).toMatchObject({ status: "expired", ownerId: null });
    expect(expired.audit.at(-1)).toMatchObject({ type: "readiness_expired" });
    expect(expired.audit.at(-1)?.reason).toContain("logout non inferito");
    expect(expired.checks).toHaveLength(10);
    expect(runner.load().queue).toEqual(before.queue);
    expect(runner.load().revision).toBe(before.revision);
  });

  it("produce login_required solo con prova server reale di logout e rende il replay idempotente", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    lease.recordAuthenticatedKeepalive("keeper-a", {
      authenticated: true, ok: true, serverVerified: true, method: "GET", surface: "dashboard", action: "read_existing_dashboard", readiness: greenReadiness,
    }, "authenticated:before-logout", new Date("2026-08-14T10:00:00.000Z"));
    const loggedOut = lease.recordAuthenticatedKeepalive("keeper-a", {
      authenticated: false, ok: false, serverVerified: true, method: "GET", surface: "dashboard", action: "read_existing_dashboard",
      logoutEvidence: { source: "enea_server_response", evidenceId: "server-response-401-abc" },
    }, "authenticated:server-logout", new Date("2026-08-14T10:01:00.000Z"));
    const replay = new PersistentReadinessLease(directory).recordAuthenticatedKeepalive("keeper-a", {
      authenticated: false, ok: false, serverVerified: true, method: "GET", surface: "dashboard", action: "read_existing_dashboard",
      logoutEvidence: { source: "enea_server_response", evidenceId: "server-response-401-abc" },
    }, "authenticated:server-logout", new Date("2026-08-14T10:01:01.000Z"));

    expect(loggedOut).toMatchObject({ status: "login_required", ownerId: null });
    expect(loggedOut.audit.at(-1)).toMatchObject({ type: "readiness_login_required" });
    expect(loggedOut.audit.at(-1)?.reason).toContain("server-response-401-abc");
    expect(replay.revision).toBe(loggedOut.revision);
  });

  it("non degrada a login_required quando un rinnovo è rifiutato senza prova server di logout", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    const verified = lease.recordAuthenticatedKeepalive("keeper-a", {
      authenticated: true, ok: true, serverVerified: true, method: "HEAD", surface: "summary", action: "read_existing_summary", readiness: greenReadiness,
    }, "authenticated:verified", new Date("2026-08-14T10:00:00.000Z"));
    const rejected = lease.recordAuthenticatedKeepalive("keeper-a", {
      authenticated: false, ok: false, serverVerified: false, method: "GET", surface: "dashboard", action: "read_existing_dashboard",
    }, "authenticated:rejected", new Date("2026-08-14T10:01:00.000Z"));

    expect(rejected).toMatchObject({ status: "expired", safeKeepaliveCount: verified.safeKeepaliveCount });
    expect(rejected.heartbeatAt).toBe(verified.heartbeatAt);
    expect(rejected.checks).toEqual(verified.checks);
    expect(rejected.audit.at(-1)).toMatchObject({ type: "readiness_authenticated_keepalive_rejected" });
  });

  it("ripara append-only una vecchia classificazione login_required da timeout", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    lease.recordAuthenticatedKeepalive("keeper-a", {
      authenticated: true, ok: true, serverVerified: true, method: "GET", surface: "dashboard", action: "read_existing_dashboard", readiness: greenReadiness,
    }, "authenticated:legacy", new Date("2026-08-14T10:00:00.000Z"));
    const checkpointPath = path.join(directory, "readiness-lease", "checkpoint.json");
    const legacy = JSON.parse(readFileSync(checkpointPath, "utf8"));
    legacy.revision += 1;
    legacy.status = "login_required";
    legacy.ownerId = null;
    legacy.leaseUntil = "2026-08-14T10:05:00.000Z";
    legacy.processedIdempotencyKeys.push("readiness-expire:2026-08-14T10:05:00.000Z");
    legacy.audit.push({ id: "legacy-timeout", revision: legacy.revision, at: "2026-08-14T10:05:00.000Z", type: "readiness_login_required", ownerId: null, idempotencyKey: "readiness-expire:2026-08-14T10:05:00.000Z", appliedRuleIds: ["system-enea-lease-required"], reason: "legacy timeout", nextAction: "legacy login" });
    writeFileSync(checkpointPath, `${JSON.stringify(legacy, null, 2)}\n`);

    const repaired = new PersistentReadinessLease(directory).repairSpuriousTimeoutLoginRequired("repair:legacy-timeout", new Date("2026-08-14T10:06:00.000Z"));
    const replay = new PersistentReadinessLease(directory).repairSpuriousTimeoutLoginRequired("repair:legacy-timeout", new Date("2026-08-14T10:06:01.000Z"));
    expect(repaired).toMatchObject({ status: "expired", safeKeepaliveCount: 1 });
    expect(repaired.checks).toHaveLength(10);
    expect(repaired.audit.at(-1)).toMatchObject({ type: "readiness_checkpoint_repaired" });
    expect(repaired.audit.some((event) => event.type === "readiness_login_required")).toBe(true);
    expect(replay.revision).toBe(repaired.revision);
  });

  it("rifiuta preview, corpo e intento mutativo nel keepalive autenticato", () => {
    const directory = temporaryStateDirectory();
    const state = new PersistentReadinessLease(directory).recordAuthenticatedKeepalive("keeper-a", {
      authenticated: true, ok: true, serverVerified: true, method: "GET", surface: "dashboard", action: "apri preview", hasBody: true, mutativeIntent: true,
    }, "authenticated:forbidden", new Date("2026-08-14T10:00:00.000Z"));
    expect(state).toMatchObject({ status: "blocked", safeKeepaliveCount: 0 });
    expect(state.audit.at(-1)).toMatchObject({ type: "readiness_authenticated_keepalive_rejected" });
  });

  it("acquisisce una lease simulata, rinnova soltanto con keepalive innocuo e tratta il replay come idempotente", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    const acquired = lease.acquireSimulation("owner-a", greenReadiness, "acquire:a", new Date("2026-08-14T10:00:00.000Z"));

    expect(acquired).toMatchObject({ status: "simulation_ready", evidenceMode: "local_simulation", operationalGate: "blocked_pending_real_readiness" });
    expect(lease.snapshot(new Date("2026-08-14T10:00:01.000Z"))).toMatchObject({ leaseState: "active_simulation", queueMayRun: false });
    expect(() => lease.acquireSimulation("owner-b", greenReadiness, "acquire:b-too-early", new Date("2026-08-14T10:00:02.000Z"))).toThrow(ReadinessLeaseBusyError);

    const keptAlive = lease.keepaliveSimulation("owner-a", {
      ok: true,
      serverVerified: true,
      method: "GET",
      surface: "dashboard",
      action: "read existing dashboard",
    }, "keepalive:a:1", new Date("2026-08-14T10:00:05.000Z"));
    const replayed = lease.keepaliveSimulation("owner-a", {
      ok: true,
      serverVerified: true,
      method: "GET",
      surface: "dashboard",
      action: "read existing dashboard",
    }, "keepalive:a:1", new Date("2026-08-14T10:00:06.000Z"));

    expect(keptAlive.safeKeepaliveCount).toBe(1);
    expect(keptAlive.leaseUntil).toBe("2026-08-14T10:00:20.000Z");
    expect(replayed.revision).toBe(keptAlive.revision);
    expect(keptAlive.audit.at(-1)).toMatchObject({ type: "readiness_keepalive_ok" });
    expect(keptAlive.audit.at(-1)?.appliedRuleIds).toContain("system-enea-lease-required");
  });

  it("rifiuta un keepalive mutativo e mantiene il blocco globale", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    lease.acquireSimulation("owner-a", greenReadiness, "acquire:a", new Date("2026-08-14T10:00:00.000Z"));
    const blocked = lease.keepaliveSimulation("owner-a", {
      ok: true,
      serverVerified: true,
      method: "POST",
      surface: "dashboard",
      action: "salva e invia",
    }, "keepalive:forbidden", new Date("2026-08-14T10:00:01.000Z"));

    expect(blocked).toMatchObject({ status: "blocked", operationalGate: "blocked_pending_real_readiness", safeKeepaliveCount: 0 });
    expect(lease.snapshot(new Date("2026-08-14T10:00:02.000Z"))).toMatchObject({ leaseState: "blocked", queueMayRun: false });
    expect(blocked.audit.at(-1)).toMatchObject({ type: "readiness_keepalive_rejected" });
  });

  it("persiste scadenza e recupero da un nuovo processo senza doppia proprietà", () => {
    const directory = temporaryStateDirectory();
    const firstProcess = new PersistentReadinessLease(directory);
    firstProcess.acquireSimulation("owner-a", greenReadiness, "acquire:a", new Date("2026-08-14T10:00:00.000Z"));
    const expired = firstProcess.expireIfNeeded(new Date("2026-08-14T10:00:15.000Z"));

    expect(expired).toMatchObject({ status: "expired", ownerId: "owner-a" });
    expect(expired.audit.at(-1)).toMatchObject({ type: "readiness_expired" });

    const restartedProcess = new PersistentReadinessLease(directory);
    expect(restartedProcess.load()).toEqual(expired);
    const recovered = restartedProcess.acquireSimulation("owner-b", greenReadiness, "acquire:b:recover", new Date("2026-08-14T10:00:16.000Z"));
    expect(recovered).toMatchObject({ status: "simulation_ready", ownerId: "owner-b" });
    expect(recovered.audit.at(-1)).toMatchObject({ type: "readiness_simulation_recovered" });
    expect(recovered.audit.filter((event) => event.type === "readiness_simulation_recovered")).toHaveLength(1);
    expect(new PersistentReadinessLease(directory).snapshot(new Date("2026-08-14T10:00:17.000Z"))).toMatchObject({ leaseState: "active_simulation", queueMayRun: false });
  });

  it("blocca globalmente start, tick e prova pratica anche con readiness simulata verde", () => {
    const directory = temporaryStateDirectory();
    const runner = new PersistentEneaRunner(directory);
    const initial = runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE, new Date("2026-08-14T10:00:00.000Z"));
    new PersistentReadinessLease(directory).acquireSimulation("owner-a", greenReadiness, "acquire:a", new Date("2026-08-14T10:00:01.000Z"));

    expect(() => runner.start("runner-a", "runner:start", new Date("2026-08-14T10:00:02.000Z"))).toThrow(RunnerReadinessBlockedError);
    expect(() => runner.tick("runner-a", "runner:tick", new Date("2026-08-14T10:00:03.000Z"))).toThrow(RunnerReadinessBlockedError);
    expect(() => runner.recordSubmissionProof("runner-a", initial.queue[0].practice.id, {
      evidenceId: "simulation-only",
      source: "enea_dashboard_read_only",
      dashboardStatus: "Inviata",
      cpid: "CPID-SIMULATED",
      observedAt: "2026-08-14T10:00:03.000Z",
    }, "runner:proof", new Date("2026-08-14T10:00:04.000Z"))).toThrow(RunnerReadinessBlockedError);

    const after = runner.load();
    expect(after.revision).toBe(initial.revision);
    expect(after.runner).toMatchObject({ status: "off", currentPracticeId: null });
    expect(after.queue.map((job) => ({ id: job.practice.id, state: job.executionState, selections: job.selectionCount })))
      .toEqual(initial.queue.map((job) => ({ id: job.practice.id, state: job.executionState, selections: job.selectionCount })));
    expect(readFileSync(path.join(directory, "HEAD"), "utf8").trim()).toBe("0");
  });

  it("resta bloccato quando anche un solo controllo simulato fallisce", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    const state = lease.acquireSimulation("owner-a", { ...greenReadiness, eneaAuthenticated: false }, "acquire:blocked", new Date("2026-08-14T10:00:00.000Z"));

    expect(state.status).toBe("blocked");
    expect(state.checks.filter((check) => !check.ok).map((check) => check.reason)).toEqual(["enea_not_authenticated"]);
    expect(state.audit.at(-1)).toMatchObject({ type: "readiness_check_blocked" });
    expect(lease.snapshot(new Date("2026-08-14T10:00:01.000Z")).queueMayRun).toBe(false);
  });

  it("registra una readiness browser reale parziale e la prova keepalive senza abilitare la coda", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    const state = lease.recordRealObservationBlocked("chrome-readonly", {
      readiness: { ...greenReadiness, attachmentReadCapabilityVerified: false },
      keepalive: { ok: true, serverVerified: true, method: "GET", surface: "dashboard", action: "reload_existing_dashboard" },
      reason: "Manca la prova allegato.",
      nextAction: "Acquisire una prova read-only separata.",
    }, "real:documents-blocked", new Date("2026-08-14T12:00:00.000Z"));

    expect(state).toMatchObject({ status: "blocked", evidenceMode: "browser_readonly", ownerId: null, safeKeepaliveCount: 1 });
    expect(state.checks.filter((check) => !check.ok).map((check) => check.reason)).toEqual(["attachment_read_not_verified"]);
    expect(state.audit.at(-1)).toMatchObject({ type: "readiness_real_check_blocked" });
    expect(state.audit.at(-1)?.appliedRuleIds).toContain("system-operator-block-fail-closed");
    expect(lease.snapshot(new Date("2026-08-14T12:00:01.000Z"))).toMatchObject({ leaseState: "blocked", queueMayRun: false });
  });

  it("registra la capability allegato verde ma non riusa una lease ENEA precedente", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    const state = lease.recordRealObservationBlocked("chrome-readonly", {
      readiness: { ...greenReadiness, eneaLeaseActive: false },
      keepalive: { ok: false, serverVerified: false, method: "GET", surface: "dashboard", action: "no_keepalive" },
      reason: "Allegato reale verificato; lease ENEA da riacquisire.",
      nextAction: "Ripetere il keepalive prima di una futura autorizzazione.",
    }, "real:attachment-verified", new Date("2026-08-14T12:30:00.000Z"));

    expect(state.checks.find((check) => check.reason === "attachment_read_not_verified")?.ok).not.toBe(false);
    expect(state.checks.filter((check) => !check.ok).map((check) => check.reason)).toEqual(["enea_lease_not_active"]);
    expect(state).toMatchObject({ status: "blocked", evidenceMode: "browser_readonly", safeKeepaliveCount: 0 });
    expect(new PersistentReadinessLease(directory).load()).toEqual(state);
    expect(lease.snapshot(new Date("2026-08-14T12:30:01.000Z"))).toMatchObject({ leaseState: "blocked", queueMayRun: false });
  });

  it("registra autenticazione e lease reali verdi ma si ferma prima della coda", () => {
    const directory = temporaryStateDirectory();
    const lease = new PersistentReadinessLease(directory);
    const state = lease.recordRealObservationVerifiedBeforeQueue("chrome-readonly", {
      readiness: greenReadiness,
      keepalive: { ok: true, serverVerified: true, method: "GET", surface: "allowed_navigation", action: "reload_authenticated_root" },
      reason: "DOM autenticato e keepalive server verificati.",
      nextAction: "Fermarsi prima della coda.",
    }, "real:lease-verified", new Date("2026-08-14T13:00:00.000Z"));
    const replay = lease.recordRealObservationVerifiedBeforeQueue("chrome-readonly", {
      readiness: greenReadiness,
      keepalive: { ok: true, serverVerified: true, method: "GET", surface: "allowed_navigation", action: "reload_authenticated_root" },
      reason: "DOM autenticato e keepalive server verificati.",
      nextAction: "Fermarsi prima della coda.",
    }, "real:lease-verified", new Date("2026-08-14T13:00:01.000Z"));

    expect(state).toMatchObject({ status: "blocked", evidenceMode: "browser_readonly", safeKeepaliveCount: 1 });
    expect(state.checks.every((check) => check.ok)).toBe(true);
    expect(state.audit.at(-1)).toMatchObject({ type: "readiness_real_check_verified" });
    expect(replay.revision).toBe(state.revision);
    expect(new PersistentReadinessLease(directory).load()).toEqual(state);
    expect(lease.snapshot(new Date("2026-08-14T13:00:02.000Z"))).toMatchObject({ leaseState: "blocked", queueMayRun: false });
  });
});
