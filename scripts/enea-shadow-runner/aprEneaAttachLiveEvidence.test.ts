import { describe, expect, it } from "vitest";
import { validateAprEneaAttachLiveEvidence } from "./aprEneaAttachLiveEvidence";

const evidence = {
  version: "apr-enea-attach-live-evidence-v1", observedAt: "2026-08-17T14:00:00.000Z", browserFamily: "chrome", selectedProfile: "Default",
  browserId: "chrome-instance-1", controllerConnected: true,
  crm: { url: "https://app.praticarapida.it/kanban", title: "Pratica Rapida", domSha256: "a".repeat(64), authenticatedEvidence: "kanban_visible" },
  enea: { url: "https://bonusfiscali.enea.it/dashboard", title: "Bonus Fiscali - ENEA", domSha256: "b".repeat(64), authenticatedEvidence: "connected_user_banner_and_dashboard_visible" },
  newTabCreated: false, navigationPerformed: false, networkRequestPerformed: false, mutationPerformed: false,
} as const;

describe("validateAprEneaAttachLiveEvidence", () => {
  it("accetta soltanto prova live fresca e allowlistata", () => expect(validateAprEneaAttachLiveEvidence(evidence, new Date("2026-08-17T14:04:59.000Z"))).toEqual(evidence));
  it("rifiuta prova scaduta", () => expect(() => validateAprEneaAttachLiveEvidence(evidence, new Date("2026-08-17T14:05:01.000Z"))).toThrow("enea_attach_live_evidence_invalid"));
  it("rifiuta host CRM differente", () => expect(() => validateAprEneaAttachLiveEvidence({ ...evidence, crm: { ...evidence.crm, url: "https://example.com/kanban" } }, new Date("2026-08-17T14:00:01.000Z"))).toThrow("enea_attach_live_evidence_scope_invalid"));
  it("rifiuta qualunque mutazione", () => expect(() => validateAprEneaAttachLiveEvidence({ ...evidence, mutationPerformed: true }, new Date("2026-08-17T14:00:01.000Z"))).toThrow("enea_attach_live_evidence_invalid"));
});
