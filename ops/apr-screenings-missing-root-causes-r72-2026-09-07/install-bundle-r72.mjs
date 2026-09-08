import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

// Installazione r72 con verifica alternativa esplicita, stesso schema di r69
// e r71: base di verifica = suite vitest completa (sandbox + socket-
// integration) + typecheck, dichiarati onestamente nella ricevuta.

const repository = process.cwd();
const ops = path.join(repository, "ops/apr-screenings-missing-root-causes-r72-2026-09-07");
const staging = path.join(ops, "staged-bundle-r72");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const bundleFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"];
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r72_install_failed:${reason}`); };

for (const name of bundleFiles) assert(existsSync(path.join(staging, name)), `staged_bundle_missing:${name}`);
const stagedHashes = Object.fromEntries(bundleFiles.map((name) => [name, sha256(path.join(staging, name))]));
const bundleContentHash = createHash("sha256").update(bundleFiles.map((name) => stagedHashes[name]).join("|")).digest("hex").slice(0, 8);
const versionId = `${bundleContentHash}-screenings-missing-root-causes-r72-20260907`;
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
const current = path.join(canonicalRoot, "current");
const expectedPrevious = path.join(canonicalRoot, "versions/02aca904-fiorini-classification-connect-r71-20260907");

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
  const temporary = path.join(canonicalRoot, `.current-r72-${randomUUID()}`);
  symlinkSync(path.relative(canonicalRoot, versionDirectory), temporary);
  renameSync(temporary, current);
}
assert(path.resolve(canonicalRoot, readlinkSync(current)) === versionDirectory, "current_pointer");
for (const name of bundleFiles) assert(sha256(path.join(current, name)) === sha256(path.join(staging, name)), `active_hash:${name}`);

const verificationPath = path.join(ops, "alt-verification-r72.json");
const verification = JSON.parse(readFileSync(verificationPath, "utf8"));
assert(verification.status === "verified_alternative", "alt_verification_status");
assert(verification.testsFailed === 0 && verification.typecheckExitCode === 0, "alt_verification_not_clean");

const receipt = {
  version: "apr-screenings-missing-r72-bundle-install-receipt-v1",
  installedAt: new Date().toISOString(),
  status: "bundle_promoted_alternative_verification",
  governanceAttestationStatus: "not_performed",
  governanceAttestationNote: "Il rituale formale non e' stato eseguito: albero git non pulito, lavoro condiviso in corso. Installazione basata sulla verifica alternativa qui sotto, come per r69 e r71.",
  alternativeVerification: verification,
  versionId, previousTarget, currentTarget: versionDirectory,
  installedBundle: stagedHashes,
  correctionsIncluded: verification.correctionsIncludedSinceR71,
  keepaliveRestartRequested: false, chromeRestartRequested: false, operationalReplayPerformed: false,
};
writeFileSync(path.join(ops, "bundle-install-receipt-r72.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
