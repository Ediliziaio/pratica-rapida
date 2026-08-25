import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export type AprInfissiOriginalSourceKind = "invoice" | "third_party_certificate" | "additional" | "crm_internal_technical_document" | "crm_history" | "operator_history" | string;
export interface AprInfissiOriginalSource { sourceId: string; text: string; kind?: AprInfissiOriginalSourceKind }

export const APR_INFISSI_ORIGINAL_SOURCE_POLICY_VERSION = "apr-infissi-original-source-policy-v1" as const;

export function applyAprInfissiOriginalSourcePolicy<T extends AprInfissiOriginalSource>(sources: readonly T[]) {
  const trusted = sources.filter((source) => source.kind === "invoice" || source.kind === "third_party_certificate");
  const excluded = sources.filter((source) => source.kind !== "invoice" && source.kind !== "third_party_certificate");
  return Object.freeze({
    version: APR_INFISSI_ORIGINAL_SOURCE_POLICY_VERSION,
    trusted: Object.freeze(trusted),
    excluded: Object.freeze(excluded.map((source) => Object.freeze({
      sourceId: source.sourceId,
      kind: source.kind ?? "unclassified",
      reason: source.kind === "additional" || source.kind === "crm_internal_technical_document"
        ? "crm_internal_technical_document_not_authoritative"
        : "source_not_allowed_for_ex_novo_test",
    }))),
    audit: Object.freeze({
      appliedRuleIds: Object.freeze([
        USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
        USER_AUTHORIZED_RULE_IDS.testExNovoOriginalSourcesOnly,
      ]),
    }),
  });
}
