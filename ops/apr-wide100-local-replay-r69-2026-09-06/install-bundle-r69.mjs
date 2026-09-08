import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

// Installazione r69 con verifica alternativa esplicita, NON con il rituale
// formale di governance (apr-rule-governance-attestation.json, che
// richiederebbe riprova individuale con fixture/replay di tutte le 151 regole
// della matrice — lavoro non completabile in questa sessione). Autorizzato
// esplicitamente dall'utente al posto dell'attestazione: base di verifica =
// suite vitest completa + typecheck, dichiarati onestamente nella ricevuta.

const repository = process.cwd();
const ops = path.join(repository, "ops/apr-wide100-local-replay-r69-2026-09-06");
const staging = path.join(ops, "staged-bundle-r69");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const bundleFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"];
const sha256 = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const assert = (condition, reason) => { if (!condition) throw new Error(`apr_r69_install_failed:${reason}`); };

for (const name of bundleFiles) assert(existsSync(path.join(staging, name)), `staged_bundle_missing:${name}`);
const stagedHashes = Object.fromEntries(bundleFiles.map((name) => [name, sha256(path.join(staging, name))]));
const bundleContentHash = createHash("sha256").update(bundleFiles.map((name) => stagedHashes[name]).join("|")).digest("hex").slice(0, 8);
const versionId = `${bundleContentHash}-comune-rinaldi-alt-verified-r69-20260906`;
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
const current = path.join(canonicalRoot, "current");
const expectedPrevious = path.join(canonicalRoot, "versions/b52ec569-terminal-cohort-quiescence-r67-20260906");

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
  const temporary = path.join(canonicalRoot, `.current-r69-${randomUUID()}`);
  symlinkSync(path.relative(canonicalRoot, versionDirectory), temporary);
  renameSync(temporary, current);
}
assert(path.resolve(canonicalRoot, readlinkSync(current)) === versionDirectory, "current_pointer");
for (const name of bundleFiles) assert(sha256(path.join(current, name)) === sha256(path.join(staging, name)), `active_hash:${name}`);

const verificationPath = path.join(ops, "alt-verification-r69.json");
const verification = JSON.parse(readFileSync(verificationPath, "utf8"));
assert(verification.status === "verified_alternative", "alt_verification_status");
assert(verification.testsFailed === 0 && verification.typecheckExitCode === 0, "alt_verification_not_clean");

const receipt = {
  version: "apr-wide100-r69-bundle-install-receipt-v1",
  installedAt: new Date().toISOString(),
  status: "bundle_promoted_alternative_verification",
  governanceAttestationStatus: "not_performed",
  governanceAttestationNote: "Il rituale formale (apr-rule-governance-attestation.json, prova individuale delle 151 regole della matrice con fixture/replay) non e' stato eseguito: richiede ore di lavoro puntuale, non completabile in questa sessione. Installazione autorizzata esplicitamente dall'utente sulla base della verifica alternativa qui sotto.",
  alternativeVerification: verification,
  versionId, previousTarget, currentTarget: versionDirectory,
  installedBundle: stagedHashes,
  correctionsIncluded: [
    "user-2026-09-06-official-works-municipality-over-manual-crm-v1 (Comune lavori/immobile: precedenza documenti su CRM)",
    "user-2026-08-14-rinaldi-explicit-deductible-total (spese congrue Rinaldi)",
    "user-2026-09-06-gross-invoice-sum-supersedes-service-separation-v1 (Pratica ENEA compresa: somma sempre le fatture)",
    "user-2026-09-06-invoice-work-date-chronology-order-scoped-v1 (cronologia fatture per riferimento ordine/commessa)",
    "riconciliazione Schermature/Infissi Olteanu (dimension parser + gate di riconciliazione)",
  ],
  keepaliveRestartRequested: false, chromeRestartRequested: false, operationalReplayPerformed: false,
};
writeFileSync(path.join(ops, "bundle-install-receipt-r69.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
