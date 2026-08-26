import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_TECHNICAL_DOCUMENT_CLASSIFIER_VERSION = "apr-infissi-technical-document-classifier-v1" as const;

export type AprInfissiVerifiedDocumentKind = "invoice" | "third_party_certificate" | "additional";
export type AprInfissiCertificateProfile = "invoice_passthrough" | "formal_declaration" | "structured_product_dop" | "none";

export const APR_INFISSI_THIRD_PARTY_CERTIFICATE_CRITERIA = Object.freeze({
  version: APR_INFISSI_TECHNICAL_DOCUMENT_CLASSIFIER_VERSION,
  decision: "Promote only when every criterion of at least one complete profile matches; otherwise keep additional.",
  profiles: Object.freeze({
    formal_declaration: Object.freeze([
      "formal_declaration_title",
      "window_product_family",
      "numeric_thermal_performance",
      "technical_standard",
      "declaring_party_or_signature",
    ]),
    structured_product_dop: Object.freeze([
      "window_product_family",
      "numeric_thermal_performance",
      "en_14351_product_standard",
      "product_reference_and_model",
      "labelled_dimensions_mm",
      "at_least_two_structured_product_blocks",
    ]),
  }),
  thresholds: Object.freeze({
    formal_declaration: "5 of 5 required criteria",
    structured_product_dop: "6 of 6 required criteria, including at least 2 distinct Numero/Rif. tipologia + Modello blocks",
  }),
} as const);

export interface AprInfissiTechnicalDocumentClassification {
  version: typeof APR_INFISSI_TECHNICAL_DOCUMENT_CLASSIFIER_VERSION;
  storageKind: "invoice" | "additional";
  verifiedKind: AprInfissiVerifiedDocumentKind;
  profile: AprInfissiCertificateProfile;
  certificateScope: "installed_windows" | "removed_windows" | null;
  matchedCriteria: readonly string[];
  missingCriteria: readonly string[];
  appliedRuleIds: readonly string[];
}

const CRITERIA = Object.freeze({
  formal_declaration_title: /\b(?:dichiarazione|asseverazione)\b[\s\S]{0,100}\b(?:prestazion\w*|conformit[aà]\s+energetica|trasmittanza)\b/iu,
  window_product_family: /\b(?:serrament[oi]|infiss[oi]|finestr[ae]|porta[\s-]?finestr[ae])\b/iu,
  numeric_thermal_performance: /(?:\bU[wd]\b\s*[=:]?\s*(?:\[\s*)?|trasmittanza\s+termica(?:\s+complessiva)?(?:\s+de[il]\s+serrament[oi])?\s*(?:corrisponde\s+a|pari\s+a)?\s*(?:\bU[wd]\b\s*)?[=:]?\s*(?:\[\s*)?)([0-9](?:[.,][0-9]{1,2})?)(?:\s*\])?(?:\s*W\s*\/\s*m)?/giu,
  technical_standard: /\b(?:UNI\s+EN\s+ISO\s+10077(?:-1)?|EN\s+14351-1|regolamento\s*\(UE\)\s*n?\.?\s*305\/2011|D\.?\s*Lgs\.?\s*192\/2005)\b/iu,
  declaring_party_or_signature: /\b(?:rappresentante\s+legale|fabbricante|costruttore|ditta\s+(?:fornitrice|produttrice)|timbro\s+e\s+firma|firmato\s+a\s+nome\s+e\s+per\s+conto)\b/iu,
  removed_window_scope: /\b(?:serrament[oi]|infiss[oi]|finestr[ae])\s+(?:vecchi|vecchie|esistenti|dismessi|dismesse|rimossi|rimosse|preesistenti)\b/iu,
  en_14351_product_standard: /\bEN\s+14351-1(?::\d{4}|:\d{4}\+A\d)?\b/iu,
  product_reference_and_model: /\b(?:Numero|Rif\.?\s*tipologia)\s*:\s*[^\n]{1,100}\bModello\s*:/giu,
  labelled_dimensions_mm: /\bdimensioni\s*:\s*[0-9]{3,4}\s*[x×]\s*[0-9]{3,4}(?:\s*mm)?\b/giu,
} as const);

function matches(pattern: RegExp, text: string) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function countMatches(pattern: RegExp, text: string) {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].length;
}

