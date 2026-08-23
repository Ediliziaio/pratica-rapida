import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_OLD_WINDOW_SOURCE_RESOLUTION_VERSION = "apr-infissi-old-window-source-resolution-v1" as const;

export interface AprInfissiOldWindowSource { sourceId: string; kind: string; text: string }

export interface AprInfissiOldWindowSourceResolution {
  version: typeof APR_INFISSI_OLD_WINDOW_SOURCE_RESOLUTION_VERSION;
  material: string | undefined;
  glazing: string | undefined;
  hasDoubt: boolean;
  sourceKind: "invoice_over_form" | "customer_form" | "conflicting_invoices";
  sourceIds: readonly string[];
  audit: Readonly<{
    formMaterial: string | null;
    formGlazing: string | null;
    invoiceMaterials: readonly string[];
    invoiceGlazings: readonly string[];
    appliedRuleIds: readonly string[];
  }>;
}

const unique = (values: readonly string[]) => [...new Set(values)];

function oldWindowContexts(text: string): string[] {
  const contexts: string[] = [];
  const marker = /\b(?:serrament\w*|infiss\w*|finestr\w*)\s+(?:vecchi\w*|preesistent\w*|rimoss\w*|smontat\w*)\b/giu;
  for (const match of text.matchAll(marker)) {
    const start = Math.max(0, (match.index ?? 0) - 40);
    contexts.push(text.slice(start, Math.min(text.length, start + 360)));
  }
  return contexts;
}

function material(context: string): string | null {
  if (/\bmetallo\s+senza\s+taglio\s+termico\b/iu.test(context)) return "metallo senza taglio termico";
  if (/\bmetallo\s+(?:a|con)\s+taglio\s+termico\b/iu.test(context)) return "metallo taglio termico";
  const match = context.match(/\b(legno|pvc|misto)\b/iu);
  return match ? match[1].toLocaleLowerCase("it-IT") : null;
}

function glazing(context: string): string | null {
  const match = context.match(/\b(?:vetro\s+(singolo|doppio|triplo)|(singolo|doppio|triplo)\s+vetro|pannello)\b/iu);
  return match?.[1] ?? match?.[2] ?? (match?.[0]?.toLocaleLowerCase("it-IT") === "pannello" ? "pannello" : null);
}

export function resolveAprInfissiOldWindowSources(input: {
  formMaterial?: string;
  formGlazing?: string;
  formSourceId: string;
  sources: readonly AprInfissiOldWindowSource[];
}): AprInfissiOldWindowSourceResolution {
  const invoiceEvidence = input.sources
    .filter((source) => source.kind === "invoice")
    .flatMap((source) => oldWindowContexts(source.text).map((context) => ({ sourceId: source.sourceId, material: material(context), glazing: glazing(context) })));
  const invoiceMaterials = unique(invoiceEvidence.map((item) => item.material).filter((value): value is string => Boolean(value)));
  const invoiceGlazings = unique(invoiceEvidence.map((item) => item.glazing).filter((value): value is string => Boolean(value)));
  const hasDoubt = invoiceMaterials.length > 1 || invoiceGlazings.length > 1;
  const invoiceSourceIds = unique(invoiceEvidence.filter((item) => item.material || item.glazing).map((item) => item.sourceId));
  const invoiceOverrides = !hasDoubt && (invoiceMaterials.length === 1 || invoiceGlazings.length === 1);

  return Object.freeze({
    version: APR_INFISSI_OLD_WINDOW_SOURCE_RESOLUTION_VERSION,
    material: hasDoubt ? undefined : invoiceMaterials[0] ?? input.formMaterial,
    glazing: hasDoubt ? undefined : invoiceGlazings[0] ?? input.formGlazing,
    hasDoubt,
    sourceKind: hasDoubt ? "conflicting_invoices" : invoiceOverrides ? "invoice_over_form" : "customer_form",
    sourceIds: Object.freeze(hasDoubt || invoiceOverrides ? unique([...invoiceSourceIds, input.formSourceId]) : [input.formSourceId]),
    audit: Object.freeze({
      formMaterial: input.formMaterial?.trim() || null,
      formGlazing: input.formGlazing?.trim() || null,
      invoiceMaterials: Object.freeze(invoiceMaterials),
      invoiceGlazings: Object.freeze(invoiceGlazings),
      appliedRuleIds: Object.freeze([USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix]),
    }),
  });
}
