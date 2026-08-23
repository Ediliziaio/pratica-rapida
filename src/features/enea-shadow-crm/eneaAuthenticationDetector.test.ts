import { describe, expect, it } from "vitest";
import { detectEneaAuthentication, type EneaAuthenticationEvidence } from "./eneaAuthenticationDetector";

const base: EneaAuthenticationEvidence = {
  originAllowed: true,
  serverDocumentLoaded: true,
  documentReady: true,
  observedPath: "/",
  connectedUserBannerVisible: false,
  logoutControlVisible: false,
  dashboardAccessVerified: false,
  loginControlVisible: false,
};

describe("detector autenticazione ENEA basato su DOM/server", () => {
  it("considera autenticata la root quando mostra il banner utente connesso", () => {
    expect(detectEneaAuthentication({ ...base, connectedUserBannerVisible: true })).toMatchObject({
      outcome: "authenticated",
      authenticated: true,
      reason: "connected_user_dom_evidence",
      observedPath: "/",
      pathAloneUsed: false,
    });
  });

  it("considera autenticata una dashboard realmente accessibile anche senza banner", () => {
    expect(detectEneaAuthentication({ ...base, observedPath: "/dashboard", dashboardAccessVerified: true })).toMatchObject({
      outcome: "authenticated",
      reason: "dashboard_server_evidence",
    });
  });

  it("considera non autenticata la root solo con un controllo login DOM esplicito", () => {
    expect(detectEneaAuthentication({ ...base, loginControlVisible: true })).toMatchObject({
      outcome: "not_authenticated",
      authenticated: false,
      reason: "explicit_login_dom_evidence",
      pathAloneUsed: false,
    });
  });

  it("non deduce logout dalla sola root e resta fail-closed", () => {
    expect(detectEneaAuthentication(base)).toMatchObject({
      outcome: "indeterminate",
      authenticated: false,
      reason: "authentication_dom_evidence_missing",
      pathAloneUsed: false,
    });
  });

  it("privilegia il banner utente quando il DOM contiene anche un link login generico", () => {
    expect(detectEneaAuthentication({ ...base, connectedUserBannerVisible: true, loginControlVisible: true })).toMatchObject({
      outcome: "authenticated",
      reason: "connected_user_dom_evidence",
    });
  });

  it("rifiuta una classificazione se origine o documento server non sono verificati", () => {
    expect(detectEneaAuthentication({ ...base, loginControlVisible: true, serverDocumentLoaded: false })).toMatchObject({
      outcome: "indeterminate",
      reason: "origin_or_document_unverified",
    });
  });
});
