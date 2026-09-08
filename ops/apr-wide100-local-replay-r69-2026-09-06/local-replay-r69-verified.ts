import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalSha256, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope } from "../../scripts/enea-shadow-runner/aprMonotonicArtifacts";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

// Replay locale POST-installazione, con campi di integrita' verificabili.
// Nessun accesso a Chrome/ENEA/keepalive: solo lettura di checkpoint gia'
// analizzati su disco, e una ricostruzione locale del bundle per provare che
// il codice sorgente eseguito qui e' byte-per-byte lo stesso installato in
// canonical-bundle/current (usa lo stesso comando di build, stesso esbuild).

const repository = path.resolve(import.meta.dirname, "../..");
const canonicalRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/canonical-bundle";
const currentPointer = path.join(canonicalRoot, "current");
const sha256File = (target: string) => createHash("sha256").update(readFileSync(target)).digest("hex");

// --- 1. Leggere lo stato REALE installato da disco (nessuna assunzione) ---
if (!existsSync(currentPointer) || !lstatSync(currentPointer).isSymbolicLink()) throw new Error("apr_r69_verify_current_pointer_missing");
const installedVersionId = path.basename(path.resolve(canonicalRoot, readlinkSync(currentPointer)));
const installedDirectory = path.resolve(canonicalRoot, readlinkSync(currentPointer));
const bundleFiles = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"];
const installedBundleSha256 = Object.fromEntries(bundleFiles.map((name) => [name, sha256File(path.join(installedDirectory, name))]));

const receiptPath = path.join(import.meta.dirname, "bundle-install-receipt-r69.json");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { versionId: string; installedBundle: Record<string, string>; installedAt: string };
if (receipt.versionId !== installedVersionId) throw new Error(`apr_r69_verify_version_mismatch:receipt=${receipt.versionId}:disk=${installedVersionId}`);
for (const name of bundleFiles) if (receipt.installedBundle[name] !== installedBundleSha256[name]) throw new Error(`apr_r69_verify_hash_mismatch:${name}`);

// --- 2. Riprova indipendente: ricostruire il bundle ORA dallo stesso sorgente e confrontare l'hash ---
const rebuildDirectory = path.join(import.meta.dirname, "rebuild-check-tmp");
execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", rebuildDirectory], { cwd: repository, stdio: "pipe" });
const rebuildSha256 = Object.fromEntries(bundleFiles.map((name) => [name, sha256File(path.join(rebuildDirectory, name))]));
const rebuildMatchesInstalled = bundleFiles.every((name) => rebuildSha256[name] === installedBundleSha256[name]);
for (const name of bundleFiles) rmSync(path.join(rebuildDirectory, name), { force: true });
rmSync(rebuildDirectory, { recursive: true, force: true });
if (!rebuildMatchesInstalled) throw new Error(`apr_r69_verify_rebuild_does_not_match_installed:${JSON.stringify({ rebuildSha256, installedBundleSha256 })}`);

// --- 3. Replay locale vero e proprio, sulle 100 pratiche del manifest originale ---
const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifestBytes = readFileSync(manifestPath);
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as { cases: Array<{ cohort: number; customerKey: string; practiceId: string; displayName: string }> };
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const names = readdirSync(cohortRoot);
const cohortOffset = 2920;

type CaseResult = {
  customerKey: string; displayName: string; cohort: number;
  outcome: "ready_local_plan" | "blocked_case" | "case_not_found" | "error";
  blockerCodes: string[]; warningCodes: string[]; error?: string;
};
const results: CaseResult[] = [];
const replayAt = new Date();

for (const entry of manifest.cases) {
  const operationalCohort = cohortOffset + entry.cohort;
  try {
    const candidates = names.filter((name) => name.startsWith(`apr-pilot-${operationalCohort}-global-controller-`));
    if (candidates.length !== 1) { results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: "case_not_found", blockerCodes: [], warningCodes: [], error: `cohort_state_count:${candidates.length}` }); continue; }
    const stateDirectory = path.join(cohortRoot, candidates[0]);
    const current = resolveCurrentCohortManifestCase(stateDirectory, entry.customerKey);
    if (current.practiceId !== entry.practiceId) { results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: "case_not_found", blockerCodes: [], warningCodes: [], error: "practice_mismatch" }); continue; }
    const dossier = JSON.parse(readFileSync(current.evidence.dossierPath, "utf8"));
    const report = buildCrmLocalPreflightReport(dossier, entry.customerKey, new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(), replayAt);
    results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: report.outcome, blockerCodes: report.blockers.map((item) => item.code), warningCodes: report.warnings.map((item) => item.code) });
  } catch (error) {
    results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: "error", blockerCodes: [], warningCodes: [], error: error instanceof Error ? error.message : String(error) });
  }
}

