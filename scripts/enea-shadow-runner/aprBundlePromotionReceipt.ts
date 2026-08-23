import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import type { AprBundleRole } from "./aprBundleHashEvidence";
import { APR_BUNDLE_HASH_EVIDENCE_VERSION } from "./aprBundleHashEvidence";

export const APR_BUNDLE_PROMOTION_RECEIPT_VERSION = "apr-bundle-promotion-receipt-v1" as const;
export interface AprBundlePromotionReceiptPayload {
  schemaVersion: typeof APR_BUNDLE_PROMOTION_RECEIPT_VERSION;
  receiptId: string;
  preDeployCertificateId: string;
  versionId: string;
  promotedAt: string;
  gitCommit: string;
  runtimeRevision: string;
  status: "PASS" | "FAIL";
  bundles: Array<{ schemaVersion: typeof APR_BUNDLE_HASH_EVIDENCE_VERSION; role: AprBundleRole; stagedRef: string; installedRef: string; stagedSha256: string; installedSha256: string }>;
  previousTarget: string | null;
  activeTarget: string | null;
  rejectionReasons: string[];
  rollback: { performed: boolean; restoredPointer: string | null };
}
export type AprBundlePromotionReceipt = AprImmutableArtifactEnvelope<AprBundlePromotionReceiptPayload, { promotionRoot: string; receiptPath: string }>;

export function persistAprBundlePromotionReceipt(input: Omit<AprBundlePromotionReceiptPayload, "schemaVersion" | "receiptId"> & { promotionRoot: string }) {
  const receiptId = `promotion-${input.preDeployCertificateId}`;
  const directory = path.join(input.promotionRoot, "receipts");
  const target = path.join(directory, `${receiptId}.json`);
  const { promotionRoot, ...payload } = input;
  const receipt = envelopeImmutableArtifact({ ...payload, receiptId, schemaVersion: APR_BUNDLE_PROMOTION_RECEIPT_VERSION }, { promotionRoot: path.resolve(promotionRoot), receiptPath: target });
  if (!verifyImmutableArtifactEnvelope(receipt)) throw new Error("apr_promotion_receipt_invalid");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const contents = `${canonicalJson(receipt)}\n`;
  if (existsSync(target)) {
    const existing = JSON.parse(readFileSync(target, "utf8")) as AprBundlePromotionReceipt;
    if (!verifyImmutableArtifactEnvelope(existing) || canonicalJson(existing) !== canonicalJson(receipt)) throw new Error("apr_promotion_receipt_append_only_collision");
    return { receipt: existing, path: target, created: false };
  }
  const descriptor = openSync(target, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const directoryDescriptor = openSync(directory, "r"); try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  return { receipt, path: target, created: true };
}
