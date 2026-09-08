import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

// Replay locale, sola lettura: nessun accesso a Chrome/ENEA. Usa soltanto
// checkpoint persistenti gia' analizzati su disco e il preflight comune
// (buildCrmLocalPreflightReport) con il codice sorgente corrente del
// repository, che include le correzioni odierne (Comune lavori, Rinaldi,
// riconciliazione Schermature/Infissi, cronologia fatture per ordine).

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const manifestBytes = readFileSync(manifestPath);
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as { cases: Array<{ cohort: number; customerKey: string; practiceId: string; displayName: string }> };
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 100) throw new Error(`manifest_case_count_invalid:${manifest.cases?.length}`);

const names = readdirSync(cohortRoot);

type CaseResult = {
  customerKey: string;
  displayName: string;
  cohort: number;
  outcome: "ready_local_plan" | "blocked_case" | "case_not_found" | "error";
  blockerCodes: string[];
  warningCodes: string[];
  error?: string;
};

const results: CaseResult[] = [];

const cohortOffset = 2920;

for (const entry of manifest.cases) {
  const operationalCohort = cohortOffset + entry.cohort;
  try {
    const candidates = names.filter((name) => name.startsWith(`apr-pilot-${operationalCohort}-global-controller-`));
    if (candidates.length !== 1) {
      results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: "case_not_found", blockerCodes: [], warningCodes: [], error: `cohort_state_count:${candidates.length}` });
      continue;
    }
    const stateDirectory = path.join(cohortRoot, candidates[0]);
    const current = resolveCurrentCohortManifestCase(stateDirectory, entry.customerKey);
    if (current.practiceId !== entry.practiceId) {
      results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: "case_not_found", blockerCodes: [], warningCodes: [], error: "practice_mismatch" });
      continue;
    }
    const dossier = JSON.parse(readFileSync(current.evidence.dossierPath, "utf8"));
    const report = buildCrmLocalPreflightReport(
      dossier,
      entry.customerKey,
      new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(),
      new Date("2026-09-06T18:00:00+02:00"),
    );
    results.push({
      customerKey: entry.customerKey,
      displayName: entry.displayName,
      cohort: operationalCohort,
      outcome: report.outcome,
      blockerCodes: report.blockers.map((item) => item.code),
      warningCodes: report.warnings.map((item) => item.code),
    });
  } catch (error) {
    results.push({ customerKey: entry.customerKey, displayName: entry.displayName, cohort: operationalCohort, outcome: "error", blockerCodes: [], warningCodes: [], error: error instanceof Error ? error.message : String(error) });
  }
}

const readyLocalPlan = results.filter((item) => item.outcome === "ready_local_plan").length;
const blockedCase = results.filter((item) => item.outcome === "blocked_case").length;
const caseNotFound = results.filter((item) => item.outcome === "case_not_found").length;
const errored = results.filter((item) => item.outcome === "error").length;

const blockerFrequency = Object.entries(
  results.flatMap((item) => item.blockerCodes).reduce<Record<string, number>>((counts, code) => { counts[code] = (counts[code] ?? 0) + 1; return counts; }, {}),
).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

const warningFrequency = Object.entries(
  results.flatMap((item) => item.warningCodes).reduce<Record<string, number>>((counts, code) => { counts[code] = (counts[code] ?? 0) + 1; return counts; }, {}),
).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

const report = {
  schemaVersion: "apr-wide100-local-replay-r69-v1",
  generatedAt: new Date().toISOString(),
  safety: { localOnly: true, eneaAccessed: false, chromeAccessed: false, crmMutated: false, description: "Replay locale del preflight comune su checkpoint gia' analizzati su disco; nessun accesso a Chrome, ENEA o keepalive." },
  sourceManifestPath: manifestPath,
  sourceManifestSha256: manifestSha256,
  aggregate: { total: results.length, readyLocalPlan, blockedCase, caseNotFound, errored },
  blockerFrequency,
  warningFrequency,
  cases: results,
};

const jsonPath = path.join(import.meta.dirname, "report.json");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const markdownLines = [
  "# APR — replay locale r69 (100 pratiche, manifest originale)",
  "",
  `Data: ${report.generatedAt}`,
  `Manifest: \`${manifestPath}\` (SHA-256 \`${manifestSha256}\`)`,
  "",
  "**Sicurezza:** replay locale, sola lettura dei checkpoint gia' presenti su disco. Nessun accesso a Chrome, ENEA, keepalive o servizi persistenti.",
  "",
  "## Aggregato",
  "",
  `- Pratiche totali: ${report.aggregate.total}`,
  `- **Procedibili in locale (\`ready_local_plan\`): ${readyLocalPlan}**`,
  `- Bloccate (\`blocked_case\`): ${blockedCase}`,
  `- Non trovate nello stato locale: ${caseNotFound}`,
  `- Errori di esecuzione: ${errored}`,
  "",
  "## Frequenza blocker (tra le pratiche bloccate)",
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
const markdownPath = path.join(import.meta.dirname, "report.md");
writeFileSync(markdownPath, `${markdownLines.join("\n")}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ jsonPath, markdownPath, aggregate: report.aggregate }, null, 2)}\n`);
