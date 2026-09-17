import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import {
  resolveAprInfissiOldWindowTransmittance,
  type AprInfissiOldWindowTransmittanceResolution,
} from "./infissiOldWindowTransmittance";

export const APR_INFISSI_PRODUCT_RULES_VERSION = "apr-infissi-product-rules-v3" as const;
export const APR_INFISSI_DEFAULT_FRAME_MATERIAL = "PVC" as const;
export const APR_INFISSI_DEFAULT_GLASS_TYPE = "Bassa emissivita" as const;

export interface InfissiProductRulesInput {
  practiceId: string;
  physicalRowId?: string;
  explicitNewFrameMaterial?: string;
  explicitGlassType?: string;
  formOldFrameMaterial?: string;
  formOldGlazingType?: string;
  oldWindowDataHasDoubt?: boolean;
  oldWindowSourceIds?: readonly string[];
  oldWindowSourceKind?: "customer_form" | "invoice_over_form" | "conflicting_invoices";
  formAlsoInstalledClosures?: boolean;
  formSourceId?: string;
  documentedNoAdditionalClosures?: boolean;
  documentedNoAdditionalClosureSourceIds?: readonly string[];
  documentedClosureAllocationResolved?: boolean;
  documentedClosureAllocationUniformValue?: boolean;
  documentedClosureAllocationSourceIds?: readonly string[];
}

export interface InfissiProductRulesResolution {
  version: typeof APR_INFISSI_PRODUCT_RULES_VERSION;
  status: "ready" | "operator_required";
  newFrameMaterial: string;
  glassType: string;
  oldWindowThermalTransmittanceWm2K: number;
  eneaShadingClosuresChecked: boolean | null;
  blockers: readonly string[];
  audit: Readonly<{
    physicalRowId: string | null;
    newFrameMaterialSource: "explicit_original_source" | "authorized_fallback_pvc";
    glassTypeSource: "explicit_original_source" | "authorized_fallback_low_emissivity";
    oldWindowThermalTransmittance: AprInfissiOldWindowTransmittanceResolution;
    formSourceId: string | null;
    formAlsoInstalledClosures: boolean | null;
    shadingClosuresSource: "customer_form" | "explicit_no_screen_evidence" | "invoice_authoritative" | null;
    documentedNoAdditionalClosureSourceIds: readonly string[];
    appliedRuleIds: readonly string[];
  }>;
}

const RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks,
  USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix,
] as const);

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveInfissiProductRules(input: InfissiProductRulesInput): InfissiProductRulesResolution {
  if (!input.practiceId.trim()) throw new Error("infissi_identity_required");

  const explicitMaterial = nonEmpty(input.explicitNewFrameMaterial);
  const explicitGlassType = nonEmpty(input.explicitGlassType);
  const oldWindowThermalTransmittance = resolveAprInfissiOldWindowTransmittance({
    oldFrameMaterial: input.formOldFrameMaterial,
    oldGlazingType: input.formOldGlazingType,
    formSourceId: input.formSourceId,
    sourceIds: input.oldWindowSourceIds,
    sourceKind: input.oldWindowSourceKind,
    hasDoubt: input.oldWindowDataHasDoubt,
  });
  const formAnswerKnown = typeof input.formAlsoInstalledClosures === "boolean";
  const documentedNoAdditionalClosures = input.documentedNoAdditionalClosures === true;
  const documentedClosureAllocationResolved = input.documentedClosureAllocationResolved === true;
  const closureAnswerKnown = documentedClosureAllocationResolved || formAnswerKnown || documentedNoAdditionalClosures;
  const blockers = closureAnswerKnown ? [] : ["infissi_shading_closures_form_answer_missing_or_ambiguous"];

  return Object.freeze({
    version: APR_INFISSI_PRODUCT_RULES_VERSION,
    status: blockers.length === 0 ? "ready" : "operator_required",
    newFrameMaterial: explicitMaterial ?? APR_INFISSI_DEFAULT_FRAME_MATERIAL,
    glassType: explicitGlassType ?? APR_INFISSI_DEFAULT_GLASS_TYPE,
    oldWindowThermalTransmittanceWm2K: oldWindowThermalTransmittance.thermalTransmittanceWm2K,
    eneaShadingClosuresChecked: documentedClosureAllocationResolved
      ? typeof input.documentedClosureAllocationUniformValue === "boolean" ? input.documentedClosureAllocationUniformValue : null
      : formAnswerKnown ? input.formAlsoInstalledClosures! : documentedNoAdditionalClosures ? false : null,
    blockers: Object.freeze(blockers),
    audit: Object.freeze({
      physicalRowId: nonEmpty(input.physicalRowId) ?? null,
      newFrameMaterialSource: explicitMaterial ? "explicit_original_source" : "authorized_fallback_pvc",
      glassTypeSource: explicitGlassType ? "explicit_original_source" : "authorized_fallback_low_emissivity",
      oldWindowThermalTransmittance,
      formSourceId: nonEmpty(input.formSourceId) ?? null,
      formAlsoInstalledClosures: formAnswerKnown ? input.formAlsoInstalledClosures! : null,
      shadingClosuresSource: documentedClosureAllocationResolved
        ? "invoice_authoritative"
        : formAnswerKnown ? "customer_form" : documentedNoAdditionalClosures ? "explicit_no_screen_evidence" : null,
      documentedNoAdditionalClosureSourceIds: Object.freeze([
        ...(documentedClosureAllocationResolved
          ? input.documentedClosureAllocationSourceIds ?? []
          : input.documentedNoAdditionalClosureSourceIds ?? []),
      ]),
      appliedRuleIds: Object.freeze(documentedClosureAllocationResolved
        ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures]
        : documentedNoAdditionalClosures && !formAnswerKnown
          ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.infissiExplicitNoScreenNegativeClosureEvidence]
          : [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm]),
    }),
  });
}
