import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";
import type { AprBundlePromotionReceipt } from "./aprBundlePromotionReceipt";
import { canonicalJson } from "./aprMonotonicArtifacts";

export type AprServiceRole = "supervisor" | "worker" | "watchdog";
export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
export interface AprServiceController {
  activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean };
  rollback(request: AprServiceActivationRequest): { restored: boolean };
}
export interface AprRuntimeBaseline { roles: Array<{ role: AprServiceRole; heartbeatAt: string | null; checkpointRevision: number | null }> }
export interface AprRuntimeHealthGate { status: "PASS" | "FAIL"; reasons: string[]; roles: Array<{ role: AprServiceRole; pidOk: boolean; heartbeatAdvanced: boolean; checkpointAdvanced: boolean; bundleVersionOk: boolean }> ; dashboardResponding: boolean }
interface AprActivationTransaction { schemaVersion: "apr-service-activation-transaction-v1"; activationId: string; phase: "POINTER_SWITCHED" | "ROLLING_BACK" | "COMPLETE"; request: AprServiceActivationRequest; previousPlistTarget: string | null; previousBundleTarget: string | null; healthStatus: "PASS" | "FAIL" | null }
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
  if (target === null) { if (existsSync(pointer)) unlinkSync(pointer); return; }
  const temporary = `${pointer}.${randomUUID()}.tmp`; symlinkSync(target, temporary); renameSync(temporary, pointer);
}
function transactionPath(root: string, activationId: string) { return path.join(path.resolve(root), "transactions", `${activationId}.json`); }
function writeTransaction(root: string, transaction: AprActivationTransaction) {
  const target = transactionPath(root, transaction.activationId); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; writeFileSync(temporary, `${canonicalJson(transaction)}\n`, { mode: 0o600 }); renameSync(temporary, target);
}

export function verifyAprServiceRuntimeHealth(input: { request: AprServiceActivationRequest; runtime: ReturnType<AprServiceController["activate"]>; baseline?: AprRuntimeBaseline }): AprRuntimeHealthGate {
  const reasons: string[] = []; const baseline = new Map(input.baseline?.roles.map((item) => [item.role, item]) ?? []);
  const roles = input.request.roles.map((expected) => {
    const observed = input.runtime.observations.find((item) => item.role === expected.role); const before = baseline.get(expected.role);
    const pidOk = Boolean(observed?.pid && observed.pid > 0);
    const heartbeatAdvanced = Boolean(observed?.heartbeatAt && (!before?.heartbeatAt || Date.parse(observed.heartbeatAt) > Date.parse(before.heartbeatAt)));
    const checkpointAdvanced = Boolean(observed?.checkpointRevision !== null && observed?.checkpointRevision !== undefined && (!before || before.checkpointRevision === null || observed.checkpointRevision > before.checkpointRevision));
    const bundleVersionOk = observed?.bundlePath === expected.bundlePath && expected.bundlePath.includes(input.request.versionId);
    if (!pidOk) reasons.push(`${expected.role}:pid_missing`); if (!heartbeatAdvanced) reasons.push(`${expected.role}:heartbeat_not_advanced`); if (!checkpointAdvanced) reasons.push(`${expected.role}:checkpoint_not_advanced`); if (!bundleVersionOk) reasons.push(`${expected.role}:bundle_version_mismatch`);
    return { role: expected.role, pidOk, heartbeatAdvanced, checkpointAdvanced, bundleVersionOk };
  });
  if (!input.runtime.dashboardResponding) reasons.push("dashboard_unreachable");
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, roles, dashboardResponding: input.runtime.dashboardResponding };
}

