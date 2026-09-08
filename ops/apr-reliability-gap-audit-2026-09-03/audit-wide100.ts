import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { resolveCurrentCohortManifestCase } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const manifestPath = path.resolve(import.meta.dirname, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const priorReportPath = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-wide100-current-cohort-bridge-r25/report.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { cases: Array<{ cohort:number; customerKey:string; practiceId:string; displayName:string }> };
const priorReport = JSON.parse(readFileSync(priorReportPath, "utf8")) as { cases: Array<{ customerKey:string; state:string }> };
const priorByKey = new Map(priorReport.cases.map((item) => [item.customerKey, item.state]));
const names = readdirSync(cohortRoot);

const cases = manifest.cases.map((entry) => {
  const operationalCohort = 2920 + entry.cohort;
  const candidates = names.filter((name) => name.startsWith(`apr-pilot-${operationalCohort}-global-controller-`));
  if (candidates.length !== 1) throw new Error(`cohort_state_count:${entry.customerKey}:${candidates.length}`);
  const stateDirectory = path.join(cohortRoot, candidates[0]);
  const current = resolveCurrentCohortManifestCase(stateDirectory, entry.customerKey);
  if (current.practiceId !== entry.practiceId) throw new Error(`practice_mismatch:${entry.customerKey}`);
  const report = buildCrmLocalPreflightReport(
    JSON.parse(readFileSync(current.evidence.dossierPath, "utf8")),
    entry.customerKey,
    new PersistentAprCrmDocumentAnalysis(stateDirectory).snapshot(),
    new Date("2026-09-03T12:00:00+02:00"),
  );
  const codes = report.blockers.map((item) => item.code);
  // Questo script osserva soltanto il preflight comune. I segnali seguenti
  // non sono verdetti: per Infissi e misti devono essere confrontati con il
  // gate prodotto autorevole prima di poter parlare di contraddizione.
  const commonPreflightSignals: string[] = [];
  if (report.financial.tripleReconciliationVerified && report.blockers.some((item) => item.field === "economic_sources")) commonPreflightSignals.push("economic_blocker_despite_common_triple_reconciliation");
  if (report.products.length > 0 && codes.includes("screenings_missing")) commonPreflightSignals.push("screenings_missing_despite_common_products");
  if (report.resolvedTaxCode && codes.includes("tax_code_missing_or_invalid")) commonPreflightSignals.push("tax_code_missing_despite_common_resolution");
  if (report.formAvailable && codes.includes("customer_form_missing")) commonPreflightSignals.push("customer_form_missing_despite_common_form");
  if (report.eneaPayloadAudit.draftReady && report.blockers.length > 0) commonPreflightSignals.push("common_draft_ready_despite_blockers");
  return {
    customerKey: entry.customerKey,
    displayName: entry.displayName,
    operationalCohort,
    priorState: priorByKey.get(entry.customerKey) ?? null,
    currentOutcome: report.outcome,
    formAvailable: report.formAvailable,
    resolvedTaxCode: report.resolvedTaxCode,
    productCount: report.products.length,
    financialVerified: report.financial.tripleReconciliationVerified,
    blockerCodes: codes,
    commonPreflightSignals,
  };
});

const blockerFrequency = Object.entries(cases.flatMap((item) => item.blockerCodes).reduce<Record<string, number>>((counts, code) => {
  counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}, {})).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

console.log(JSON.stringify({
  schemaVersion: "apr-wide100-current-source-reliability-gap-audit-v1",
  safety: { localOnly: true, eneaAccessed: false, crmMutated: false },
  aggregate: {
    total: cases.length,
    readyLocalPlan: cases.filter((item) => item.currentOutcome === "ready_local_plan").length,
    blockedCase: cases.filter((item) => item.currentOutcome === "blocked_case").length,
    priorNonSavedNowReady: cases.filter((item) => item.priorState !== "saved" && item.currentOutcome === "ready_local_plan").length,
    commonPreflightSignals: cases.filter((item) => item.commonPreflightSignals.length > 0).length,
  },
  blockerFrequency,
  upliftCandidates: cases.filter((item) => item.priorState !== "saved" && item.currentOutcome === "ready_local_plan"),
  commonPreflightSignals: cases.filter((item) => item.commonPreflightSignals.length > 0),
}, null, 2));