function hasNumericThermalPerformance(text: string) {
  CRITERIA.numeric_thermal_performance.lastIndex = 0;
  return [...text.matchAll(CRITERIA.numeric_thermal_performance)].some((match) => {
    const value = Number.parseFloat(match[1].replace(",", "."));
    return Number.isFinite(value) && value >= 0.1 && value <= 8;
  });
}

export function classifyAprInfissiTechnicalDocument(input: {
  storageKind: "invoice" | "additional";
  text: string;
  historicalEneaAppendixExcluded?: boolean;
}): AprInfissiTechnicalDocumentClassification {
  const appliedRuleIds = Object.freeze([
    USER_AUTHORIZED_RULE_IDS.thirdPartyTechnicalCertificateClassification,
    USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
  ]);
  if (input.storageKind === "invoice") return Object.freeze({
    version: APR_INFISSI_TECHNICAL_DOCUMENT_CLASSIFIER_VERSION,
    storageKind: input.storageKind,
    verifiedKind: "invoice",
    profile: "invoice_passthrough",
    certificateScope: null,
    matchedCriteria: Object.freeze([]),
    missingCriteria: Object.freeze([]),
    appliedRuleIds,
  });

  const facts = new Map<string, boolean>([
    ["formal_declaration_title", matches(CRITERIA.formal_declaration_title, input.text)],
    ["window_product_family", matches(CRITERIA.window_product_family, input.text)],
    ["numeric_thermal_performance", hasNumericThermalPerformance(input.text)],
    ["technical_standard", matches(CRITERIA.technical_standard, input.text)],
    ["declaring_party_or_signature", matches(CRITERIA.declaring_party_or_signature, input.text)],
    ["en_14351_product_standard", matches(CRITERIA.en_14351_product_standard, input.text)],
    ["product_reference_and_model", countMatches(CRITERIA.product_reference_and_model, input.text) >= 1],
    ["labelled_dimensions_mm", countMatches(CRITERIA.labelled_dimensions_mm, input.text) >= 1],
    ["at_least_two_structured_product_blocks", countMatches(CRITERIA.product_reference_and_model, input.text) >= 2
      && countMatches(CRITERIA.labelled_dimensions_mm, input.text) >= 2],
  ]);
  const formal = APR_INFISSI_THIRD_PARTY_CERTIFICATE_CRITERIA.profiles.formal_declaration;
  const structured = APR_INFISSI_THIRD_PARTY_CERTIFICATE_CRITERIA.profiles.structured_product_dop;
  const formalMatch = formal.every((criterion) => facts.get(criterion));
  const structuredMatch = structured.every((criterion) => facts.get(criterion));
  const profile: AprInfissiCertificateProfile = input.historicalEneaAppendixExcluded ? "none"
    : formalMatch ? "formal_declaration"
      : structuredMatch ? "structured_product_dop"
        : "none";
  const considered = profile === "formal_declaration" ? formal : profile === "structured_product_dop" ? structured : [...new Set([...formal, ...structured])];
  return Object.freeze({
    version: APR_INFISSI_TECHNICAL_DOCUMENT_CLASSIFIER_VERSION,
    storageKind: input.storageKind,
    verifiedKind: profile === "none" ? "additional" : "third_party_certificate",
    profile,
    certificateScope: profile === "none" ? null : matches(CRITERIA.removed_window_scope, input.text) ? "removed_windows" : "installed_windows",
    matchedCriteria: Object.freeze(considered.filter((criterion) => facts.get(criterion))),
    missingCriteria: Object.freeze(considered.filter((criterion) => !facts.get(criterion))),
    appliedRuleIds,
  });
}
