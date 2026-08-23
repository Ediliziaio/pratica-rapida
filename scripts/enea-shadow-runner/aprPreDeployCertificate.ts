import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalBundleHashEvidence, computeStagedBundleHashes, type AprBundleHashEvidence } from "./aprBundleHashEvidence";
import { assertAprInputCorpusMatchesBaseline } from "./aprCorpusFingerprint";
import type { AprMonotonicBootstrapBaseline } from "./aprMonotonicBootstrapBaseline";
import type { AprPersistentReplayDifferential } from "./aprPersistentReplayDifferential";
import { PersistentAprTestEvidenceStore, type AprVerifiedRuleTestEvidence } from "./aprPersistedTestEvidence";
import { canonicalJson, canonicalSha256, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprInputCorpusFingerprint, type AprMonotonicPreDeployCertificate } from "./aprMonotonicArtifacts";

export const APR_MONOTONIC_PREDEPLOY_CERTIFICATE_VERSION = "apr-monotonic-predeploy-certificate-v1" as const;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();

export function inspectAprPreDeployGitState(repositoryRoot: string) {
  const root = path.resolve(repositoryRoot);
  const output = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const gitCommit = git(root, ["rev-parse", "HEAD^{commit}"]);
  const treeHash = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (!GIT_OBJECT_ID.test(gitCommit) || !GIT_OBJECT_ID.test(treeHash)) throw new Error("apr_predeploy_git_identity_invalid");
  return {
    gitCommit,
    treeHash,
    workingTreeEvidence: {
      command: "git status --porcelain=v1 --untracked-files=all" as const,
      output,
      outputSha256: canonicalSha256(output),
      clean: output.length === 0,
    },
  };
}

function readBaseline(target: string) {
  const baseline = JSON.parse(readFileSync(target, "utf8")) as AprMonotonicBootstrapBaseline;
  if (!verifyImmutableArtifactEnvelope(baseline) || baseline.payload.status !== "FROZEN") throw new Error("apr_predeploy_baseline_invalid");
  return baseline;
}

function readDifferential(target: string) {
  const artifact = JSON.parse(readFileSync(target, "utf8")) as AprPersistentReplayDifferential;
  if (!verifyImmutableArtifactEnvelope(artifact) || !verifyImmutableArtifactEnvelope(artifact.payload.report)) throw new Error("apr_predeploy_differential_invalid");
  return artifact;
}

