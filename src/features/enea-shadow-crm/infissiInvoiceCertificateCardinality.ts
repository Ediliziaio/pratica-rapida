import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import { applyAprInfissiOriginalSourcePolicy } from "./infissiOriginalSourcePolicy";

export const APR_INFISSI_INVOICE_CERTIFICATE_CARDINALITY_VERSION = "apr-infissi-invoice-certificate-cardinality-v1" as const;

export interface AprInfissiCardinalitySource { sourceId: string; kind: string; text: string }

export interface AprInfissiInvoiceCertificateCardinality {
  version: typeof APR_INFISSI_INVOICE_CERTIFICATE_CARDINALITY_VERSION;
  status: "not_applicable" | "matched" | "operator_required";
  invoiceCount: number | null;
  certificateCount: number | null;
  invoiceSourceIds: readonly string[];
  certificateSourceIds: readonly string[];
  blocker: null | Readonly<{ code: "infissi_invoice_certificate_cardinality_mismatch"; field: "technical_cardinality"; reason: string; sourceIds: readonly string[] }>;
  audit: Readonly<{ appliedRuleIds: readonly string[] }>;
}

function counts(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) => Number.parseInt(match[1], 10)).filter((value) => Number.isInteger(value) && value > 0);
}

export function verifyAprInfissiInvoiceCertificateCardinality(
  sources: readonly AprInfissiCardinalitySource[],
  extractedTechnicalCount?: number | null,
): AprInfissiInvoiceCertificateCardinality {
  const trustedSources = applyAprInfissiOriginalSourcePolicy(sources).trusted;
  const invoiceEvidence = trustedSources.flatMap((source) => source.kind === "invoice"
    ? counts(source.text, /\b(?:n(?:[°.o]|umero)?\s*)?(\d{1,3})\s+(?:infiss\w*|serrament\w*)\b/giu).map((count) => ({ sourceId: source.sourceId, count }))
    : []);
  const certificateEvidence = trustedSources.flatMap((source) => source.kind === "third_party_certificate"
    ? counts(source.text, /\bPag\.?\s*\d+\s+su\s+(\d{1,3})\b/giu).map((count) => ({ sourceId: source.sourceId, count }))
    : []);
  const invoiceCounts = [...new Set(invoiceEvidence.map((item) => item.count))];
  const certificatePageCounts = [...new Set(certificateEvidence.map((item) => item.count))];
  const invoiceCount = invoiceCounts.length === 1 ? invoiceCounts[0] : null;
  const certificateCount = certificatePageCounts.length === 1
    ? certificatePageCounts[0]
    : certificateEvidence.length > 0 && extractedTechnicalCount && extractedTechnicalCount > 0 ? extractedTechnicalCount : null;
  const invoiceSourceIds = [...new Set(invoiceEvidence.map((item) => item.sourceId))];
  const certificateSourceIds = [...new Set(certificateEvidence.map((item) => item.sourceId))];
  const mismatch = invoiceCount !== null && certificateCount !== null && invoiceCount !== certificateCount;
  const sourceIds = [...new Set([...invoiceSourceIds, ...certificateSourceIds])];

  return Object.freeze({
    version: APR_INFISSI_INVOICE_CERTIFICATE_CARDINALITY_VERSION,
    status: mismatch ? "operator_required" : invoiceCount !== null && certificateCount !== null ? "matched" : "not_applicable",
    invoiceCount,
    certificateCount,
    invoiceSourceIds: Object.freeze(invoiceSourceIds),
    certificateSourceIds: Object.freeze(certificateSourceIds),
    blocker: mismatch ? Object.freeze({
      code: "infissi_invoice_certificate_cardinality_mismatch" as const,
      field: "technical_cardinality" as const,
      reason: `La fattura dichiara ${invoiceCount} infissi, mentre il certificato di trasmittanza documenta ${certificateCount} pezzi. Richiesto intervento operatore: confermare se un certificato vale per piu pezzi oppure acquisire il documento mancante.`,
      sourceIds: Object.freeze(sourceIds),
    }) : null,
    audit: Object.freeze({ appliedRuleIds: Object.freeze([USER_AUTHORIZED_RULE_IDS.infissiInvoiceCertificateCardinality]) }),
  });
}
