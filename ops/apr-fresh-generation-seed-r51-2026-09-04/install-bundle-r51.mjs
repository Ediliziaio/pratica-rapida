import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const repository = process.cwd();
const ops = path.join(repository, "ops/apr-fresh-generation-seed-r51-2026-09-04");
const preinstallPath = path.join(ops, "preinstall-gate-attestation-r51.json");
const staging = path.join(ops, "bundle-staging-r51");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const versionId = "67afeee3-fresh-generation-seed-r51-20260904";
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
const current = path.join(canonicalRoot, "current");
const expectedPrevious = path.join(canonicalRoot, "versions/c7b93248-recovery-accounting-candidate-r50-20260904");
const bundleFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-pdf-ocr"];
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r51_install_failed:${reason}`); };
const preinstall = JSON.parse(readFileSync(preinstallPath, "utf8"));

assert(preinstall.status === "tested_not_deployed", "preinstall_status");
assert(preinstall.monotonicGate?.testSuites === 444 && preinstall.monotonicGate?.tests === 1753 && preinstall.monotonicGate?.failedTests === 0 && preinstall.monotonicGate?.rulesProved === 133, "preinstall_gate_incomplete");
assert(preinstall.correction?.ruleId === "system-cohort-seed-atomic-fresh-generation-initialization-v1", "correction_gate_incomplete");
assert(preinstall.writerAudit?.newItemWriters === 4 && preinstall.writerAudit?.unprotectedWriters === 0 && preinstall.writerAudit?.directCheckpointWritersOutsideStore === 0, "writer_audit_incomplete");
for (const name of bundleFiles) assert(sha256(path.join(staging, name)) === preinstall.stagedBundle[name], `staging_hash:${name}`);
const previousTarget = existsSync(current) && lstatSync(current).isSymbolicLink() ? path.resolve(canonicalRoot, readlinkSync(current)) : null;
assert(previousTarget === expectedPrevious || previousTarget === versionDirectory, `unexpected_current:${previousTarget}`);
mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
for (const name of bundleFiles) {
  const source = path.join(staging, name);
  const target = path.join(versionDirectory, name);
  if (!existsSync(target)) copyFileSync(source, target);
  chmodSync(target, 0o700);
  assert(sha256(target) === preinstall.stagedBundle[name], `installed_hash:${name}`);
}
if (previousTarget !== versionDirectory) {
  const temporary = path.join(canonicalRoot, `.current-r51-${randomUUID()}`);
  symlinkSync(path.relative(canonicalRoot, versionDirectory), temporary);
  renameSync(temporary, current);
}
assert(path.resolve(canonicalRoot, readlinkSync(current)) === versionDirectory, "current_pointer");
for (const name of bundleFiles) assert(sha256(path.join(current, name)) === preinstall.stagedBundle[name], `active_hash:${name}`);
const receipt = {
  version: "apr-fresh-generation-seed-r51-bundle-install-receipt-v1",
  installedAt: new Date().toISOString(),
  status: "bundle_promoted_local_gate_verified",
  preinstallGateSha256: sha256(preinstallPath),
  versionId,
  previousTarget,
  currentTarget: versionDirectory,
  installedBundle: preinstall.stagedBundle,
  keepaliveRestartRequested: false,
  chromeRestartRequested: false
};
writeFileSync(path.join(ops, "bundle-install-receipt-r51.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
