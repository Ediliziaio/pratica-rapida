import type { InfissiProductRulesResolution } from "./infissiProductRules";
import type { InfissiTechnicalResolution } from "./infissiTechnicalSources";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import type { AprInfissiShadingClosureAllocation } from "./infissiShadingClosureAllocation";

export const APR_INFISSI_ENEA_DRAFT_PAYLOAD_VERSION = "apr-infissi-enea-draft-payload-v1" as const;
export const APR_INFISSI_ENEA_MAX_NEW_WINDOW_TRANSMITTANCE_WM2K = 1.3 as const;

export interface AprInfissiEneaDraftPayload {
  version: typeof APR_INFISSI_ENEA_DRAFT_PAYLOAD_VERSION;
  practiceId: string;
  interventionType: "comma_345a_building_envelope";
  physicalWindowCount: number;
  windows: ReadonlyArray<{
    physicalRowId: string;
    widthM: number;
    heightM: number;
    areaM2: number;
    sourceNewWindowThermalTransmittanceWm2K: number;
    newWindowThermalTransmittanceWm2K: number;
    oldWindowThermalTransmittanceWm2K: number;
    frameMaterial: string;
    glassType: string;
    shadingClosuresChecked: boolean;
  }>;
  expenseGrossVatIncluded: number;
  portalManagedFields: Readonly<{
    energySavings: "leave_unset_portal_computed";
  }>;
  audit: Readonly<{
    appliedRuleIds: readonly string[];
    fieldEvidence: ReadonlyArray<{
      physicalRowId: string | null;
      field: string;
      source: string;
      ruleId: string;
    }>;
  }>;
}

export function mapInfissiNewWindowTransmittanceForEnea(sourceValueWm2K: number): {
  sourceValueWm2K: number;
  eneaValueWm2K: number;
  transformed: boolean;
  ruleId: typeof USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13 | null;
} {
  if (!Number.isFinite(sourceValueWm2K) || sourceValueWm2K <= 0) throw new Error("infissi_new_window_transmittance_invalid");
  if (sourceValueWm2K > APR_INFISSI_ENEA_MAX_NEW_WINDOW_TRANSMITTANCE_WM2K) {
    return {
      sourceValueWm2K,
      eneaValueWm2K: APR_INFISSI_ENEA_MAX_NEW_WINDOW_TRANSMITTANCE_WM2K,
      transformed: true,
      ruleId: USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13,
    };
  }
  return { sourceValueWm2K, eneaValueWm2K: sourceValueWm2K, transformed: false, ruleId: null };
}

export interface AprInfissiPortalEnergySavingsAudit {
  type: "infissi_portal_energy_savings_observed";
  practiceId: string;
  observedValueKwhYear: number;
  observedAt: string;
  evidenceId: string;
  source: "enea_portal_readonly";
  mutationAllowed: false;
  appliedRuleIds: readonly [string];
}