export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; promotionReceipt: AprBundlePromotionReceipt; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string; runtimeBaseline?: AprRuntimeBaseline; crashAt?: "after_pointer" | "during_rollback" }) {
  assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
  const activationId = input.activationId ?? randomUUID();
  const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
  const roles = input.prepared.entries.map((entry) => {
    const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
    return { role: entry.role as AprServiceRole, plistPath: target, bundlePath: entry.bundlePath };
  });
  const pointer = path.join(path.resolve(input.activationRoot), "current"); const previousPlistTarget = currentSymlinkTarget(pointer); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
  symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
  if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
  const request = { activationId, versionId: input.promotionVersionId, roles };
  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "POINTER_SWITCHED", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: null });
  if (input.crashAt === "after_pointer") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_after_pointer");
  const runtime = input.controller.activate(request);
  const healthGate = verifyAprServiceRuntimeHealth({ request, runtime, baseline: input.runtimeBaseline });
  let rollback = { performed: false, verified: false, restoredBundlePointer: null as string | null, restoredPlistPointer: null as string | null };
  if (healthGate.status === "FAIL") {
    const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
    writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "ROLLING_BACK", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: "FAIL" });
    replaceSymlink(bundlePointer, input.promotionReceipt.payload.previousTarget); replaceSymlink(pointer, previousPlistTarget);
    if (input.crashAt === "during_rollback") throw new AprSimulatedActivationCrash("apr_service_activation_simulated_crash_during_rollback");
    const processRollback = input.controller.rollback(request);
    const bundleVerified = currentSymlinkTarget(bundlePointer) === input.promotionReceipt.payload.previousTarget;
    const plistVerified = currentSymlinkTarget(pointer) === previousPlistTarget;
    rollback = { performed: true, verified: processRollback.restored && bundleVerified && plistVerified, restoredBundlePointer: input.promotionReceipt.payload.previousTarget, restoredPlistPointer: previousPlistTarget };
    if (!rollback.verified) throw new Error("apr_service_activation_rollback_not_verified");
  }
  writeTransaction(input.activationRoot, { schemaVersion: "apr-service-activation-transaction-v1", activationId, phase: "COMPLETE", request, previousPlistTarget, previousBundleTarget: input.promotionReceipt.payload.previousTarget, healthStatus: healthGate.status });
  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, healthGate, rollback, loadPerformed: true as const, simulated: true as const };
}

export function recoverAprServiceActivation(input: { activationRoot: string; promotionReceipt: AprBundlePromotionReceipt; controller: AprServiceController; activationId: string }) {
  const target = transactionPath(input.activationRoot, input.activationId); const transaction = JSON.parse(readFileSync(target, "utf8")) as AprActivationTransaction;
  if (transaction.schemaVersion !== "apr-service-activation-transaction-v1" || transaction.activationId !== input.activationId) throw new Error("apr_service_activation_recovery_transaction_invalid");
  if (transaction.phase === "COMPLETE") return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: true as const };
  const plistPointer = path.join(path.resolve(input.activationRoot), "current"); const bundlePointer = path.join(input.promotionReceipt.localMetadata!.promotionRoot, "current");
  if (transaction.phase === "POINTER_SWITCHED") {
    const runtime = input.controller.activate(transaction.request); const health = verifyAprServiceRuntimeHealth({ request: transaction.request, runtime });
    if (health.status === "PASS") {
      writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "PASS" });
      return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, health };
    }
    writeTransaction(input.activationRoot, { ...transaction, phase: "ROLLING_BACK", healthStatus: "FAIL" });
    replaceSymlink(bundlePointer, transaction.previousBundleTarget); replaceSymlink(plistPointer, transaction.previousPlistTarget);
  }
  const rollback = input.controller.rollback(transaction.request);
  const verified = rollback.restored && currentSymlinkTarget(bundlePointer) === transaction.previousBundleTarget && currentSymlinkTarget(plistPointer) === transaction.previousPlistTarget;
  if (!verified) throw new Error("apr_service_activation_recovery_rollback_not_verified");
  writeTransaction(input.activationRoot, { ...transaction, phase: "COMPLETE", healthStatus: "FAIL" });
  return { activationId: input.activationId, phase: "COMPLETE" as const, idempotent: false as const, rollbackVerified: true as const };
}
