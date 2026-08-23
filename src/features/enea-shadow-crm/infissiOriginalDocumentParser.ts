import { createHash } from "node:crypto";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import {
  resolveInfissiTechnicalSources,
  type InfissiTechnicalEvidence,
  type InfissiTechnicalResolution,
} from "./infissiTechnicalSources";
import {
  resolveInfissiProductRules,
  type InfissiProductRulesResolution,
} from "./infissiProductRules";
import { buildAprInfissiEneaDraftPayload, type AprInfissiEneaDraftPayload } from "./infissiEneaDraftPayload";

export const APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION = "apr-infissi-original-document-parser-v3" as const;

export interface ParsedInfissiInvoiceDimension {
  lineId: string;
  quantity: number;
  widthMm: number;
  heightMm: number;
  sourceId: string;
  sourceExcerpt: string;
}

export interface ParsedInfissiTechnicalDeclaration {
  pageId: string;
  thermalTransmittanceWm2K: number;
  sourceId: string;
  sourceExcerpt: string;
}

export interface VerifiedInfissiTechnicalPageDimension {
  pageId: string;
  widthMm: number;
  heightMm: number;
  verificationMethod: "visual_pdf_page_verified";
}

export interface InfissiArchivedCasePreflightInput {
  practiceId: string;
  customerKey: string;
  displayName: string;
  invoiceDimensionSource: { sourceId: string; text: string };
  invoiceFinancialSources: readonly { sourceId: string; text: string }[];
  technicalDocumentSource: { sourceId: string; text: string };
  verifiedTechnicalPageDimensions: readonly VerifiedInfissiTechnicalPageDimension[];
  form: {
    explicitNewFrameMaterial?: string;
    explicitGlassType?: string;
    oldFrameMaterial?: string;
    oldGlazingType?: string;
    oldWindowDataHasDoubt?: boolean;
    alsoInstalledClosures: boolean | undefined;
    sourceId: string;
  };
}

export interface InfissiArchivedCasePreflight {
  version: typeof APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION;
  caseTruth: "READY" | "OPERATOR_REQUIRED";
  practiceId: string;
  customerKey: string;
  displayName: string;
  report: {
    outcome: "ready_local_plan" | "blocked_case";
    blockers: Array<{ code: string; field: string; sourceIds: string[] }>;
    physicalProductCount: number;
    invoiceGrossTotal: number | null;
    rows: InfissiTechnicalResolution["rows"];
    productRules: InfissiProductRulesResolution;
    eneaDraftPayload: AprInfissiEneaDraftPayload | null;
    sourceIds: string[];
    sourceFingerprints: Array<{ sourceId: string; sha256: string }>;
    appliedRuleIds: string[];
  };
  draftPlan: {
    status: "ready_for_portal_mapping" | "operator_required";
    externalActionAllowed: false;
    previewAllowed: false;
    submitAllowed: false;
    communicationsAllowed: false;
    nextAction: string;
  };
}

const RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
  USER_AUTHORIZED_RULE_IDS.infissiAreaRounding,
  USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
  USER_AUTHORIZED_RULE_IDS.infissiOldWindowTransmittanceMatrix,
  USER_AUTHORIZED_RULE_IDS.infissiMaterialGlassFallbacks,
  USER_AUTHORIZED_RULE_IDS.infissiShadingClosuresFromForm,
  USER_AUTHORIZED_RULE_IDS.infissiPortalManagedEnergySavings,
  USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded,
  USER_AUTHORIZED_RULE_IDS.distinctInvoiceNumbersSameCustomerSum,
  USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
  "system-atomic-checkpoint-resume",
] as const);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function parseItalianMoney(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function excerpt(value: string, start: number, end: number) {
  return value.slice(Math.max(0, start - 32), Math.min(value.length, end + 32)).replace(/\s+/g, " ").trim();
}

export function extractInfissiInvoiceDimensions(text: string, sourceId: string): ParsedInfissiInvoiceDimension[] {
  const rows: ParsedInfissiInvoiceDimension[] = [];
  const pattern = /\b(\d{2,4})\s*(?:mm|millimetri)\s*[x×]\s*(\d{2,4})\s*(?:mm|millimetri)(?:\s*\(\s*[x×]\s*(\d{1,3})\s*\))?/giu;
  for (const match of text.matchAll(pattern)) {
    const widthMm = Number.parseInt(match[1], 10);
    const heightMm = Number.parseInt(match[2], 10);
    const quantity = match[3] ? Number.parseInt(match[3], 10) : 1;
    if (!(widthMm > 0 && heightMm > 0 && quantity > 0)) continue;
    rows.push({
      lineId: `${sourceId}:dimension:${rows.length + 1}`,
      quantity,
      widthMm,
      heightMm,
      sourceId,
      sourceExcerpt: excerpt(text, match.index ?? 0, (match.index ?? 0) + match[0].length),
    });
  }
  return rows;
}

export function extractInfissiTechnicalDeclarations(text: string, sourceId: string): ParsedInfissiTechnicalDeclaration[] {
  const headings = [...text.matchAll(/\bWEB\/[A-Z0-9/.-]+\s*-\s*(\d{3})\b/giu)];
  return headings.flatMap((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? text.length;
    const pageText = text.slice(start, end);
    const uw = pageText.match(/Trasmittanza\s+termica\s+Uw\s*\[[^\]]+\]\s*([0-9]+(?:[.,][0-9]+)?)/iu);
    if (!uw) return [];
    const thermalTransmittanceWm2K = Number.parseFloat(uw[1].replace(",", "."));
    if (!(thermalTransmittanceWm2K > 0)) return [];
    return [{
      pageId: heading[1],
      thermalTransmittanceWm2K,
      sourceId,
      sourceExcerpt: excerpt(pageText, uw.index ?? 0, (uw.index ?? 0) + uw[0].length),
    }];
  });
}

