import type { LocalReadOnlyFixture } from "../readOnlyAdapter";

export const VERIFIED_LOCAL_READ_ONLY_FIXTURE = Object.freeze({
  id: "local-readonly-fixture-v1",
  registeredIdentity: {
    version: "enea-persistent-browser-v1",
    browserInstanceId: "fixture-browser-instance",
    profileId: "fixture-persistent-profile",
    profilePath: "/Users/fixture/Library/Application Support/PraticaRapida/ReadOnlyFixtureProfile",
    crmTabId: "fixture-crm-tab",
    eneaTabId: "fixture-enea-tab",
    registeredAt: "2026-08-14T12:00:00.000Z",
  },
  observation: {
    browserInstanceId: "fixture-browser-instance",
    profileId: "fixture-persistent-profile",
    profilePath: "/Users/fixture/Library/Application Support/PraticaRapida/ReadOnlyFixtureProfile",
    crmTabIds: ["fixture-crm-tab"],
    eneaTabIds: ["fixture-enea-tab"],
    crmAuthenticated: true,
    eneaAuthenticated: true,
  },
  childDocumentSurfaces: [{ id: "fixture-attachment-surface", parentTabId: "fixture-crm-tab" }],
  allowlistedOrigins: { crm: "https://crm.fixture.invalid", enea: "https://enea.fixture.invalid" },
  exchanges: [
    {
      request: { id: "crm-readonly-page", method: "GET", url: "https://crm.fixture.invalid/pratiche/read-only", surface: "crm_readonly", action: "read existing practice index", purpose: "evidence" },
      response: { transport: "local_fixture", status: 200, finalUrl: "https://crm.fixture.invalid/pratiche/read-only", contentType: "text/html; charset=utf-8", body: "<main data-fixture='crm-readonly'>Sessione CRM autenticata fixture</main>", serverVerified: true, observedMutation: false },
    },
    {
      request: { id: "crm-attachment-head", method: "HEAD", url: "https://crm.fixture.invalid/allegati/fattura-fixture.pdf", surface: "crm_attachment", action: "inspect existing attachment metadata", purpose: "evidence" },
      response: { transport: "local_fixture", status: 200, finalUrl: "https://crm.fixture.invalid/allegati/fattura-fixture.pdf", contentType: "application/pdf", body: "", serverVerified: true, observedMutation: false },
    },
    {
      request: { id: "crm-attachment-read", method: "GET", url: "https://crm.fixture.invalid/allegati/fattura-fixture.pdf", surface: "crm_attachment", action: "read existing attachment", purpose: "evidence" },
      response: { transport: "local_fixture", status: 200, finalUrl: "https://crm.fixture.invalid/allegati/fattura-fixture.pdf", contentType: "application/pdf", body: "%PDF-1.4\nLOCAL FIXTURE ONLY\n%%EOF", serverVerified: true, observedMutation: false },
    },
    {
      request: { id: "enea-dashboard-read", method: "GET", url: "https://enea.fixture.invalid/dashboard", surface: "enea_dashboard", action: "read existing authenticated dashboard", purpose: "evidence" },
      response: { transport: "local_fixture", status: 200, finalUrl: "https://enea.fixture.invalid/dashboard", contentType: "text/html; charset=utf-8", body: "<main data-fixture='enea-dashboard'>Sessione ENEA autenticata fixture</main>", serverVerified: true, observedMutation: false },
    },
    {
      request: { id: "enea-keepalive-head", method: "HEAD", url: "https://enea.fixture.invalid/dashboard", surface: "enea_dashboard", action: "verify existing dashboard", purpose: "keepalive" },
      response: { transport: "local_fixture", status: 204, finalUrl: "https://enea.fixture.invalid/dashboard", contentType: "text/html; charset=utf-8", body: "", serverVerified: true, observedMutation: false },
    },
  ],
} satisfies LocalReadOnlyFixture);
