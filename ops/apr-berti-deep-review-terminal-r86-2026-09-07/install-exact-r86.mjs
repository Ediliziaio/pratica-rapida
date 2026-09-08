#!/usr/bin/env node
import crypto from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const operationRoot = path.resolve(import.meta.dirname);
const stagedDirectory = path.join(operationRoot, "staged-bundle");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const expected = {
  "apr-supervisor.mjs": "f384bedb9a2f93101f8baa224ab680cf377c2dc4f183d0e5f6b827db867a07d0",
  "apr-enea-worker.mjs": "fbf41cdd351262848387183d76323769f7c2cd06de73dc370363d96cda491ce0",
  "apr-watchdog.mjs": "551118e02af5d2a9163f18d8663d7b332d173ff0ae28cffb9659dee9a33619f0",
};
const files = [...Object.keys(expected), "apr-rule-governance-attestation.json"];
const sha256 = (target) => crypto.createHash("sha256").update(readFileSync(target)).digest("hex");

for (const [name, digest] of Object.entries(expected)) {
  const target = path.join(stagedDirectory, name);
  if (!existsSync(target) || sha256(target) !== digest) throw new Error(`staged_bundle_hash_mismatch:${name}`);
}
const attestation = JSON.parse(readFileSync(path.join(stagedDirectory, "apr-rule-governance-attestation.json"), "utf8"));
if (attestation.status !== "certified_deployed") throw new Error("staged_governance_not_certified");
for (const [name, digest] of Object.entries(expected)) {
  if (attestation.bundleSha256?.[name] !== digest) throw new Error(`staged_governance_hash_mismatch:${name}`);
}

const versionId = "f6f8e746-deep-review-terminal-gate-r86-20260907";
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
const currentPointer = path.join(canonicalRoot, "current");
const previousTarget = existsSync(currentPointer) && lstatSync(currentPointer).isSymbolicLink()
  ? path.resolve(canonicalRoot, readlinkSync(currentPointer))
  : null;
mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
for (const name of files) {
  const source = path.join(stagedDirectory, name);
  const destination = path.join(versionDirectory, name);
  if (!existsSync(destination)) copyFileSync(source, destination);
  chmodSync(destination, name.endsWith(".mjs") ? 0o700 : 0o600);
  if (sha256(source) !== sha256(destination)) throw new Error(`installed_hash_mismatch:${name}`);
}
const temporaryPointer = path.join(canonicalRoot, `.current-r86-${crypto.randomUUID()}`);
symlinkSync(path.relative(canonicalRoot, versionDirectory), temporaryPointer);
renameSync(temporaryPointer, currentPointer);
if (path.resolve(canonicalRoot, readlinkSync(currentPointer)) !== versionDirectory) throw new Error("current_pointer_mismatch");
for (const [name, digest] of Object.entries(expected)) {
  if (sha256(path.join(currentPointer, name)) !== digest) throw new Error(`active_hash_mismatch:${name}`);
}

const receipt = {
  version: "apr-exact-tested-bundle-install-receipt-v1",
  installedAt: new Date().toISOString(),
  versionId,
  previousTarget,
  currentTarget: versionDirectory,
  installedBundleSha256: expected,
  governanceAttestationSha256: sha256(path.join(versionDirectory, "apr-rule-governance-attestation.json")),
  sourceGateCheckpoint: path.join(operationRoot, "rule-activation", "checkpoint.json"),
};
writeFileSync(path.join(operationRoot, "install-receipt-r86.json"), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
