import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { buildParallelCaseArtifacts, compareFrozenCorpusInParallel, projectParallelDecisions } from "./aprL2L3ParallelBoundary";

const sourceHash = (label: string) => canonicalSha256({ label });

const source = (customerKey: string, practiceId: string, module = "screening") => ({
  customerKey,
  practiceId,
  module,
  evidence: { sourceSha256: [sourceHash(`${customerKey}:source`)] },
});

describe("APR Slice 1 parallel L2/L3 boundary", () => {
  it("mantiene identici un caso READY e un caso BLOCKED senza autorita operativa", () => {
    const legacy = [
      { customerKey: "ready-case", practiceId: "practice-ready", module: "screening", currentClassification: "READY" as const, currentBlockerCodes: [] },
      { customerKey: "blocked-case", practiceId: "practice-blocked", module: "infissi", currentClassification: "BLOCKED" as const, currentBlockerCodes: ["screenings_missing", "invoice_missing"] },
    ];
    const comparison = compareFrozenCorpusInParallel(legacy, [
      source("blocked-case", "practice-blocked", "infissi"),
      source("ready-case", "practice-ready"),
    ]);
    expect(comparison).toMatchObject({
      caseCount: 2,
      legacy: { ready: 1, blocked: 1 },
      parallel: { ready: 1, blocked: 1 },
      unchanged: 2,
      mismatches: [],
      status: "PASS",
      operationalAuthority: false,
    });
  });

  it("proietta i blocker in ordine stabile indipendentemente dall'ordine legacy", () => {
    const artifacts = buildParallelCaseArtifacts(
      { customerKey: "ordered-case", practiceId: "practice-ordered", module: "infissi", currentClassification: "BLOCKED", currentBlockerCodes: ["zeta", "alpha"] },
      source("ordered-case", "practice-ordered", "infissi"),
    );
    expect(projectParallelDecisions(artifacts.decisions)).toEqual({ classification: "BLOCKED", blockerCodes: ["alpha", "zeta"] });
  });

  it("normalizza riferimenti duplicati allo stesso documento senza duplicare il fatto", () => {
    const item = source("duplicate-source", "practice-duplicate");
    const artifacts = buildParallelCaseArtifacts(
      { customerKey: "duplicate-source", practiceId: "practice-duplicate", module: "screening", currentClassification: "READY", currentBlockerCodes: [] },
      { ...item, evidence: { sourceSha256: [item.evidence.sourceSha256[0], item.evidence.sourceSha256[0]] } },
    );
    expect(artifacts.facts.payload.facts).toHaveLength(1);
    expect(artifacts.facts.payload.facts[0].sourceIds).toHaveLength(1);
  });

  it("fallisce chiuso per identita sorgente divergente", () => {
    expect(() => buildParallelCaseArtifacts(
      { customerKey: "case-a", practiceId: "practice-a", module: "screening", currentClassification: "READY", currentBlockerCodes: [] },
      source("case-b", "practice-a"),
    )).toThrow("apr_parallel_source_identity_mismatch");
  });

  it("fallisce chiuso per classificazioni legacy internamente incoerenti", () => {
    expect(() => buildParallelCaseArtifacts(
      { customerKey: "case-a", practiceId: "practice-a", module: "screening", currentClassification: "READY", currentBlockerCodes: ["unexpected"] },
      source("case-a", "practice-a"),
    )).toThrow("apr_parallel_ready_with_blockers");
  });
});
