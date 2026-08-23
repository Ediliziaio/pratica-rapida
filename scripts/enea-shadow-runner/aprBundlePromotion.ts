import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync } from "node:fs";
import path from "node:path";
import type { AprBundleRole } from "./aprBundleHashEvidence";
import type { AprVerifiedPreDeployCertificate } from "./aprPreDeployVerification";
import { verifyAprStagingImmediatelyBeforePromotion } from "./aprPreDeployVerification";

const sha256File = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

export interface AprBundlePromotionResult {
  certificateArtifactId: string;
  versionId: string;
  versionDirectory: string;
  activePointer: string;
  previousTarget: string | null;
  installed: Array<{ role: AprBundleRole; installedRef: string; installedPath: string; installedSha256: string }>;
}

export function promoteAprBundles(verification: AprVerifiedPreDeployCertificate, options: { afterCopy?: (role: AprBundleRole, installedPath: string) => void } = {}): AprBundlePromotionResult {
  const { certificate } = verifyAprStagingImmediatelyBeforePromotion(verification);
  const promotionRoot = certificate.localMetadata!.promotionRoot;
  const versionId = certificate.artifactId;
  const versionDirectory = path.join(promotionRoot, "versions", versionId);
  const activePointer = path.join(promotionRoot, "current");
  mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
  const installed = certificate.payload.bundleHashEvidence.map((evidence) => {
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
  const previousTarget = existsSync(activePointer) && lstatSync(activePointer).isSymbolicLink() ? readlinkSync(activePointer) : null;
  const temporaryPointer = path.join(promotionRoot, `.current-${randomUUID()}`);
  mkdirSync(promotionRoot, { recursive: true, mode: 0o700 });
  symlinkSync(path.relative(promotionRoot, versionDirectory), temporaryPointer);
  renameSync(temporaryPointer, activePointer);
  for (const item of installed) {
    const activePath = path.join(activePointer, item.installedRef);
    if (sha256File(activePath) !== item.installedSha256) throw new Error(`apr_promotion_active_pointer_hash_mismatch:${item.role}`);
  }
  return { certificateArtifactId: certificate.artifactId, versionId, versionDirectory, activePointer, previousTarget, installed };
}
