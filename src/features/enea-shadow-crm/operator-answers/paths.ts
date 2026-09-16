import os from "node:os";
import path from "node:path";

// Radice dei file che APR scrive su disco. Il CRM ombra legge SOLO qui dentro
// e scrive SOLO il ledger risposte: nessun host, nessuna credenziale.
export const RUNNER_ROOT = path.join(os.homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");

export const cohortsDirectory = (root: string) => path.join(root, "cohorts");
export const runsDirectory = (root: string) => path.join(root, "runs");
export const operatorQuestionsPath = (cohortDir: string) => path.join(cohortDir, "operator-questions", "checkpoint.json");
export const cohortSeedPath = (cohortDir: string) => path.join(cohortDir, "cohort-seed", "checkpoint.json");
export const operatorResponsesPath = (root: string) => path.join(root, "state", "operator-responses", "checkpoint.json");
