import type { EneaLabDocumentAnalysis, EneaLabMapOptions, EneaLabSourcePractice } from "./types";
import { buildAprInfissiIntake } from "./infissiIntake";
import { mapInfissiCommonPractice } from "./infissiCommonMapping";
import {
  auditHistoricalInfissi,
  type AprInfissiHistoricalAuditResult,
} from "./infissiHistoricalAudit";
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
import type { CompletedEneaInfissiSnapshot } from "./completedEneaInfissi";

export interface AprInfissiPipelineInput {
  source: EneaLabSourcePractice;
  documentAnalysis?: EneaLabDocumentAnalysis;
  mapOptions?: EneaLabMapOptions;
  technicalEvidence: AprInfissiTechnicalEvidenceItem[];
  completedEnea: CompletedEneaInfissiSnapshot;
  portalContract?: AprInfissiPortalObservedContract;
  livePortalValidated: boolean;
}

export interface AprInfissiPipelineResult {
  intake: ReturnType<typeof buildAprInfissiIntake>;
  commonMapping: ReturnType<typeof mapInfissiCommonPractice>;
  historicalAudit: AprInfissiHistoricalAuditResult;
  technicalMapping: AprInfissiTechnicalMappingResult;
  technicalAudit: AprInfissiTechnicalAuditResult;
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
 *
 * Tutte le sorgenti sono input read-only. La funzione non effettua query, upload,
 * update, RPC, click o submit: prepara soltanto mapping, confronti e script che il
 * collaudo live può eseguire sulla pagina già aperta. L'invio ufficiale resta false.
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
  const technicalMapping = mapInfissiTechnicalEvidence(intake.fields, input.technicalEvidence);
  const technicalAudit = technicalMapping.status === "ready"
    ? auditInfissiTechnicalMappingAgainstCompleted(technicalMapping.items, input.completedEnea)
    : { status: "blocked" as const, comparisons: [], blockers: ["technical-mapping-not-ready"] };
  const commonPortalWorkflow = buildAprInfissiCommonPortalWorkflow(commonMapping);
  const technicalPortalScript = input.portalContract && portalContract.valid
    ? prepareAprInfissiPortalScript(input.portalContract, input.completedEnea)
    : { mode: "blocked" as const, script: "", rowCount: 0, reason: "portal-contract-not-valid" };
  const gate = evaluateAprInfissiShadowGate({
    historicalAudit,
    technicalMapping,
    technicalAudit,
    portalContract,
    livePortalValidated: input.livePortalValidated,
  });

  return {
    intake,
    commonMapping,
    historicalAudit,
    technicalMapping,
    technicalAudit,
    portalContract,
    commonPortalWorkflow,
    technicalPortalScript,
    gate,
  };
}
