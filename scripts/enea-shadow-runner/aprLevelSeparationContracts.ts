import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import {
  canonicalJson,
  canonicalSha256,
  envelopeImmutableArtifact,
  verifyImmutableArtifactEnvelope,
  type AprImmutableArtifactEnvelope,
} from "./aprMonotonicArtifacts";

export const APR_CANONICAL_FACTS_VERSION = "apr-canonical-facts-v1" as const;
export const APR_BUSINESS_DECISIONS_VERSION = "apr-business-decisions-v1" as const;
export const APR_L2_FACT_RULE_ID = "system-apr-canonical-fact-boundary-v1" as const;
export const APR_L3_PARALLEL_RULE_ID = "system-apr-business-decision-parallel-observation-v1" as const;

export const APR_L2_L3_CONTRACT_RULES = Object.freeze([
  Object.freeze({
    id: APR_L2_FACT_RULE_ID,
    step: "L2_CANONICAL_FACTS",
    condition: "An acquired source is represented before any business decision.",
    sourcePrecedence: Object.freeze(["immutable observed value", "source locator and fingerprint", "extraction method and rule"]),
    deterministicAction: "Preserve the observed value, state and provenance without applying business fallback, precedence or resolution.",
    audit: "factId, field, observed value, state, sourceIds, locators, method, confidence, extractionRuleId and sourceFingerprint",
    outcome: "continue",
  }),
  Object.freeze({
    id: APR_L3_PARALLEL_RULE_ID,
    step: "L3_BUSINESS_DECISIONS",
    condition: "Slice 1 observes the frozen legacy outcome in parallel without operational authority.",
    sourcePrecedence: Object.freeze(["immutable L2 facts", "frozen legacy outcome for comparison only", "fingerprinted rule registry"]),
    deterministicAction: "Emit a separate parallel_observation_only artifact; forbid cutover, payload changes, public reclassification and external actions.",
    audit: "decisionId, factsArtifactId, factsFingerprint, registryFingerprint, applied rules, observed legacy classification, blockers and differences",
    outcome: "continue",
  }),
] as const);

export type AprCanonicalFactStatus = "observed" | "missing" | "ambiguous" | "conflicting";
export type AprCanonicalFactConfidence = "high" | "medium" | "low" | "not_applicable";
export type AprCanonicalFactExtractionMethod = "crm_field" | "pdf_text" | "ocr_text" | "legacy_projection";
export type AprCanonicalValue = null | boolean | number | string | readonly AprCanonicalValue[] | { readonly [key: string]: AprCanonicalValue };

export interface AprCanonicalFactSourceLocator {
  sourceId: string;
  pageNumber: number | null;
  contentSha256: string | null;
  excerptSha256: string | null;
}

export interface AprCanonicalFact {
  factId: string;
  field: string;
  status: AprCanonicalFactStatus;
  value: AprCanonicalValue;
  sourceIds: readonly string[];
  sourceLocators: readonly AprCanonicalFactSourceLocator[];
  extractionMethod: AprCanonicalFactExtractionMethod;
  confidence: AprCanonicalFactConfidence;
  extractionRuleId: string;
}

export interface AprCanonicalFactsPayload {
  schemaVersion: typeof APR_CANONICAL_FACTS_VERSION;
  customerKey: string;
  practiceId: string;
  sourceFingerprint: string;
  facts: readonly AprCanonicalFact[];
}

export type AprCanonicalFactsArtifact = AprImmutableArtifactEnvelope<AprCanonicalFactsPayload>;

export interface AprBusinessDecision {
  decisionId: string;
  field: string;
  status: "resolved" | "blocked" | "operator_required";
  resolvedValue: AprCanonicalValue;
  blockerCode: string | null;
  inputFactIds: readonly string[];
  appliedRuleIds: readonly string[];
  sourcePrecedence: readonly string[];
  reason: string;
}

export interface AprBusinessDecisionsPayload {
  schemaVersion: typeof APR_BUSINESS_DECISIONS_VERSION;
  mode: "parallel_observation_only";
  customerKey: string;
  practiceId: string;
  factsArtifactId: string;
  factsFingerprint: string;
  registryFingerprint: string;
  decisions: readonly AprBusinessDecision[];
  operationalAuthority: false;
}

export type AprBusinessDecisionsArtifact = AprImmutableArtifactEnvelope<AprBusinessDecisionsPayload>;

