export const ENEA_AUTHENTICATION_DETECTOR_VERSION = "enea-authentication-detector-v1" as const;

export interface EneaAuthenticationEvidence {
  originAllowed: boolean;
  serverDocumentLoaded: boolean;
  documentReady: boolean;
  observedPath: string;
  connectedUserBannerVisible: boolean;
  logoutControlVisible: boolean;
  dashboardAccessVerified: boolean;
  loginControlVisible: boolean;
}

export interface EneaAuthenticationDetection {
  version: typeof ENEA_AUTHENTICATION_DETECTOR_VERSION;
  outcome: "authenticated" | "not_authenticated" | "indeterminate";
  authenticated: boolean;
  reason:
    | "connected_user_dom_evidence"
    | "dashboard_server_evidence"
    | "explicit_login_dom_evidence"
    | "origin_or_document_unverified"
    | "authentication_dom_evidence_missing";
  observedPath: string;
  pathAloneUsed: false;
}

/**
 * Classifica la sessione ENEA esclusivamente da prove positive DOM/server.
 * Il percorso corrente viene conservato per audit ma non costituisce mai, da
 * solo, prova di login o logout: anche la root può mostrare un utente connesso.
 */
export function detectEneaAuthentication(evidence: EneaAuthenticationEvidence): EneaAuthenticationDetection {
  const base = {
    version: ENEA_AUTHENTICATION_DETECTOR_VERSION,
    observedPath: evidence.observedPath,
    pathAloneUsed: false as const,
  };
  if (!evidence.originAllowed || !evidence.serverDocumentLoaded || !evidence.documentReady) {
    return { ...base, outcome: "indeterminate", authenticated: false, reason: "origin_or_document_unverified" };
  }
  if (evidence.connectedUserBannerVisible || evidence.logoutControlVisible) {
    return { ...base, outcome: "authenticated", authenticated: true, reason: "connected_user_dom_evidence" };
  }
  if (evidence.dashboardAccessVerified) {
    return { ...base, outcome: "authenticated", authenticated: true, reason: "dashboard_server_evidence" };
  }
  if (evidence.loginControlVisible) {
    return { ...base, outcome: "not_authenticated", authenticated: false, reason: "explicit_login_dom_evidence" };
  }
  return { ...base, outcome: "indeterminate", authenticated: false, reason: "authentication_dom_evidence_missing" };
}
