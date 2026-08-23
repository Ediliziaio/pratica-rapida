import { createHash } from "node:crypto";
import { constants, accessSync, readFileSync } from "node:fs";
import path from "node:path";

export const APR_BUNDLE_HASH_EVIDENCE_VERSION = "apr-bundle-hash-evidence-v1" as const;
export type AprBundleRole = "supervisor" | "worker" | "watchdog";

export interface AprBundleHashEvidence {
  schemaVersion: typeof APR_BUNDLE_HASH_EVIDENCE_VERSION;
  role: AprBundleRole;
  stagedPath: string;
  installedPath: string | null;
  stagedSha256: string;
  installedSha256: string | null;
}

const BUNDLE_FILES: Record<AprBundleRole, string> = {
  supervisor: "apr-supervisor.mjs",
  worker: "apr-enea-worker.mjs",
  watchdog: "apr-watchdog.mjs",
};

const sha256File = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

export function computeStagedBundleHashes(stagingDirectory: string): AprBundleHashEvidence[] {
  const root = path.resolve(stagingDirectory);
  return (Object.entries(BUNDLE_FILES) as Array<[AprBundleRole, string]>).map(([role, filename]) => {
    const stagedPath = path.join(root, filename);
    try { accessSync(stagedPath, constants.R_OK); } catch { throw new Error(`apr_staged_bundle_missing:${role}:${stagedPath}`); }
    return {
      schemaVersion: APR_BUNDLE_HASH_EVIDENCE_VERSION,
      role,
      stagedPath,
      installedPath: null,
      stagedSha256: sha256File(stagedPath),
      installedSha256: null,
    };
  });
}

export function verifyStagedBundleHashEvidence(evidence: readonly AprBundleHashEvidence[]) {
  const roles = new Map(evidence.map((item) => [item.role, item]));
  for (const role of Object.keys(BUNDLE_FILES) as AprBundleRole[]) {
    const item = roles.get(role);
    if (!item) throw new Error(`apr_staged_bundle_evidence_role_missing:${role}`);
    if (sha256File(item.stagedPath) !== item.stagedSha256) throw new Error(`apr_staged_bundle_hash_mismatch:${role}`);
  }
  if (roles.size !== 3) throw new Error("apr_staged_bundle_evidence_role_duplicate_or_unknown");
  return true as const;
}
