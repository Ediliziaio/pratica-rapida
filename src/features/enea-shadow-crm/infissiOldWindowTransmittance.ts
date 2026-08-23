import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_OLD_WINDOW_TRANSMITTANCE_VERSION = "apr-infissi-old-window-transmittance-v1" as const;
export const APR_INFISSI_OLD_WINDOW_FALLBACK_WM2K = 6 as const;

export const APR_INFISSI_OLD_FRAME_MATERIALS = [
  "legno",
  "pvc",
  "metallo_taglio_termico",
  "metallo_senza_taglio_termico",
  "misto",
] as const;

export const APR_INFISSI_OLD_GLAZING_TYPES = [
  "vetro_singolo",
  "vetro_doppio",
  "vetro_triplo",
  "pannello",
] as const;

export type AprInfissiOldFrameMaterial = typeof APR_INFISSI_OLD_FRAME_MATERIALS[number];
export type AprInfissiOldGlazingType = typeof APR_INFISSI_OLD_GLAZING_TYPES[number];

export const APR_INFISSI_OLD_WINDOW_TRANSMITTANCE_MATRIX: Readonly<
  Record<AprInfissiOldGlazingType, Readonly<Record<AprInfissiOldFrameMaterial, number>>>
> = Object.freeze({
  vetro_singolo: Object.freeze({ legno: 5, pvc: 5, metallo_taglio_termico: 5.3, metallo_senza_taglio_termico: 6, misto: 5.2 }),
  vetro_doppio: Object.freeze({ legno: 3, pvc: 3.5, metallo_taglio_termico: 3.5, metallo_senza_taglio_termico: 4.1, misto: 3.2 }),
  vetro_triplo: Object.freeze({ legno: 2.1, pvc: 2.1, metallo_taglio_termico: 2.5, metallo_senza_taglio_termico: 3.4, misto: 2.4 }),
  pannello: Object.freeze({ legno: 2.8, pvc: 2.8, metallo_taglio_termico: 5.3, metallo_senza_taglio_termico: 6, misto: 5.2 }),
});

export type AprInfissiOldWindowFallbackReason =
  | "missing_material"
  | "missing_glazing"
  | "ambiguous_or_unmapped_material"
  | "ambiguous_or_unmapped_glazing"
  | "explicit_doubt";

export interface AprInfissiOldWindowTransmittanceResolution {
  version: typeof APR_INFISSI_OLD_WINDOW_TRANSMITTANCE_VERSION;
  thermalTransmittanceWm2K: number;
  source: "form_matrix_combination" | "invoice_over_form_matrix_combination" | "authorized_precautionary_fallback";
  material: AprInfissiOldFrameMaterial | null;
  glazing: AprInfissiOldGlazingType | null;
  fallbackReason: AprInfissiOldWindowFallbackReason | null;
  audit: Readonly<{
    formSourceId: string | null;
    sourceIds: readonly string[];
    sourceKind: "customer_form" | "invoice_over_form" | "conflicting_invoices";
    rawMaterial: string | null;
    rawGlazing: string | null;
    appliedRuleIds: readonly string[];
  }>;
}

const MATERIALS = new Map<string, AprInfissiOldFrameMaterial>([
  ["legno", "legno"],
  ["pvc", "pvc"],
  ["metallo taglio termico", "metallo_taglio_termico"],
  ["metallo_taglio_termico", "metallo_taglio_termico"],
  ["metallo senza taglio termico", "metallo_senza_taglio_termico"],
  ["metallo_senza_taglio_termico", "metallo_senza_taglio_termico"],
  ["misto", "misto"],
]);

const GLAZINGS = new Map<string, AprInfissiOldGlazingType>([
  ["singolo", "vetro_singolo"],
  ["vetro singolo", "vetro_singolo"],
  ["vetro_singolo", "vetro_singolo"],
  ["doppio", "vetro_doppio"],
  ["vetro doppio", "vetro_doppio"],
  ["vetro_doppio", "vetro_doppio"],
  ["triplo", "vetro_triplo"],
  ["vetro triplo", "vetro_triplo"],
  ["vetro_triplo", "vetro_triplo"],
  ["pannello", "pannello"],
]);

function raw(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function key(value: string | null) {
  return value?.toLocaleLowerCase("it-IT").replace(/\s+/g, " ") ?? null;
}

export function resolveAprInfissiOldWindowTransmittance(input: {
  oldFrameMaterial?: string | null;
  oldGlazingType?: string | null;
  formSourceId?: string | null;
  sourceIds?: readonly string[];
  sourceKind?: "customer_form" | "invoice_over_form" | "conflicting_invoices";
  hasDoubt?: boolean;
}): AprInfissiOldWindowTransmittanceResolution {
  const rawMaterial = raw(input.oldFrameMaterial);
  const rawGlazing = raw(input.oldGlazingType);
  const material = MATERIALS.get(key(rawMaterial) ?? "") ?? null;
  const glazing = GLAZINGS.get(key(rawGlazing) ?? "") ?? null;
  const fallbackReason: AprInfissiOldWindowFallbackReason | null = input.hasDoubt
    ? "explicit_doubt"
    : !rawMaterial
      ? "missing_material"
      : !rawGlazing
        ? "missing_glazing"
        : !material
          ? "ambiguous_or_unmapped_material"
          : !glazing
            ? "ambiguous_or_unmapped_glazing"
            : null;
  const useFallback = fallbackReason !== null;

  return Object.freeze({
    version: APR_INFISSI_OLD_WINDOW_TRANSMITTANCE_VERSION,
    thermalTransmittanceWm2K: useFallback
      ? APR_INFISSI_OLD_WINDOW_FALLBACK_WM2K
      : APR_INFISSI_OLD_WINDOW_TRANSMITTANCE_MATRIX[glazing!][material!],
    source: useFallback
      ? "authorized_precautionary_fallback"
      : input.sourceKind === "invoice_over_form" ? "invoice_over_form_matrix_combination" : "form_matrix_combination",
    material,
    glazing,
    fallbackReason,
    audit: Object.freeze({
      formSourceId: raw(input.formSourceId),
      sourceIds: Object.freeze([...(input.sourceIds ?? (raw(input.formSourceId) ? [raw(input.formSourceId)!] : []))]),
      sourceKind: input.sourceKind ?? "customer_form",
      rawMaterial,
      rawGlazing,
      appliedRuleIds: Object.freeze([USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix]),
    }),
  });
}
