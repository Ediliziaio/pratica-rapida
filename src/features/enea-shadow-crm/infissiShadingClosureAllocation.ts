import { parseScreeningInvoiceText } from "../enea-lab/invoiceParser";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_SHADING_CLOSURE_ALLOCATION_VERSION = "apr-infissi-shading-closure-allocation-v2" as const;

export interface AprInfissiInvoiceTextSource { sourceId: string; text: string }

export interface AprInfissiShadingClosureAllocation {
  version: typeof APR_INFISSI_SHADING_CLOSURE_ALLOCATION_VERSION;
  mode: "invoice_order_partial" | "form_all" | "form_none" | "unresolved";
  flags: readonly boolean[];
  documentedClosureCount: number;
  sourceIds: readonly string[];
  blocker: string | null;
  audit: Readonly<{
    physicalWindowCount: number;
    documentedClosureCount: number;
    technicalRowSourceKind: "invoice" | "technical_document" | null;
    invoiceDocumentSignatures: readonly string[];
    appliedRuleIds: readonly string[];
  }>;
}

const closureDescription = /\b(?:avvolgibil[ei]|tapparell[ae]|chiusur[ae]\s+oscurant[ei])\b/iu;

function closureInventory(source: AprInfissiInvoiceTextSource) {
  const parsedRows = parseScreeningInvoiceText(source.text, source.sourceId).items.filter((item) => closureDescription.test(item.description));
  const normalized = source.text.replace(/\s+/gu, " ");
  const start = normalized.search(closureDescription);
  const scoped = start < 0 ? "" : normalized.slice(start).split(/\b(?:infiss|serrament)[io]\b/iu)[0] ?? "";
  const physicalRows = [...scoped.matchAll(/\bN[.°º]?\s*(\d{1,2})\s+da\s+([0-9]+(?:[,.][0-9]+)?)\s*[x×]\s*([0-9]+(?:[,.][0-9]+)?)/giu)];
  const explicitGroup = scoped.match(/\bN[.°º]?\s*(\d{1,2})\s+(?:avvolgibil[ei]|tapparell[ae]|chiusur[ae]\s+oscurant[ei])\b/iu);
  const count = physicalRows.length
    ? physicalRows.reduce((sum, match) => sum + Number(match[1]), 0)
    : explicitGroup ? Number(explicitGroup[1]) : parsedRows.length;
  const signature = physicalRows.length
    ? physicalRows.flatMap((match) => Array.from({ length: Number(match[1]) }, () => `${match[2]}x${match[3]}`)).sort().join("|")
    : parsedRows.map((item) => `${item.widthMm}x${item.heightMm}`).sort().join("|");
  return { count, signature };
}

/** Deduplica acconto/saldo soltanto quando ripetono lo stesso elenco tecnico. */
export function countDocumentedShadingClosures(invoiceSources: readonly AprInfissiInvoiceTextSource[]) {
  const unique = new Map<string, { count: number; sourceIds: string[] }>();
  for (const source of invoiceSources) {
    const inventory = closureInventory(source);
    if (!inventory.count) continue;
    const signature = inventory.signature || `count:${inventory.count}`;
    const current = unique.get(signature);
    if (current) current.sourceIds.push(source.sourceId);
    else unique.set(signature, { count: inventory.count, sourceIds: [source.sourceId] });
  }
  return {
    count: [...unique.values()].reduce((sum, item) => sum + item.count, 0),
    sourceIds: [...new Set([...unique.values()].flatMap((item) => item.sourceIds))],
    signatures: [...unique.keys()],
  };
}

export function resolveAprInfissiShadingClosureAllocation(input: {
  physicalWindowCount: number;
  invoiceSources: readonly AprInfissiInvoiceTextSource[];
  technicalRowSourceKind: "invoice" | "technical_document" | null;
  formAlsoInstalledClosures?: boolean;
}): AprInfissiShadingClosureAllocation {
  if (!Number.isInteger(input.physicalWindowCount) || input.physicalWindowCount < 1) throw new Error("infissi_physical_window_count_invalid");
  const documented = countDocumentedShadingClosures(input.invoiceSources);
  const partial = documented.count > 0 && documented.count < input.physicalWindowCount;
  const invoiceOrderProven = input.technicalRowSourceKind === "invoice";
  const formKnown = typeof input.formAlsoInstalledClosures === "boolean";
  const mode = partial && !invoiceOrderProven ? "unresolved"
    : partial ? "invoice_order_partial"
    : input.formAlsoInstalledClosures === true ? "form_all"
    : input.formAlsoInstalledClosures === false ? "form_none" : "unresolved";
  const flags = mode === "invoice_order_partial"
    ? Array.from({ length: input.physicalWindowCount }, (_, index) => index < documented.count)
    : mode === "form_all" ? Array.from({ length: input.physicalWindowCount }, () => true)
    : mode === "form_none" ? Array.from({ length: input.physicalWindowCount }, () => false) : [];
  return Object.freeze({
    version: APR_INFISSI_SHADING_CLOSURE_ALLOCATION_VERSION,
    mode,
    flags: Object.freeze(flags),
    documentedClosureCount: documented.count,
    sourceIds: Object.freeze(documented.sourceIds),
    blocker: partial && !invoiceOrderProven
      ? "infissi_shading_closure_invoice_order_not_proven"
      : mode === "unresolved" ? "infissi_shading_closures_form_answer_missing_or_ambiguous" : null,
    audit: Object.freeze({
      physicalWindowCount: input.physicalWindowCount,
      documentedClosureCount: documented.count,
      technicalRowSourceKind: input.technicalRowSourceKind,
      invoiceDocumentSignatures: Object.freeze(documented.signatures),
      appliedRuleIds: Object.freeze(partial
        ? [USER_AUTHORIZED_RULE_IDS.infissiShadingClosureInvoiceOrderAllocation]
        : [USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm]),
    }),
  });
}
