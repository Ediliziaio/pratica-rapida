import { readFileSync } from "node:fs";
import path from "node:path";
import { computeStagedBundleHashes } from "./aprBundleHashEvidence";
import { inspectAprPreDeployGitState } from "./aprPreDeployCertificate";
import { PersistentAprTestEvidenceStore } from "./aprPersistedTestEvidence";
import { canonicalJson, verifyImmutableArtifactEnvelope, type AprMonotonicPreDeployCertificate } from "./aprMonotonicArtifacts";

export const APR_PREDEPLOY_VERIFICATION_VERSION = "apr-predeploy-verification-v1" as const;
const verifiedResults = new WeakSet<object>();

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
  if (certificate.payload.status !== "PASS" || certificate.payload.rejectionReasons.length > 0) throw new Error("apr_predeploy_verification_certificate_not_pass");
  const repositoryRoot = path.resolve(options.repositoryRoot ?? certificate.payload.repositoryRoot);
  const git = inspectAprPreDeployGitState(repositoryRoot);
  if (git.gitCommit !== certificate.payload.gitCommit) throw new Error("apr_predeploy_verification_git_commit_mismatch");
  if (git.treeHash !== certificate.payload.treeHash) throw new Error("apr_predeploy_verification_git_tree_mismatch");
  if (!git.workingTreeEvidence.clean) throw new Error("apr_predeploy_verification_worktree_dirty");
  const testStore = new PersistentAprTestEvidenceStore(certificate.payload.testEvidenceRoot);
  const reverifiedRules = certificate.payload.newRuleIds.map((ruleId) => testStore.verifyTestEvidence(ruleId, certificate.payload.gitCommit, certificate.payload.runtimeRevision));
  if (canonicalJson(reverifiedRules) !== canonicalJson(certificate.payload.ruleTestEvidence)) throw new Error("apr_predeploy_verification_test_evidence_mismatch");
  const staged = computeStagedBundleHashes(certificate.payload.stagingDirectory);
  if (canonicalJson(staged) !== canonicalJson(certificate.payload.bundleHashEvidence)) throw new Error("apr_predeploy_verification_bundle_hash_mismatch");
  const differential = JSON.parse(readFileSync(certificate.payload.differentialReport.path, "utf8")) as { artifactId?: string; payload?: { report?: { payload?: { status?: string; hasCriticalRegression?: boolean } } } };
  if (differential.artifactId !== certificate.payload.differentialReport.artifactId
    || differential.payload?.report?.payload?.status !== "PASS"
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
