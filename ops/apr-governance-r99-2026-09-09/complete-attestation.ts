import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAprRuleGovernanceAttestation, verifyAprRuleGovernanceAdmission } from "../../scripts/enea-shadow-runner/aprRuleGovernanceAdmission";
import { buildHistoricalBusinessDecisionAudit, inventoryHistoricalDecisionSources } from "../../scripts/enea-shadow-runner/historicalBusinessDecisionAudit";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

const repositoryRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const sourceBundle = path.join(canonicalRoot, "versions/e7587c94-document-type-fattura-narrative-batch-r99-2026-09-09-20260908");
const outputRoot = path.join(repositoryRoot, "ops/apr-governance-r99-2026-09-09");
const historicalAuditReport = path.join(outputRoot, "historical-audit-report-r99.json");
const baselineBundle = path.join(canonicalRoot, "versions/58161914-historical-gap-governance-r98-20260908");
const executables = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;
const expected = {
  "apr-supervisor.mjs": "5d3d32f389030b0a9893610dc67ad8c7c33fd17c5dd1241ce1ec7ae3f542c684",
  "apr-enea-worker.mjs": "84b19a9055a5d8d621a9c50735fb32acee69b216c9a27aab4dbdf141a6bdecfb",
  "apr-watchdog.mjs": "551118e02af5d2a9163f18d8663d7b332d173ff0ae28cffb9659dee9a33619f0",
} as const;
const sha256 = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

for (const name of executables) {
  const actual = sha256(path.join(sourceBundle, name));
  if (actual !== expected[name]) throw new Error(`r99_executable_hash_mismatch:${name}:${actual}`);
}
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const readBundle = (directory: string) => executables.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n");
const sourceInventory = await inventoryHistoricalDecisionSources({
  sessionsRoot: "/Users/giulianolavoro/.codex/sessions",
  additionalSourceFiles: [path.join(repositoryRoot, "ops/apr-install-reseller-addressee-batch-r97-2026-09-08-2026-09-08/claude-sessions-export.json")],
});
const historicalAudit = buildHistoricalBusinessDecisionAudit({
  sourceInventory,
  provedMatrixKeys: new Set(APR_RULE_TEST_MATRIX.map((item) => item.key)),
  deploymentVerified: true,
  baselineBundleText: readBundle(baselineBundle),
  currentBundleText: readBundle(sourceBundle),
});
const unresolved = historicalAudit.decisions.filter((item) => item.recoveryStatus === "unresolved_documented").map((item) => item.decisionId.replace(/^decision:/, "")).sort();
const authorized = [
  "user-2026-08-06-existing-plant-authoritative-mapping-v1",
  "user-2026-08-06-intervention-authoritative-sources-and-defaults-v1",
  "user-2026-08-06-portal-intermediary-physical-beneficiary-v1",
  "user-2026-08-06-portal-municipality-controlled-selection-v1",
].sort();
if (historicalAudit.status !== "incomplete" || historicalAudit.unresolvedDocumentedDecisionCount !== 4 || JSON.stringify(unresolved) !== JSON.stringify(authorized)) {
  throw new Error(`r99_historical_audit_not_exactly_authorized_gap:${JSON.stringify({ status: historicalAudit.status, unresolved })}`);
}
writeFileSync(historicalAuditReport, `${JSON.stringify(historicalAudit, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
const staging = path.join(outputRoot, "staged-governed-bundle");
mkdirSync(staging, { recursive: true, mode: 0o700 });
for (const name of executables) copyFileSync(path.join(sourceBundle, name), path.join(staging, name));

const attestation = buildAprRuleGovernanceAttestation({
  bundleDirectory: staging,
  historicalAuditReport,
  allowAuthorizedHistoricalGap: true,
});
const attestationPath = path.join(staging, "apr-rule-governance-attestation.json");
writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

const positive = executables.map((name) => verifyAprRuleGovernanceAdmission({ executablePath: path.join(staging, name), attestationPath }));
if (positive.some((result) => result.status !== "admitted")) throw new Error(`positive_admission_failed:${JSON.stringify(positive)}`);
const missing = verifyAprRuleGovernanceAdmission({ executablePath: path.join(staging, "apr-enea-worker.mjs"), attestationPath: path.join(staging, "missing-attestation.json") });
if (missing.status !== "technical_block" || !missing.failures.includes("attestation_missing")) throw new Error("negative_missing_attestation_not_fail_closed");
const tamperedPath = path.join(staging, "tampered-attestation.json");
writeFileSync(tamperedPath, `${JSON.stringify({ ...attestation, bundleSha256: { ...attestation.bundleSha256, "apr-enea-worker.mjs": "0".repeat(64) } }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
const tampered = verifyAprRuleGovernanceAdmission({ executablePath: path.join(staging, "apr-enea-worker.mjs"), attestationPath: tamperedPath });
if (tampered.status !== "technical_block" || !tampered.failures.includes("running_bundle_hash_mismatch")) throw new Error("negative_tampered_hash_not_fail_closed");

const governedFiles = [...executables, "apr-rule-governance-attestation.json"];
const hashes = Object.fromEntries(governedFiles.map((name) => [name, sha256(path.join(staging, name))]));
const contentHash = createHash("sha256").update(governedFiles.map((name) => hashes[name]).join("|")).digest("hex").slice(0, 8);
const versionId = `${contentHash}-document-type-fattura-narrative-batch-r99-governed-20260909`;
const versionDirectory = path.join(canonicalRoot, "versions", versionId);
mkdirSync(versionDirectory, { recursive: true, mode: 0o700 });
for (const name of governedFiles) {
  const source = path.join(staging, name);
  const target = path.join(versionDirectory, name);
  if (!existsSync(target)) copyFileSync(source, target);
  chmodSync(target, name === "apr-rule-governance-attestation.json" ? 0o600 : 0o700);
  if (sha256(target) !== hashes[name]) throw new Error(`installed_hash_mismatch:${name}`);
}
const activePointer = path.join(canonicalRoot, "current");
const previousTarget = existsSync(activePointer) && lstatSync(activePointer).isSymbolicLink() ? path.resolve(canonicalRoot, readlinkSync(activePointer)) : null;
const temporaryPointer = path.join(canonicalRoot, `.current-r99-governed-${randomUUID()}`);
symlinkSync(path.relative(canonicalRoot, versionDirectory), temporaryPointer);
renameSync(temporaryPointer, activePointer);
if (path.resolve(canonicalRoot, readlinkSync(activePointer)) !== versionDirectory) throw new Error("current_pointer_mismatch");
for (const name of governedFiles) if (sha256(path.join(activePointer, name)) !== hashes[name]) throw new Error(`active_hash_mismatch:${name}`);

const receipt = {
  version: "apr-r99-governance-completion-receipt-v1",
  installedAt: new Date().toISOString(),
  sourceBundle,
  previousTarget,
  currentTarget: versionDirectory,
  versionId,
  hashes,
  historicalAuditReport,
  historicalAuditReportSha256: sha256(historicalAuditReport),
  attestationStatus: attestation.status,
  positiveAdmissions: positive.map((result) => ({ executablePath: result.executablePath, status: result.status, failures: result.failures })),
  negativeTests: {
    missingAttestation: { status: missing.status, failures: missing.failures },
    tamperedWorkerHash: { status: tampered.status, failures: tampered.failures },
  },
};
writeFileSync(path.join(outputRoot, "install-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
