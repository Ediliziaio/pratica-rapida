import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprBundleRole } from "./aprBundleHashEvidence";
import { APR_BUNDLE_HASH_EVIDENCE_VERSION } from "./aprBundleHashEvidence";
import type { AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
import { verifyAprStagingImmediatelyBeforePromotion } from "./aprPreDeployVerification";
import { loadLatestAprBundlePromotionReceipt, persistAprBundlePromotionReceipt, type AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
import { canonicalJson } from "./aprMonotonicArtifacts";

const sha256File = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

export interface AprBundlePromotionResult {
  certificateArtifactId: string;
  versionId: string;
  versionDirectory: string;
  activePointer: string;
  previousTarget: string | null;
  installed: Array<{ role: AprBundleRole; installedRef: string; installedPath: string; installedSha256: string }>;
  receipt: AprBundlePromotionReceipt;
}

interface AprPromotionTransaction { schemaVersion: "apr-bundle-promotion-transaction-v1"; certificateArtifactId: string; attemptId: string; versionId: string; promotedAt: string; phase: "COPIED" | "POINTER_SWITCHED"; previousTarget: string | null }
class AprSimulatedPromotionCrash extends Error {}

function transactionPath(root: string, certificateId: string) { return path.join(root, "transactions", `${certificateId}.json`); }
function writeTransaction(root: string, transaction: AprPromotionTransaction) {
  const target = transactionPath(root, transaction.certificateArtifactId); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; writeFileSync(temporary, `${canonicalJson(transaction)}\n`, { mode: 0o600 }); renameSync(temporary, target);
}

export function promoteAprBundles(verification: AprVerifiedPreDeployCertificate, options: { afterCopy?: (role: AprBundleRole, installedPath: string) => void; now?: Date; crashAfterPointerSwitch?: boolean; attemptId?: string } = {}): AprBundlePromotionResult {
  const { certificate } = verifyAprStagingImmediatelyBeforePromotion(verification);
  const promotionRoot = certificate.localMetadata!.promotionRoot;
  const activePointer = path.join(promotionRoot, "current");
  const existingReceipt = loadLatestAprBundlePromotionReceipt(promotionRoot, certificate.artifactId);
  if (existingReceipt?.payload.status === "PASS") {
    const versionId = existingReceipt.payload.versionId; const versionDirectory = path.join(promotionRoot, "versions", versionId);
    const installed = existingReceipt.payload.bundles.map((item) => ({ role: item.role, installedRef: item.installedRef, installedSha256: item.installedSha256, installedPath: path.join(activePointer, item.installedRef) }));
    for (const item of installed) if (sha256File(item.installedPath) !== item.installedSha256) throw new Error(`apr_promotion_idempotent_active_hash_mismatch:${item.role}`);
    return { certificateArtifactId: certificate.artifactId, versionId, versionDirectory, activePointer, previousTarget: existingReceipt.payload.previousTarget, installed, receipt: existingReceipt };
  }
  const attemptId = options.attemptId ?? randomUUID(); const versionId = `${certificate.artifactId}-${attemptId}`;
  const versionDirectory = path.join(promotionRoot, "versions", versionId);
  mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
  let previousTarget: string | null = null;
  let installed: AprBundlePromotionResult["installed"] = [];
  try {
  installed = certificate.payload.bundleHashEvidence.map((evidence) => {
    const stagedPath = path.join(certificate.localMetadata!.stagingDirectory, evidence.stagedRef);
    const installedPath = path.join(versionDirectory, evidence.stagedRef);
    if (existsSync(installedPath)) {
      if (sha256File(installedPath) !== evidence.stagedSha256) throw new Error(`apr_promotion_existing_version_hash_mismatch:${evidence.role}`);
    } else {
      copyFileSync(stagedPath, installedPath);
    }
    options.afterCopy?.(evidence.role, installedPath);
    const installedSha256 = sha256File(installedPath);
    if (installedSha256 !== evidence.stagedSha256) throw new Error(`apr_promotion_post_copy_hash_mismatch:${evidence.role}`);
    return { role: evidence.role, installedRef: evidence.stagedRef, installedPath, installedSha256 };
  });
  previousTarget = existsSync(activePointer) && lstatSync(activePointer).isSymbolicLink() ? readlinkSync(activePointer) : null;
  const promotedAt = (options.now ?? new Date()).toISOString();
  writeTransaction(promotionRoot, { schemaVersion: "apr-bundle-promotion-transaction-v1", certificateArtifactId: certificate.artifactId, attemptId, versionId, promotedAt, phase: "COPIED", previousTarget });
  const temporaryPointer = path.join(promotionRoot, `.current-${randomUUID()}`);
  mkdirSync(promotionRoot, { recursive: true, mode: 0o700 });
  symlinkSync(path.relative(promotionRoot, versionDirectory), temporaryPointer);
  renameSync(temporaryPointer, activePointer);
  writeTransaction(promotionRoot, { schemaVersion: "apr-bundle-promotion-transaction-v1", certificateArtifactId: certificate.artifactId, attemptId, versionId, promotedAt, phase: "POINTER_SWITCHED", previousTarget });
  if (options.crashAfterPointerSwitch) throw new AprSimulatedPromotionCrash("apr_promotion_simulated_crash_after_pointer_switch");
  installed = installed.map((item) => {
    const activePath = path.join(activePointer, item.installedRef);
    const installedSha256 = sha256File(activePath);
    if (installedSha256 !== item.installedSha256) throw new Error(`apr_promotion_active_pointer_hash_mismatch:${item.role}`);
    return { ...item, installedPath: activePath, installedSha256 };
  });
  const receipt = persistAprBundlePromotionReceipt({ promotionRoot, attemptId, preDeployCertificateId: certificate.artifactId, versionId, promotedAt, gitCommit: certificate.payload.gitCommit, runtimeRevision: certificate.payload.runtimeRevision, status: "PASS", bundles: installed.map(({ role, installedRef, installedSha256 }) => ({ schemaVersion: APR_BUNDLE_HASH_EVIDENCE_VERSION, role, stagedRef: installedRef, installedRef, stagedSha256: certificate.payload.bundleHashEvidence.find((item) => item.role === role)!.stagedSha256, installedSha256 })), previousTarget, activeTarget: path.relative(promotionRoot, versionDirectory), rejectionReasons: [], rollback: { performed: false, restoredPointer: null } }).receipt;
  return { certificateArtifactId: certificate.artifactId, versionId, versionDirectory, activePointer, previousTarget, installed, receipt };
  } catch (error) {
    if (error instanceof AprSimulatedPromotionCrash) throw error;
    persistAprBundlePromotionReceipt({ promotionRoot, attemptId, preDeployCertificateId: certificate.artifactId, versionId, promotedAt: (options.now ?? new Date()).toISOString(), gitCommit: certificate.payload.gitCommit, runtimeRevision: certificate.payload.runtimeRevision, status: "FAIL", bundles: installed.map(({ role, installedRef, installedSha256 }) => ({ schemaVersion: APR_BUNDLE_HASH_EVIDENCE_VERSION, role, stagedRef: installedRef, installedRef, stagedSha256: certificate.payload.bundleHashEvidence.find((item) => item.role === role)!.stagedSha256, installedSha256 })), previousTarget, activeTarget: previousTarget, rejectionReasons: [error instanceof Error ? error.message : String(error)], rollback: { performed: false, restoredPointer: null } });
    throw error;
  }
}

export function recoverAprBundlePromotion(verification: AprVerifiedPreDeployCertificate): AprBundlePromotionResult {
  const { certificate } = verifyAprStagingImmediatelyBeforePromotion(verification);
  const promotionRoot = certificate.localMetadata!.promotionRoot;
  const existing = loadLatestAprBundlePromotionReceipt(promotionRoot, certificate.artifactId);
  if (existing?.payload.status === "PASS") return promoteAprBundles(verification);
  const transaction = JSON.parse(readFileSync(transactionPath(promotionRoot, certificate.artifactId), "utf8")) as AprPromotionTransaction;
  if (transaction.phase !== "POINTER_SWITCHED" || transaction.certificateArtifactId !== certificate.artifactId) throw new Error("apr_promotion_recovery_checkpoint_not_resumable");
  const activePointer = path.join(promotionRoot, "current"); const versionDirectory = path.join(promotionRoot, "versions", transaction.versionId);
  const installed = certificate.payload.bundleHashEvidence.map((evidence) => {
    const installedPath = path.join(activePointer, evidence.stagedRef); const installedSha256 = sha256File(installedPath);
    if (installedSha256 !== evidence.stagedSha256) throw new Error(`apr_promotion_recovery_hash_mismatch:${evidence.role}`);
    return { role: evidence.role, installedRef: evidence.stagedRef, installedPath, installedSha256 };
  });
  const receipt = persistAprBundlePromotionReceipt({ promotionRoot, attemptId: transaction.attemptId, preDeployCertificateId: certificate.artifactId, versionId: transaction.versionId, promotedAt: transaction.promotedAt, gitCommit: certificate.payload.gitCommit, runtimeRevision: certificate.payload.runtimeRevision, status: "PASS", bundles: installed.map(({ role, installedRef, installedSha256 }) => ({ schemaVersion: APR_BUNDLE_HASH_EVIDENCE_VERSION, role, stagedRef: installedRef, installedRef, stagedSha256: certificate.payload.bundleHashEvidence.find((item) => item.role === role)!.stagedSha256, installedSha256 })), previousTarget: transaction.previousTarget, activeTarget: path.relative(promotionRoot, versionDirectory), rejectionReasons: [], rollback: { performed: false, restoredPointer: null } }).receipt;
  return { certificateArtifactId: certificate.artifactId, versionId: transaction.versionId, versionDirectory, activePointer, previousTarget: transaction.previousTarget, installed, receipt };
}
