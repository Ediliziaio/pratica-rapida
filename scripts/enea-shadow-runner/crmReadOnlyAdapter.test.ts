import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentAprCrmReadOnlyAdapter } from "./crmReadOnlyAdapter";
import { VERIFIED_APR_CRM_READONLY_FIXTURE } from "./fixtures/aprCrmReadOnlyFixture";

const configPath = path.resolve("config/apr/crm-readonly-adapter.json");
describe("adapter CRM APR persistente esclusivamente locale", () => {
  it("configura e verifica cinque capability conservando gate chiuso e prova persistente", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-ro-"));
    try {
      const store = new PersistentAprCrmReadOnlyAdapter(directory);
      expect(store.initialize()).toMatchObject({ status: "unconfigured", externalActionAllowed: false, queueMayRun: false });
      expect(store.configureFromFile(configPath)).toMatchObject({ status: "configured_local_only", integration: "contract_only_not_real" });
      const verified = store.verifyFixture(VERIFIED_APR_CRM_READONLY_FIXTURE, new Date("2026-08-15T08:00:00Z"));
      expect(verified).toMatchObject({ status: "fixture_verified", operationalGate: "blocked_adapters_unverified", externalActionAllowed: false, queueMayRun: false });
      expect(verified.evidence).toHaveLength(5);
      expect(new PersistentAprCrmReadOnlyAdapter(directory).snapshot()).toMatchObject({ status: "fixture_verified", evidenceCount: 5, integration: "contract_only_not_real" });
      expect(verified.audit.at(-1)?.appliedRuleIds).toContain("system-apr-crm-readonly-adapter-contract");
      const replay = new PersistentAprCrmReadOnlyAdapter(directory).verifyFixture(VERIFIED_APR_CRM_READONLY_FIXTURE);
      expect(replay.revision).toBe(verified.revision);
      expect(replay.audit).toHaveLength(verified.audit.length);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("blocca fixture mutativa e cancella le prove", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-ro-"));
    try {
      const store = new PersistentAprCrmReadOnlyAdapter(directory); store.configureFromFile(configPath);
      const fixture = structuredClone(VERIFIED_APR_CRM_READONLY_FIXTURE); fixture.exchanges[0].request.method = "POST";
      const blocked = store.verifyFixture(fixture);
      expect(blocked).toMatchObject({ status: "blocked", evidence: [], validationErrors: expect.arrayContaining(["method_not_allowed"]), queueMayRun: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("registra il bootstrap CRM reale senza trasformare la sessione Chrome in credenziale APR", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-bootstrap-"));
    try {
      const fingerprint = "a".repeat(64);
      const blocked = new PersistentAprCrmReadOnlyAdapter(directory).recordBrowserBootstrapBlocked({
        observedAt: "2026-08-15T13:54:35.691Z", crmOrigin: "https://app.praticarapida.it", pathname: "/kanban",
        title: "Pratiche ENEA e Conto Termico per Installatori | Pratica Rapida", authenticated: true,
        expectedCandidateCount: 5, matchedCandidateCount: 5, candidateFingerprint: fingerprint, browserEvidenceFingerprint: "b".repeat(64),
        publicRestProbe: { origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co", status: 200, rowCount: 0, bodySha256: "c".repeat(64), publishableKeyFingerprint: "d".repeat(64) },
      }, new Date("2026-08-15T13:55:00Z"));
      expect(blocked).toMatchObject({ status: "blocked", integration: "browser_bootstrap_only", queueMayRun: false,
        validationErrors: ["persistent_authenticated_transport_unavailable"] });
      expect(blocked.evidence.map((item) => item.transport)).toEqual(["browser_visible_dom", "public_rest_readonly"]);
      expect(blocked.reason).toContain("5/5 candidati visibili");
      expect(blocked.nextAction).toContain("Portachiavi macOS");
      const replay = new PersistentAprCrmReadOnlyAdapter(directory).recordBrowserBootstrapBlocked({
        observedAt: "2026-08-15T13:54:35.691Z", crmOrigin: "https://app.praticarapida.it", pathname: "/kanban",
        title: "Pratiche ENEA e Conto Termico per Installatori | Pratica Rapida", authenticated: true,
        expectedCandidateCount: 5, matchedCandidateCount: 5, candidateFingerprint: fingerprint, browserEvidenceFingerprint: "b".repeat(64),
        publicRestProbe: { origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co", status: 200, rowCount: 0, bodySha256: "c".repeat(64), publishableKeyFingerprint: "d".repeat(64) },
      });
      expect(replay.revision).toBe(blocked.revision);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("sostituisce il vecchio blocco bootstrap soltanto con prove GET autenticate reali", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-authenticated-"));
    try {
      const store = new PersistentAprCrmReadOnlyAdapter(directory);
      const observed = store.recordAuthenticatedReadOnly({
        observedAt: "2026-08-15T14:43:09.685Z", origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co",
        candidateFingerprint: "a".repeat(64), acquiredCount: 3, blockedCount: 2,
        dossierEvidence: [
          { customerKey: "lorena-brendas", responseSha256: "b".repeat(64) },
          { customerKey: "milena-albertoni", responseSha256: "c".repeat(64) },
          { customerKey: "danila-serpa", responseSha256: "d".repeat(64) },
        ],
      });
      expect(observed).toMatchObject({ status: "authenticated_readonly_verified", integration: "authenticated_rest_readonly",
        externalActionAllowed: false, queueMayRun: false, validationErrors: [] });
      expect(observed.evidence).toHaveLength(3);
      expect(observed.evidence.every((item) => item.method === "GET" && item.transport === "authenticated_rest_readonly")).toBe(true);
      const replay = store.recordAuthenticatedReadOnly({
        observedAt: "2026-08-15T14:53:09.685Z", origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co",
        candidateFingerprint: "a".repeat(64), acquiredCount: 3, blockedCount: 2,
        dossierEvidence: [
          { customerKey: "danila-serpa", responseSha256: "d".repeat(64) },
          { customerKey: "milena-albertoni", responseSha256: "c".repeat(64) },
          { customerKey: "lorena-brendas", responseSha256: "b".repeat(64) },
        ],
      });
      expect(replay.revision).toBe(observed.revision);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("accetta coorti autenticate non limitate a cinque casi e rende idempotente un blocco ripetuto", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-authenticated-ten-"));
    try {
      const store = new PersistentAprCrmReadOnlyAdapter(directory);
      const dossierEvidence = Array.from({ length: 10 }, (_, index) => ({
        customerKey: `cliente-${index}`,
        responseSha256: `${index.toString(16)}${"a".repeat(63)}`,
      }));
      const verified = store.recordAuthenticatedReadOnly({
        observedAt: "2026-08-17T08:00:00.000Z",
        origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co",
        candidateFingerprint: "b".repeat(64),
        acquiredCount: 10,
        blockedCount: 0,
        dossierEvidence,
      });
      expect(verified).toMatchObject({ status: "authenticated_readonly_verified", integration: "authenticated_rest_readonly" });
      const firstBlock = store.block(["same_failure"], new Date("2026-08-17T08:01:00.000Z"));
      const replay = store.block(["same_failure"], new Date("2026-08-17T08:02:00.000Z"));
      expect(replay.revision).toBe(firstBlock.revision);
      expect(replay.audit).toHaveLength(firstBlock.audit.length);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("invalida la cache quando un altro processo sostituisce atomicamente il checkpoint", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-crm-cache-"));
    try {
      const firstProcess = new PersistentAprCrmReadOnlyAdapter(directory);
      firstProcess.initialize(new Date("2026-08-17T10:00:00.000Z"));
      expect(firstProcess.snapshot().status).toBe("unconfigured");

      const secondProcess = new PersistentAprCrmReadOnlyAdapter(directory);
      secondProcess.block(["external_checkpoint_change"], new Date("2026-08-17T10:00:01.000Z"));

      expect(firstProcess.snapshot()).toMatchObject({
        status: "blocked",
        validationErrors: ["external_checkpoint_change"],
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
