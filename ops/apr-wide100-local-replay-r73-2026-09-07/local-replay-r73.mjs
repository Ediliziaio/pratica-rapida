import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envelopeImmutableArtifact, verifyImmutableArtifactEnvelope } from "../../scripts/enea-shadow-runner/aprMonotonicArtifacts.ts";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis.ts";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight.ts";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay.ts";

// Replay locale POST-installazione r73 (Mocenighi model-code tolerance +
// Codognato Finestra Italia notation + governance mixed-infissi-persiane),
// stesso metodo e stesso manifest di r71. Nessun accesso a Chrome/ENEA/keepalive:
// solo lettura di checkpoint gia' analizzati su disco, con la logica di
// preflight CORRENTE (post tutte le correzioni di stanotte).

const repository = path.resolve(import.meta.dirname, "../..");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");

if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_r73_replay_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installReceiptPath = path.resolve(import.meta.dirname, "../apr-install-mixed-infissi-persiane-r73-2026-09-07/install-receipt.json");
const installReceipt = JSON.parse(readFileSync(installReceiptPath, "utf8"));
if (installReceipt.versionId !== installedVersionId) throw new Error(`apr_r73_replay_version_mismatch:receipt=${installReceipt.versionId}:disk=${installedVersionId}`);

const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifestBytes = readFileSync(manifestPath);
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const names = readdirSync(cohortRoot);
const cohortOffset = 2920;

const results = [];
const replayAt = new Date();

for (const c of manifest.cases) {
  const pilotId = cohortOffset + c.cohort;
  const dirName = `apr-pilot-${pilotId}-global-controller-${c.customerKey}`;
  const stateDirectory = path.join(cohortRoot, dirName);
  if (!names.includes(dirName) || !existsSync(stateDirectory)) {
    results.push({ customerKey: c.customerKey, displayName: c.displayName, cohort: c.cohort, module: c.module, outcome: "case_not_found", blockerCodes: [], warningCodes: [] });
    continue;
  }
  try {
    const item = resolveCurrentCohortManifestCase(stateDirectory, c.customerKey);
    const dossier = JSON.parse(readFileSync(item.evidence.dossierPath, "utf8"));
    const analysis = new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(replayAt);
    const report = buildCrmLocalPreflightReport(dossier, c.customerKey, analysis, replayAt);
    results.push({
      customerKey: c.customerKey,
      displayName: c.displayName,
      cohort: c.cohort,
      module: c.module,
      outcome: report.outcome,
      blockerCodes: report.blockers.map((b) => b.code),
      blockerReasons: report.blockers.map((b) => b.reason ?? b.message ?? null),
      warningCodes: report.warnings.map((w) => w.code),
    });
  } catch (err) {
    results.push({ customerKey: c.customerKey, displayName: c.displayName, cohort: c.cohort, module: c.module, outcome: "error", blockerCodes: [], warningCodes: [], error: String(err && err.message || err) });
  }
}

const ready = results.filter((r) => r.outcome === "ready_local_plan");
const blocked = results.filter((r) => r.outcome === "blocked_case");
const notFound = results.filter((r) => r.outcome === "case_not_found");
const errored = results.filter((r) => r.outcome === "error");

const blockerFrequency = {};
for (const r of blocked) for (const code of r.blockerCodes) blockerFrequency[code] = (blockerFrequency[code] ?? 0) + 1;

const payload = {
  version: "apr-wide100-local-replay-r73-v1",
  replayAt: replayAt.toISOString(),
  installedVersionId,
  installReceiptVersionId: installReceipt.versionId,
  manifestPath: "ops/apr-wide100-province-lineage-2026-09-02/manifest.json",
  manifestSha256,
  totalCases: manifest.cases.length,
  readyCount: ready.length,
  blockedCount: blocked.length,
  caseNotFoundCount: notFound.length,
  errorCount: errored.length,
  blockerFrequency,
  results: results.sort((a, b) => a.customerKey.localeCompare(b.customerKey)),
};

const envelope = envelopeImmutableArtifact(payload);
if (!verifyImmutableArtifactEnvelope(envelope)) throw new Error("apr_r73_replay_envelope_self_check_failed");

const outputDirectory = import.meta.dirname;
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "report.json"), `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

const reportMd = `# Replay locale wide100 — r73 (post-installazione, hash-verificata)

- Data replay: ${payload.replayAt}
- Bundle installato: ${installedVersionId}
- Manifest: ${payload.manifestPath} (sha256 ${manifestSha256})
- Artifact ID (firma): ${envelope.artifactId}

## Risultato

- Pratiche totali: ${payload.totalCases}
- **Procedibili (ready_local_plan): ${payload.readyCount}**
- Bloccate: ${payload.blockedCount}
- Non trovate: ${payload.caseNotFoundCount}
- Errori: ${payload.errorCount}

## Frequenza blocker (tra le pratiche bloccate)

${Object.entries(blockerFrequency).sort((a, b) => b[1] - a[1]).map(([code, count]) => `- ${code}: ${count}`).join("\n")}

## Pratiche procedibili

${ready.map((r) => `- ${r.customerKey} (${r.displayName}, ${r.module})`).join("\n")}
`;
writeFileSync(path.join(outputDirectory, "report.md"), reportMd, "utf8");

process.stdout.write(`${JSON.stringify({ readyCount: payload.readyCount, blockedCount: payload.blockedCount, caseNotFoundCount: payload.caseNotFoundCount, errorCount: payload.errorCount, artifactId: envelope.artifactId }, null, 2)}\n`);