const readyLocalPlan = results.filter((item) => item.outcome === "ready_local_plan").length;
const blockedCase = results.filter((item) => item.outcome === "blocked_case").length;
const caseNotFound = results.filter((item) => item.outcome === "case_not_found").length;
const errored = results.filter((item) => item.outcome === "error").length;
const blockerFrequency = Object.entries(results.flatMap((item) => item.blockerCodes).reduce<Record<string, number>>((counts, code) => { counts[code] = (counts[code] ?? 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const warningFrequency = Object.entries(results.flatMap((item) => item.warningCodes).reduce<Record<string, number>>((counts, code) => { counts[code] = (counts[code] ?? 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

// --- 4. Buste con integrita' verificabile (stesso schema di aprMonotonicArtifacts.ts: artifactId = sha256 canonico del payload) ---
const payload = {
  schemaVersion: "apr-wide100-local-replay-r69-verified-v1",
  generatedAt: replayAt.toISOString(),
  producedAfterInstallConfirmed: true,
  safety: { localOnly: true, eneaAccessed: false, chromeAccessed: false, keepaliveTouched: false, crmMutated: false },
  installedBundle: { versionId: installedVersionId, sha256: installedBundleSha256, installedAt: receipt.installedAt, currentPointerTarget: path.relative(canonicalRoot, installedDirectory) },
  sourceIntegrity: { rebuildMatchesInstalled, rebuildCommand: "node scripts/enea-shadow-runner/buildPersistentBundles.mjs", note: "Il bundle e' stato ricostruito ora dallo stesso sorgente e confrontato byte-per-byte (SHA-256) con quello installato in canonical-bundle/current: gli hash coincidono, quindi il replay sottostante esegue esattamente la stessa logica del bundle installato." },
  sourceManifest: { path: manifestPath, sha256: manifestSha256 },
  aggregate: { total: results.length, readyLocalPlan, blockedCase, caseNotFound, errored },
  blockerFrequency,
  warningFrequency,
  cases: results,
};
const envelope = envelopeImmutableArtifact(payload);
if (!verifyImmutableArtifactEnvelope(envelope)) throw new Error("apr_r69_verify_envelope_self_check_failed");

const jsonPath = path.join(import.meta.dirname, "report-verified-post-install.json");
writeFileSync(jsonPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

const markdownLines = [
  "# APR — replay locale r69, verificato POST-installazione",
  "",
  `Generato: ${payload.generatedAt}`,
  `**artifactId (firma SHA-256 canonica del payload, ricalcolabile e verificata da questo stesso script):** \`${envelope.artifactId}\``,
  "",
  "## Integrità del bundle installato",
  "",
  `- Versione installata: \`${installedVersionId}\``,
  `- Puntatore \`canonical-bundle/current\` → \`${payload.installedBundle.currentPointerTarget}\` (letto ora da disco, non assunto)`,
  `- Installato il: ${receipt.installedAt}`,
  `- apr-enea-worker.mjs SHA-256: \`${installedBundleSha256["apr-enea-worker.mjs"]}\``,
  `- apr-supervisor.mjs SHA-256: \`${installedBundleSha256["apr-supervisor.mjs"]}\``,
  `- apr-watchdog.mjs SHA-256: \`${installedBundleSha256["apr-watchdog.mjs"]}\``,
  `- **Riprova indipendente:** bundle ricostruito ora dallo stesso sorgente → hash identico a quello installato: **${rebuildMatchesInstalled ? "CONFERMATO" : "NON CORRISPONDE"}**`,
  "",
  "**Sicurezza:** replay locale, sola lettura. Nessun accesso a Chrome, ENEA, keepalive o servizi persistenti (nessuno riavviato o toccato).",
  "",
  "## Aggregato",
  "",
  `- Pratiche totali: ${payload.aggregate.total}`,
  `- **Procedibili in locale (\`ready_local_plan\`): ${readyLocalPlan}**`,
  `- Bloccate (\`blocked_case\`): ${blockedCase}`,
  `- Non trovate nello stato locale: ${caseNotFound}`,
  `- Errori di esecuzione: ${errored}`,
  "",
  "## Frequenza blocker",
  "",
  ...blockerFrequency.map(([code, count]) => `- \`${code}\`: ${count}`),
  "",
  "## Frequenza avvisi (override documento-su-CRM applicati)",
  "",
  ...(warningFrequency.length ? warningFrequency.map(([code, count]) => `- \`${code}\`: ${count}`) : ["- nessuno"]),
  "",
  "## Dettaglio per pratica",
  "",
  "| customerKey | coorte | esito | blocker | avvisi |",
  "|---|---|---|---|---|",
  ...results.map((item) => `| ${item.customerKey} | ${item.cohort} | ${item.outcome} | ${item.blockerCodes.join(", ") || "-"} | ${item.warningCodes.join(", ") || "-"} |`),
  "",
];
const markdownPath = path.join(import.meta.dirname, "report-verified-post-install.md");
writeFileSync(markdownPath, `${markdownLines.join("\n")}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ jsonPath, markdownPath, artifactId: envelope.artifactId, rebuildMatchesInstalled, aggregate: payload.aggregate }, null, 2)}\n`);
