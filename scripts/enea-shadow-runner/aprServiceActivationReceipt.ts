import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";
import type { AprRuntimeHealthGate, AprServiceRole, AprServiceRuntimeObservation } from "./aprServiceActivation";

export const APR_SERVICE_ACTIVATION_RECEIPT_VERSION = "apr-service-activation-receipt-v1" as const;
export interface AprServiceActivationReceiptPayload {
  schemaVersion: typeof APR_SERVICE_ACTIVATION_RECEIPT_VERSION;
  activationId: string;
  promotionReceiptId: string;
  timestamp: string;
  gitCommit: string;
  runtimeRevision: string;
  status: "PASS" | "FAIL";
  roles: Array<{ role: AprServiceRole; observedPid: number | null; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }>;
  dashboardResponding: boolean;
  reasons: string[];
  rollback: { performed: boolean; verified: boolean };
}
export type AprServiceActivationReceipt = AprImmutableArtifactEnvelope<AprServiceActivationReceiptPayload, { activationRoot: string; receiptPath: string }>;

export function persistAprServiceActivationReceipt(input: Omit<AprServiceActivationReceiptPayload, "schemaVersion" | "roles"> & { activationRoot: string; healthGate: AprRuntimeHealthGate; observations: AprServiceRuntimeObservation[] }) {
  const directory = path.join(path.resolve(input.activationRoot), "receipts"); const target = path.join(directory, `${input.activationId}.json`);
  const { activationRoot, healthGate, observations, ...payload } = input;
  const roles = healthGate.roles.map((health) => ({ ...health, observedPid: observations.find((item) => item.role === health.role)?.pid ?? null }));
  const receipt = envelopeImmutableArtifact({ ...payload, roles, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, schemaVersion: APR_SERVICE_ACTIVATION_RECEIPT_VERSION }, { activationRoot: path.resolve(activationRoot), receiptPath: target });
  if (!verifyImmutableArtifactEnvelope(receipt)) throw new Error("apr_service_activation_receipt_invalid");
  mkdirSync(directory, { recursive: true, mode: 0o700 }); const contents = `${canonicalJson(receipt)}\n`;
  if (existsSync(target)) {
    const existing = JSON.parse(readFileSync(target, "utf8")) as AprServiceActivationReceipt;
    if (!verifyImmutableArtifactEnvelope(existing) || canonicalJson(existing) !== canonicalJson(receipt)) throw new Error("apr_service_activation_receipt_collision");
    return { receipt: existing, path: target, created: false };
  }
  const descriptor = openSync(target, "wx", 0o600); try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  return { receipt, path: target, created: true };
}

export function loadAprServiceActivationReceipt(activationRoot: string, activationId: string) {
  const target = path.join(path.resolve(activationRoot), "receipts", `${activationId}.json`); const receipt = JSON.parse(readFileSync(target, "utf8")) as AprServiceActivationReceipt;
  if (!verifyImmutableArtifactEnvelope(receipt) || receipt.payload.activationId !== activationId) throw new Error("apr_service_activation_receipt_load_invalid");
  return receipt;
}
