import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { VERIFIED_LOCAL_READ_ONLY_FIXTURE } from "./fixtures/readOnlyAdapterFixture";
import {
  PersistentReadOnlyAdapter,
  type LocalReadOnlyFixture,
} from "./readOnlyAdapter";
import { PersistentEneaRunner, RunnerReadinessBlockedError } from "./runner";

const temporaryDirectories: string[] = [];
function temporaryStateDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "enea-shadow-adapter-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fixtureCopy(): LocalReadOnlyFixture {
  return structuredClone(VERIFIED_LOCAL_READ_ONLY_FIXTURE);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("adattatore browser/CRM/ENEA rigorosamente read-only", () => {
  it("acquisisce soltanto prove fixture con fingerprint e senza persistere i contenuti", () => {
    const directory = temporaryStateDirectory();
    const adapter = new PersistentReadOnlyAdapter(directory);
    const state = adapter.runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, "fixture:verified", new Date("2026-08-14T12:00:01.000Z"));

    expect(state).toMatchObject({
      status: "fixture_verified",
      mode: "local_fixture",
      identityOutcome: "verified_fixture",
      operationalGate: "blocked_no_real_adapter",
      queueMayRun: false,
      keepaliveCount: 1,
    });
    expect(state.evidence).toHaveLength(5);
    expect(state.evidence.every((entry) => ["GET", "HEAD"].includes(entry.method))).toBe(true);
    expect(state.evidence.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);
    expect(state.evidence.at(-1)).toMatchObject({ purpose: "keepalive", method: "HEAD", serverVerified: true, byteLength: 0 });
    expect(state.evidence.at(-1)?.appliedRuleIds).toContain("system-enea-lease-required");
    expect(state.audit.at(-1)?.appliedRuleIds).toContain("system-readonly-adapter-contract");

    const checkpoint = readFileSync(adapter.checkpointPath, "utf8");
    expect(checkpoint).not.toContain("LOCAL FIXTURE ONLY");
    expect(checkpoint).not.toContain("Sessione CRM autenticata fixture");
    expect(checkpoint).not.toContain("Sessione ENEA autenticata fixture");
  });

  it("è idempotente e ripristinabile da un nuovo processo", () => {
    const directory = temporaryStateDirectory();
    const first = new PersistentReadOnlyAdapter(directory);
    const state = first.runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, "fixture:once", new Date("2026-08-14T12:00:01.000Z"));
    const replay = first.runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, "fixture:once", new Date("2026-08-14T12:00:02.000Z"));
    const restarted = new PersistentReadOnlyAdapter(directory).load();

    expect(replay.revision).toBe(state.revision);
    expect(restarted).toEqual(state);
    expect(new Set(restarted.evidence.map((entry) => entry.id)).size).toBe(restarted.evidence.length);
  });

  it("blocca identità o profilo diversi senza fallback", () => {
    const directory = temporaryStateDirectory();
    const fixture = fixtureCopy();
    fixture.observation.browserInstanceId = "different-browser-instance";
    const state = new PersistentReadOnlyAdapter(directory).runLocalFixture(fixture, "fixture:identity-mismatch", new Date("2026-08-14T12:00:01.000Z"));

    expect(state).toMatchObject({ status: "blocked", identityOutcome: "blocked", queueMayRun: false, evidence: [] });
    expect(state.reason).toContain("persistent_identity_instance_mismatch");
  });

  it("blocca origine o redirect fuori allowlist", () => {
    const directory = temporaryStateDirectory();
    const fixture = fixtureCopy();
    fixture.exchanges[0].request.url = "https://evil.fixture.invalid/pratiche";
    const originBlocked = new PersistentReadOnlyAdapter(directory).runLocalFixture(fixture, "fixture:origin", new Date("2026-08-14T12:00:01.000Z"));
    expect(originBlocked.reason).toContain("origin_not_allowlisted");

    const secondDirectory = temporaryStateDirectory();
    const redirect = fixtureCopy();
    redirect.exchanges[0].response.finalUrl = "https://evil.fixture.invalid/redirect";
    const redirectBlocked = new PersistentReadOnlyAdapter(secondDirectory).runLocalFixture(redirect, "fixture:redirect", new Date("2026-08-14T12:00:01.000Z"));
    expect(redirectBlocked.reason).toContain("redirect_not_allowlisted");

    const thirdDirectory = temporaryStateDirectory();
    const crossed = fixtureCopy();
    crossed.exchanges[0].request.url = "https://enea.fixture.invalid/pratiche";
    crossed.exchanges[0].response.finalUrl = "https://enea.fixture.invalid/pratiche";
    const crossedBlocked = new PersistentReadOnlyAdapter(thirdDirectory).runLocalFixture(crossed, "fixture:crossed-origin", new Date("2026-08-14T12:00:01.000Z"));
    expect(crossedBlocked.reason).toContain("surface_origin_mismatch");
  });

  it.each([
    ["POST mutativo", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].request.method = "POST"; }, "mutation_method"],
    ["corpo su GET", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].request.body = "write=true"; }, "request_body_forbidden"],
    ["intento submit", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].request.action = "submit form"; }, "mutation_intent"],
    ["azione non enumerata", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].request.action = "browse around"; }, "action_not_allowlisted"],
    ["percorso non enumerato", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].request.url = "https://crm.fixture.invalid/delete/1"; fixture.exchanges[0].response.finalUrl = "https://crm.fixture.invalid/delete/1"; }, "path_not_allowlisted"],
    ["mutazione osservata", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].response.observedMutation = true; }, "response_not_verified"],
    ["trasporto esterno", (fixture: LocalReadOnlyFixture) => { fixture.exchanges[0].response.transport = "network" as "local_fixture"; }, "external_transport_forbidden"],
  ])("blocca %s", (_label, mutate, expectedReason) => {
    const directory = temporaryStateDirectory();
    const fixture = fixtureCopy();
    mutate(fixture);
    const state = new PersistentReadOnlyAdapter(directory).runLocalFixture(fixture, `fixture:${expectedReason}`, new Date("2026-08-14T12:00:01.000Z"));
    expect(state.status).toBe("blocked");
    expect(state.reason).toContain(expectedReason);
    expect(state.evidence).toEqual([]);
  });

  it("non avvia né modifica pratiche anche dopo una fixture completamente verde", () => {
    const directory = temporaryStateDirectory();
    const runner = new PersistentEneaRunner(directory);
    const before = runner.initialize(DEFAULT_AUDITED_OPERATOR_QUEUE, new Date("2026-08-14T12:00:00.000Z"));
    new PersistentReadOnlyAdapter(directory).runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, "fixture:green", new Date("2026-08-14T12:00:01.000Z"));

    expect(() => runner.start("runner-a", "runner:start", new Date("2026-08-14T12:00:02.000Z"))).toThrow(RunnerReadinessBlockedError);
    const after = runner.load();
    expect(after).toEqual(before);
    expect(after.queue.every((job) => job.executionState === "queued" && job.selectionCount === 0)).toBe(true);
  });

  it("registra un blocco globale di connessione con motivo e prossima azione senza perdere le prove fixture", () => {
    const directory = temporaryStateDirectory();
    const adapter = new PersistentReadOnlyAdapter(directory);
    const fixture = adapter.runLocalFixture(VERIFIED_LOCAL_READ_ONLY_FIXTURE, "fixture:before-block", new Date("2026-08-14T12:00:01.000Z"));
    const blocked = adapter.recordConnectionBlock({
      idempotencyKey: "connection:blocked",
      reason: "Connessione Chrome non osservabile.",
      nextAction: "Ripristinare il collegamento controllato senza aprire schede.",
    }, new Date("2026-08-14T12:00:02.000Z"));

    expect(blocked).toMatchObject({ status: "blocked", mode: "disconnected", identityOutcome: "blocked", queueMayRun: false });
    expect(blocked.evidence).toEqual(fixture.evidence);
    expect(blocked.audit.at(-1)).toMatchObject({ type: "adapter_blocked", reason: "Connessione Chrome non osservabile." });
    expect(blocked.audit.at(-1)?.appliedRuleIds).toContain("system-operator-block-fail-closed");
  });

  it("registra una sola prova allegato browser, riparte dal checkpoint e lascia la coda chiusa", () => {
    const directory = temporaryStateDirectory();
    const adapter = new PersistentReadOnlyAdapter(directory);
    const state = adapter.recordBrowserReadOnlyVerifiedBeforeQueue({
      idempotencyKey: "browser:attachment:once",
      profileName: "Profilo stabile",
      browserIdentity: "browser-instance|extension-instance|default",
      crmOrigin: "https://crm.example.test",
      eneaOrigin: "https://enea.example.test",
      attachmentOrigin: "https://storage.example.test",
      attachmentBucket: "enea-documents",
      attachmentContentType: "application/pdf",
      attachmentObjectDepth: 3,
    }, new Date("2026-08-14T12:30:00.000Z"));
    const replay = adapter.recordBrowserReadOnlyVerifiedBeforeQueue({
      idempotencyKey: "browser:attachment:once",
      profileName: "Profilo stabile",
      browserIdentity: "browser-instance|extension-instance|default",
      crmOrigin: "https://crm.example.test",
      eneaOrigin: "https://enea.example.test",
      attachmentOrigin: "https://storage.example.test",
      attachmentBucket: "enea-documents",
      attachmentContentType: "application/pdf",
      attachmentObjectDepth: 3,
    }, new Date("2026-08-14T12:30:01.000Z"));

    expect(state).toMatchObject({ status: "blocked", mode: "chrome_readonly", identityOutcome: "verified_browser", queueMayRun: false });
    expect(state.browserObservation).toMatchObject({ method: "GET", readSucceeded: true, practiceScoped: true, originalAttachment: true });
    expect(state.browserObservation?.appliedRuleIds).toContain("system-readonly-adapter-contract");
    expect(replay.revision).toBe(state.revision);
    expect(new PersistentReadOnlyAdapter(directory).load()).toEqual(state);
  });
});
