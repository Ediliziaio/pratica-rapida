#!/usr/bin/env node
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ENEA_OPERATIONAL_REGISTRY } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_RULE_SOURCE_FINGERPRINT, APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { materializeAprRuleProofs } from "./aprRuleProofMaterializer";
import { assertCompleteBusinessDecisionCoverage } from "../../src/features/enea-shadow-crm/businessDecisionLedger";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const required = (name: string) => {
  const value = option(name);
  if (!value) throw new Error(`Opzione obbligatoria ${name}.`);
  return value;
};

const rootDirectory = path.resolve(required("--root"));
const repositoryDirectory = path.resolve(option("--repository") ?? process.cwd());
const builtDirectory = path.resolve(option("--built-dir") ?? path.join(repositoryDirectory, ".artifacts", "apr-rule-activation"));
const installedDirectory = path.resolve(required("--installed-dir"));
const skipTests = args.includes("--reuse-current-test-evidence");
const bundleNames = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const testTargets = [
  "src/features/enea-shadow-crm",
  "src/features/enea-lab",
  "scripts/enea-shadow-runner",
];
const testCommand = `vitest run --maxWorkers=1 --testTimeout=30000 ${testTargets.join(" ")}`;

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function bundleHashes(directory: string): Record<string, string> {
  return Object.fromEntries(bundleNames.map((name) => {
    const file = path.join(directory, name);
    if (!existsSync(file)) throw new Error(`Bundle APR mancante: ${file}`);
    return [name, sha256(file)];
  }));
}

function assertRegistryCoverage(): void {
  const registryIds = new Set(ENEA_OPERATIONAL_REGISTRY.map((rule) => rule.id));
  const missing = APR_RULE_TEST_MATRIX.flatMap((entry) => entry.registryRuleIds.filter((id) => !registryIds.has(id)).map((id) => `${entry.key}:${id}`));
  if (missing.length) throw new Error(`Matrice collegata a ID regola inesistenti: ${missing.join(", ")}`);
  // Copertura bidirezionale: non basta che la matrice punti a regole valide.
  // Ogni decisione utente dichiarata deve anche possedere almeno una prova
  // positiva/negativa nella matrice, altrimenti l'attivazione si chiude.
  assertCompleteBusinessDecisionCoverage(APR_RULE_TEST_MATRIX);
}

function assertBundlesContainRules(directory: string): void {
  const executable = bundleNames.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
  const missing = [...new Set(APR_RULE_TEST_MATRIX.flatMap((entry) => entry.registryRuleIds))].filter((ruleId) => !executable.includes(ruleId));
  if (missing.length) throw new Error(`Bundle APR non contiene gli ID regola: ${missing.join(", ")}`);
}

function run(command: string, commandArgs: string[]): void {
  // La suite seriale comprende fixture CDP/macOS volutamente real-time: il solo
  // file cdpEneaBrowserDriver può superare sette minuti. Venti minuti rendevano
  // il gate non deterministico sull'intera suite pur con tutti i test verdi.
  const result = spawnSync(command, commandArgs, { cwd: repositoryDirectory, stdio: "inherit", timeout: 60 * 60 * 1000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Comando fallito (${result.status}): ${command} ${commandArgs.join(" ")}`);
}

mkdirSync(path.join(rootDirectory, "rule-activation"), { recursive: true });
assertRegistryCoverage();
const evidenceStore = new PersistentRuleMatrixEvidence(rootDirectory);
if (!skipTests) {
  // I test browser simulati hanno timeout intenzionalmente stretti. In parallelo
  // potevano fallire per saturazione CPU pur passando sempre isolati: la prova
  // di attivazione deve essere deterministica, quindi usa un solo worker.
  const rawReportPath = path.join(rootDirectory, "rule-activation", `vitest-${Date.now()}-${crypto.randomUUID()}.json`);
  run(path.join(repositoryDirectory, "node_modules", ".bin", "vitest"), ["run", "--maxWorkers=1", "--testTimeout=30000", "--reporter=json", `--outputFile=${rawReportPath}`, ...testTargets]);
  materializeAprRuleProofs({ repositoryRoot: repositoryDirectory, rootDirectory, rawReportPath, testCommand });
  const current = evidenceStore.load();
  if (!current || current.passedKeys.length !== APR_RULE_TEST_MATRIX.length || Object.keys(current.ruleProofs).length !== APR_RULE_TEST_MATRIX.length) {
    throw new Error("Suite verde ma certificazione incompleta: ogni regola richiede fixture reale, secondo caso analogo e replay pulito.");
  }
} else {
  const current = evidenceStore.load();
  if (!current || current.sourceFingerprint !== APR_RULE_SOURCE_FINGERPRINT || current.passedKeys.length !== APR_RULE_TEST_MATRIX.length || Object.keys(current.ruleProofs).length !== APR_RULE_TEST_MATRIX.length) {
    throw new Error("Evidenza test corrente assente o superata: impossibile riusarla.");
  }
}
run(process.execPath, [path.join(repositoryDirectory, "scripts", "enea-shadow-runner", "buildPersistentBundles.mjs"), builtDirectory]);
assertBundlesContainRules(builtDirectory);
const builtBundleSha256 = bundleHashes(builtDirectory);
const installedBundleSha256 = bundleHashes(installedDirectory);
const deploymentMatches = Object.entries(builtBundleSha256).every(([name, digest]) => installedBundleSha256[name] === digest);
if (deploymentMatches) evidenceStore.recordDeployment(builtBundleSha256, installedBundleSha256);

const report = {
  version: "apr-rule-activation-verification-v1",
  verifiedAt: new Date().toISOString(),
  status: deploymentMatches ? "active_tested_deployed" : "tested_not_deployed",
  sourceFingerprint: APR_RULE_SOURCE_FINGERPRINT,
  matrixRules: APR_RULE_TEST_MATRIX.length,
  registryLinksVerified: true,
  testCommand,
  testEvidenceReused: skipTests,
  builtBundleSha256,
  installedBundleSha256,
  deploymentMatches,
  nextAction: deploymentMatches
    ? "Regole testate e bundle persistenti corrispondenti: il runtime installato e' certificato."
    : "Installare esattamente i tre bundle costruiti e ripetere la certificazione senza riusare una versione diversa.",
};
writeFileSync(path.join(rootDirectory, "rule-activation", "checkpoint.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!deploymentMatches) process.exitCode = 2;
