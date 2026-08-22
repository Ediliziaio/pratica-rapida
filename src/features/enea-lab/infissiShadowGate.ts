import type { AprInfissiHistoricalAuditResult } from "./infissiHistoricalAudit";
import type { AprInfissiCommonCompletedAuditResult } from "./infissiCommonCompletedAudit";
import type { AprInfissiPortalContractValidation } from "./infissiPortalContract";
import type { AprInfissiTechnicalAuditResult } from "./infissiTechnicalAudit";
import type { AprInfissiTechnicalMappingResult } from "./infissiTechnicalMapping";

export type AprInfissiShadowGateBlocker =
  | "historical-audit-unsafe"
  | "common-audit-not-match"
  | "technical-mapping-not-ready"
  | "technical-audit-not-match"
  | "portal-contract-not-valid"
  | "live-portal-validation-missing";

export interface AprInfissiShadowGateInput {
  historicalAudit: AprInfissiHistoricalAuditResult;
  commonAudit: AprInfissiCommonCompletedAuditResult;
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
  return audit.status === "difference" || audit.status === "error";
}

/**
 * Gate finale Infissi. Il confronto col PDF concluso deve essere verde sia
 * sulle sezioni comuni sia sui nove campi tecnici di ogni serramento.
 * L'invio ufficiale resta sempre disabilitato.
 */
export function evaluateAprInfissiShadowGate(
  input: AprInfissiShadowGateInput,
): AprInfissiShadowGateResult {
  const blockers: AprInfissiShadowGateBlocker[] = [];
  if (historicalAuditUnsafe(input.historicalAudit)) blockers.push("historical-audit-unsafe");
  if (input.commonAudit.status !== "match") blockers.push("common-audit-not-match");
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
