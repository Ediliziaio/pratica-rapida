import type { AprInfissiHistoricalAuditResult } from "./infissiHistoricalAudit";
import type { AprInfissiPortalContractValidation } from "./infissiPortalContract";
import type { AprInfissiTechnicalAuditResult } from "./infissiTechnicalAudit";
import type { AprInfissiTechnicalMappingResult } from "./infissiTechnicalMapping";

export type AprInfissiShadowGateBlocker =
  | "historical-audit-unsafe"
  | "technical-mapping-not-ready"
  | "technical-audit-not-match"
  | "portal-contract-not-valid"
  | "live-portal-validation-missing";

export interface AprInfissiShadowGateInput {
  historicalAudit: AprInfissiHistoricalAuditResult;
  technicalMapping: AprInfissiTechnicalMappingResult;
  technicalAudit: AprInfissiTechnicalAuditResult;
  portalContract: AprInfissiPortalContractValidation;
  livePortalValidated: boolean;
}

export interface AprInfissiShadowGateResult {
  shadowTechnicalCandidate: boolean;
  officialSubmissionAllowed: false;
  blockers: AprInfissiShadowGateBlocker[];
}

function historicalAuditUnsafe(audit: AprInfissiHistoricalAuditResult): boolean {
  // Il protocollo APR ammette un historical audit `blocked` quando il CRM è
  // aggregato e il PDF concluso contiene granularità maggiore (es. vetri misti).
  // In quel caso il mapper tecnico source-driven + confronto campo-per-campo
  // devono risolvere il dettaglio. `difference` ed `error` restano invece hard stop.
  return audit.status === "difference" || audit.status === "error";
}

/**
 * Gate finale Infissi. Anche un candidato shadow non abilita mai l'invio ENEA:
 * il live test deve limitarsi alla compilazione e al confronto visivo.
 */
export function evaluateAprInfissiShadowGate(
  input: AprInfissiShadowGateInput,
): AprInfissiShadowGateResult {
  const blockers: AprInfissiShadowGateBlocker[] = [];
  if (historicalAuditUnsafe(input.historicalAudit)) blockers.push("historical-audit-unsafe");
  if (input.technicalMapping.status !== "ready") blockers.push("technical-mapping-not-ready");
  if (input.technicalAudit.status !== "match") blockers.push("technical-audit-not-match");
  if (!input.portalContract.valid) blockers.push("portal-contract-not-valid");
  if (!input.livePortalValidated) blockers.push("live-portal-validation-missing");

  return {
    shadowTechnicalCandidate: blockers.length === 0,
    officialSubmissionAllowed: false,
    blockers,
  };
}
