import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const repository = process.cwd();
const ops = path.join(repository, "ops/apr-ragni-final-canonical-proof-r66-2026-09-05");
const staging = path.join(ops, "staged-bundle-green");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const versionId = "e4afbcb6-final-canonical-proof-r66-20260905";
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
const current = path.join(canonicalRoot, "current");
const expectedPrevious = path.join(canonicalRoot, "versions/27d27bc3-allocation-canonical-proof-r65-20260905");
const bundleFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs", "apr-rule-governance-attestation.json"];
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r66_install_failed:${reason}`); };

const attestationPath = path.join(staging, "apr-rule-governance-attestation.json");
const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
assert(attestation.status === "certified_deployed", "governance_status");
for (const name of bundleFiles.slice(0, 3)) assert(sha256(path.join(staging, name)) === attestation.bundleSha256?.[name], `staging_hash:${name}`);

const previousTarget = existsSync(current) && lstatSync(current).isSymbolicLink() ? path.resolve(canonicalRoot, readlinkSync(current)) : null;
assert(previousTarget === expectedPrevious || previousTarget === versionDirectory, `unexpected_current:${previousTarget}`);
mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
for (const name of bundleFiles) {
  const source = path.join(staging, name);
  const target = path.join(versionDirectory, name);
  if (!existsSync(target)) copyFileSync(source, target);
  chmodSync(target, 0o700);
  assert(sha256(target) === sha256(source), `installed_hash:${name}`);
}
if (previousTarget !== versionDirectory) {
  const temporary = path.join(canonicalRoot, `.current-r66-${randomUUID()}`);
  symlinkSync(path.relative(canonicalRoot, versionDirectory), temporary);
  renameSync(temporary, current);
}
assert(path.resolve(canonicalRoot, readlinkSync(current)) === versionDirectory, "current_pointer");
for (const name of bundleFiles) assert(sha256(path.join(current, name)) === sha256(path.join(staging, name)), `active_hash:${name}`);

const receipt = {
  version: "apr-final-canonical-proof-bundle-install-receipt-r66-v1",
  installedAt: new Date().toISOString(), status: "bundle_promoted_local_gate_verified",
  governanceAttestationSha256: sha256(attestationPath), versionId, previousTarget, currentTarget: versionDirectory,
  installedBundle: Object.fromEntries(bundleFiles.map((name) => [name, sha256(path.join(versionDirectory, name))])),
  keepaliveRestartRequested: false, chromeRestartRequested: false, operationalReplayPerformed: false,
};
writeFileSync(path.join(ops, "bundle-install-receipt-r66.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
