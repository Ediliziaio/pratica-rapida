import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const outputPath = path.join(import.meta.dirname, "reviewed-cases-current-source-replay.json");
const selected = new Set([
  "massimiliano-montemorra", "francesca-monti", "enrico-amos-maria-berneri", "sabrina-eustomi", "marco-de-marinis",
  "mimosa-freni", "elena-marcella-berti", "nadia-ragni", "riccardo-coda", "maria-sofia-tosatti", "antonella-ferletic", "giulia-kasermann", "sarah-mondini", "roberta-di-cesare",
]);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { cases: Array<{ cohort:number; customerKey:string; practiceId:string; displayName:string }> };
const names = readdirSync(cohortRoot);
const cases = manifest.cases.filter((entry) => selected.has(entry.customerKey)).map((entry) => {
  const operationalCohort = 2920 + entry.cohort;
  const candidates = names.filter((name) => name.startsWith(`apr-pilot-${operationalCohort}-global-controller-`));
  if (candidates.length !== 1) throw new Error(`cohort_state_count:${entry.customerKey}:${candidates.length}`);
  const stateDirectory = path.join(cohortRoot, candidates[0]);
  const current = resolveCurrentCohortManifestCase(stateDirectory, entry.customerKey);
  if (current.practiceId !== entry.practiceId) throw new Error(`practice_mismatch:${entry.customerKey}`);
  const report = buildCrmLocalPreflightReport(JSON.parse(readFileSync(current.evidence.dossierPath, "utf8")), entry.customerKey, new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(), new Date("2026-09-03T00:00:00+02:00"));
  return {
    customerKey: entry.customerKey,
    displayName: entry.displayName,
    operationalCohort,
    outcome: report.outcome,
    formAvailable: report.formAvailable,
    taxCodeStatus: report.taxCodeStatus,
    resolvedTaxCode: report.resolvedTaxCode,
    products: report.products,
    blockers: report.blockers,
    warnings: report.warnings,
  };
});
const result = {
  schemaVersion: "apr-reviewed-cases-current-source-replay-v1",
  generatedAt: new Date().toISOString(),
  source: "current_worktree_uninstalled_local_replay",
  safety: { localOnly: true, externalActionAllowed: false, eneaAccessed: false },
  cases,
};
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ outputPath, sha256: createHash("sha256").update(readFileSync(outputPath)).digest("hex"), count: cases.length }));
