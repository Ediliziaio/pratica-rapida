export interface AprEneaAttachLiveEvidence {
  version: "apr-enea-attach-live-evidence-v1";
  observedAt: string;
  browserFamily: "chrome";
  selectedProfile: "Default";
  browserId: string;
  controllerConnected: true;
  crm: { url: string; title: string; domSha256: string; authenticatedEvidence: "kanban_visible" };
  enea: { url: string; title: string; domSha256: string; authenticatedEvidence: "connected_user_banner_and_dashboard_visible" };
  newTabCreated: false;
  navigationPerformed: false;
  networkRequestPerformed: false;
  mutationPerformed: false;
}

const SHA256 = /^[a-f0-9]{64}$/;

export function validateAprEneaAttachLiveEvidence(value: unknown, now = new Date()): AprEneaAttachLiveEvidence {
  if (!value || typeof value !== "object") throw new Error("enea_attach_live_evidence_invalid");
  const evidence = value as AprEneaAttachLiveEvidence;
  const observedAt = new Date(evidence.observedAt);
  if (evidence.version !== "apr-enea-attach-live-evidence-v1" || evidence.browserFamily !== "chrome" || evidence.selectedProfile !== "Default"
    || typeof evidence.browserId !== "string" || evidence.browserId.length < 8 || evidence.controllerConnected !== true
    || !Number.isFinite(observedAt.getTime()) || Math.abs(now.getTime() - observedAt.getTime()) > 5 * 60_000
    || evidence.newTabCreated !== false || evidence.navigationPerformed !== false || evidence.networkRequestPerformed !== false || evidence.mutationPerformed !== false) {
    throw new Error("enea_attach_live_evidence_invalid");
  }
  const crm = new URL(evidence.crm.url); const enea = new URL(evidence.enea.url);
  if (crm.protocol !== "https:" || crm.hostname !== "app.praticarapida.it" || !crm.pathname.startsWith("/kanban")
    || evidence.crm.authenticatedEvidence !== "kanban_visible" || !SHA256.test(evidence.crm.domSha256)
    || enea.protocol !== "https:" || enea.hostname !== "bonusfiscali.enea.it" || enea.pathname !== "/dashboard"
    || evidence.enea.authenticatedEvidence !== "connected_user_banner_and_dashboard_visible" || !SHA256.test(evidence.enea.domSha256)) {
    throw new Error("enea_attach_live_evidence_scope_invalid");
  }
  return structuredClone(evidence);
}
