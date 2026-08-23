import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalBundleHashEvidence, computeStagedBundleHashes } from "./aprBundleHashEvidence";
import { assertAprInputCorpusMatchesBaseline } from "./aprCorpusFingerprint";
import type { AprMonotonicBootstrapBaseline } from "./aprMonotonicBootstrapBaseline";
import { inspectAprPreDeployGitState } from "./aprPreDeployCertificate";
import { PersistentAprTestEvidenceStore } from "./aprPersistedTestEvidence";
import { canonicalJson, verifyImmutableArtifactEnvelope, type AprMonotonicPreDeployCertificate } from "./aprMonotonicArtifacts";
import type { AprPersistentReplayDifferential } from "./aprPersistentReplayDifferential";

export const APR_PREDEPLOY_VERIFICATION_VERSION = "apr-predeploy-verification-v1" as const;
const verifiedResults = new WeakSet<object>();
const SHA256 = /^[a-f0-9]{64}$/;

function verifyBaselineFromDisk(certificate: AprMonotonicPreDeployCertificate) {
  const baseline = JSON.parse(readFileSync(certificate.localMetadata!.baselinePath, "utf8")) as AprMonotonicBootstrapBaseline;
  if (!verifyImmutableArtifactEnvelope(baseline) || baseline.payload.status !== "FROZEN") throw new Error("apr_predeploy_verification_baseline_envelope_invalid");
  if (baseline.artifactId !== certificate.payload.baselineId) throw new Error("apr_predeploy_verification_baseline_replaced");
  try { assertAprInputCorpusMatchesBaseline(baseline.payload.inputCorpusFingerprint, certificate.payload.inputCorpusFingerprint); }
  catch { throw new Error("apr_predeploy_verification_baseline_corpus_mismatch"); }
  const roles = baseline.payload.bundleHashes.map((item) => item.role).sort();
  if (canonicalJson(roles) !== canonicalJson(["supervisor", "watchdog", "worker"])
    || baseline.payload.bundleHashes.some((item) => !item.stagedRef || !SHA256.test(item.stagedSha256))) {
    throw new Error("apr_predeploy_verification_baseline_bundle_hashes_invalid");
  }
  return baseline;
}

export interface AprVerifiedPreDeployCertificate {
  version: typeof APR_PREDEPLOY_VERIFICATION_VERSION;
  certificatePath: string;
  certificateArtifactId: string;
  gitCommit: string;
  treeHash: string;
  verifiedAt: string;
  status: "VERIFIED_PASS";
}

export function verifyPreDeployCertificate(certificatePath: string, options: { repositoryRoot?: string; now?: Date } = {}): AprVerifiedPreDeployCertificate {
  const resolvedPath = path.resolve(certificatePath);
  const certificate = JSON.parse(readFileSync(resolvedPath, "utf8")) as AprMonotonicPreDeployCertificate;
  if (!verifyImmutableArtifactEnvelope(certificate)) throw new Error("apr_predeploy_verification_certificate_hash_mismatch");
  if (!certificate.localMetadata) throw new Error("apr_predeploy_verification_local_metadata_missing");
  if (certificate.payload.status !== "PASS" || certificate.payload.rejectionReasons.length > 0) throw new Error("apr_predeploy_verification_certificate_not_pass");
  verifyBaselineFromDisk(certificate);
  const repositoryRoot = path.resolve(options.repositoryRoot ?? certificate.localMetadata.repositoryRoot);
  const git = inspectAprPreDeployGitState(repositoryRoot);
  if (git.gitCommit !== certificate.payload.gitCommit) throw new Error("apr_predeploy_verification_git_commit_mismatch");
  if (git.treeHash !== certificate.payload.treeHash) throw new Error("apr_predeploy_verification_git_tree_mismatch");
  if (!git.workingTreeEvidence.clean) throw new Error("apr_predeploy_verification_worktree_dirty");
  const testStore = new PersistentAprTestEvidenceStore(certificate.localMetadata.testEvidenceRoot);
  const reverifiedRules = certificate.payload.newRuleIds.map((ruleId) => testStore.verifyTestEvidence(ruleId, certificate.payload.gitCommit, certificate.payload.runtimeRevision, repositoryRoot));
  if (canonicalJson(reverifiedRules) !== canonicalJson(certificate.payload.ruleTestEvidence)) throw new Error("apr_predeploy_verification_test_evidence_mismatch");
  const staged = canonicalBundleHashEvidence(computeStagedBundleHashes(certificate.localMetadata.stagingDirectory));
  if (canonicalJson(staged) !== canonicalJson(certificate.payload.bundleHashEvidence)) throw new Error("apr_predeploy_verification_bundle_hash_mismatch");
  const differential = JSON.parse(readFileSync(certificate.localMetadata.differentialReportPath, "utf8")) as AprPersistentReplayDifferential;
  if (!verifyImmutableArtifactEnvelope(differential) || !verifyImmutableArtifactEnvelope(differential.payload.report)
    || differential.artifactId !== certificate.payload.differentialReport.artifactId
    || differential.payload.report.payload.status !== "PASS"
    || differential.payload.report.payload.hasCriticalRegression !== false) throw new Error("apr_predeploy_verification_differential_mismatch");
  const result: AprVerifiedPreDeployCertificate = {
    version: APR_PREDEPLOY_VERIFICATION_VERSION,
    certificatePath: resolvedPath,
    certificateArtifactId: certificate.artifactId,
    gitCommit: git.gitCommit,
    treeHash: git.treeHash,
    verifiedAt: (options.now ?? new Date()).toISOString(),
    status: "VERIFIED_PASS",
  };
  verifiedResults.add(result);
  return result;
}

export function guardAprInstallation(verification: AprVerifiedPreDeployCertificate) {
  if (!verification || verification.status !== "VERIFIED_PASS" || !verifiedResults.has(verification)) throw new Error("apr_installation_guard_unverified_certificate");
  return { allowed: true as const, certificateArtifactId: verification.certificateArtifactId, verifiedAt: verification.verifiedAt };
}

export function verifyAprStagingImmediatelyBeforePromotion(verification: AprVerifiedPreDeployCertificate) {
  guardAprInstallation(verification);
  const certificate = JSON.parse(readFileSync(verification.certificatePath, "utf8")) as AprMonotonicPreDeployCertificate;
  if (!verifyImmutableArtifactEnvelope(certificate) || certificate.artifactId !== verification.certificateArtifactId || !certificate.localMetadata) {
    throw new Error("apr_promotion_certificate_changed_after_verification");
  }
  const observed = canonicalBundleHashEvidence(computeStagedBundleHashes(certificate.localMetadata.stagingDirectory));
  if (canonicalJson(observed) !== canonicalJson(certificate.payload.bundleHashEvidence)) throw new Error("apr_promotion_staging_changed_after_verification");
  return { certificate, observed };
}
