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
const readyTechnical = { status: "ready" as const, items: [], blockers: [] };
const matchTechnicalAudit = { status: "match" as const, comparisons: [], blockers: [] };
const validPortal = { valid: true, blockers: [] };

describe("APR infissi shadow gate", () => {
  it("non dichiara candidato prima del collaudo live sul portale", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: matchHistorical,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      portalContract: validPortal,
      livePortalValidated: false,
    });

    expect(result.shadowTechnicalCandidate).toBe(false);
    expect(result.officialSubmissionAllowed).toBe(false);
    expect(result.blockers).toEqual(["live-portal-validation-missing"]);
  });

  it("ammette un historical blocked per aggregazione CRM se il confronto tecnico è match", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: blockedHistorical,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
      portalContract: validPortal,
      livePortalValidated: true,
    });

    expect(result.shadowTechnicalCandidate).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("anche dopo tutti i gate mantiene l'invio ufficiale disabilitato", () => {
    const result = evaluateAprInfissiShadowGate({
      historicalAudit: matchHistorical,
      technicalMapping: readyTechnical,
      technicalAudit: matchTechnicalAudit,
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
