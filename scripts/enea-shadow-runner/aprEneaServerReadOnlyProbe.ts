import { createHash } from "node:crypto";

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const HASH = /^[a-f0-9]{64}$/;

export function validateAprEneaServerReadOnlyProbe(input: {
  service: any;
  config: any;
  driver: any;
}, now = new Date()) {
  const { service, config, driver } = input;
  const heartbeatAt = Date.parse(service?.heartbeatAt ?? "");
  const contractAt = Date.parse(driver?.contract?.observedAt ?? "");
  if (service?.status !== "setup_ready" || !Number.isFinite(heartbeatAt) || now.getTime() - heartbeatAt > 30_000
    || service?.forbiddenActionCount !== 0 || service?.previewAttemptCount !== 0 || service?.submitAttemptCount !== 0 || service?.communicationAttemptCount !== 0
    || config?.setupEnabled !== true || config?.operationalEnabled !== false || config?.previewAllowed !== false || config?.submitAllowed !== false || config?.communicationsAllowed !== false
    || driver?.contract?.ready !== true || driver?.contract?.operationalUrl !== "https://bonusfiscali.enea.it/dashboard"
    || !Number.isFinite(contractAt) || now.getTime() - contractAt > 5 * 60_000 || driver.contract.evidenceId !== service.sessionEvidenceId) {
    throw new Error("apr_enea_server_readonly_probe_invalid");
  }
  const events = Array.isArray(driver.events) ? driver.events : [];
  const contractEvent = events.findLast((event: any) => event?.evidenceId === driver.contract.evidenceId && event?.action === "inspect_portal_contract_readonly");
  const acceptedDashboardGetActions = new Set([
    "verify_session_dom_server_get",
    "verify_session_dashboard_navigation_readonly_get",
  ]);
  const getEvent = events.findLast((event: any) => acceptedDashboardGetActions.has(event?.action) && event?.targetId === contractEvent?.targetId
    && event?.url === "https://bonusfiscali.enea.it/dashboard" && Math.abs(Date.parse(contractEvent?.at ?? "") - Date.parse(event?.at ?? "")) <= 60_000);
  const validEvent = (event: any) => event && HASH.test(event.domSha256 ?? "") && Array.isArray(event.appliedRuleIds)
    && event.appliedRuleIds.includes("authorized-27-enea-session-readonly-keepalive") && event.customerKey == null && event.draftId == null && event.pageId == null;
  if (!validEvent(contractEvent) || !validEvent(getEvent)) throw new Error("apr_enea_server_readonly_probe_evidence_missing");
  const evidence = {
    version: "apr-enea-server-readonly-probe-v1", observedAt: now.toISOString(), serviceHeartbeatAt: service.heartbeatAt,
    sessionEvidenceId: service.sessionEvidenceId, profileFingerprint: service.profileFingerprint, contractObservedAt: driver.contract.observedAt,
    contractEvidenceId: contractEvent.evidenceId, getEvidenceId: getEvent.evidenceId, targetId: contractEvent.targetId,
    operationalUrl: driver.contract.operationalUrl, contractDomSha256: contractEvent.domSha256, getDomSha256: getEvent.domSha256,
    operationalEnabled: false, forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0,
  };
  return { evidence, evidenceFingerprint: sha256(evidence) };
}
