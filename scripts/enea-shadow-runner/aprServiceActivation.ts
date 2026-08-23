import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
import { canonicalJson } from "./aprMonotonicArtifacts";
import { loadAprServiceActivationReceipt, persistAprServiceActivationReceipt, type AprServiceActivationReceipt } from "./aprServiceActivationReceipt";

export type AprServiceRole = "supervisor" | "worker" | "watchdog";
export interface AprServiceActivationRequest { activationId: string; versionId: string; startedAt: string; healthDeadlineAt: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
export interface AprServiceController {
  activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean };
  rollback(request: AprServiceActivationRequest): { restored: boolean };
}
export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; startedAt: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
class AprSimulatedActivationCrash extends Error {}

const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

function copyAtomic(source: string, target: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, readFileSync(source)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  if (sha256(source) !== sha256(target)) throw new Error("apr_service_activation_plist_hash_mismatch");
}

function currentSymlinkTarget(pointer: string) { return existsSync(pointer) && lstatSync(pointer).isSymbolicLink() ? readlinkSync(pointer) : null; }
function replaceSymlink(pointer: string, target: string | null) {
  mkdirSync(path.dirname(pointer), { recursive: true, mode: 0o700 });
  if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); const directory = openSync(path.dirname(pointer), "r"); try { fsyncSync(directory); } finally { closeSync(directory); } return; }
  const temporary = `${pointer}.${randomUUID()}.tmp`; symlinkSync(target, temporary); renameSync(temporary, pointer);
  const directory = openSync(path.dirname(pointer), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
function transactionPath(root: string, activationId: string) { return path.join(path.resolve(root), "transactions", `${activationId}.json`); }
function writeTransaction(root: string, transaction: AprActivationTransaction) {
  const target = transactionPath(root, transaction.activationId); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${canonicalJson(transaction)}\n`, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function loadExistingActivationReceipt(activationRoot: string, activationId: string) {
  try { return loadAprServiceActivationReceipt(activationRoot, activationId); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function assertActivationReceiptCoherent(receipt: AprServiceActivationReceipt, transaction: AprActivationTransaction, promotionReceipt: AprBundlePromotionReceipt) {
  if (receipt.payload.activationId !== transaction.activationId || receipt.payload.promotionReceiptId !== promotionReceipt.payload.receiptId || transaction.request.versionId !== promotionReceipt.payload.versionId) throw new Error("apr_service_activation_recovery_receipt_mismatch");
}

export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
  const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
  const roles = input.request.roles.map((expected) => {
    const observed = input.runtime.observations.find((item) => item.role === expected.role); const before = baseline.get(expected.role);
    const pidOk = Boolean(observed?.pid && observed.pid > 0);
    const heartbeatTime = observed?.heartbeatAt ? Date.parse(observed.heartbeatAt) : Number.NaN;
    const heartbeatAdvanced = Number.isFinite(heartbeatTime) && heartbeatTime >= Date.parse(input.request.startedAt) && heartbeatTime <= Date.parse(input.request.healthDeadlineAt) && (!before?.heartbeatAt || heartbeatTime > Date.parse(before.heartbeatAt));
    const checkpointAdvanced = Boolean(observed?.checkpointRevision !== null && observed?.checkpointRevision !== undefined && (!before || before.checkpointRevision === null || observed.checkpointRevision > before.checkpointRevision));
    const bundleVersionOk = observed?.bundlePath === expected.bundlePath && expected.bundlePath.includes(input.request.versionId);
    if (!pidOk) reasons.push(`${expected.role}:pid_missing`); if (!heartbeatAdvanced) reasons.push(`${expected.role}:heartbeat_not_advanced`); if (!checkpointAdvanced) reasons.push(`${expected.role}:checkpoint_not_advanced`); if (!bundleVersionOk) reasons.push(`${expected.role}:bundle_version_mismatch`);
    return { role: expected.role, pidOk, heartbeatAdvanced, checkpointAdvanced, bundleVersionOk };
  });
  if (!input.runtime.dashboardResponding) reasons.push("dashboard_unreachable");
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
}

export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" | "after_receipt"; now?: Date; healthWindowMs?: number }) {
  const binding = assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
  if (binding.promotionReceiptArtifactId !== input.promotionReceipt.artifactId || binding.promotionVersionId !== input.promotionVersionId || input.promotionReceipt.payload.versionId !== input.promotionVersionId) throw new Error("apr_service_activation_promotion_binding_mismatch");
  const activationId = input.activationId ?? `activation-${input.promotionReceipt.payload.receiptId}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(activationId) || activationId.includes("..")) throw new Error("apr_service_activation_id_invalid");
  const existingTransactionPath = transactionPath(input.activationRoot, activationId);
  if (existsSync(existingTransactionPath)) {
    const existing = JSON.parse(readFileSync(existingTransactionPath, "utf8")) as AprActivationTransaction;
    if (existing.phase === "COMPLETE") {
      const receipt = loadAprServiceActivationReceipt(input.activationRoot, activationId); assertActivationReceiptCoherent(receipt, existing, input.promotionReceipt);
      return { activationId, idempotent: true as const, receipt };
    }
  }
  const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
  const roles = input.prepared.entries.map((entry) => {
    const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
    return { role: entry.role as AprServiceRole, plistPath: target, bundlePath: entry.bundlePath };
  });
  const pointer = path.join(path.resolve(input.activationRoot), "current"); const previousPlistTarget = currentSymlinkTarget(pointer); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
  symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
  if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
  const startedAtDate = input.now ?? new Date(); const healthWindowMs = input.healthWindowMs ?? 30_000;
  if (!Number.isFinite(healthWindowMs) || healthWindowMs <= 0) throw new Error("apr_service_activation_health_window_invalid");
  const startedAt = startedAtDate.toISOString();
  const request = { activationId, versionId: input.promotionVersionId, startedAt, healthDeadlineAt: new Date(startedAtDate.getTime() + healthWindowMs).toISOString(), roles };
  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "POINTER_SWITCHED", request, previousPlistTarget, healthStatus: null });
  if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
  const runtime = input.controller.activate(request);
  const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
  let rollback = { performed: false, verified: false, restoredPlistPointer: null as string | null };
  if (healthGate.status === "FAIL") {
    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "ROLLING_BACK", request, previousPlistTarget, healthStatus: "FAIL" });
    replaceSymlink(pointer, previousPlistTarget);
    if (input.crashAt === "during_rollback") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_during_rollback");
    const processRollback = input.controller.rollback(request);
    const plistVerified = currentSymlinkTarget(pointer) === previousPlistTarget;
    rollback = { performed: true, verified: processRollback.restored && plistVerified, restoredPlistPointer: previousPlistTarget };
    if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
  }
  const receipt = persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: healthGate.status, healthGate, observations: runtime.observations, dashboardResponding: healthGate.dashboardResponding, reasons: healthGate.reasons, rollback: { performed: rollback.performed, verified: rollback.verified } }).receipt;
  if (input.crashAt === "after_receipt") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_receipt");
  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, startedAt, phase: "COMPLETE", request, previousPlistTarget, healthStatus: healthGate.status });
  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, receipt, idempotent: false as const, loadPerformed: true as const, simulated: true as const };
}

