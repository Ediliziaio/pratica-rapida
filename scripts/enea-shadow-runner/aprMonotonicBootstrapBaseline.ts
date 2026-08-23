import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AprCaseOutputFingerprint,
  AprImmutableArtifactEnvelope,
  AprInputCorpusFingerprint,
  AprStagedBundleHash,
} from "./aprMonotonicArtifacts";
import { canonicalJson, envelopeImmutableArtifact } from "./aprMonotonicArtifacts";
import { APR_FIXED_MONOTONIC_CORPUS_SIZE } from "./aprCorpusFingerprint";

export const APR_MONOTONIC_BASELINE_COMMIT = "76598e7" as const;
export const APR_MONOTONIC_BOOTSTRAP_BASELINE_VERSION = "apr-monotonic-bootstrap-baseline-v1" as const;

export interface AprMonotonicBootstrapBaselinePayload {
  schemaVersion: typeof APR_MONOTONIC_BOOTSTRAP_BASELINE_VERSION;
  createdAt: string;
  sourceCommit: string;
  sourceTree: string;
  runtimeRevision: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  caseOutputs: readonly AprCaseOutputFingerprint[];
  bundleHashes: readonly AprStagedBundleHash[];
  testEvidenceIds: readonly string[];
  status: "FROZEN";
}

export type AprMonotonicBootstrapBaseline = AprImmutableArtifactEnvelope<AprMonotonicBootstrapBaselinePayload>;

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function git(repositoryRoot: string, args: string[]) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

export function inspectAprBaselineGitSource(repositoryRoot: string, baselineCommit: string = APR_MONOTONIC_BASELINE_COMMIT) {
  const root = path.resolve(repositoryRoot);
  const worktreeStatus = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (worktreeStatus) throw new Error("apr_baseline_bootstrap_worktree_dirty");
  const sourceCommit = git(root, ["rev-parse", `${baselineCommit}^{commit}`]);
  const sourceTree = git(root, ["rev-parse", `${baselineCommit}^{tree}`]);
  if (!GIT_OBJECT_ID.test(sourceCommit) || !GIT_OBJECT_ID.test(sourceTree)) throw new Error("apr_baseline_bootstrap_git_source_invalid");
  return { sourceCommit, sourceTree };
}

function assertBaselineEvidence(input: {
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  caseOutputs: readonly AprCaseOutputFingerprint[];
  bundleHashes: readonly AprStagedBundleHash[];
  testEvidenceIds: readonly string[];
  runtimeRevision: string;
}) {
  if (input.inputCorpusFingerprint.caseCount !== APR_FIXED_MONOTONIC_CORPUS_SIZE
    || input.inputCorpusFingerprint.perCaseSources.length !== APR_FIXED_MONOTONIC_CORPUS_SIZE) {
    throw new Error("apr_baseline_bootstrap_corpus_incomplete");
  }
  const corpusKeys = input.inputCorpusFingerprint.perCaseSources.map((item) => item.customerKey).sort();
  const outputKeys = input.caseOutputs.map((item) => item.customerKey).sort();
  if (outputKeys.length !== APR_FIXED_MONOTONIC_CORPUS_SIZE || new Set(outputKeys).size !== outputKeys.length
    || canonicalJson(corpusKeys) !== canonicalJson(outputKeys)) {
    throw new Error("apr_baseline_bootstrap_outputs_do_not_match_corpus");
  }
  const roles = input.bundleHashes.map((item) => item.role).sort();
  if (canonicalJson(roles) !== canonicalJson(["supervisor", "watchdog", "worker"])) {
    throw new Error("apr_baseline_bootstrap_bundle_roles_incomplete");
  }
  if (input.bundleHashes.some((item) => !SHA256.test(item.stagedSha256))) throw new Error("apr_baseline_bootstrap_bundle_sha_invalid");
  if (!input.runtimeRevision.trim() || input.testEvidenceIds.length < 1 || input.testEvidenceIds.some((id) => !id.trim())) {
    throw new Error("apr_baseline_bootstrap_evidence_incomplete");
  }
}

export function createAprMonotonicBootstrapBaseline(input: {
  repositoryRoot: string;
  baselineCommit?: string;
  runtimeRevision: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  caseOutputs: readonly AprCaseOutputFingerprint[];
  bundleHashes: readonly AprStagedBundleHash[];
  testEvidenceIds: readonly string[];
  now?: Date;
}): AprMonotonicBootstrapBaseline {
  assertBaselineEvidence(input);
  const source = inspectAprBaselineGitSource(input.repositoryRoot, input.baselineCommit);
  return envelopeImmutableArtifact({
    schemaVersion: APR_MONOTONIC_BOOTSTRAP_BASELINE_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    sourceCommit: source.sourceCommit,
    sourceTree: source.sourceTree,
    runtimeRevision: input.runtimeRevision,
    inputCorpusFingerprint: input.inputCorpusFingerprint,
    caseOutputs: [...input.caseOutputs].sort((left, right) => left.customerKey.localeCompare(right.customerKey)),
    bundleHashes: [...input.bundleHashes].sort((left, right) => left.role.localeCompare(right.role)),
    testEvidenceIds: [...new Set(input.testEvidenceIds)].sort(),
    status: "FROZEN" as const,
  });
}

export function persistAprMonotonicBootstrapBaseline(target: string, baseline: AprMonotonicBootstrapBaseline) {
  const resolved = path.resolve(target);
  mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const descriptor = openSync(resolved, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${canonicalJson(baseline)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const directory = openSync(path.dirname(resolved), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
  return resolved;
}
