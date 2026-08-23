import { describe, expect, it } from "vitest";
import { validateAprEneaServerReadOnlyProbe } from "./aprEneaServerReadOnlyProbe";

const fixture = () => ({
  service: { status: "setup_ready", heartbeatAt: "2026-08-17T14:10:20.000Z", sessionEvidenceId: "contract-1", profileFingerprint: "profile-1", forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0 },
  config: { setupEnabled: true, operationalEnabled: false, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  driver: { contract: { ready: true, observedAt: "2026-08-17T14:10:10.000Z", operationalUrl: "https://bonusfiscali.enea.it/dashboard", evidenceId: "contract-1" }, events: [
    { at: "2026-08-17T14:10:09.000Z", action: "verify_session_dom_server_get", evidenceId: "get-1", url: "https://bonusfiscali.enea.it/dashboard", targetId: "target-1", domSha256: "a".repeat(64), customerKey: null, draftId: null, pageId: null, appliedRuleIds: ["authorized-27-enea-session-readonly-keepalive"] },
    { at: "2026-08-17T14:10:10.000Z", action: "inspect_portal_contract_readonly", evidenceId: "contract-1", url: "https://bonusfiscali.enea.it/dashboard", targetId: "target-1", domSha256: "b".repeat(64), customerKey: null, draftId: null, pageId: null, appliedRuleIds: ["authorized-27-enea-session-readonly-keepalive"] },
  ] },
});

describe("validateAprEneaServerReadOnlyProbe", () => {
  it("accetta una coppia GET+contratto fresca, read-only e senza pratica", () => expect(validateAprEneaServerReadOnlyProbe(fixture(), new Date("2026-08-17T14:10:21.000Z")).evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/));
  it("accetta il GET innocuo di navigazione dashboard prodotto dal recupero sessione reale", () => {
    const value = fixture();
    value.driver.events[0].action = "verify_session_dashboard_navigation_readonly_get";
    value.driver.events[0].evidenceId = "get-dashboard-recovery";
    expect(validateAprEneaServerReadOnlyProbe(value, new Date("2026-08-17T14:10:21.000Z")).evidence).toMatchObject({
      getEvidenceId: "get-dashboard-recovery",
      operationalUrl: "https://bonusfiscali.enea.it/dashboard",
      operationalEnabled: false,
    });
  });
  it("rifiuta heartbeat scaduto", () => expect(() => validateAprEneaServerReadOnlyProbe(fixture(), new Date("2026-08-17T14:11:00.001Z"))).toThrow("apr_enea_server_readonly_probe_invalid"));
  it("rifiuta operativita armata", () => { const value = fixture(); value.config.operationalEnabled = true; expect(() => validateAprEneaServerReadOnlyProbe(value, new Date("2026-08-17T14:10:21.000Z"))).toThrow("apr_enea_server_readonly_probe_invalid"); });
  it("rifiuta prova associata a una pratica", () => { const value = fixture(); value.driver.events[0].customerKey = "cliente" as never; expect(() => validateAprEneaServerReadOnlyProbe(value, new Date("2026-08-17T14:10:21.000Z"))).toThrow("apr_enea_server_readonly_probe_evidence_missing"); });
});
