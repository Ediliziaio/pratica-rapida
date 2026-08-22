import { describe, expect, it } from "vitest";
import { evaluateAprInfissiShadowGate } from "./infissiShadowGate";

const matchHistorical = {
  status: "match" as const,
  blockers: [],
  comparisons: [],
  itemCount: 1,
  expense: 1000,
};
const blockedHistorical = {
  ...matchHistorical,
  status: "blocked" as const,
  blockers: ["aggregate-field-mixed" as const],
};
const matchCommonAudit = {
  status: "match" as const,
  compared: 1,
  matches: 1,
  differences: [],
  comparisons: [],
  completed: { cpid: "TEST", fields: {}, screeningCount: -1 },
};
const readyTechnical = { status: "ready" as const, items: [], blockers: [] };
const matchTechnicalAudit = { status: "match" as const, comparisons: [], blockers: [] };
const passTransmittance = { status: "pass" as const, checks: [], blockers: [] };
const validPortal = { valid: true, blockers: [] };

describe("APR infissi shadow gate", () => {
  it("non dichiara candidato prima del collaudo live sul portale", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: matchHistorical,
      commonAudit: matchCommonAudit,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      transmittanceGate: passTransmittance,
      portalContract: validPortal,
      livePortalValidated: false,
    });

    expect(result.shadowTechnicalCandidate).toBe(false);
    expect(result.officialSubmissionAllowed).toBe(false);
    expect(result.blockers).toEqual(["live-portal-validation-missing"]);
  });

  it("ammette un historical blocked per aggregazione CRM se gli audit dettagliati sono match", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: blockedHistorical,
      commonAudit: matchCommonAudit,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      transmittanceGate: passTransmittance,
      portalContract: validPortal,
      livePortalValidated: true,
    });

    expect(result.shadowTechnicalCandidate).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("blocca anche una sola differenza nelle sezioni comuni", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: matchHistorical,
      commonAudit: { ...matchCommonAudit, status: "difference", matches: 0 },
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      transmittanceGate: passTransmittance,
      portalContract: validPortal,
      livePortalValidated: true,
    });

    expect(result.shadowTechnicalCandidate).toBe(false);
    expect(result.blockers).toContain("common-audit-not-match");
  });

  it("blocca una trasmittanza non conforme anche se il confronto storico coincide", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: matchHistorical,
      commonAudit: matchCommonAudit,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      transmittanceGate: { status: "blocked", checks: [], blockers: ["new-transmittance-above-limit:1"] },
      portalContract: validPortal,
      livePortalValidated: true,
    });

    expect(result.shadowTechnicalCandidate).toBe(false);
    expect(result.blockers).toContain("transmittance-gate-not-pass");
  });

  it("anche dopo tutti i gate mantiene l'invio ufficiale disabilitato", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: matchHistorical,
      commonAudit: matchCommonAudit,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      transmittanceGate: passTransmittance,
      portalContract: validPortal,
      livePortalValidated: true,
    });

    expect(result).toEqual({
      shadowTechnicalCandidate: true,
      officialSubmissionAllowed: false,
      blockers: [],
    });
  });
});
