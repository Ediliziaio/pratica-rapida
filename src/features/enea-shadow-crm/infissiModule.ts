import { ENEA_INTERVENTION_TYPE } from "../enea-lab/interventionRules";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_MODULE_VERSION = "apr-infissi-module-v5" as const;

const INFISSI_SHARED_RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.infissiSharedWorkflow,
  USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
  USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
  USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks,
  USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm,
  USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
  USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix,
  USER_AUTHORIZED_RULE_IDS.invoiceIdentityOverCustomerForm,
  USER_AUTHORIZED_RULE_IDS.invoiceCoBeneficiaryPortalFlow,
  USER_AUTHORIZED_RULE_IDS.fiscalCodeIdentityCrossCheck,
  USER_AUTHORIZED_RULE_IDS.singleUnitBuildingQualification,
  USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverAffectedUnitCount,
  USER_AUTHORIZED_RULE_IDS.missingCompletionDate,
  USER_AUTHORIZED_RULE_IDS.invoiceWorkDateChronology,
  USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded,
  USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum,
  USER_AUTHORIZED_RULE_IDS.secondaryHome36PercentAllocation,
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
] as const);

export const APR_INFISSI_SHARED_WORKFLOW_CONTRACT = Object.freeze({
  status: "implemented_and_tested_locally" as const,
  product: "infissi_serramenti" as const,
  scheme: "ecobonus" as const,
  inheritedFrom: "screenings_shared_workflow" as const,
  interventionType: ENEA_INTERVENTION_TYPE.envelope,
  interventionDifference: "comma_345a_involucro_instead_of_345b_screenings" as const,
  sharedSections: Object.freeze([
    "beneficiary",
    "co_beneficiaries",
    "fiscal_code_and_residence",
    "property",
    "building_qualification",
    "work_dates",
    "existing_heating_system",
    "economic_sources_and_reconciliation",
    "primary_home_50_or_secondary_home_36_allocation",
    "audit_queue_lock_checkpoint",
  ] as const),
  invoiceProductExtraction: "invoice_or_original_technical_documents_defined_and_tested_locally" as const,
  physicalWindowCardinality: "one_row_per_physical_window_defined_and_tested_locally" as const,
  thermalTechnicalContract: "explicit_transmittance_preferred_authorized_fallback_1_3_if_absent" as const,
  oldWindowThermalContract: "form_material_and_glazing_matrix_fallback_6_0_on_missing_ambiguous_or_doubt" as const,
  areaContract: "exact_area_audited_enea_area_rounded_to_one_decimal" as const,
  measurementContract: "overall_external_preferred_other_documented_measurement_allowed" as const,
  productDefaults: "pvc_and_low_emissivity_only_when_original_sources_are_silent" as const,
  shadingClosuresFlag: "form_yes_checked_form_no_unchecked_missing_operator" as const,
  technicalPortalMapping: "next_gate_not_defined" as const,
  draftAllowed: false as const,
  externalActionAllowed: false as const,
  previewAllowed: false as const,
  submitAllowed: false as const,
  appliedRuleIds: INFISSI_SHARED_RULE_IDS,
});

export function buildAprInfissiSharedPlan(input: { practiceId: string; displayName: string }) {
  if (!input.practiceId.trim() || !input.displayName.trim()) throw new Error("infissi_identity_required");
  return Object.freeze({
    version: APR_INFISSI_MODULE_VERSION,
    practiceId: input.practiceId.trim(),
    displayName: input.displayName.trim(),
    status: "ready_for_technical_portal_mapping" as const,
    contract: APR_INFISSI_SHARED_WORKFLOW_CONTRACT,
    reason: "Flusso comune e risoluzione locale fattura/documenti tecnici pronti; mapping della pagina tecnica ENEA non ancora definito.",
    nextAction: "Definire i campi tecnici specifici degli infissi e poi osservare e testare la pagina tecnica senza abilitare la bozza.",
    draftAllowed: false as const,
    externalActionAllowed: false as const,
    appliedRuleIds: INFISSI_SHARED_RULE_IDS,
  });
}

export function aprInfissiModuleReadinessSnapshot() {
  return Object.freeze({
    version: APR_INFISSI_MODULE_VERSION,
    product: "infissi_serramenti" as const,
    scheme: "ecobonus" as const,
    sharedWorkflow: "implemented_and_tested_locally" as const,
    interventionType: ENEA_INTERVENTION_TYPE.envelope,
    invoiceProductExtraction: "implemented_and_tested_locally" as const,
    physicalWindowCardinality: "implemented_and_tested_locally" as const,
    thermalSourceResolution: "implemented_and_tested_locally" as const,
    oldWindowThermalTransmittance: "implemented_and_tested_locally" as const,
    areaRounding: "implemented_and_tested_locally" as const,
    materialAndGlassFallbacks: "implemented_and_tested_locally" as const,
    shadingClosuresFromForm: "implemented_and_tested_locally" as const,
    technicalMapping: "pending_user_guided_gate" as const,
    realDraft: "disabled" as const,
    preview: "forbidden" as const,
    submit: "forbidden" as const,
    appliedRuleIds: INFISSI_SHARED_RULE_IDS,
  });
}