export function recoverAprServiceActivation(input: { activationRoot: string; promotionReceipt: AprBundlePromotionReceipt; controller: AprServiceController; activationId: string }) {
  const target = transactionPath(input.activationRoot, input.activationId); const transaction = JSON.parse(readFileSync(target, "utf8")) as AprActivationTransaction;
  if (transaction.schemaVersion !== "apr-service-activation-transaction-v1" || transaction.activationId !== input.activationId) throw new Error("apr_service_activation_recovery_transaction_invalid");
  if (transaction.request.versionId !== input.promotionReceipt.payload.versionId) throw new Error("apr_service_activation_recovery_promotion_mismatch");
  const existingReceipt = loadExistingActivationReceipt(input.activationRoot, input.activationId);
  if (existingReceipt) {
    assertActivationReceiptCoherent(existingReceipt, transaction, input.promotionReceipt);
    const expectedStatus = transaction.phase === "COMPLETE" ? transaction.healthStatus : transaction.phase === "ROLLING_BACK" ? "FAIL" : "PASS";
    if (expectedStatus === null) throw new Error("apr_service_activation_recovery_receipt_phase_mismatch");
    if (existingReceipt.payload.status !== expectedStatus || (expectedStatus === "FAIL" && (!existingReceipt.payload.rollback.performed || !existingReceipt.payload.rollback.verified))) throw new Error("apr_service_activation_recovery_receipt_phase_mismatch");
    if (transaction.phase === "ROLLING_BACK") {
      const plistPointer = path.join(path.resolve(input.activationRoot), "current");
      if (currentSymlinkTarget(plistPointer) !== transaction.previousPlistTarget) throw new Error("apr_service_activation_recovery_plist_not_restored");
    }
    if (transaction.phase !== "COMPLETE") writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: existingReceipt.payload.status });
    return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const, receipt: existingReceipt };
  }
  if (transaction.phase === "COMPLETE") throw new Error("apr_service_activation_recovery_complete_receipt_missing");
  const plistPointer = path.join(path.resolve(input.activationRoot), "current");
  if (transaction.phase === "POINTER_SWITCHED") {
    const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });
    if (health.status === "PASS") {
      persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "PASS", healthGate: health, observations: runtime.observations, dashboardResponding: health.dashboardResponding, reasons: health.reasons, rollback: { performed: false, verified: false } });
      writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "PASS" });
      return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, health };
    }
    writeTransaction(input.activationRoot, { ...transaction, phase: "ROLLING_BACK", healthStatus: "FAIL" });
    replaceSymlink(plistPointer, transaction.previousPlistTarget);
  }
  const rollback = input.controller.rollback(transaction.request);
  const verified = rollback.restored && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
  if (!verified) throw new Error("apr_service_activation_recovery_rollback_not_verified");
  const recoveredHealth: AprRuntimeHealthGate = { status: "FAIL", reasons: ["recovered_failed_health_gate"], dashboardResponding: false, roles: transaction.request.roles.map((item) => ({ role: item.role, pidOk: false, heartbeatAdvanced: false, checkpointAdvanced: false, bundleVersionOk: false })) };
  persistAprServiceActivationReceipt({ activationRoot: input.activationRoot, activationId: transaction.activationId, promotionReceiptId: input.promotionReceipt.payload.receiptId, timestamp: transaction.startedAt, gitCommit: input.promotionReceipt.payload.gitCommit, runtimeRevision: input.promotionReceipt.payload.runtimeRevision, status: "FAIL", healthGate: recoveredHealth, observations: [], dashboardResponding: false, reasons: recoveredHealth.reasons, rollback: { performed: true, verified: true } });
  writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "FAIL" });
  return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, rollbackVerified: true as const };
}
