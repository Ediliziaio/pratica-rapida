import { describe, expect, it } from "vitest";
import { ENEA_INTERVENTION_TYPE } from "../enea-lab/interventionRules";
import { APR_INFISSI_SHARED_WORKFLOW_CONTRACT, aprInfissiModuleReadinessSnapshot, buildAprInfissiSharedPlan } from "./infissiModule";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

describe("APR modulo Infissi · gate flusso condiviso", () => {
  it("riusa tutte le sezioni comuni delle schermature cambiando soltanto il tipo intervento", () => {
    expect(APR_INFISSI_SHARED_WORKFLOW_CONTRACT).toMatchObject({
      product: "infissi_serramenti",
      scheme: "ecobonus",
      inheritedFrom: "screenings_shared_workflow",
      interventionType: ENEA_INTERVENTION_TYPE.envelope,
      interventionDifference: "comma_345a_involucro_instead_of_345b_screenings",
      draftAllowed: false,
      externalActionAllowed: false,
    });
    expect(APR_INFISSI_SHARED_WORKFLOW_CONTRACT.interventionType).not.toBe(ENEA_INTERVENTION_TYPE.screening);
    expect(APR_INFISSI_SHARED_WORKFLOW_CONTRACT.sharedSections).toEqual(expect.arrayContaining([
      "beneficiary",
      "co_beneficiaries",
      "property",
      "work_dates",
      "existing_heating_system",
      "economic_sources_and_reconciliation",
      "primary_home_50_or_secondary_home_36_allocation",
    ]));
    expect(APR_INFISSI_SHARED_WORKFLOW_CONTRACT.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverApartmentCount);
    expect(APR_INFISSI_SHARED_WORKFLOW_CONTRACT.appliedRuleIds).not.toContain(USER_AUTHORIZED_RULE_IDS.explicitBuildingTypeOverAffectedUnitCount);
  });

  it("espone la risoluzione locale delle fonti e ferma il piano prima del mapping tecnico e della bozza", () => {
    const plan = buildAprInfissiSharedPlan({ practiceId: "infissi-1", displayName: "Cliente Infissi" });
    expect(plan).toMatchObject({
      status: "ready_for_technical_portal_mapping",
      draftAllowed: false,
      externalActionAllowed: false,
      contract: {
        invoiceProductExtraction: "invoice_or_original_technical_documents_defined_and_tested_locally",
        physicalWindowCardinality: "one_row_per_physical_window_defined_and_tested_locally",
        thermalTechnicalContract: "explicit_transmittance_preferred_authorized_fallback_1_3_if_absent",
        areaContract: "exact_area_audited_enea_area_rounded_to_one_decimal",
        measurementContract: "overall_external_preferred_other_documented_measurement_allowed",
        productDefaults: "pvc_and_low_emissivity_only_when_original_sources_are_silent",
        shadingClosuresFlag: "form_yes_checked_form_no_unchecked_missing_operator",
        technicalPortalMapping: "next_gate_not_defined",
      },
    });
  });

  it("rifiuta un piano senza identita pratica", () => {
    expect(() => buildAprInfissiSharedPlan({ practiceId: "", displayName: "Cliente" })).toThrow("infissi_identity_required");
  });

  it("espone chiaramente il prossimo gate senza dichiarare una bozza reale", () => {
    expect(aprInfissiModuleReadinessSnapshot()).toMatchObject({
      sharedWorkflow: "implemented_and_tested_locally",
      invoiceProductExtraction: "implemented_and_tested_locally",
      physicalWindowCardinality: "implemented_and_tested_locally",
      thermalSourceResolution: "implemented_and_tested_locally",
      areaRounding: "implemented_and_tested_locally",
      materialAndGlassFallbacks: "implemented_and_tested_locally",
      shadingClosuresFromForm: "implemented_and_tested_locally",
      technicalMapping: "pending_user_guided_gate",
      realDraft: "disabled",
      preview: "forbidden",
      submit: "forbidden",
    });
  });
});
