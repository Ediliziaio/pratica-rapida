#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertAprCorrectionActivationGate, envelopeAprCorrectionActivationGateResult } from "./aprCorrectionActivationGate";
import { APR_RULE_GOVERNANCE_SIDECAR, buildAprRuleGovernanceAttestation, verifyAprRuleGovernanceAdmission } from "./aprRuleGovernanceAdmission";

/**
 * Punto di installazione UNICO e permanente per un worktree condiviso, mai
 * pulito, dove il rituale formale di governance (aprPreDeployCertificate.ts)
 * non e' mai stato ne' sara' realisticamente eseguibile. Nasce per sostituire
 * gli script ad-hoc scritti una tantum a ogni installazione (sotto ops,
 * uno per correzione, tipo install-bundle-rXX.mjs): quegli script copiavano i file a mano, senza alcun
 * controllo automatico che impedisse di installare una correzione scritta
 * ma non davvero collegata al flusso reale. Questo script non permette di
 * saltare il gate: lo richiama sempre, PRIMA di costruire il bundle, e la
 * build stessa viene fatta qui (non prima, altrove), cosi' il gate verifica
 * sempre la build che sta per essere installata, non una build precedente.
 *
 * Uso: npx tsx scripts/enea-shadow-runner/apr-install-bundle-cli.ts --label <slug-breve>
 */

const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const label = option("--label");
const historicalAuditReport = option("--historical-audit");
const allowAuthorizedHistoricalGap = process.argv.includes("--allow-authorized-historical-gap");
if (!label || !/^[a-z0-9-]{3,60}$/.test(label)) {
  process.stderr.write("uso: apr-install-bundle-cli.ts --label <slug-breve-minuscolo-con-trattini>\n");
  process.exit(1);
}
if (allowAuthorizedHistoricalGap && !historicalAuditReport) {
  process.stderr.write("--allow-authorized-historical-gap richiede --historical-audit <report.json>\n");
  process.exit(1);
}

const repositoryRoot = process.cwd();
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const bundleExecutableFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const sha256File = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");
const fail = (reason: string): never => { process.stderr.write(`apr_install_bundle_failed:${reason}\n`); process.exit(1); };

const now = new Date();
const opsDirectory = path.join(repositoryRoot, "ops", `apr-install-${label}-${now.toISOString().slice(0, 10)}`);
const stagingDirectory = path.join(opsDirectory, "staged-bundle");
mkdirSync(stagingDirectory, { recursive: true });

process.stdout.write("1/3 — costruzione bundle dal sorgente corrente...\n");
execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", stagingDirectory], { cwd: repositoryRoot, stdio: "inherit" });

