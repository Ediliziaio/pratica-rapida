import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export const APR_GOVERNED_BUNDLE_FILES = Object.freeze([
  "apr-supervisor.mjs",
  "apr-enea-worker.mjs",
  "apr-watchdog.mjs",
  "apr-rule-governance-attestation.json",
]);

export function installGovernedBundleSet(sourceDirectory, installDirectory) {
  const missing = APR_GOVERNED_BUNDLE_FILES.filter((name) => !existsSync(path.join(sourceDirectory, name)));
  if (missing.length) throw new Error(`apr_governed_bundle_set_incomplete:${missing.join(",")}`);
  mkdirSync(installDirectory, { recursive: true, mode: 0o700 });
  for (const name of APR_GOVERNED_BUNDLE_FILES) copyFileSync(path.join(sourceDirectory, name), path.join(installDirectory, name));
  return { status: "installed", files: [...APR_GOVERNED_BUNDLE_FILES] };
}
