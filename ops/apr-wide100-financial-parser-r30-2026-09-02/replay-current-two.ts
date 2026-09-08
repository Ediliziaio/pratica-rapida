import { readFileSync, writeFileSync } from "node:fs";

import {
  observedEconomicInput,
  resolveCurrentCohortManifestCase,
  runEconomicVerticalForCurrentCohort,
} from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cases = [
  ["giovanna-atzeni", "apr-pilot-3021-global-controller-giovanna-atzeni"],
  ["elena-marcella-berti", "apr-pilot-3022-global-controller-elena-marcella-berti"],
] as const;

const results = cases.map(([customerKey, cohort]) => {
  const stateDir = `${cohortRoot}/${cohort}`;
  const replay = runEconomicVerticalForCurrentCohort(stateDir, customerKey);
  const manifestCase = resolveCurrentCohortManifestCase(stateDir, customerKey);
  const analysis = JSON.parse(readFileSync(manifestCase.evidence.analysisCheckpoint, "utf8"));
  const input = observedEconomicInput(manifestCase, analysis);
  return {
    customerKey,
    cohort,
    outcome: replay.outcome,
    eligibleExpense: replay.eligibleExpense,
    invoiceReconciliation: replay.invoiceReconciliation,
    bankTransferReconciliation: replay.bankTransferReconciliation,
    invoices: input.invoices,
  };
});

const artifact = { generatedAt: new Date().toISOString(), results };
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], serialized, "utf8");
process.stdout.write(serialized);