export function extractInvoiceGrossTotal(text: string): number | null {
  const matches = [...text.matchAll(/\bTOTALE\s+([0-9][0-9.]*,[0-9]{2})\s*(?:\(EUR\)|EUR|€)/giu)];
  return matches.length === 1 ? parseItalianMoney(matches[0][1]) : null;
}

function dimensionKey(widthMm: number, heightMm: number) {
  return `${widthMm}x${heightMm}`;
}

function expandedDimensionKeys(rows: readonly ParsedInfissiInvoiceDimension[]) {
  return rows.flatMap((row) => Array.from({ length: row.quantity }, () => dimensionKey(row.widthMm, row.heightMm))).sort();
}

export function buildInfissiArchivedCasePreflight(input: InfissiArchivedCasePreflightInput): InfissiArchivedCasePreflight {
  if (!input.practiceId.trim() || !input.customerKey.trim() || !input.displayName.trim()) throw new Error("infissi_identity_required");

  const invoiceRows = extractInfissiInvoiceDimensions(input.invoiceDimensionSource.text, input.invoiceDimensionSource.sourceId);
  const declarations = extractInfissiTechnicalDeclarations(input.technicalDocumentSource.text, input.technicalDocumentSource.sourceId);
  const blockers: Array<{ code: string; field: string; sourceIds: string[] }> = [];
  if (!invoiceRows.length) blockers.push({ code: "infissi_invoice_dimensions_missing", field: "technical_dimensions", sourceIds: [input.invoiceDimensionSource.sourceId] });
  if (!declarations.length) blockers.push({ code: "infissi_technical_declarations_missing", field: "thermal_transmittance", sourceIds: [input.technicalDocumentSource.sourceId] });

  const verifiedByPage = new Map(input.verifiedTechnicalPageDimensions.map((row) => [row.pageId, row]));
  const declarationIds = declarations.map((row) => row.pageId).sort();
  const verifiedIds = [...verifiedByPage.keys()].sort();
  if (declarationIds.length !== verifiedIds.length || declarationIds.some((id, index) => id !== verifiedIds[index])) {
    blockers.push({ code: "infissi_visual_page_verification_mismatch", field: "technical_document_pages", sourceIds: [input.technicalDocumentSource.sourceId] });
  }

  const invoiceKeys = expandedDimensionKeys(invoiceRows);
  const verifiedKeys = input.verifiedTechnicalPageDimensions.map((row) => dimensionKey(row.widthMm, row.heightMm)).sort();
  if (invoiceKeys.length !== verifiedKeys.length || invoiceKeys.some((key, index) => key !== verifiedKeys[index])) {
    blockers.push({ code: "infissi_invoice_technical_document_cardinality_or_dimensions_conflict", field: "technical_cardinality", sourceIds: [input.invoiceDimensionSource.sourceId, input.technicalDocumentSource.sourceId] });
  }

  const totals = input.invoiceFinancialSources.map((source) => ({ sourceId: source.sourceId, total: extractInvoiceGrossTotal(source.text) }));
  if (totals.some((row) => row.total === null)) {
    blockers.push({ code: "infissi_invoice_gross_total_missing_or_ambiguous", field: "invoice_total", sourceIds: totals.filter((row) => row.total === null).map((row) => row.sourceId) });
  }
  const invoiceGrossTotal = totals.every((row) => row.total !== null)
    ? Math.round(totals.reduce((sum, row) => sum + row.total!, 0) * 100) / 100
    : null;

  const invoiceEvidence: InfissiTechnicalEvidence = {
    kind: "invoice",
    sourceIds: [input.invoiceDimensionSource.sourceId],
    rows: invoiceRows.map((row) => ({
      lineId: row.lineId,
      quantity: row.quantity,
      widthM: row.widthMm / 1000,
      heightM: row.heightMm / 1000,
      measurementKind: "overall_external",
    })),
  };
  const technicalEvidence: InfissiTechnicalEvidence = {
    kind: "technical_document",
    sourceIds: [input.technicalDocumentSource.sourceId],
    rows: declarations.flatMap((row) => {
      const verified = verifiedByPage.get(row.pageId);
      return verified ? [{
        lineId: `${input.technicalDocumentSource.sourceId}:page:${row.pageId}`,
        quantity: 1,
        widthM: verified.widthMm / 1000,
        heightM: verified.heightMm / 1000,
        thermalTransmittanceWm2K: row.thermalTransmittanceWm2K,
        measurementKind: "overall_external" as const,
      }] : [];
    }),
  };
  const technical = resolveInfissiTechnicalSources({
    practiceId: input.practiceId,
    invoice: invoiceEvidence,
    technicalDocuments: technicalEvidence,
  });
  for (const code of technical.blockers) blockers.push({ code, field: "technical_rows", sourceIds: [...new Set([...invoiceEvidence.sourceIds, ...technicalEvidence.sourceIds])] });

  const productRules = resolveInfissiProductRules({
    practiceId: input.practiceId,
    explicitNewFrameMaterial: input.form.explicitNewFrameMaterial,
    explicitGlassType: input.form.explicitGlassType,
    formOldFrameMaterial: input.form.oldFrameMaterial,
    formOldGlazingType: input.form.oldGlazingType,
    oldWindowDataHasDoubt: input.form.oldWindowDataHasDoubt,
    formAlsoInstalledClosures: input.form.alsoInstalledClosures,
    formSourceId: input.form.sourceId,
  });
  for (const code of productRules.blockers) blockers.push({ code, field: "shading_closures", sourceIds: [input.form.sourceId] });

  const sourceContents = [input.invoiceDimensionSource, ...input.invoiceFinancialSources, input.technicalDocumentSource];
  const sourceFingerprints = [...new Map(sourceContents.map((source) => [source.sourceId, { sourceId: source.sourceId, sha256: sha256(source.text) }])).values()];
  const appliedRuleIds = [...new Set([...RULE_IDS, ...technical.audit.appliedRuleIds, ...productRules.audit.appliedRuleIds])];
  const ready = blockers.length === 0 && technical.status === "ready" && productRules.status === "ready" && invoiceGrossTotal !== null;
  const eneaDraftPayload = ready
    ? buildAprInfissiEneaDraftPayload({ practiceId: input.practiceId, technical, productRules, invoiceGrossTotal: invoiceGrossTotal! })
    : null;

  const reportOutcome: "ready_local_plan" | "blocked_case" = ready ? "ready_local_plan" : "blocked_case";
  const draftStatus: "ready_for_portal_mapping" | "operator_required" = ready ? "ready_for_portal_mapping" : "operator_required";
  return Object.freeze({
    version: APR_INFISSI_ORIGINAL_DOCUMENT_PARSER_VERSION,
    caseTruth: ready ? "READY" : "OPERATOR_REQUIRED",
    practiceId: input.practiceId.trim(),
    customerKey: input.customerKey.trim(),
    displayName: input.displayName.trim(),
    report: {
      outcome: reportOutcome,
      blockers,
      physicalProductCount: ready ? technical.rows.length : 0,
      invoiceGrossTotal,
      rows: ready ? technical.rows : [],
      productRules,
      eneaDraftPayload,
      sourceIds: [...new Set([input.form.sourceId, ...sourceContents.map((source) => source.sourceId)])],
      sourceFingerprints,
      appliedRuleIds,
    },
    draftPlan: {
      status: draftStatus,
      externalActionAllowed: false as const,
      previewAllowed: false as const,
      submitAllowed: false as const,
      communicationsAllowed: false as const,
      nextAction: ready
        ? "Mappare la pagina tecnica Infissi sul portale TEST con conferma operativa al momento dell'azione; nessuna anteprima o invio."
        : "Risolvere i blocker dalle fonti originarie senza inventare valori e rieseguire lo stesso checkpoint.",
    },
  });
}