type CanonicalFactInput = Omit<AprCanonicalFact, "factId">;
type BusinessDecisionInput = Omit<AprBusinessDecision, "decisionId">;

const SHA256 = /^[a-f0-9]{64}$/;

function required(value: string, code: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function sortedUnique(values: readonly string[], code: string) {
  const normalized = values.map((value) => required(value, code)).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error(`${code}:duplicate`);
  return normalized;
}

function assertSha256(value: string, code: string) {
  if (!SHA256.test(value)) throw new Error(code);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function canonicalClone<T extends AprCanonicalValue>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function resolveRule(id: string) {
  return APR_L2_L3_CONTRACT_RULES.find((rule) => rule.id === id) ?? registryRule(id);
}

function registryFingerprint(ruleIds: readonly string[]) {
  const rules = sortedUnique(ruleIds, "apr_l3_rule_id_missing").map((id) => {
    const rule = resolveRule(id);
    if (!rule) throw new Error(`apr_l3_unknown_rule:${id}`);
    return {
      id: rule.id,
      step: rule.step,
      condition: rule.condition,
      sourcePrecedence: [...rule.sourcePrecedence],
      deterministicAction: rule.deterministicAction,
      audit: rule.audit,
      outcome: rule.outcome,
    };
  });
  return canonicalSha256(rules);
}

function normalizeLocator(locator: AprCanonicalFactSourceLocator): AprCanonicalFactSourceLocator {
  const sourceId = required(locator.sourceId, "apr_l2_locator_source_missing");
  if (locator.pageNumber !== null && (!Number.isInteger(locator.pageNumber) || locator.pageNumber < 1)) {
    throw new Error("apr_l2_locator_page_invalid");
  }
  if (locator.contentSha256 !== null) assertSha256(locator.contentSha256, "apr_l2_locator_content_hash_invalid");
  if (locator.excerptSha256 !== null) assertSha256(locator.excerptSha256, "apr_l2_locator_excerpt_hash_invalid");
  return { sourceId, pageNumber: locator.pageNumber, contentSha256: locator.contentSha256, excerptSha256: locator.excerptSha256 };
}

function normalizeFact(input: CanonicalFactInput): AprCanonicalFact {
  const field = required(input.field, "apr_l2_field_missing");
  const extractionRuleId = required(input.extractionRuleId, "apr_l2_extraction_rule_missing");
  if (!resolveRule(extractionRuleId)) throw new Error(`apr_l2_unknown_extraction_rule:${extractionRuleId}`);
  const sourceIds = sortedUnique(input.sourceIds, "apr_l2_source_missing");
  const sourceLocators = input.sourceLocators.map(normalizeLocator).sort((left, right) => canonicalSha256(left).localeCompare(canonicalSha256(right)));
  if (input.status === "observed" && sourceIds.length === 0) throw new Error("apr_l2_observed_source_required");
  if (input.status === "missing" && input.value !== null) throw new Error("apr_l2_missing_value_must_be_null");
  for (const locator of sourceLocators) {
    if (!sourceIds.includes(locator.sourceId)) throw new Error(`apr_l2_locator_source_unbound:${locator.sourceId}`);
  }
  const normalized = {
    field,
    status: input.status,
    value: canonicalClone(input.value),
    sourceIds,
    sourceLocators,
    extractionMethod: input.extractionMethod,
    confidence: input.confidence,
    extractionRuleId,
  };
  return { factId: canonicalSha256(normalized), ...normalized };
}

export function createCanonicalFactsArtifact(input: Omit<AprCanonicalFactsPayload, "schemaVersion" | "facts"> & { facts: readonly CanonicalFactInput[] }): AprCanonicalFactsArtifact {
  const facts = input.facts.map(normalizeFact).sort((left, right) => left.factId.localeCompare(right.factId));
  if (new Set(facts.map((fact) => fact.factId)).size !== facts.length) throw new Error("apr_l2_duplicate_fact");
  const payload: AprCanonicalFactsPayload = {
    schemaVersion: APR_CANONICAL_FACTS_VERSION,
    customerKey: required(input.customerKey, "apr_l2_customer_key_missing"),
    practiceId: required(input.practiceId, "apr_l2_practice_id_missing"),
    sourceFingerprint: assertSha256(input.sourceFingerprint, "apr_l2_source_fingerprint_invalid"),
    facts,
  };
  return deepFreeze(envelopeImmutableArtifact(payload));
}

export function createBusinessDecisionsArtifact(input: {
  factsArtifact: AprCanonicalFactsArtifact;
  decisions: readonly BusinessDecisionInput[];
}): AprBusinessDecisionsArtifact {
  if (!verifyCanonicalFactsArtifact(input.factsArtifact)) throw new Error("apr_l3_invalid_facts_artifact");
  const factIds = new Set(input.factsArtifact.payload.facts.map((fact) => fact.factId));
  const decisions = input.decisions.map((decision) => {
    const field = required(decision.field, "apr_l3_field_missing");
    const inputFactIds = sortedUnique(decision.inputFactIds, "apr_l3_fact_id_missing");
    for (const factId of inputFactIds) if (!factIds.has(factId)) throw new Error(`apr_l3_unknown_fact:${factId}`);
    const appliedRuleIds = sortedUnique(decision.appliedRuleIds, "apr_l3_rule_id_missing");
    registryFingerprint(appliedRuleIds);
    const blockerCode = decision.blockerCode === null ? null : required(decision.blockerCode, "apr_l3_blocker_code_missing");
    if (decision.status === "resolved" && blockerCode !== null) throw new Error("apr_l3_resolved_with_blocker");
    if (decision.status !== "resolved" && blockerCode === null) throw new Error("apr_l3_blocked_without_code");
    const normalized = {
      field,
      status: decision.status,
      resolvedValue: canonicalClone(decision.resolvedValue),
      blockerCode,
      inputFactIds,
      appliedRuleIds,
      sourcePrecedence: [...decision.sourcePrecedence],
      reason: required(decision.reason, "apr_l3_reason_missing"),
    };
    return { decisionId: canonicalSha256(normalized), ...normalized };
  }).sort((left, right) => left.decisionId.localeCompare(right.decisionId));
  if (new Set(decisions.map((decision) => decision.decisionId)).size !== decisions.length) throw new Error("apr_l3_duplicate_decision");
  const allRuleIds = [...new Set(decisions.flatMap((decision) => decision.appliedRuleIds))];
  const payload: AprBusinessDecisionsPayload = {
    schemaVersion: APR_BUSINESS_DECISIONS_VERSION,
    mode: "parallel_observation_only",
    customerKey: input.factsArtifact.payload.customerKey,
    practiceId: input.factsArtifact.payload.practiceId,
    factsArtifactId: input.factsArtifact.artifactId,
    factsFingerprint: canonicalSha256(input.factsArtifact.payload.facts),
    registryFingerprint: registryFingerprint(allRuleIds),
    decisions,
    operationalAuthority: false,
  };
  return deepFreeze(envelopeImmutableArtifact(payload));
}

export function verifyCanonicalFactsArtifact(artifact: AprCanonicalFactsArtifact) {
  if (!verifyImmutableArtifactEnvelope(artifact) || artifact.payload.schemaVersion !== APR_CANONICAL_FACTS_VERSION) return false;
  try {
    const rebuilt = createCanonicalFactsArtifact({
      customerKey: artifact.payload.customerKey,
      practiceId: artifact.payload.practiceId,
      sourceFingerprint: artifact.payload.sourceFingerprint,
      facts: artifact.payload.facts.map(({ factId: _factId, ...fact }) => fact),
    });
    return rebuilt.artifactId === artifact.artifactId;
  } catch {
    return false;
  }
}

export function verifyBusinessDecisionsArtifact(artifact: AprBusinessDecisionsArtifact, factsArtifact: AprCanonicalFactsArtifact) {
  if (!verifyImmutableArtifactEnvelope(artifact) || artifact.payload.schemaVersion !== APR_BUSINESS_DECISIONS_VERSION) return false;
  if (artifact.payload.mode !== "parallel_observation_only" || artifact.payload.operationalAuthority !== false) return false;
  if (artifact.payload.factsArtifactId !== factsArtifact.artifactId || artifact.payload.factsFingerprint !== canonicalSha256(factsArtifact.payload.facts)) return false;
  try {
    const rebuilt = createBusinessDecisionsArtifact({
      factsArtifact,
      decisions: artifact.payload.decisions.map(({ decisionId: _decisionId, ...decision }) => decision),
    });
    return rebuilt.artifactId === artifact.artifactId;
  } catch {
    return false;
  }
}