export function buildAprInfissiEneaDraftPayload(input: {
  practiceId: string;
  technical: InfissiTechnicalResolution;
  productRules: InfissiProductRulesResolution;
  shadingClosureAllocation?: AprInfissiShadingClosureAllocation;
  invoiceGrossTotal: number;
}): AprInfissiEneaDraftPayload {
  const practiceId = input.practiceId.trim();
  if (!practiceId) throw new Error("infissi_identity_required");
  if (input.technical.status !== "ready" || input.productRules.status !== "ready") {
    throw new Error("infissi_mapping_not_ready");
  }
  if (!Number.isFinite(input.invoiceGrossTotal) || input.invoiceGrossTotal < 0) {
    throw new Error("infissi_invoice_total_invalid");
  }
  if (input.productRules.eneaShadingClosuresChecked === null) {
    throw new Error("infissi_shading_closures_unresolved");
  }
  if (input.shadingClosureAllocation?.blocker) throw new Error("infissi_shading_closures_unresolved");
  if (input.shadingClosureAllocation && input.shadingClosureAllocation.flags.length !== input.technical.rows.length) {
    throw new Error("infissi_shading_closure_allocation_cardinality_mismatch");
  }

  const fieldEvidence: Array<{ physicalRowId: string | null; field: string; source: string; ruleId: string }> = [];
  const windows = input.technical.rows.map((row, index) => {
    const addEvidence = (field: string, source: string, ruleId: string) => {
      fieldEvidence.push({ physicalRowId: row.physicalRowId, field, source, ruleId });
    };
    addEvidence("dimensions", `${row.dimensionSourceKind}:${row.dimensionSourceIds.join(",")}`, USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution);
    addEvidence("areaM2", `${row.exactAreaM2}->${row.eneaAreaM2}`, USER_AUTHORIZED_RULE_IDS.infissiAreaRounding);
    const portalTransmittance = mapInfissiNewWindowTransmittanceForEnea(row.thermalTransmittanceWm2K);
    addEvidence("newWindowThermalTransmittanceWm2K", `${row.transmittanceSourceKind}:${row.transmittanceSourceIds.join(",") || "fallback"};source=${portalTransmittance.sourceValueWm2K};enea=${portalTransmittance.eneaValueWm2K}`, portalTransmittance.ruleId ?? USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback);
    addEvidence("oldWindowThermalTransmittanceWm2K", input.productRules.audit.oldWindowThermalTransmittance.source, USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix);
    addEvidence("frameMaterial", input.productRules.audit.newFrameMaterialSource, USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks);
    addEvidence("glassType", input.productRules.audit.glassTypeSource, USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks);
    const allocatedByInvoice = input.shadingClosureAllocation?.mode === "invoice_order_partial";
    const shadingClosuresChecked = input.shadingClosureAllocation?.flags[index] ?? input.productRules.eneaShadingClosuresChecked!;
    addEvidence(
      "shadingClosuresChecked",
      allocatedByInvoice
        ? `invoice_order:${input.shadingClosureAllocation!.sourceIds.join(",")};closureCount=${input.shadingClosureAllocation!.documentedClosureCount};position=${index + 1}`
        : input.productRules.audit.formSourceId ?? "form_source_missing",
      allocatedByInvoice ? USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation : USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm,
    );
    return Object.freeze({
      physicalRowId: row.physicalRowId,
      widthM: row.widthM,
      heightM: row.heightM,
      areaM2: row.eneaAreaM2,
      sourceNewWindowThermalTransmittanceWm2K: portalTransmittance.sourceValueWm2K,
      newWindowThermalTransmittanceWm2K: portalTransmittance.eneaValueWm2K,
      oldWindowThermalTransmittanceWm2K: input.productRules.oldWindowThermalTransmittanceWm2K,
      frameMaterial: input.productRules.newFrameMaterial,
      glassType: input.productRules.glassType,
      shadingClosuresChecked,
    });
  });
  fieldEvidence.push({
    physicalRowId: null,
    field: "energySavingsKwhYear",
    source: "portal_managed_leave_unset",
    ruleId: USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings,
  });

  return Object.freeze({
    version: APR_INFISSI_ENEA_DRAFT_PAYLOAD_VERSION,
    practiceId,
    interventionType: "comma_345a_building_envelope",
    physicalWindowCount: windows.length,
    windows: Object.freeze(windows),
    expenseGrossVatIncluded: input.invoiceGrossTotal,
    portalManagedFields: Object.freeze({ energySavings: "leave_unset_portal_computed" }),
    audit: Object.freeze({
      appliedRuleIds: Object.freeze([
        USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
        USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
        USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
        USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittance131To13,
        USER_AUTHORIZED_RULE_IDS.infissiPortalTransmittanceOverMaxTo13,
        USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix,
        USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks,
        USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm,
        ...(input.shadingClosureAllocation?.mode === "invoice_order_partial" ? [USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation] : []),
        USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings,
      ]),
      fieldEvidence: Object.freeze(fieldEvidence),
    }),
  });
}

export function auditInfissiPortalComputedEnergySavings(input: {
  practiceId: string;
  observedValueKwhYear: number;
  observedAt: string;
  evidenceId: string;
}): AprInfissiPortalEnergySavingsAudit {
  if (!input.practiceId.trim() || !input.evidenceId.trim()) throw new Error("infissi_portal_energy_savings_evidence_required");
  if (!Number.isFinite(input.observedValueKwhYear) || input.observedValueKwhYear < 0) {
    throw new Error("infissi_portal_energy_savings_invalid");
  }
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error("infissi_portal_energy_savings_timestamp_invalid");
  return Object.freeze({
    type: "infissi_portal_energy_savings_observed",
    practiceId: input.practiceId.trim(),
    observedValueKwhYear: input.observedValueKwhYear,
    observedAt: input.observedAt,
    evidenceId: input.evidenceId.trim(),
    source: "enea_portal_readonly",
    mutationAllowed: false,
    appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings] as const,
  });
}