process.stdout.write("2/3 — gate di attivazione (copertura registro/matrice, collegamento regole, esistenza test dichiarati, freschezza bundle)...\n");
let gateResult!: ReturnType<typeof assertAprCorrectionActivationGate>;
try {
  gateResult = assertAprCorrectionActivationGate({ repositoryRoot, stagingDirectory }, now);
} catch (error) {
  const gate = (error as { gateResult?: ReturnType<typeof assertAprCorrectionActivationGate> }).gateResult;
  if (gate) {
    writeFileSync(path.join(opsDirectory, "gate-result-FAILED.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8");
    process.stderr.write(`Installazione RIFIUTATA dal gate. Motivi:\n${gate.reasons.map((r) => `  - ${r}`).join("\n")}\n`);
    process.stderr.write(`Dettaglio completo: ${path.join(opsDirectory, "gate-result-FAILED.json")}\n`);
  }
  fail(error instanceof Error ? error.message : String(error));
}
if (gateResult.ruleWiring.legacyUnwiredRuleIds.length) {
  process.stdout.write(`Nota (non bloccante): ${gateResult.ruleWiring.legacyUnwiredRuleIds.length} regole precedenti al gate risultano non collegate (debito di governance preesistente, non introdotto ora): ${gateResult.ruleWiring.legacyUnwiredRuleIds.join(", ")}\n`);
}
const gateEnvelope = envelopeAprCorrectionActivationGateResult(gateResult);
writeFileSync(path.join(opsDirectory, "gate-result.json"), `${JSON.stringify(gateEnvelope, null, 2)}\n`, "utf8");
process.stdout.write("Gate superato.\n");

if (historicalAuditReport) {
  const attestationPath = path.join(stagingDirectory, APR_RULE_GOVERNANCE_SIDECAR);
  const attestation = buildAprRuleGovernanceAttestation({
    bundleDirectory: stagingDirectory,
    historicalAuditReport: path.resolve(historicalAuditReport),
    allowAuthorizedHistoricalGap,
    attestedAt: now,
  });
  writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const admissions = bundleExecutableFiles.map((name) => verifyAprRuleGovernanceAdmission({ executablePath: path.join(stagingDirectory, name), attestationPath }));
  if (admissions.some((item) => item.status !== "admitted")) fail(`governance_admission_failed:${JSON.stringify(admissions.map((item) => item.failures))}`);
  process.stdout.write(`Governance ammessa: ${attestation.status}.\n`);
}

process.stdout.write("3/3 — installazione (copia atomica + verifica hash)...\n");
const bundleFiles = historicalAuditReport ? [...bundleExecutableFiles, APR_RULE_GOVERNANCE_SIDECAR] : [...bundleExecutableFiles];
const stagedHashes = Object.fromEntries(bundleFiles.map((name) => [name, sha256File(path.join(stagingDirectory, name))]));
const bundleContentHash = createHash("sha256").update(bundleFiles.map((name) => stagedHashes[name]).join("|")).digest("hex").slice(0, 8);
const versionId = `${bundleContentHash}-${label}-${now.toISOString().slice(0, 10).replace(/-/g, "")}`;
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
const activePointer = path.join(canonicalRoot, "current");

const previousTarget = existsSync(activePointer) && lstatSync(activePointer).isSymbolicLink() ? path.resolve(canonicalRoot, readlinkSync(activePointer)) : null;
if (previousTarget !== null && previousTarget === versionDirectory) {
  process.stdout.write(`Questa versione (${versionId}) e' gia' quella attiva: nulla da fare.\n`);
  process.exit(0);
}

mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
for (const name of bundleFiles) {
  const source = path.join(stagingDirectory, name);
  const target = path.join(versionDirectory, name);
  if (!existsSync(target)) copyFileSync(source, target);
  chmodSync(target, name === APR_RULE_GOVERNANCE_SIDECAR ? 0o600 : 0o700);
  if (sha256File(target) !== sha256File(source)) fail(`installed_hash_mismatch:${name}`);
}
const temporaryPointer = path.join(canonicalRoot, `.current-${label}-${randomUUID()}`);
symlinkSync(path.relative(canonicalRoot, versionDirectory), temporaryPointer);
renameSync(temporaryPointer, activePointer);
if (path.resolve(canonicalRoot, readlinkSync(activePointer)) !== versionDirectory) fail("current_pointer_mismatch_after_install");
for (const name of bundleFiles) if (sha256File(path.join(activePointer, name)) !== stagedHashes[name]) fail(`active_hash_mismatch:${name}`);

const receipt = {
  version: "apr-install-bundle-cli-receipt-v1",
  installedAt: now.toISOString(),
  label,
  versionId,
  previousTarget,
  currentTarget: versionDirectory,
  installedBundle: stagedHashes,
  gateResultArtifactId: gateEnvelope.artifactId,
  gateStatus: gateResult.status,
  governanceAttestation: historicalAuditReport ? {
    path: APR_RULE_GOVERNANCE_SIDECAR,
    sha256: stagedHashes[APR_RULE_GOVERNANCE_SIDECAR],
    historicalAuditReport: path.resolve(historicalAuditReport),
    authorizedHistoricalGap: allowAuthorizedHistoricalGap,
  } : null,
  legacyGovernanceDebtNoticed: gateResult.ruleWiring.legacyUnwiredRuleIds,
};
writeFileSync(path.join(opsDirectory, "install-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`\nInstallato: ${versionId}\nDettagli in: ${opsDirectory}\n`);
