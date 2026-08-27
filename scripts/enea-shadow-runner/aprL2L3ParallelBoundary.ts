import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  APR_L2_FACT_RULE_ID,
  APR_L3_PARALLEL_RULE_ID,
  createBusinessDecisionsArtifact,
  createCanonicalFactsArtifact,
  type AprBusinessDecisionsArtifact,
  type AprCanonicalFactsArtifact,
} from "./aprLevelSeparationContracts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

export const APR_L2_L3_PARALLEL_COMPARISON_VERSION = "apr-l2-l3-parallel-comparison-v1" as const;

export interface AprLegacyCorpusCase {
  practiceId: string;
  customerKey: string;
  module: string;
  currentClassification: "READY" | "BLOCKED";
  currentBlockerCodes: readonly string[];
}

export interface AprSourceManifestCase {
  practiceId: string;
  customerKey: string;
  module: string;
  evidence: { sourceSha256: readonly string[] };
}

export interface AprParallelCaseArtifacts {
  facts: AprCanonicalFactsArtifact;
  decisions: AprBusinessDecisionsArtifact;
}

export interface AprParallelProjection {
  classification: "READY" | "BLOCKED";
  blockerCodes: readonly string[];
}

export interface AprParallelCorpusComparison {
  schemaVersion: typeof APR_L2_L3_PARALLEL_COMPARISON_VERSION;
  mode: "parallel_observation_only";
  operationalAuthority: false;
  caseCount: number;
  legacy: { ready: number; blocked: number };
  parallel: { ready: number; blocked: number };
  unchanged: number;
  mismatches: readonly {
    customerKey: string;
    legacy: AprParallelProjection;
    parallel: AprParallelProjection;
  }[];
  factsSetFingerprint: string;
  decisionsSetFingerprint: string;
  status: "PASS" | "FAIL";
}

const SHA256 = /^[a-f0-9]{64}$/;

function sortedUnique(values: readonly string[], code: string) {
  const sorted = values.map((value) => value.trim()).sort();
  if (sorted.some((value) => !value)) throw new Error(code);
  if (new Set(sorted).size !== sorted.length) throw new Error(`${code}:duplicate`);
  return sorted;
}

function validateIdentity(legacy: AprLegacyCorpusCase, source: AprSourceManifestCase) {
  if (!legacy.customerKey || !legacy.practiceId) throw new Error("apr_parallel_identity_missing");
  if (legacy.customerKey !== source.customerKey || legacy.practiceId !== source.practiceId || legacy.module !== source.module) {
    throw new Error(`apr_parallel_source_identity_mismatch:${legacy.customerKey}`);
  }
}

export function buildParallelCaseArtifacts(legacy: AprLegacyCorpusCase, source: AprSourceManifestCase): AprParallelCaseArtifacts {
  validateIdentity(legacy, source);
  const sourceHashes = sortedUnique([...new Set(source.evidence.sourceSha256)], "apr_parallel_source_hash_missing");
  if (sourceHashes.some((hash) => !SHA256.test(hash))) throw new Error(`apr_parallel_source_hash_invalid:${legacy.customerKey}`);
  const sourceIds = sourceHashes.map((hash) => `sha256:${hash}`);
  const facts = createCanonicalFactsArtifact({
    customerKey: legacy.customerKey,
    practiceId: legacy.practiceId,
    sourceFingerprint: canonicalSha256({ customerKey: legacy.customerKey, practiceId: legacy.practiceId, module: legacy.module, sourceHashes }),
    facts: [
      {
        field: "case.productModule",
        status: "observed",
        value: legacy.module,
        sourceIds,
        sourceLocators: sourceHashes.map((hash) => ({ sourceId: `sha256:${hash}`, pageNumber: null, contentSha256: hash, excerptSha256: null })),
        extractionMethod: "legacy_projection",
        confidence: "high",
        extractionRuleId: APR_L2_FACT_RULE_ID,
      },
    ],
  });
  const inputFactIds = facts.payload.facts.map((fact) => fact.factId);
  const blockerCodes = sortedUnique(legacy.currentBlockerCodes, "apr_parallel_blocker_code_missing");
  if (legacy.currentClassification === "READY" && blockerCodes.length > 0) throw new Error(`apr_parallel_ready_with_blockers:${legacy.customerKey}`);
  if (legacy.currentClassification === "BLOCKED" && blockerCodes.length === 0) throw new Error(`apr_parallel_blocked_without_blockers:${legacy.customerKey}`);
  const decisions = createBusinessDecisionsArtifact({
    factsArtifact: facts,
    decisions: legacy.currentClassification === "READY"
      ? [{
        field: "case.legacyOutcome",
        status: "resolved",
        resolvedValue: "READY",
        blockerCode: null,
        inputFactIds,
        appliedRuleIds: [APR_L3_PARALLEL_RULE_ID],
        sourcePrecedence: ["frozen legacy currentClassification"],
        reason: "Parallel observation of the frozen legacy READY outcome; no operational authority.",
      }]
      : blockerCodes.map((blockerCode) => ({
        field: `case.blocker.${blockerCode}`,
        status: "blocked" as const,
        resolvedValue: null,
        blockerCode,
        inputFactIds,
        appliedRuleIds: [APR_L3_PARALLEL_RULE_ID],
        sourcePrecedence: ["frozen legacy currentClassification", "frozen legacy currentBlockerCodes"],
        reason: "Parallel observation of a frozen legacy blocker; no operational authority.",
      })),
  });
  return { facts, decisions };
}

