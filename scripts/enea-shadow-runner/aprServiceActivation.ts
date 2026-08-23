import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertVerifiedAprCohortLaunchAgentPreparation, type AprVerifiedCohortLaunchAgentPreparation } from "./aprCohortLaunchAgents";

export type AprServiceRole = "supervisor" | "worker" | "watchdog";
export interface AprServiceActivationRequest { activationId: string; versionId: string; roles: Array<{ role: AprServiceRole; plistPath: string; bundlePath: string }> }
export interface AprServiceRuntimeObservation { role: AprServiceRole; pid: number | null; bundlePath: string; heartbeatAt: string | null; checkpointRevision: number | null }
export interface AprServiceController { activate(request: AprServiceActivationRequest): { observations: AprServiceRuntimeObservation[]; dashboardResponding: boolean } }

const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

function copyAtomic(source: string, target: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`; const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, readFileSync(source)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  if (sha256(source) !== sha256(target)) throw new Error("apr_service_activation_plist_hash_mismatch");
}

export function activatePreparedAprServices(input: { prepared: AprVerifiedCohortLaunchAgentPreparation; activationRoot: string; promotionVersionId: string; controller: AprServiceController; activationId?: string }) {
  assertVerifiedAprCohortLaunchAgentPreparation(input.prepared);
  const activationId = input.activationId ?? randomUUID();
  const versionDirectory = path.join(path.resolve(input.activationRoot), "versions", activationId); mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
  const roles = input.prepared.entries.map((entry) => {
    const target = path.join(versionDirectory, path.basename(entry.path)); copyAtomic(entry.path, target);
    return { role: entry.role as AprServiceRole, plistPath: target, bundlePath: entry.bundlePath };
  });
  const pointer = path.join(path.resolve(input.activationRoot), "current"); const temporaryPointer = `${pointer}.${randomUUID()}.tmp`;
  symlinkSync(path.relative(path.dirname(pointer), versionDirectory), temporaryPointer); renameSync(temporaryPointer, pointer);
  if (readlinkSync(pointer) !== path.relative(path.dirname(pointer), versionDirectory)) throw new Error("apr_service_activation_pointer_mismatch");
  const runtime = input.controller.activate({ activationId, versionId: input.promotionVersionId, roles });
  return { activationId, versionDirectory, activePointer: pointer, roles, runtime, loadPerformed: true as const, simulated: true as const };
}