export function createAprMonotonicPreDeployCertificate(input: {
  repositoryRoot: string;
  baselinePath: string;
  differentialReportPath: string;
  testEvidenceRoot: string;
  stagingDirectory: string;
  promotionRoot?: string;
  runtimeRevision: string;
  inputCorpusFingerprint: AprInputCorpusFingerprint;
  newRuleIds: readonly string[];
  now?: Date;
}): AprMonotonicPreDeployCertificate {
  const reasons: string[] = [];
  const gitState = inspectAprPreDeployGitState(input.repositoryRoot);
  if (!gitState.workingTreeEvidence.clean) reasons.push("working_tree_dirty");
  let baseline: AprMonotonicBootstrapBaseline | null = null;
  try { baseline = readBaseline(input.baselinePath); } catch (error) { reasons.push(`baseline_invalid:${error instanceof Error ? error.message : String(error)}`); }
  if (baseline) {
    try { assertAprInputCorpusMatchesBaseline(baseline.payload.inputCorpusFingerprint, input.inputCorpusFingerprint); }
    catch (error) { reasons.push(`corpus_mismatch:${error instanceof Error ? error.message : String(error)}`); }
  }
  let differential: AprPersistentReplayDifferential | null = null;
  try { differential = readDifferential(input.differentialReportPath); }
  catch (error) { reasons.push(`differential_report_invalid:${error instanceof Error ? error.message : String(error)}`); }
  if (differential) {
    if (differential.payload.report.payload.hasCriticalRegression) reasons.push("differential_report_critical_regression");
    if (differential.payload.report.payload.status !== "PASS") reasons.push("differential_report_failed");
    if (baseline) {
      try { assertAprInputCorpusMatchesBaseline(baseline.payload.inputCorpusFingerprint, differential.payload.report.payload.inputCorpusFingerprint); }
      catch (error) { reasons.push(`differential_corpus_mismatch:${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  const ruleTestEvidence: AprVerifiedRuleTestEvidence[] = [];
  const testStore = new PersistentAprTestEvidenceStore(input.testEvidenceRoot);
  for (const ruleId of [...new Set(input.newRuleIds)].sort()) {
    try { ruleTestEvidence.push(testStore.verifyTestEvidence(ruleId, gitState.gitCommit, input.runtimeRevision, input.repositoryRoot)); }
    catch (error) { reasons.push(`rule_test_evidence_invalid:${ruleId}:${error instanceof Error ? error.message : String(error)}`); }
  }
  let bundleHashEvidence: AprBundleHashEvidence[] = [];
  try { bundleHashEvidence = canonicalBundleHashEvidence(computeStagedBundleHashes(input.stagingDirectory)); }
  catch (error) { reasons.push(`bundle_staging_invalid:${error instanceof Error ? error.message : String(error)}`); }
  const rejectionReasons = [...new Set(reasons)].sort();
  return envelopeImmutableArtifact({
    schemaVersion: APR_MONOTONIC_PREDEPLOY_CERTIFICATE_VERSION,
    issuedAt: (input.now ?? new Date()).toISOString(),
    locationRefs: { repository: "repository", testEvidence: "monotonic-test-evidence", staging: "apr-bundle-staging", baseline: "bootstrap-baseline", differential: "replay-differential", installed: "apr-bundle-installation" },
    gitCommit: gitState.gitCommit,
    treeHash: gitState.treeHash,
    workingTreeEvidence: gitState.workingTreeEvidence,
    runtimeRevision: input.runtimeRevision,
    inputCorpusFingerprint: input.inputCorpusFingerprint,
    baselineId: baseline?.artifactId ?? "INVALID_BASELINE",
    newRuleIds: [...new Set(input.newRuleIds)].sort(),
    ruleTestEvidence,
    differentialReport: differential
      ? { artifactId: differential.artifactId, ref: "replay-differential", status: differential.payload.report.payload.status, hasCriticalRegression: differential.payload.report.payload.hasCriticalRegression }
      : { artifactId: "INVALID_DIFFERENTIAL", ref: "replay-differential", status: "FAIL", hasCriticalRegression: true },
    bundleHashEvidence,
    status: rejectionReasons.length === 0 ? "PASS" : "FAIL",
    rejectionReasons,
  }, {
    repositoryRoot: path.resolve(input.repositoryRoot),
    testEvidenceRoot: path.resolve(input.testEvidenceRoot),
    stagingDirectory: path.resolve(input.stagingDirectory),
    baselinePath: path.resolve(input.baselinePath),
    differentialReportPath: path.resolve(input.differentialReportPath),
    promotionRoot: path.resolve(input.promotionRoot ?? path.join(path.dirname(input.stagingDirectory), "installed")),
  });
}

export function persistAprMonotonicPreDeployCertificate(targetDirectory: string, certificate: AprMonotonicPreDeployCertificate) {
  if (!verifyImmutableArtifactEnvelope(certificate)) throw new Error("apr_predeploy_certificate_envelope_invalid");
  const directory = path.resolve(targetDirectory); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${certificate.artifactId}.json`); const contents = `${canonicalJson(certificate)}\n`;
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== contents) throw new Error("apr_predeploy_certificate_immutable_collision");
    return { path: target, certificate, created: false };
  }
  const descriptor = openSync(target, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const directoryDescriptor = openSync(directory, "r"); try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  return { path: target, certificate, created: true };
}
