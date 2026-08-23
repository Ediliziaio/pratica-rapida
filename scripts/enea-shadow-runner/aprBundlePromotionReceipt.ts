import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import type { AprBundleRole } from "./aprBundleHashEvidence";
import { APR_BUNDLE_HASH_EVIDENCE_VERSION } from "./aprBundleHashEvidence";

export const APR_BUNDLE_PROMOTION_RECEIPT_VERSION = "apr-bundle-promotion-receipt-v1" as const;
export interface AprBundlePromotionReceiptPayload {
  schemaVersion: typeof APR_BUNDLE_PROMOTION_RECEIPT_VERSION;
  receiptId: string;
  attemptId: string;
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

interface AprLatestPromotionReceiptPointer {
  schemaVersion: "apr-latest-promotion-receipt-pointer-v1";
  preDeployCertificateId: string;
  receiptId: string;
  receiptArtifactId: string;
  receiptRef: string;
  status: "PASS" | "FAIL";
}

function latestPointerPath(promotionRoot: string, certificateId: string) {
  return path.join(promotionRoot, "latest-receipts", `${certificateId}.json`);
}

function persistLatestPointer(promotionRoot: string, receipt: AprBundlePromotionReceipt) {
  const target = latestPointerPath(promotionRoot, receipt.payload.preDeployCertificateId);
  const directory = path.dirname(target); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const pointer: AprLatestPromotionReceiptPointer = { schemaVersion: "apr-latest-promotion-receipt-pointer-v1", preDeployCertificateId: receipt.payload.preDeployCertificateId, receiptId: receipt.payload.receiptId, receiptArtifactId: receipt.artifactId, receiptRef: `receipts/${receipt.payload.receiptId}.json`, status: receipt.payload.status };
  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${canonicalJson(pointer)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directoryDescriptor = openSync(directory, "r"); try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
}

export function loadLatestAprBundlePromotionReceipt(promotionRoot: string, certificateId: string) {
  const pointerPath = latestPointerPath(promotionRoot, certificateId); if (!existsSync(pointerPath)) return null;
  const pointer = JSON.parse(readFileSync(pointerPath, "utf8")) as AprLatestPromotionReceiptPointer;
  if (pointer.schemaVersion !== "apr-latest-promotion-receipt-pointer-v1" || pointer.preDeployCertificateId !== certificateId) throw new Error("apr_promotion_latest_pointer_invalid");
  const receiptPath = path.join(promotionRoot, pointer.receiptRef); const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as AprBundlePromotionReceipt;
  if (!verifyImmutableArtifactEnvelope(receipt) || receipt.artifactId !== pointer.receiptArtifactId || receipt.payload.receiptId !== pointer.receiptId || receipt.payload.status !== pointer.status) throw new Error("apr_promotion_latest_pointer_receipt_mismatch");
  return receipt;
}

export function persistAprBundlePromotionReceipt(input: Omit<AprBundlePromotionReceiptPayload, "schemaVersion" | "receiptId"> & { promotionRoot: string }) {
  if (!input.attemptId.trim()) throw new Error("apr_promotion_attempt_id_missing");
  const receiptId = `promotion-${input.preDeployCertificateId}-${input.attemptId}`;
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
    persistLatestPointer(promotionRoot, existing);
    return { receipt: existing, path: target, created: false };
  }
  const descriptor = openSync(target, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const directoryDescriptor = openSync(directory, "r"); try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  persistLatestPointer(promotionRoot, receipt);
  return { receipt, path: target, created: true };
}
