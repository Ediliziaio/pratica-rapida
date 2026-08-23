import type { AprInputCorpusCaseFingerprint, AprInputCorpusFingerprint } from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";

export const APR_FIXED_MONOTONIC_CORPUS_SIZE = 40 as const;

const SHA256 = /^[a-f0-9]{64}$/;

export interface AprInputCorpusCase {
  customerKey: string;
  dossierSha256: string;
  originalDocumentSetSha256: string;
}

function validateCase(item: AprInputCorpusCase) {
  if (!item.customerKey.trim()) throw new Error("apr_corpus_customer_key_empty");
  if (!SHA256.test(item.dossierSha256) || !SHA256.test(item.originalDocumentSetSha256)) {
    throw new Error(`apr_corpus_source_sha_invalid:${item.customerKey}`);
  }
}

export function computeAprInputCorpusFingerprint(input: {
  corpusVersion: string;
  cases: readonly AprInputCorpusCase[];
}): AprInputCorpusFingerprint {
  if (!input.corpusVersion.trim()) throw new Error("apr_corpus_version_empty");
  if (input.cases.length !== APR_FIXED_MONOTONIC_CORPUS_SIZE) {
    throw new Error(`apr_corpus_size_invalid:${input.cases.length}:expected:${APR_FIXED_MONOTONIC_CORPUS_SIZE}`);
  }
  input.cases.forEach(validateCase);
  const keys = input.cases.map((item) => item.customerKey);
  if (new Set(keys).size !== keys.length) throw new Error("apr_corpus_customer_key_duplicate");
  const perCaseSources: AprInputCorpusCaseFingerprint[] = input.cases
    .map((item) => ({ ...item, customerKey: item.customerKey.trim() }))
    .sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  return {
    corpusVersion: input.corpusVersion,
    caseCount: APR_FIXED_MONOTONIC_CORPUS_SIZE,
    customerKeysSha256: canonicalSha256(perCaseSources.map((item) => item.customerKey)),
    sourceSetSha256: canonicalSha256(perCaseSources),
    perCaseSources,
  };
}

export interface AprCorpusComparison {
  matches: boolean;
  missingFromCandidate: string[];
  addedToCandidate: string[];
  changedSourceCases: string[];
  versionChanged: boolean;
}

export function compareAprInputCorpusFingerprint(
  baseline: AprInputCorpusFingerprint,
  candidate: AprInputCorpusFingerprint,
): AprCorpusComparison {
  const baselineByKey = new Map(baseline.perCaseSources.map((item) => [item.customerKey, item]));
  const candidateByKey = new Map(candidate.perCaseSources.map((item) => [item.customerKey, item]));
  const missingFromCandidate = [...baselineByKey.keys()].filter((key) => !candidateByKey.has(key)).sort();
  const addedToCandidate = [...candidateByKey.keys()].filter((key) => !baselineByKey.has(key)).sort();
  const changedSourceCases = [...baselineByKey].flatMap(([key, before]) => {
    const after = candidateByKey.get(key);
    return after && (before.dossierSha256 !== after.dossierSha256 || before.originalDocumentSetSha256 !== after.originalDocumentSetSha256) ? [key] : [];
  }).sort();
  const versionChanged = baseline.corpusVersion !== candidate.corpusVersion;
  return {
    matches: !versionChanged && missingFromCandidate.length === 0 && addedToCandidate.length === 0
      && changedSourceCases.length === 0 && baseline.customerKeysSha256 === candidate.customerKeysSha256
      && baseline.sourceSetSha256 === candidate.sourceSetSha256,
    missingFromCandidate,
    addedToCandidate,
    changedSourceCases,
    versionChanged,
  };
}

export function assertAprInputCorpusMatchesBaseline(
  baseline: AprInputCorpusFingerprint,
  candidate: AprInputCorpusFingerprint,
) {
  const comparison = compareAprInputCorpusFingerprint(baseline, candidate);
  if (!comparison.matches) throw new Error(`apr_corpus_baseline_mismatch:${JSON.stringify(comparison)}`);
  return comparison;
}