export function projectParallelDecisions(artifact: AprBusinessDecisionsArtifact): AprParallelProjection {
  const blockerCodes = artifact.payload.decisions
    .filter((decision) => decision.status !== "resolved")
    .map((decision) => decision.blockerCode)
    .filter((code): code is string => code !== null)
    .sort();
  return blockerCodes.length > 0 ? { classification: "BLOCKED", blockerCodes } : { classification: "READY", blockerCodes: [] };
}

export function compareFrozenCorpusInParallel(
  legacyCases: readonly AprLegacyCorpusCase[],
  sourceCases: readonly AprSourceManifestCase[],
): AprParallelCorpusComparison {
  const legacyKeys = legacyCases.map((item) => item.customerKey);
  if (new Set(legacyKeys).size !== legacyKeys.length) throw new Error("apr_parallel_duplicate_legacy_customer");
  const sourcesByKey = new Map<string, AprSourceManifestCase>();
  for (const source of sourceCases) {
    if (sourcesByKey.has(source.customerKey)) throw new Error(`apr_parallel_duplicate_source_customer:${source.customerKey}`);
    sourcesByKey.set(source.customerKey, source);
  }
  const rows = legacyCases.map((legacy) => {
    const source = sourcesByKey.get(legacy.customerKey);
    if (!source) throw new Error(`apr_parallel_source_case_missing:${legacy.customerKey}`);
    const artifacts = buildParallelCaseArtifacts(legacy, source);
    const legacyProjection: AprParallelProjection = {
      classification: legacy.currentClassification,
      blockerCodes: [...legacy.currentBlockerCodes].sort(),
    };
    return { customerKey: legacy.customerKey, legacy: legacyProjection, parallel: projectParallelDecisions(artifacts.decisions), artifacts };
  }).sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  const mismatches = rows
    .filter((row) => canonicalSha256(row.legacy) !== canonicalSha256(row.parallel))
    .map(({ customerKey, legacy, parallel }) => ({ customerKey, legacy, parallel }));
  const count = (projection: "legacy" | "parallel", classification: "READY" | "BLOCKED") => rows.filter((row) => row[projection].classification === classification).length;
  return {
    schemaVersion: APR_L2_L3_PARALLEL_COMPARISON_VERSION,
    mode: "parallel_observation_only",
    operationalAuthority: false,
    caseCount: rows.length,
    legacy: { ready: count("legacy", "READY"), blocked: count("legacy", "BLOCKED") },
    parallel: { ready: count("parallel", "READY"), blocked: count("parallel", "BLOCKED") },
    unchanged: rows.length - mismatches.length,
    mismatches,
    factsSetFingerprint: canonicalSha256(rows.map((row) => ({ customerKey: row.customerKey, artifactId: row.artifacts.facts.artifactId }))),
    decisionsSetFingerprint: canonicalSha256(rows.map((row) => ({ customerKey: row.customerKey, artifactId: row.artifacts.decisions.artifactId }))),
    status: mismatches.length === 0 ? "PASS" : "FAIL",
  };
}

export async function compareFrozenCorpusFiles(replayPath: string, sourceManifestPath: string) {
  const [replayText, sourceManifestText] = await Promise.all([readFile(replayPath, "utf8"), readFile(sourceManifestPath, "utf8")]);
  const replay = JSON.parse(replayText) as { sourceManifestSha256?: string; cases: AprLegacyCorpusCase[] };
  const sourceManifest = JSON.parse(sourceManifestText) as { cases: AprSourceManifestCase[] };
  if (!Array.isArray(replay.cases) || !Array.isArray(sourceManifest.cases)) throw new Error("apr_parallel_corpus_cases_missing");
  const sourceManifestSha256 = createHash("sha256").update(sourceManifestText).digest("hex");
  if (replay.sourceManifestSha256 && replay.sourceManifestSha256 !== sourceManifestSha256) {
    throw new Error(`apr_parallel_source_manifest_hash_mismatch:${sourceManifestSha256}`);
  }
  return compareFrozenCorpusInParallel(replay.cases, sourceManifest.cases);
}
