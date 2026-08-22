import type { EneaLabDocumentAnalysis, EneaLabMapOptions, EneaLabSourcePractice } from "./types";
import { buildAprInfissiIntake } from "./infissiIntake";
import { mapInfissiCommonPractice } from "./infissiCommonMapping";
import {
  auditHistoricalInfissi,
  type AprInfissiHistoricalAuditResult,
} from "./infissiHistoricalAudit";
import {
  auditInfissiCommonMappingAgainstCompleted,
  type AprInfissiCommonCompletedAuditResult,
} from "./infissiCommonCompletedAudit";
import {
  mapInfissiTechnicalEvidence,
  type AprInfissiTechnicalEvidenceItem,
  type AprInfissiTechnicalMappingResult,
} from "./infissiTechnicalMapping";
import {
  auditInfissiTechnicalMappingAgainstCompleted,
  type AprInfissiTechnicalAuditResult,
} from "./infissiTechnicalAudit";
import {
  validateAprInfissiPortalContract,
  type AprInfissiPortalObservedContract,
  type AprInfissiPortalContractValidation,
} from "./infissiPortalContract";
import { buildAprInfissiCommonPortalWorkflow } from "./infissiCommonPortalWorkflow";
import { prepareAprInfissiPortalScript, type AprInfissiPortalScriptPreparation } from "./infissiPortalScript";
import { evaluateAprInfissiShadowGate, type AprInfissiShadowGateResult } from "./infissiShadowGate";
import {
  validateAprInfissiTransmittance,
  type AprInfissiTransmittanceGateResult,
  type EneaClimateZone,
} from "./infissiTransmittanceGate";
import type { CompletedEneaInfissiSnapshot } from "./completedEneaInfissi";
import type { CompletedEneaSnapshot } from "./completedEneaAudit";

export interface AprInfissiPipelineInput {
  source: EneaLabSourcePractice;
  documentAnalysis?: EneaLabDocumentAnalysis;
  mapOptions?: EneaLabMapOptions;
  technicalEvidence: AprInfissiTechnicalEvidenceItem[];
  completedEnea: CompletedEneaInfissiSnapshot;
  completedEneaCommon: CompletedEneaSnapshot;
  observedClimateZone?: EneaClimateZone | null;
  portalContract?: AprInfissiPortalObservedContract;
  livePortalValidated: boolean;
}

export interface AprInfissiPipelineResult {
  intake: ReturnType<typeof buildAprInfissiIntake>;
  commonMapping: ReturnType<typeof mapInfissiCommonPractice>;
  historicalAudit: AprInfissiHistoricalAuditResult;
  commonAudit: AprInfissiCommonCompletedAuditResult;
  technicalMapping: AprInfissiTechnicalMappingResult;
  technicalAudit: AprInfissiTechnicalAuditResult;
  transmittanceGate: AprInfissiTransmittanceGateResult;
  portalContract: AprInfissiPortalContractValidation;
  commonPortalWorkflow: ReturnType<typeof buildAprInfissiCommonPortalWorkflow>;
  technicalPortalScript: AprInfissiPortalScriptPreparation;
  gate: AprInfissiShadowGateResult;
}

const INVALID_CONTRACT: AprInfissiPortalContractValidation = {
  valid: false,
  blockers: ["required-control-missing"],
};

/**
 * Orchestratore end-to-end APR Infissi per laboratorio/shadow.
 * Il PDF concluso è solo ground truth; zona climatica e DOM del live test devono
 * essere osservati esplicitamente e non vengono dedotti da dati storici.
 */
export function runAprInfissiPipeline(input: AprInfissiPipelineInput): AprInfissiPipelineResult {
  if (input.source.form.prodotto.tipo !== "infissi") {
    throw new Error("APR Infissi pipeline richiede una pratica prodotto infissi");
  }

  const portalContract = input.portalContract
    ? validateAprInfissiPortalContract(input.portalContract)
    : INVALID_CONTRACT;
  const intake = buildAprInfissiIntake(input.source.form, {
    hasInvoice: input.source.fattureCount > 0,
    hasCompletedEneaPdf: input.completedEnea.items.length > 0,
    technicalPortalContractObserved: portalContract.valid,
  });
  const commonMapping = mapInfissiCommonPractice(
    input.source,
    input.documentAnalysis,
    { ...input.mapOptions, includeTestConventions: false },
  );
  const historicalAudit = auditHistoricalInfissi(intake.fields, input.completedEnea);
  const commonAudit = auditInfissiCommonMappingAgainstCompleted(commonMapping, input.completedEneaCommon);
  const technicalMapping = mapInfissiTechnicalEvidence(intake.fields, input.technicalEvidence);
  const technicalAudit = technicalMapping.status === "ready"
    ? auditInfissiTechnicalMappingAgainstCompleted(technicalMapping.items, input.completedEnea)
    : { status: "blocked" as const, comparisons: [], blockers: ["technical-mapping-not-ready"] };
  const transmittanceGate = validateAprInfissiTransmittance(
    input.observedClimateZone,
    technicalMapping.status === "ready" ? technicalMapping.items : [],
  );
  const commonPortalWorkflow = buildAprInfissiCommonPortalWorkflow(commonMapping);
  const technicalPortalScript = input.portalContract
    && portalContract.valid
    && technicalMapping.status === "ready"
    ? prepareAprInfissiPortalScript(input.portalContract, technicalMapping.items)
    : {
        mode: "blocked" as const,
        script: "",
        rowCount: 0,
        reason: portalContract.valid ? "technical-mapping-not-ready" : "portal-contract-not-valid",
      };
  const gate = evaluateAprInfissiShadowGate({
    historicalAudit,
    commonAudit,
    technicalMapping,
    technicalAudit,
    transmittanceGate,
    portalContract,
    livePortalValidated: input.livePortalValidated,
  });

  return {
    intake,
    commonMapping,
    historicalAudit,
    commonAudit,
    technicalMapping,
    technicalAudit,
    transmittanceGate,
    portalContract,
    commonPortalWorkflow,
    technicalPortalScript,
    gate,
  };
}
