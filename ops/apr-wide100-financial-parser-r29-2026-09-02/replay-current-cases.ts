import { observedEconomicInput, resolveCurrentCohortManifestCase, runEconomicVerticalForCurrentCohort } from "../../scripts/enea-shadow-runner/aprEconomicCorpusReplay";
import { readFileSync } from "node:fs";

const cases = [
  ["giovanna-atzeni", "apr-pilot-2943-global-controller-giovanna-atzeni"],
  ["elena-marcella-berti", "apr-pilot-2992-global-controller-elena-marcella-berti"],
  ["gabriele-girelli", "apr-pilot-2938-global-controller-gabriele-girelli"],
  ["giovanni-amadu", "apr-pilot-2999-global-controller-giovanni-amadu"],
  ["francesca-pisanu", "apr-pilot-2995-global-controller-francesca-pisanu"],
  ["maurizia-coreggioli", "apr-pilot-2990-global-controller-maurizia-coreggioli"],
  ["massimo-cappello", "apr-pilot-2970-global-controller-massimo-cappello"],
  ["claudia-sellati", "apr-pilot-2988-global-controller-claudia-sellati"],
] as const;

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const results = cases.map(([customerKey, cohort]) => ({
  customerKey,
  cohort,
  result: (() => {
    const stateDir = `${cohortRoot}/${cohort}`;
    const replay = runEconomicVerticalForCurrentCohort(stateDir, customerKey);
    const manifestCase = resolveCurrentCohortManifestCase(stateDir, customerKey);
    const input = observedEconomicInput(manifestCase, JSON.parse(readFileSync(manifestCase.evidence.analysisCheckpoint, "utf8")));
    return {
      outcome: replay.outcome,
      eligibleExpense: replay.eligibleExpense,
      invoiceReconciliation: replay.invoiceReconciliation,
      bankTransferReconciliation: replay.bankTransferReconciliation,
      invoices: input.invoices,
    };
  })(),
}));

process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
