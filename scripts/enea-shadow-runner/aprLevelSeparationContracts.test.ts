import { describe, expect, it } from "vitest";
import {
  APR_L2_FACT_RULE_ID,
  APR_L3_PARALLEL_RULE_ID,
  createBusinessDecisionsArtifact,
  createCanonicalFactsArtifact,
  verifyBusinessDecisionsArtifact,
  verifyCanonicalFactsArtifact,
} from "./aprLevelSeparationContracts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

const hash = (label: string) => canonicalSha256({ label });
const source = (label: string) => `source:${label}`;

function observedFact(field: string, value: string, label: string) {
  const contentSha256 = hash(label);
  return {
    field,
    status: "observed" as const,
    value,
    sourceIds: [source(label)],
    sourceLocators: [{ sourceId: source(label), pageNumber: 1, contentSha256, excerptSha256: hash(`${label}:excerpt`) }],
    extractionMethod: "pdf_text" as const,
    confidence: "high" as const,
    extractionRuleId: APR_L2_FACT_RULE_ID,
  };
}

describe("APR Slice 1 contracts L2/L3", () => {
  it("positivo: collega una decisione parallela a fatti canonici e regole esistenti", () => {
    const facts = createCanonicalFactsArtifact({
      customerKey: "fixture-positive",
      practiceId: "practice-positive",
      sourceFingerprint: hash("positive-source-set"),
      facts: [observedFact("invoice.grossTotal", "1694.00", "invoice")],
    });
    const decisions = createBusinessDecisionsArtifact({
      factsArtifact: facts,
      decisions: [{
        field: "invoice.grossTotal",
        status: "resolved",
        resolvedValue: "1694.00",
        blockerCode: null,
        inputFactIds: [facts.payload.facts[0].factId],
        appliedRuleIds: [APR_L3_PARALLEL_RULE_ID],
        sourcePrecedence: ["frozen legacy outcome"],
        reason: "Compatibility observation only.",
      }],
    });
    expect(verifyCanonicalFactsArtifact(facts)).toBe(true);
    expect(verifyBusinessDecisionsArtifact(decisions, facts)).toBe(true);
    expect(decisions.payload.operationalAuthority).toBe(false);
    expect(decisions.payload.mode).toBe("parallel_observation_only");
  });

  it("negativo: rifiuta fatti osservati privi di fonte e regole inesistenti", () => {
    expect(() => createCanonicalFactsArtifact({
      customerKey: "fixture-negative",
      practiceId: "practice-negative",
      sourceFingerprint: hash("negative-source-set"),
      facts: [{ ...observedFact("invoice.grossTotal", "10.00", "invoice"), sourceIds: [], sourceLocators: [] }],
    })).toThrow("apr_l2_observed_source_required");

    expect(() => createCanonicalFactsArtifact({
      customerKey: "fixture-negative",
      practiceId: "practice-negative",
      sourceFingerprint: hash("negative-source-set"),
      facts: [{ ...observedFact("invoice.grossTotal", "10.00", "invoice"), extractionRuleId: "rule-does-not-exist" }],
    })).toThrow("apr_l2_unknown_extraction_rule");
  });

  it("limite: conserva un conflitto L2 senza risolverlo implicitamente", () => {
    const first = observedFact("screening.material", "Tessuto", "invoice");
    const second = observedFact("screening.material", "Misto", "form");
    const facts = createCanonicalFactsArtifact({
      customerKey: "fixture-conflict",
      practiceId: "practice-conflict",
      sourceFingerprint: hash("conflicting-source-set"),
      facts: [{
        field: "screening.material",
        status: "conflicting",
        value: [first.value, second.value],
        sourceIds: [...first.sourceIds, ...second.sourceIds],
        sourceLocators: [...first.sourceLocators, ...second.sourceLocators],
        extractionMethod: "legacy_projection",
        confidence: "low",
        extractionRuleId: APR_L2_FACT_RULE_ID,
      }],
    });
    expect(facts.payload.facts[0]).toMatchObject({ status: "conflicting", value: ["Tessuto", "Misto"] });
    expect(facts.payload.facts[0]).not.toHaveProperty("resolvedValue");
  });

  it("determinismo: ordine di fatti, fonti e decisioni non cambia gli artifactId", () => {
    const a = observedFact("invoice.number", "17", "invoice-a");
    const b = observedFact("invoice.grossTotal", "1694.00", "invoice-b");
    const makeFacts = (items: readonly (typeof a)[]) => createCanonicalFactsArtifact({
      customerKey: "fixture-deterministic",
      practiceId: "practice-deterministic",
      sourceFingerprint: hash("deterministic-source-set"),
      facts: items,
    });
    const first = makeFacts([a, b]);
    const second = makeFacts([b, a]);
    expect(first.artifactId).toBe(second.artifactId);

    const makeDecisions = (facts: typeof first, reverse: boolean) => createBusinessDecisionsArtifact({
      factsArtifact: facts,
      decisions: (reverse ? [...facts.payload.facts].reverse() : facts.payload.facts).map((fact) => ({
        field: fact.field,
        status: "resolved" as const,
        resolvedValue: fact.value,
        blockerCode: null,
        inputFactIds: [fact.factId],
        appliedRuleIds: [APR_L3_PARALLEL_RULE_ID],
        sourcePrecedence: ["frozen legacy outcome"],
        reason: "Compatibility observation only.",
      })),
    });
    expect(makeDecisions(first, false).artifactId).toBe(makeDecisions(second, true).artifactId);
  });

  it("immutabilita: congela ricorsivamente artefatto, payload e collezioni", () => {
    const facts = createCanonicalFactsArtifact({
      customerKey: "fixture-immutable",
      practiceId: "practice-immutable",
      sourceFingerprint: hash("immutable-source-set"),
      facts: [observedFact("invoice.number", "17", "invoice")],
    });
    const before = facts.artifactId;
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.payload)).toBe(true);
    expect(Object.isFrozen(facts.payload.facts)).toBe(true);
    expect(Object.isFrozen(facts.payload.facts[0].sourceLocators[0])).toBe(true);
    expect(() => ((facts.payload.facts[0] as unknown as { field: string }).field = "tampered")).toThrow();
    expect(facts.artifactId).toBe(before);
    expect(verifyCanonicalFactsArtifact(facts)).toBe(true);
  });
});
