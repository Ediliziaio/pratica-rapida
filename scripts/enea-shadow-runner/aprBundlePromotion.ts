import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync } from "node:fs";
import path from "node:path";
import type { AprBundleRole } from "./aprBundleHashEvidence";
import { APR_BUNDLE_HASH_EVIDENCE_VERSION } from "./aprBundleHashEvidence";
import type { AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
import { verifyAprStagingImmediatelyBeforePromotion } from "./aprPreDeployVerification";
import { persistAprBundlePromotionReceipt, type AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";

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

export function promoteAprBundles(verification: AprVerifiedPreDeployCertificate, options: { afterCopy?: (role: AprBundleRole, installedPath: string) => void; now?: Date } = {}): AprBundlePromotionResult {
  const { certificate } = verifyAprStagingImmediatelyBeforePromotion(verification);
  const promotionRoot = certificate.localMetadata!.promotionRoot;
  const versionId = certificate.artifactId;
  const versionDirectory = path.join(promotionRoot, "versions", versionId);
  const activePointer = path.join(promotionRoot, "current");
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
  const temporaryPointer = path.join(promotionRoot, `.current-${randomUUID()}`);
  mkdirSync(promotionRoot, { recursive: true, mode: 0o700 });
  symlinkSync(path.relative(promotionRoot, versionDirectory), temporaryPointer);
  renameSync(temporaryPointer, activePointer);
  installed = installed.map((item) => {
    const activePath = path.join(activePointer, item.installedRef);
    const installedSha256 = sha256File(activePath);
    if (installedSha256 !== item.installedSha256) throw new Error(`apr_promotion_active_pointer_hash_mismatch:${item.role}`);
    return { ...item, installedPath: activePath, installedSha256 };
  });
  const receipt = persistAprBundlePromotionReceipt({ promotionRoot, preDeployCertificateId: certificate.artifactId, versionId, promotedAt: (options.now ?? new Date()).toISOString(), gitCommit: certificate.payload.gitCommit, runtimeRevision: certificate.payload.runtimeRevision, status: "PASS", bundles: installed.map(({ role, installedRef, installedSha256 }) => ({ schemaVersion: APR_BUNDLE_HASH_EVIDENCE_VERSION, role, stagedRef: installedRef, installedRef, stagedSha256: certificate.payload.bundleHashEvidence.find((item) => item.role === role)!.stagedSha256, installedSha256 })), previousTarget, activeTarget: path.relative(promotionRoot, versionDirectory), rejectionReasons: [], rollback: { performed: false, restoredPointer: null } }).receipt;
  return { certificateArtifactId: certificate.artifactId, versionId, versionDirectory, activePointer, previousTarget, installed, receipt };
  } catch (error) {
    persistAprBundlePromotionReceipt({ promotionRoot, preDeployCertificateId: certificate.artifactId, versionId, promotedAt: (options.now ?? new Date()).toISOString(), gitCommit: certificate.payload.gitCommit, runtimeRevision: certificate.payload.runtimeRevision, status: "FAIL", bundles: installed.map(({ role, installedRef, installedSha256 }) => ({ schemaVersion: APR_BUNDLE_HASH_EVIDENCE_VERSION, role, stagedRef: installedRef, installedRef, stagedSha256: certificate.payload.bundleHashEvidence.find((item) => item.role === role)!.stagedSha256, installedSha256 })), previousTarget, activeTarget: previousTarget, rejectionReasons: [error instanceof Error ? error.message : String(error)], rollback: { performed: false, restoredPointer: null } });
    throw error;
  }
}
